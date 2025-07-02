/**
 * @file Parser for the ucode language
 * @author Jo-Philipp Wich <jo@mein.io>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: 'ucode',

  externals: $ => [
    $.raw_text,
    $.raw_comment,

    $.string,
    $.template,
    $.regex_pattern,
    $.number,
    $.double,

    $.expression_tag_open,
    $.expression_tag_close,

    $.placeholder_open,
    $.placeholder_close,

    '{',
    '}',

    $._optional_semicolon,
    $.statement_tag_open,
    $.statement_tag_close,

    $.error,
  ],

  extras: $ => [
    $.comment,
  ],

  precedences: $ => [
    [
      'member',
      'call',
      'unary_update',
      'unary_void',
      'unary_delete',
      'binary_exp',
      'binary_times',
      'binary_plus',
      'binary_shift',
      'binary_compare',
      'binary_relation',
      'binary_equality',
      'bitwise_and',
      'bitwise_xor',
      'bitwise_or',
      'logical_and',
      'logical_or',
      'ternary',
      'sequence',
      $.lambda_expression,
      $.export_statement,
    ],
    ['assign', $._primary_expression],
    ['member', 'call', $._expression],
    [$._for_header_in, $._primary_expression],
    [$.block, $.object],
  ],

  conflicts: $ => [
    [$._array_element, $.sequence_expression],
    [$._array_element, $._expressions],
    [$._identifier_pattern, $.keyword],
    [$._for_header_in, $._variable_declaration_let],
    [$._primary_expression, $._lambda_params],
    [$._primary_expression, $.object_property],
    [$.function_expression, $._function_declaration_normal],
  ],

  word: $ => $._identifier_pattern,

  rules: {
    markup: $ => seq(
      optional($.hash_bang_line),
      repeat1($._statement),
    ),

    program: $ => seq(
      optional($.hash_bang_line),
      repeat1($._code_statement),
    ),

    hash_bang_line: _ => /#!.*/,

    _eos: $ => choice(
      $._optional_semicolon,
      $.statement_tag_open,
      $.statement_tag_close,
    ),

    _code_statement: $ => choice(
      $.if_statement,
      $.while_statement,
      $.for_statement,
      $.function_declaration,
      $.switch_statement,
      $.try_statement,
      $.import_statement,
      $.export_statement,
      $.block,

      $.return_statement,
      $.break_statement,
      $.continue_statement,
      $.expression_statement,
      $.variable_declaration,
      $._empty_statement,
    ),

    _statement: $ => choice(
      $._code_statement,

      $.raw_text,
      $.raw_comment,
      $.expression_block,
    ),

    _statements: $ => repeat1($._statement),

    expression_block: $ => seq(
      $.expression_tag_open,
      $._expressions,
      $.expression_tag_close,
    ),

    expression_statement: $ => seq($._expressions, $._eos),
    _empty_statement: $ => $._eos,

    return_statement: $ => seq(
      'return',
      field('value', optional($._expressions)),
      $._eos,
    ),

    break_statement: _ => 'break',

    continue_statement: _ => 'continue',

    _variable_declaration_const: $ => prec.right(seq(
      field('kind', alias('const', $._variable_kind)),
      repeat(seq(
        field('name', alias($._non_reserved_identifier, $._variable_name)),
        '=',
        field('initializer', $._expression),
        ',',
      )),
      field('name', alias($._non_reserved_identifier, $._variable_name)),
      '=',
      field('initializer', $._expression),
    )),

    _variable_declaration_let: $ => prec.right(seq(
      field('kind', alias('let', $._variable_kind)),
      repeat(seq(
        field('name', alias($._non_reserved_identifier, $._variable_name)),
        optional(seq('=', field('initializer', $._expression))),
        ',',
      )),
      field('name', alias($._non_reserved_identifier, $._variable_name)),
      optional(seq('=', field('initializer', $._expression))),
    )),

    variable_declaration: $ => seq(
      choice(
        $._variable_declaration_const,
        $._variable_declaration_let,
      ),
      $._eos,
    ),

    _if_statement_normal: $ => prec.right(seq(
      'if',
      field('condition', $._parenthesized_expression),
      field('statement', $._statement),
      optional(field('else_statement', seq('else', $._statement)))
    )),

    _if_statement_alt: $ => seq(
      'if',
      field('condition', $._parenthesized_expression),
      ':',
      field('statement', $._statements),
      repeat(seq(
        'elif',
        field('elif_condition', $._parenthesized_expression),
        ':',
        field('elif_statement', $._statements),
      )),
      optional(seq(
        'else',
        field('else_statement', $._statements)
      )),
      'endif',
    ),

    if_statement: $ => choice(
      $._if_statement_alt,
      $._if_statement_normal,
    ),

    _while_statement_alt: $ => seq(
      'while',
      field('condition', $._parenthesized_expression),
      ':',
      field('statement', $._statements),
      'endwhile',
    ),

    _while_statement_normal: $ => seq(
      'while',
      field('condition', $._parenthesized_expression),
      field('statement', $._statement),
    ),

    while_statement: $ => choice(
      $._while_statement_alt,
      $._while_statement_normal,
    ),

    _for_header_in: $ => seq(
      choice(
        seq(
          field('kind', alias('let', $._variable_kind)),
          field('iter_key', alias($._non_reserved_identifier, $._variable_name)),
          ',',
          field('iter_value', alias($._non_reserved_identifier, $._variable_name))
        ),
        seq(
          field('kind', alias('let', $._variable_kind)),
          field('iter_item', alias($._non_reserved_identifier, $._variable_name))
        ),
        seq(
          field('iter_key', alias($._non_reserved_identifier, $._variable_name)),
          ',',
          field('iter_value', alias($._non_reserved_identifier, $._variable_name))
        ),
        seq(
          field('iter_item', alias($._non_reserved_identifier, $._variable_name))
        ),
      ),
      'in',
      field('value', $._expressions),
    ),

    _for_header_count: $ => seq(
      optional(field('init', choice(
        alias($._variable_declaration_let, $.variable_declaration),
        $._expressions,
      ))),
      ';',
      optional(field('condition', $._expressions)),
      ';',
      optional(field('step', $._expressions)),
    ),

    _for_header: $ => choice(
      $._for_header_in,
      $._for_header_count,
    ),

    _for_statement_alt: $ => seq(
      'for', '(',
      $._for_header,
      ')', ':',
      field('statement', $._statements),
      'endfor',
    ),

    _for_statement_normal: $ => seq(
      'for', '(',
      $._for_header,
      ')',
      field('statement', $._statement),
    ),

    for_statement: $ => choice(
      $._for_statement_alt,
      $._for_statement_normal,
    ),

    _function_params: $ => seq(
      repeat(seq(
        field('param', alias($._non_reserved_identifier, $._function_param)),
        ',',
      )),
      choice(
        seq('...', field('spread_param', alias($._non_reserved_identifier, $._function_spread_param))),
        field('param', alias($._non_reserved_identifier, $._function_param)),
      ),
    ),

    _function_declaration_alt: $ => seq(
      'function',
      field('name', alias($._non_reserved_identifier, $._function_name)),
      '(',
      optional($._function_params),
      ')', ':',
      field('statement', $._statements),
      'endfunction',
    ),

    _function_declaration_normal: $ => seq(
      'function',
      field('name', alias($._non_reserved_identifier, $._function_name)),
      '(',
      optional($._function_params),
      ')', '{',
      optional(field('statement', $._statements)),
      '}',
    ),

    function_declaration: $ => choice(
      $._function_declaration_alt,
      $._function_declaration_normal,
    ),

    switch_case: $ => seq(
      'case',
      field('expression', $._expressions),
      ':',
      optional(field('statement', $._statements)),
    ),

    switch_default: $ => seq(
      'default', ':',
      optional(field('statement', $._statements)),
    ),

    switch_statement: $ => seq(
      'switch', '(',
      field('expression', $._expressions),
      ')', '{',
      repeat(choice(
        field('case', $.switch_case),
        field('default', $.switch_default),
      )),
      '}',
    ),

    try_statement: $ => seq(
      'try', '{',
      optional(field('try', $._statements)),
      '}',
      'catch',
      optional(
        seq(
          '(',
          field('exception_var', alias($._non_reserved_identifier, $.exception_variable)),
          ')',
        )
      ),
      '{',
      optional(field('catch', $._statements)),
      '}',
    ),

    import_item: $ => choice(
      seq(
        field('default', alias('default', $.import_name)),
        'as',
        field('alias', alias($._non_reserved_identifier, $.import_name)),
      ),
      seq(
        field('name', alias($.string, $.import_symbol)),
        'as',
        field('alias', alias($._non_reserved_identifier, $.import_name)),
      ),
      seq(
        field('name', alias($._non_reserved_identifier, $.import_symbol)),
        'as',
        field('alias', alias($._non_reserved_identifier, $.import_name)),
      ),
      field('name', alias($._non_reserved_identifier, $.import_symbol)),
    ),

    _import_list: $ => seq(
      '{',
      repeat(seq(field('symbol', $.import_item), ',')),
      field('symbol', $.import_item),
      '}',
    ),

    _import_namespace: $ => seq(
      '*',
      'as',
      field('namespace', alias($._non_reserved_identifier, $.import_name)),
    ),

    _import_default: $ => field(
      'default',
      alias($._non_reserved_identifier, $.import_name),
    ),

    import_statement: $ => seq(
      'import',
      choice(
        seq($._import_default, ',', $._import_namespace),
        seq($._import_default, ',', $._import_list),
        $._import_default,
        $._import_namespace,
        $._import_list,
      ),
      'from',
      field('module', $.string),
    ),

    export_item: $ => seq(
      field('name', alias($._non_reserved_identifier, $.export_name)),
      optional(seq(
        'as',
        choice(
          field('alias', alias($._non_reserved_identifier, $.export_alias)),
          field('alias', alias($.string, $.export_alias)),
          field('default', alias('default', $.export_alias)),
        ),
      )),
    ),

    _export_list: $ => seq(
      '{',
      repeat(seq(field('symbol', $.export_item), ',')),
      field('symbol', $.export_item),
      '}',
    ),

    export_statement: $ => seq(
      'export',
      choice(
        $._export_list,
        field('const', alias($._variable_declaration_const, $.export_const)),
        field('let', alias($._variable_declaration_let, $.export_let)),
        field('function', alias($._function_declaration_normal, $.export_function)),
        seq('default', field('default', $._expression)),
      ),
    ),

    block: $ => seq(
      '{',
      field('statement', optional($._statements)),
      '}',
    ),

    _expression: $ => choice(
      $._primary_expression,
      $.assignment_expression,
      $.augmented_assignment_expression,
      $.ternary_expression,
      $.binary_expression,
      $.unary_expression,
      $.update_expression,
      $.delete_expression,
    ),

    regex: $ => seq(
      field('pattern', $.regex_pattern),
      field('flags', alias(token(/[gis]*/), $.regex_flags)),
    ),

    _primary_expression: $ => choice(
      $.subscript_access,
      $.member_access,
      $.number,
      $.double,
      $.string,
      $.regex,
      alias('true', $.true),
      alias('false', $.false),
      alias('null', $.null),
      alias('this', $.this),
      $.array,
      $.object,
      $.template_string,
      alias($._non_reserved_identifier, $.variable),
      $.lambda_expression,
      $.function_expression,
      $.call_expression,
      $._parenthesized_expression,
    ),

    template_string: $ => seq(
      field('string', $.template),
      repeat(seq(
        $.placeholder_open,
        field('expression', $._expressions),
        $.placeholder_close,
        field('string', $.template),
      )),
    ),

    assignment_expression: $ => prec.right(seq(
      field('left', $._lhs_expression),
      '=',
      field('right', $._expression),
    )),

    augmented_assignment_expression: $ => prec.right('assign', seq(
      field('left', $._lhs_expression),
      field('operator', alias(
        choice('+=', '-=', '*=', '/=', '%=', '^=', '&=', '|=', '>>=', '<<=', '**=', '&&=', '||=', '??='),
        $._operator
      )),
      field('right', $._expression),
    )),

    optional_chain: _ => '?.',

    subscript_access: $ => prec.right('member', seq(
      field('object', $._primary_expression),
      optional(field('optional_chain', $.optional_chain)),
      '[', field('index', $._expressions), ']',
    )),

    member_access: $ => prec('member', seq(
      field('object', $._primary_expression),
      choice('.', field('optional_chain', $.optional_chain)),
      field('property', $.identifier),
    )),

    _lhs_expression: $ => choice(
      $.subscript_access,
      $.member_access,
      alias($._non_reserved_identifier, $.variable),
    ),

    ternary_expression: $ => prec.right('ternary', seq(
      field('condition', $._expression),
      '?',
      field('consequence', $._expression),
      ':',
      field('alternative', $._expression),
    )),

    binary_expression: $ => choice(
      ...[
        ['&&', 'logical_and'],
        ['||', 'logical_or'],
        ['>>', 'binary_shift'],
        ['<<', 'binary_shift'],
        ['&', 'bitwise_and'],
        ['^', 'bitwise_xor'],
        ['|', 'bitwise_or'],
        ['+', 'binary_plus'],
        ['-', 'binary_plus'],
        ['*', 'binary_times'],
        ['/', 'binary_times'],
        ['%', 'binary_times'],
        ['**', 'binary_exp', 'right'],
        ['<', 'binary_relation'],
        ['<=', 'binary_relation'],
        ['==', 'binary_equality'],
        ['===', 'binary_equality'],
        ['!=', 'binary_equality'],
        ['!==', 'binary_equality'],
        ['>=', 'binary_relation'],
        ['>', 'binary_relation'],
        ['??', 'ternary'],
        ['in', 'binary_relation'],
      ].map(([operator, precedence, associativity]) =>
        prec[associativity ?? 'left'](precedence, seq(
          field('left', $._expression),
          field('operator', alias(operator, $._operator)),
          field('right', $._expression),
        )),
      )
    ),

    unary_expression: $ => prec.left('unary_void', seq(
      field('operator', alias(choice('!', '~', '-', '+'), $._operator)),
      field('argument', $._expression),
    )),

    update_expression: $ => prec.left('unary_update', choice(
      seq(
        field('argument', $._expression),
        field('operator', alias(choice('++', '--'), $._operator)),
      ),
      seq(
        field('operator', alias(choice('++', '--'), $._operator)),
        field('argument', $._expression),
      ),
    )),

    delete_expression: $ => prec.left('unary_delete', seq(
      'delete',
      field('argument', $._expression),
    )),

    _arguments: $ => seq(
      '(',
      optional(seq(
        repeat(seq(
          choice(
            $._spread_expression,
            $._expression,
          ),
          ',',
        )),
        choice(
          $._spread_expression,
          $._expression,
        )
      )),
      ')'
    ),

    call_expression: $ => choice(
      prec('call', seq(
        field('function', $._expression),
        field('argument', $._arguments),
      )),
      prec('member', seq(
        field('function', $._primary_expression),
        field('optional_chain', $.optional_chain),
        field('argument', $._arguments),
      )),
    ),

    array: $ => seq(
      '[',
      optional(
        field('element', seq(
          $._array_element,
          repeat(seq(',', $._array_element)),
          optional(',')
        ))
      ),
      ']',
    ),

    _spread_expression: $ => seq(
      '...',
      field('spread', $._expression),
    ),

    _array_element: $ => choice($._expression, $._spread_expression),

    object: $ => seq(
      '{',
      optional(
        field('property', seq(
          field('property', $.object_property),
          field('property', repeat(seq(',', $.object_property))),
          optional(',')
        ))
      ),
      '}',
    ),

    object_property: $ => choice(
      seq(
        '[',
        field('name', $._expressions),
        ']',
        ':',
        field('value', $._expression),
      ),
      seq(
        field('name', $.string),
        ':',
        field('value', $._expression),
      ),
      seq(
        field('name', $.identifier),
        ':',
        field('value', $._expression),
      ),
      field('shorthand', alias($._non_reserved_identifier, $._property_shorthand)),
      $._spread_expression,
    ),

    _lambda_params: $ => choice(
      field('param', alias($._non_reserved_identifier, $._lambda_param)),
      seq(
        '(',
        repeat(seq(
          field('param', alias($._non_reserved_identifier, $._lambda_param)),
          ',',
        )),
        choice(
          seq('...', field('spread_param', alias($._non_reserved_identifier, $._lambda_spread_param))),
          field('param', alias($._non_reserved_identifier, $._lambda_param)),
        ),
        ')'
      ),
      seq('(', ')'),
    ),

    lambda_expression: $ => seq(
      $._lambda_params,
      '=>',
      choice(
        field('statement', $.block),
        field('expression', $._expression),
      ),
    ),

    function_expression: $ => seq(
      'function',
      optional(field('name', alias($._non_reserved_identifier, $._function_name))),
      '(',
      optional($._function_params),
      ')', '{',
      optional(field('statement', $._statements)),
      '}',
    ),

    sequence_expression: $ => seq(
      field('expression', $._expression),
      repeat1(seq(
        ',',
        field('expression', $._expression),
      )),
    ),

    _expressions: $ => choice(
      $.sequence_expression,
      $._expression,
    ),

    _parenthesized_expression: $ => seq(
      '(',
      $._expressions,
      ')',
    ),

    comment: _ => token(choice(
      seq('//', /[^\r\n\u2028\u2029]*/),
      seq(
        '/*',
        /[^*]*\*+([^/*][^*]*\*+)*/,
        '/',
      ),
    )),

    _identifier_pattern: _ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    keyword: _ => choice(
      "endfunction",
      "continue",
      "endwhile",
      "function",
      "default",
      "delete",
      "return",
      "endfor",
      "switch",
      "import",
      "export",
      "endif",
      "while",
      "break",
      "catch",
      "const",
      "false",
      "true",
      "elif",
      "else",
      "this",
      "null",
      "case",
      "try",
      "for",
      "let",
      "if",
      "in",
    ),

    identifier: $ => $._identifier_pattern,

    _non_reserved_identifier: $ => prec(-1, $._identifier_pattern),
  },
});
