#include <stdbool.h>
#include <string.h>
#include <ctype.h>

#include "tree_sitter/parser.h"

enum token_type
{
    TOKEN_TEXT,
    TOKEN_COMMENT,
    TOKEN_STRING,
    TOKEN_TEMPLATE,
    TOKEN_REGEXP,
    TOKEN_NUMBER,
    TOKEN_DOUBLE,
    TOKEN_EXPRESSION_START,
    TOKEN_EXPRESSION_END,
    TOKEN_PLACEHOLDER_START,
    TOKEN_PLACEHOLDER_END,
    TOKEN_BRACE_OPEN,
    TOKEN_BRACE_CLOSE,
    TOKEN_OPTIONAL_SEMICOLON,
    TOKEN_STATEMENT_START,
    TOKEN_STATEMENT_END,
    TOKEN_ERROR,
};

typedef enum
{
    NONE = 0,
    EXPRESSION,
    STATEMENTS,
    COMMENT
} block_type_t;

typedef enum
{
    INIT = 0,
    IDENTIFY_BLOCK,
    BLOCK_COMMENT,
    BLOCK_EXPRESSION_EMIT_TAG,
    BLOCK_STATEMENT_EMIT_TAG,
    IDENTIFY_TOKEN,
    PLACEHOLDER_START,
    PLACEHOLDER_END,
    EOF
} scan_state_t;

typedef struct
{
    scan_state_t state;
    block_type_t block;
    bool semicolon_emitted;
    size_t template_nesting;
    size_t *brace_nesting;
} scanner_t;

typedef struct
{
    scan_state_t state;
    block_type_t block;
    bool semicolon_emitted;
    size_t template_nesting;
    size_t brace_nesting[];
} serialized_state_t;

static bool
check_char(TSLexer *lexer, int expected)
{
    if (lexer->lookahead != expected)
        return false;

    lexer->advance(lexer, false);

    return true;
}

static int
check_chars(TSLexer *lexer, const char *expected)
{
    int ch = lexer->lookahead;

    if (!strchr(expected, ch))
        return 0;

    lexer->advance(lexer, false);

    return ch;
}

static bool
parse_escape(TSLexer *lexer)
{
    int code, ch, i;
    const char *p;

    // Unicode escape sequence: \uXXXX
    if (check_char(lexer, 'u'))
    {
        for (i = 0; i < 4; i++)
            if (!check_chars(lexer, "0123456789abcdefABCDEF"))
                return false;
    }
    // Hex escape: \xXX
    else if (check_char(lexer, 'x'))
    {
        for (i = 0; i < 2; i++)
            if (!check_chars(lexer, "0123456789abcdefABCDEF"))
                return false;
    }
    // Octal or other escape
    else
    {
        ch = lexer->lookahead;

        // Try to parse octal sequence
        if (ch >= '0' && ch <= '7')
        {
            for (i = 0, code = 0;
                 i < 3 && (ch = check_chars(lexer, "01234567")) != 0;
                 i++)
            {
                code = code * 8 + (ch - '0');
            }

            if (code > 255)
                return false;
        }
        // Other single character escapes
        else if (ch != 0)
        {
            lexer->advance(lexer, false);
        }
        else
        {
            return false;
        }
    }

    return true;
}

