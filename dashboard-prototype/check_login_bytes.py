file_path = r'c:\SistemaGestionyelave\dashboard-prototype\login.html'

with open(file_path, 'rb') as f:
    content = f.read()

import re
# Find Sesi...n
match = re.search(b'Sesi.{1,10}n', content)
if match:
    # Print hex so I can see what it actually is!
    print("Found Sesion variant:", [hex(b) for b in match.group(0)])

match = re.search(b'contrase.{1,10}a', content)
if match:
    print("Found contrasea variant:", [hex(b) for b in match.group(0)])
    
match = re.search(b'Contrase.{1,10}a', content)
if match:
    print("Found Contrasea variant:", [hex(b) for b in match.group(0)])

match = re.search(b'.{1,10}Problemas', content)
if match:
    print("Found Problemas variant:", [hex(b) for b in match.group(0)])
