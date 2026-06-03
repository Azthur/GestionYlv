import sys

def check_brackets(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    stack = []
    line_nums = []
    
    i = 0
    line = 1
    in_string = False
    string_char = ''
    in_comment_line = False
    in_comment_block = False

    while i < len(content):
        c = content[i]
        
        if c == '\n':
            line += 1
            in_comment_line = False
            
        if in_comment_line:
            i += 1
            continue
            
        if in_comment_block:
            if c == '*' and i + 1 < len(content) and content[i+1] == '/':
                i += 2
                in_comment_block = False
                continue
            i += 1
            continue

        if in_string:
            if c == '\\':
                i += 2
                continue
            elif c == string_char:
                in_string = False
            i += 1
            continue
            
        if c in ["'", '"', '`']:
            in_string = True
            string_char = c
            i += 1
            continue
            
        if c == '/' and i + 1 < len(content):
            if content[i+1] == '/':
                in_comment_line = True
                i += 2
                continue
            elif content[i+1] == '*':
                in_comment_block = True
                i += 2
                continue
                
        if c in ['{', '[', '(']:
            stack.append(c)
            line_nums.append(line)
        elif c in ['}', ']', ')']:
            if not stack:
                print(f"Unmatched closing '{c}' at line {line}")
                sys.exit(1)
            top = stack.pop()
            top_line = line_nums.pop()
            if (c == '}' and top != '{') or (c == ']' and top != '[') or (c == ')' and top != '('):
                print(f"Mismatched closing '{c}' at line {line}, expected match for '{top}' from line {top_line}")
                sys.exit(1)
                
        i += 1
        
    if stack:
        print(f"Unmatched opening bracket(s) remaining: {list(zip(stack, line_nums))}")
        sys.exit(1)
    else:
        print("Brackets are perfectly balanced!")

check_brackets('dashboard-prototype/cargos_documentales.js')