static bool
parse_string(scanner_t *scanner, TSLexer *lexer, int delimiter, uint32_t *token_type)
{
    bool is_template = (delimiter == '`');
    bool is_regexp = (delimiter == '/');
    int ch;

    *token_type = is_template ? TOKEN_TEMPLATE : (is_regexp ? TOKEN_REGEXP : TOKEN_STRING);

    while (lexer->lookahead != 0)
    {
        // Handle template placeholders: ${...}
        if (is_template && lexer->lookahead == '$')
        {
            lexer->mark_end(lexer);
            lexer->advance(lexer, false);

            if (check_char(lexer, '{'))
            {
                scanner->state = PLACEHOLDER_START;
                return true;
            }
        }

        // Handle regexp character classes: [...]
        else if (is_regexp && check_char(lexer, '['))
        {
            // Skip negation
            check_char(lexer, '^');

            // Skip leading closing bracket (not actually closing)
            check_char(lexer, ']');

            // Read until closing bracket
            while (lexer->lookahead != 0)
            {
                if (check_char(lexer, '\\'))
                {
                    if (!parse_escape(lexer))
                        return false;
                }
                else if (check_char(lexer, ']'))
                {
                    break;
                }
                else
                {
                    lexer->advance(lexer, false);
                }
            }
        }

        // Handle escape sequences
        else if (check_char(lexer, '\\'))
        {
            if (!parse_escape(lexer))
                return false;
        }

        // Handle end of string/template/regexp
        else if (check_char(lexer, delimiter))
        {
            lexer->mark_end(lexer);
            return true;
        }

        else
        {
            lexer->advance(lexer, false);
        }
    }

    // Unterminated string/template/regexp
    return false;
}

static bool
parse_number(scanner_t *scanner, TSLexer *lexer, int first_digit, uint32_t *token_type)
{
    const char *digits = "0123456789";
    bool exponent = true;
    bool decimal = true;

    *token_type = TOKEN_NUMBER;

    if (first_digit == '0')
    {
        if (check_chars(lexer, "bB"))
        {
            digits = "01";
            decimal = false;
        }
        else if (check_chars(lexer, "oO"))
        {
            digits = "01234567";
            decimal = false;
        }
        else if (check_chars(lexer, "xX"))
        {
            digits = "0123456789abcdefABCDEF";
            decimal = false;
        }
    }

    while (check_chars(lexer, digits))
        ;

    if (decimal && check_char(lexer, '.'))
    {
        exponent = false;

        while (check_chars(lexer, digits))
            exponent = true;

        *token_type = TOKEN_DOUBLE;
    }

    if (decimal && exponent && check_chars(lexer, "eE"))
    {
        lexer->mark_end(lexer);

        check_chars(lexer, "+-");

        while (check_chars(lexer, digits))
            lexer->mark_end(lexer);

        *token_type = TOKEN_DOUBLE;
    }

    return true;
}

