with open('dashboard-prototype/registro_facturas.js', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print("Lines 1910 to 1930 of registro_facturas.js:")
for idx in range(1909, min(1930, len(lines))):
    cleaned = "".join(c for c in lines[idx] if ord(c) < 128)
    print(f"{idx+1}: {cleaned.strip()}")
