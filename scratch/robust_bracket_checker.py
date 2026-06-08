import re

def check_brackets(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # Strip comments
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    content = re.sub(r'//.*', '', content)
    
    # Let's not strip strings/regex for a moment to see if that works better, 
    # or print the lines after stripping.
    
    # 3. Strip regex literals
    content = re.sub(r'/[^/\n]+/[gimy]*', 'REGEX', content)
    
    # 4. Strip single-quoted and double-quoted strings
    content = re.sub(r"'[^'\\]*(?:\\.[^'\\]*)*'", "STRING", content)
    content = re.sub(r'"[^"\\]*(?:\\.[^"\\]*)*"', "STRING", content)
    
    # 5. Strip backtick (template) strings
    content = re.sub(r'`[^`\\]*(?:\\.[^`\\]*)*`', "STRING", content, flags=re.DOTALL)

    lines = content.splitlines()
    for idx, line in enumerate(lines[:120]):
        print(f"{idx+1}: {line}")

check_brackets('dashboard-prototype/auditoria_facturas.js')