static bool
scan_next_token(scanner_t *scanner, TSLexer *lexer, uint32_t *token_type)
{
    int ch;

    switch (scanner->state)
    {
    case IDENTIFY_BLOCK:
        // Scan for block start markers
        while (lexer->lookahead != 0)
        {
            lexer->mark_end(lexer);

            if (check_char(lexer, '{'))
            {
                // Comment block: {#...#}
                if (check_char(lexer, '#'))
                {
                    scanner->state = BLOCK_COMMENT;
                    scanner->block = COMMENT;
                    *token_type = TOKEN_TEXT;
                    return true;
                }

                // Expression block: {{...}}
                else if (check_char(lexer, '{'))
                {
                    scanner->state = BLOCK_EXPRESSION_EMIT_TAG;
                    *token_type = TOKEN_TEXT;
                    return true;
                }

                // Statement block: {%...%}
                else if (check_char(lexer, '%'))
                {
                    scanner->state = BLOCK_STATEMENT_EMIT_TAG;
                    *token_type = TOKEN_TEXT;
                    return true;
                }
            }
            else
            {
                lexer->advance(lexer, false);
            }
        }

        if (lexer->lookahead == 0)
            scanner->state = EOF;

        *token_type = TOKEN_TEXT;
        return true;

    case BLOCK_COMMENT:
        // Scan for end of comment
        while (lexer->lookahead != 0)
        {
            if (check_char(lexer, '#'))
            {
                if (check_char(lexer, '}'))
                    break;
            }
            else
            {
                lexer->advance(lexer, false);
            }
        }

        if (lexer->lookahead == 0)
        {
            scanner->state = EOF;
            return false;
        }

        scanner->state = IDENTIFY_BLOCK;
        scanner->block = NONE;

        *token_type = TOKEN_COMMENT;
        return true;

    case BLOCK_EXPRESSION_EMIT_TAG:
        if (check_char(lexer, '{') && check_char(lexer, '{'))
        {
            check_char(lexer, '-');

            scanner->state = IDENTIFY_TOKEN;
            scanner->block = EXPRESSION;

            *token_type = TOKEN_EXPRESSION_START;
            return true;
        }
        break;

    case BLOCK_STATEMENT_EMIT_TAG:
        if (check_char(lexer, '{') && check_char(lexer, '%'))
        {
            check_chars(lexer, "+-");

            scanner->state = IDENTIFY_TOKEN;
            scanner->block = STATEMENTS;

            *token_type = TOKEN_STATEMENT_START;
            return true;
        }
        break;

    case IDENTIFY_TOKEN:
        // Skip whitespace
        while (isspace(lexer->lookahead))
            lexer->advance(lexer, true);

        // End of file
        if (lexer->lookahead == 0)
        {
            scanner->state = EOF;
            return false;
        }

        // Check for end of blocks
        if (check_char(lexer, '-'))
        {
            if (scanner->block == STATEMENTS && check_char(lexer, '%') && check_char(lexer, '}'))
            {
                scanner->state = IDENTIFY_BLOCK;
                scanner->block = NONE;

                *token_type = TOKEN_STATEMENT_END;
                return true;
            }

            if (scanner->block == EXPRESSION && check_char(lexer, '}') && check_char(lexer, '}'))
            {
                scanner->state = IDENTIFY_BLOCK;
                scanner->block = NONE;

                *token_type = TOKEN_EXPRESSION_END;
                return true;
            }
        }
        else if (check_char(lexer, '%'))
        {
            if (scanner->block == STATEMENTS && check_char(lexer, '}'))
            {
                scanner->state = IDENTIFY_BLOCK;
                scanner->block = NONE;

                *token_type = TOKEN_STATEMENT_END;
                return true;
            }
        }
        else if (check_char(lexer, '}'))
        {
            if (scanner->block == EXPRESSION && check_char(lexer, '}'))
            {
                scanner->state = IDENTIFY_BLOCK;
                scanner->block = NONE;

                *token_type = TOKEN_EXPRESSION_END;
                return true;
            }

            /* track closing braces */
            if (scanner->template_nesting > 0)
            {
                if (scanner->brace_nesting[scanner->template_nesting - 1] == 0)
                {
                    scanner->template_nesting--;
                    scanner->state = PLACEHOLDER_END;

                    *token_type = TOKEN_PLACEHOLDER_END;
                    return true;
                }

                scanner->brace_nesting[scanner->template_nesting - 1]--;
            }

            *token_type = TOKEN_BRACE_CLOSE;
            return true;
        }
        else if (check_char(lexer, '{'))
        {
            /* track opening braces */
            if (scanner->template_nesting > 0)
                scanner->brace_nesting[scanner->template_nesting - 1]++;

            *token_type = TOKEN_BRACE_OPEN;
            return true;
        }
        else if ((ch = check_chars(lexer, "\"'`")) != 0)
        {
            return parse_string(scanner, lexer, ch, token_type);
        }
        else if (check_char(lexer, '/'))
        {
            if (lexer->lookahead == '/' || lexer->lookahead == '*')
                return false;

            return parse_string(scanner, lexer, '/', token_type);
        }
        else if ((ch = check_chars(lexer, "0123456789")) != 0)
        {
            return parse_number(scanner, lexer, ch, token_type);
        }

        break;

    case PLACEHOLDER_START:
        if (check_char(lexer, '$') && check_char(lexer, '{'))
        {
            scanner->state = IDENTIFY_TOKEN;

            size_t *nestings = realloc(scanner->brace_nesting,
                                    (scanner->template_nesting + 1) * sizeof(size_t));

            if (!nestings)
                return false;

            scanner->brace_nesting = nestings;
            scanner->brace_nesting[scanner->template_nesting++] = 0;

            *token_type = TOKEN_PLACEHOLDER_START;
            return true;
        }
        break;

    case PLACEHOLDER_END:
        scanner->state = IDENTIFY_TOKEN;

        return parse_string(scanner, lexer, '`', token_type);

    case EOF:
        return false;
    }

    return false;
}

