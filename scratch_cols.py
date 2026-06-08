file_path = r"c:\SistemaGestionyelave\dashboard-prototype\registro_facturas.js"
with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

for i in range(864, 971):
    print(f"{i+1}: {repr(lines[i])}")
