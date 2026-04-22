import sys

# 1. Update HTML
html_path = r"c:\SistemaGestionyelave\dashboard-prototype\trazabilidad_global.html"
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Remove Usuario from middle
html = html.replace('                                <th>Usuario</th>\n', '')

# Append Usuario to end
old_estado = '                                <th style="text-align: center;">Estado</th>'
new_estado = '                                <th style="text-align: center;">Estado</th>\n                                <th>Usuario</th>'
html = html.replace(old_estado, new_estado)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)

# 2. Update JS
js_path = r"c:\SistemaGestionyelave\dashboard-prototype\trazabilidad_global.js"
with open(js_path, "r", encoding="utf-8") as f:
    js = f.read()

# Remove Usuario td from middle
user_td = '            <td style="font-size:0.75rem; color:#475569;">${it.usuario}</td>\n'
js = js.replace(user_td, '')

# Append Usuario td to the end
old_status_td = '            <td style="text-align:center;">${statusHtml}</td>\n        </tr>'
new_status_td = '            <td style="text-align:center;">${statusHtml}</td>\n            <td style="font-size:0.75rem; color:#475569; text-align:center;">${it.usuario}</td>\n        </tr>'
if new_status_td not in js:
    js = js.replace(old_status_td, new_status_td)

with open(js_path, "w", encoding="utf-8") as f:
    f.write(js)

print("Usuario column moved to the end.")