void *
tree_sitter_ucode_external_scanner_create()
{
    scanner_t *scanner = calloc(1, sizeof(scanner_t));

    scanner->state = INIT;

    return scanner;
}

void tree_sitter_ucode_external_scanner_destroy(void *payload)
{
    scanner_t *scanner = payload;

    if (scanner)
    {
        free(scanner->brace_nesting);
        free(scanner);
    }
}

unsigned
tree_sitter_ucode_external_scanner_serialize(void *payload,
                                             char *buffer)
{
    scanner_t *scanner = (scanner_t *)payload;

    if (!scanner)
        return 0;

    size_t state_size = sizeof(serialized_state_t) +
                        sizeof(size_t) * scanner->template_nesting;

    if (state_size > TREE_SITTER_SERIALIZATION_BUFFER_SIZE)
        return 0;

    serialized_state_t *state = (serialized_state_t *)buffer;

    state->state = scanner->state;
    state->block = scanner->block;
    state->semicolon_emitted = scanner->semicolon_emitted;
    state->template_nesting = scanner->template_nesting;

    for (size_t i = 0; i < scanner->template_nesting; i++)
        state->brace_nesting[i] = scanner->brace_nesting[i];

    return state_size;
}

void tree_sitter_ucode_external_scanner_deserialize(void *payload,
                                                    const char *buffer,
                                                    unsigned length)
{
    scanner_t *scanner = payload;

    if (!scanner)
        return;

    if (length < sizeof(serialized_state_t))
        return;

    const serialized_state_t *state = (const serialized_state_t *)buffer;

    if (length - sizeof(serialized_state_t) < state->template_nesting * sizeof(size_t))
        return;

    scanner->state = state->state;
    scanner->block = state->block;
    scanner->semicolon_emitted = state->semicolon_emitted;

    if (state->template_nesting > 0)
    {
        size_t *nestings = realloc(scanner->brace_nesting,
                                   sizeof(size_t) * state->template_nesting);

        if (!nestings)
            return;

        for (size_t i = 0; i < state->template_nesting; i++)
            nestings[i] = state->brace_nesting[i];

        scanner->brace_nesting = nestings;
    }

    scanner->template_nesting = state->template_nesting;
}

bool tree_sitter_ucode_external_scanner_scan(void *payload, TSLexer *lexer,
                                             const bool *valid_symbols)
{
    scanner_t *scanner = payload;

    if (!scanner)
        return false;

    if (scanner->state == INIT)
    {
        if (valid_symbols[TOKEN_TEXT])
        {
            scanner->state = IDENTIFY_BLOCK;
        }
        else
        {
            scanner->state = IDENTIFY_TOKEN;
            scanner->block = STATEMENTS;
        }
    }

    uint32_t token_type = 0;

    if (scanner->block == STATEMENTS && valid_symbols[TOKEN_OPTIONAL_SEMICOLON])
    {
        while (isspace(lexer->lookahead))
            lexer->advance(lexer, true);

        if (lexer->lookahead == ';')
        {
            scanner->semicolon_emitted = false;
            lexer->advance(lexer, false);
            lexer->result_symbol = TOKEN_OPTIONAL_SEMICOLON;

            return true;
        }

        if (lexer->lookahead == '}' || lexer->lookahead == 0)
        {
            if (scanner->semicolon_emitted)
            {
                scanner->semicolon_emitted = false;

                return false;
            }

            scanner->semicolon_emitted = true;
            lexer->result_symbol = TOKEN_OPTIONAL_SEMICOLON;

            return true;
        }
    }

    if (scan_next_token(scanner, lexer, &token_type) && valid_symbols[token_type])
    {
        scanner->semicolon_emitted = false;
        lexer->result_symbol = token_type;

        return true;
    }

    return false;
}
