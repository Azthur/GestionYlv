import re

def clean_op(op):
    if not op: return ""
    op_str = str(op).strip().upper()
    
    # 1. Native Normalizations requested by user:
    # - Remove 'OP- ' to 'OP-'
    op_str = op_str.replace("OP- ", "OP-")
    
    # - Remove 'OP-' or 'OP ' or 'OP' at the beginning 
    if op_str.startswith("OP-"):
        op_str = op_str[3:]
    elif op_str.startswith("OP ") or op_str.startswith("OP"):
        op_str = op_str[2:].strip()
        if op_str.startswith("-"):
            op_str = op_str[1:]
    
    # - Remove leading zeros
    op_str = op_str.lstrip('0')
            
    return op_str

test_cases = [
    ("OP-123", "123"),
    ("0123", "123"),
    ("123", "123"),
    ("OP- 123", "123"),
    ("463-42121", "463-42121"),
    ("OP-463-42121", "463-42121"),
    ("OP463-42121", "463-42121"),
    ("OP 463-42121", "463-42121"),
]

for p, expected in test_cases:
    res = clean_op(p)
    if res != expected:
        print(f"FAILED: {p} -> {res} (Expected: {expected})")
    else:
        print(f"PASSED: {p} -> {res}")
