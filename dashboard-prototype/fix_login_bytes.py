import os

file_path = r'c:\SistemaGestionyelave\dashboard-prototype\login.html'

with open(file_path, 'rb') as f:
    content = f.read()

# The garbled bytes might be:
# SesiÑƒÂ³n -> b'Sesi\xd1\x83\xc2\xb3n'
# contraseÑƒÂ±a -> b'contrase\xd1\x83\xc2\xb1a'

replacements = {
    b'Sesi\xd1\x83\xc2\xb3n': 'Sesión'.encode('utf-8'),
    b'contrase\xd1\x83\xc2\xb1a': 'contraseña'.encode('utf-8'),
    b'Contrase\xd1\x83\xc2\xb1a': 'Contraseña'.encode('utf-8'),
    b'\xd1\xa2\xe2\x82\xac\xc2\xa2': '•'.encode('utf-8'), # Ñ¢â‚¬Â¢
    b'\xd1\x82\xc2\xbf': '¿'.encode('utf-8'), # Ñ‚¿
    b'\xef\xbb\xbf': b'' # BOM
}

print(f"Original length: {len(content)}")
for old, new in replacements.items():
    if old in content:
        print(f"Found {old}, replacing with {new}")
        content = content.replace(old, new)
    else:
        print(f"NOT FOUND: {old}")

with open(file_path, 'wb') as f:
    f.write(content)

print(f"New length: {len(content)}")
