import os
import re

file_path = r'c:\SistemaGestionyelave\dashboard-prototype\login.html'

with open(file_path, 'rb') as f:
    content = f.read()

replacements = {
    b'\xc3\x91\xc2\x83\xc3\x82\xc2\xb3': b'\xc3\xb3', # ó
    b'\xc3\x91\xc2\x83\xc3\x82\xc2\xb1': b'\xc3\xb1', # ñ
    b'\xc3\x91\xc2\x82\xc2\xbf': b'\xc2\xbf', # ¿
}

for old, new in replacements.items():
    content = content.replace(old, new)

# Fix placeholder dots manually with regex
# placeholder="Ñ¢â‚¬Â¢Ñ¢â‚¬Â¢Ñ¢â‚¬Â¢Ñ¢â‚¬Â¢Ñ¢â‚¬Â¢Ñ¢â‚¬Â¢Ñ¢â‚¬Â¢Ñ¢â‚¬Â¢"
content = re.sub(b'placeholder="[^"]*"', b'placeholder="\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2"', content)

with open(file_path, 'wb') as f:
    f.write(content)

print("Fixed encoding using strict hex bytes.")
