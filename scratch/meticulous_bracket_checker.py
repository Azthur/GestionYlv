def check_brackets_meticulous(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        code = f.read()

    i = 0
    length = len(code)
    line = 1
    col = 1

    stack = []
    
    # State tracking
    # 'code', 'string_single', 'string_double', 'string_template', 'comment_line', 'comment_block', 'regex'
    state = 'code'
    state_start = (1, 1)

    while i < length:
        c = code[i]
        
        # Track line and column numbers
        next_line = line
        next_col = col + 1
        if c == '\n':
            next_line = line + 1
            next_col = 1

        if state == 'code':
            # Check comment line
            if c == '/' and i + 1 < length and code[i+1] == '/':
                state = 'comment_line'
                state_start = (line, col)
                i += 2
                line, col = next_line, next_col + 1
                continue
            # Check comment block
            elif c == '/' and i + 1 < length and code[i+1] == '*':
                state = 'comment_block'
                state_start = (line, col)
                i += 2
                line, col = next_line, next_col + 1
                continue
            # Check string single
            elif c == "'":
                state = 'string_single'
                state_start = (line, col)
                i += 1
                line, col = next_line, next_col
                continue
            # Check string double
            elif c == '"':
                state = 'string_double'
                state_start = (line, col)
                i += 1
                line, col = next_line, next_col
                continue
            # Check string template
            elif c == '`':
                state = 'string_template'
                state_start = (line, col)
                i += 1
                line, col = next_line, next_col
                continue
            # Check regex literal
            # JavaScript regex literals follow a slash / which is NOT preceded by an identifier or a closing parenthesis/bracket.
            # To keep it simple, we treat / as a regex if the previous non-whitespace character is in [ '=', '(', ',', ':', '[', '!', '&', '|', '?', '{', ';', '\n', 'return' ]
            elif c == '/':
                # Find previous non-whitespace char
                prev_idx = i - 1
                while prev_idx >= 0 and code[prev_idx].isspace():
                    prev_idx -= 1
                prev_char = code[prev_idx] if prev_idx >= 0 else '\n'
                
                # Check if it could be a regex start instead of division
                if prev_char in ['=', '(', ',', ':', '[', '!', '&', '|', '?', '{', ';', '\n', '>', '<']:
                    state = 'regex'
                    state_start = (line, col)
                    i += 1
                    line, col = next_line, next_col
                    continue

            # Bracket matching
            if c in ['{', '[', '(']:
                stack.append((c, line, col))
            elif c in ['}', ']', ')']:
                if not stack:
                    print(f"Unmatched closing '{c}' at line {line}, col {col}")
                    return False
                top_char, top_line, top_col = stack.pop()
                if (c == '}' and top_char != '{') or (c == ']' and top_char != '[') or (c == ')' and top_char != '('):
                    print(f"Mismatched closing '{c}' at line {line}, col {col}; expected match for '{top_char}' from line {top_line}, col {top_col}")
                    return False

        elif state == 'comment_line':
            if c == '\n':
                state = 'code'

        elif state == 'comment_block':
            if c == '*' and i + 1 < length and code[i+1] == '/':
                state = 'code'
                i += 2
                line, col = next_line, next_col + 1
                continue

        elif state == 'string_single':
            if c == '\\':
                i += 2
                # Skip next char
                continue
            elif c == "'":
                state = 'code'

        elif state == 'string_double':
            if c == '\\':
                i += 2
                continue
            elif c == '"':
                state = 'code'

        elif state == 'string_template':
            if c == '\\':
                i += 2
                continue
            elif c == '`':
                state = 'code'

        elif state == 'regex':
            if c == '\\':
                i += 2
                continue
            elif c == '/':
                state = 'code'

        i += 1
        line, col = next_line, next_col

    if stack:
        print(f"Unmatched opening bracket(s) remaining:")
        for top_char, top_line, top_col in stack:
            print(f"  '{top_char}' from line {top_line}, col {top_col}")
        return False

    print("File parsed successfully! Brackets are perfectly balanced!")
    return True

check_brackets_meticulous('dashboard-prototype/auditoria_facturas.js')
