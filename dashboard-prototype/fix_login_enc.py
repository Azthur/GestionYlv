import os

file_path = r'c:\SistemaGestionyelave\dashboard-prototype\login.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

replacements = {
    'SesiÑƒÂ³n': 'Sesión',
    'contraseÑƒÂ±a': 'contraseña',
    'ContraseÑƒÂ±a': 'Contraseña',
    'Ñ¢â‚¬Â¢': '•',
    'Ñ‚¿': '¿',
    'ï»¿': '' # BOM
}

for old, new in replacements.items():
    content = content.replace(old, new)

# Also remove the double spacing (blank lines everywhere)
lines = content.split('\n')
cleaned_lines = [line for line in lines if line.strip() != '' or '<' not in line] 
# Actually just a simple replace of \n\n with \n is safer
while '\n\n\n' in content:
    content = content.replace('\n\n\n', '\n\n')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Fixed encoding in {file_path}")
