import os

def patch():
    file_path = 'c:\\SistemaGestionyelave\\backend\\gastos_rendiciones.py'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # We need to find the INSERT query and fix the lengths
    target = """prov.codcia, jruc, jrs, jdir, jruc,
            prov.coddep[:6], prov.codpro[:6], prov.coddis[:6], xtpodoc,
            prov.email[:60]"""
    
    replacement = """prov.codcia[:3], jruc[:18], jrs[:200], jdir[:200], jruc[:18],
            prov.coddep[:4], prov.codpro[:4], prov.coddis[:4], xtpodoc[:4],
            prov.email[:100]"""

    if target in content:
        content = content.replace(target, replacement)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Lengths fixed in backend.')
    else:
        print('Target not found in backend.')

if __name__ == '__main__':
    patch()
