;; Literals
(string) @string
(template) @string
(regex_pattern) @string.regex
(regex_flags) @string.special
(number) @number
(double) @number
(true) @constant.builtin
(false) @constant.builtin
(null) @constant.builtin

;; Comments
(comment) @comment
(raw_comment) @comment

;; Variables
(variable) @variable
(variable_declaration
  name: (_) @variable.definition)
(_variable_name) @variable.definition
(_property_shorthand) @variable
(exception_variable) @variable.builtin
(this) @variable.builtin

;; Functions
(_function_name) @function
(call_expression
  function: (_) @function.call)
(_function_param) @variable.parameter
(_function_spread_param) @variable.parameter
(_lambda_param) @variable.parameter
(_lambda_spread_param) @variable.parameter

;; Keywords
"function" @keyword.function
"return" @keyword.return
"if" @keyword.control
"else" @keyword.control
"elif" @keyword.control
"endif" @keyword.control
"switch" @keyword.control
"case" @keyword.control
"default" @keyword.control
"while" @keyword.control
"endwhile" @keyword.control
"for" @keyword.control
"endfor" @keyword.control
"try" @keyword.control
"catch" @keyword.control

(_variable_kind) @keyword.storage

"import" @keyword.import
"export" @keyword.import
"from" @keyword.import
"as" @keyword.import

(break_statement) @keyword
(continue_statement) @keyword
"delete" @keyword

;; Import/Export
(import_name) @variable.import
(import_symbol) @variable.import
(export_name) @variable.export
(export_alias) @variable.export

;; Punctuation
";" @punctuation.delimiter
"." @punctuation.delimiter
"," @punctuation.delimiter
":" @punctuation.delimiter

"(" @punctuation.bracket
")" @punctuation.bracket
"[" @punctuation.bracket
"]" @punctuation.bracket
"{" @punctuation.bracket
"}" @punctuation.bracket

;; Operators
(_operator) @operator

;; Properties
(member_access
  property: (identifier) @property)
(object_property
  name: (identifier) @property)

;; Template string placeholders
(placeholder_open) @punctuation.special
(placeholder_close) @punctuation.special
(expression_tag_open) @tag
(expression_tag_close) @tag
(statement_tag_open) @tag
(statement_tag_close) @tag

;; Raw text (for mixed language support)
(raw_text) @text.literal

;; Error
(ERROR) @error
