#!/usr/bin/env python3
"""Patch conciliacion.js and conciliacion.html to add usuario, nro_operacion columns."""

def patch_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for i, (old_str, new_str) in enumerate(replacements):
        if old_str in content:
            content = content.replace(old_str, new_str, 1)
            print(f"  Patch {i+1}: OK")
        else:
            print(f"  Patch {i+1}: SKIPPED (not found)")
            # Show what we were looking for (first 80 chars)
            print(f"    Looking for: {repr(old_str[:80])}")
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# --- JS patches ---
print("=== Patching conciliacion.js ===")

js_replacements = [
    # 1. Auto-match: add usuario to payload
    (
        "period_month: month\n            })",
        "period_month: month,\n                usuario: JSON.parse(localStorage.getItem('yelave_user'))?.username || JSON.parse(localStorage.getItem('yelave_user'))?.name || 'Desconocido'\n            })"
    ),
    # 2. Manual-match: add usuario to payload
    (
        "cobranza_keys: Array.from(selectedCobKeys)\n        };",
        "cobranza_keys: Array.from(selectedCobKeys),\n            usuario: JSON.parse(localStorage.getItem('yelave_user'))?.username || JSON.parse(localStorage.getItem('yelave_user'))?.name || 'Desconocido'\n        };"
    ),
    # 3. Todas Cobranzas: add Estado column before id
    (
        "                </td>\n                <td>${c.id || ''}</td>",
        "                </td>\n                <td class=\"sticky-col\"><span class=\"status ${c.Estado === 'Conciliado' ? 'conciliado' : 'pendiente'}\">${c.Estado || 'Pendiente'}</span></td>\n                <td>${c.id || ''}</td>"
    ),
    # 4. Conciliados table: add nro_operacion and usuario columns
    (
        "            <td>${row.codaux || '\u2014'}</td>\n            <td>${row.CreatedAt",
        "            <td>${row.codaux || '\u2014'}</td>\n            <td>${row.nro_operacion || '\u2014'}</td>\n            <td>${row.usuario || '\u2014'}</td>\n            <td>${row.CreatedAt"
    ),
]

patch_file('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.js', js_replacements)

# --- HTML patches ---
print("\n=== Patching conciliacion.html ===")

html_replacements = [
    # 1. Todas Cobranzas: add Estado header
    (
        '<th style="width: 50px;" class="sticky-col">Acc.</th>\r\n                                        <th>ID</th>',
        '<th style="width: 50px;" class="sticky-col">Acc.</th>\r\n                                        <th class="sticky-col">Estado</th>\r\n                                        <th>ID</th>'
    ),
]

patch_file('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.html', html_replacements)

# Now patch the Conciliados table headers in HTML
print("\n=== Patching conciliacion.html (Conciliados headers) ===")

with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find the tableConciliados headers and add the new ones
# Look for the pattern near the conciliados table
if 'tableConciliados' in html:
    # Find CodAux header near conciliados
    idx = html.find('tableConciliados')
    if idx > 0:
        # Find the CodAux th after this position
        codaux_pos = html.find('<th>CodAux</th>', idx)
        if codaux_pos > 0:
            # Find the next th after CodAux
            next_th = html.find('<th>', codaux_pos + len('<th>CodAux</th>'))
            if next_th > 0:
                # Insert new headers before the next th
                insert_text = '<th>N\u00b0 Op. Final</th>\r\n                                        <th>Usuario</th>\r\n                                        '
                html = html[:next_th] + insert_text + html[next_th:]
                print("  Conciliados headers: OK")
            else:
                print("  Conciliados headers: next th not found")
        else:
            print("  Conciliados headers: CodAux not found after tableConciliados")
    else:
        print("  tableConciliados not found")

with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\n=== ALL DONE ===")
