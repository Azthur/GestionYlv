import sys
import re

html_path = r"c:\SistemaGestionyelave\dashboard-prototype\trazabilidad_global.html"
js_path = r"c:\SistemaGestionyelave\dashboard-prototype\trazabilidad_global.js"

# 1. Update HTML
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Make it responsive / standard
html = html.replace('<!-- Sidebar container -->', '<!-- Sidebar container -->\n        <nav class="sidebar" id="sidebar"></nav>')
html = html.replace('<main class="main-content" style="margin-left: 250px;">', '<main class="main-content">')
html = html.replace('class="card" style="padding: 1.5rem; overflow-x: auto;"', 'class="card glass-panel" style="padding: 1.25rem; overflow-x: auto;"')

# Add codmat search input
search_input = """<div class="filter-group" style="flex: 2;">
                        <label for="filterCodmat">Producto (Cód/Nombre)</label>
                        <input type="text" id="filterCodmat" placeholder="Buscar POLAWAX, 0001...">
                    </div>
"""
html = html.replace('<div class="filter-group" style="flex: 0.5;">', search_input + '                    <div class="filter-group" style="flex: 0.5; justify-content: flex-end;">')

# Add user column
html = html.replace('<th>Type</th>', '<th>Tipo</th>')
# Let's target the exact tr for the head
html = html.replace('<th>Mat. Código</th>', '<th>Mat. Código</th>\n                                <th>Usuario</th>')

# Copy modal logic from orders.html
with open(r"c:\SistemaGestionyelave\dashboard-prototype\orders.html", "r", encoding="utf-8") as f:
    orders_html = f.read()

modal_start = orders_html.find('<!-- Modal: Trazabilidad OC → Almacén → Factura -->')
modal_end = orders_html.find('<!-- SweetAlert2 -->')
modal_content = orders_html[modal_start:modal_end]

# Insert modal content right before scripts
html = html.replace('    <!-- Scripts -->', modal_content + '\n    <!-- Scripts -->')

# Inject app.js and sidebar.js
html = html.replace('<script src="trazabilidad_global.js"></script>', '<script src="app.js"></script>\n    <script src="trazabilidad_global.js"></script>\n    <script src="sidebar.js"></script>')

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
    
# 2. Update JS
with open(js_path, "r", encoding="utf-8") as f:
    js = f.read()

# Add codmat parameter
js = js.replace("const period = document.getElementById('filterPeriod').value;", "const period = document.getElementById('filterPeriod').value;\n    const codmat_search = document.getElementById('filterCodmat').value;")

js = js.replace("if (!codcia || !year || !period) {", "if (!codcia || !year || (!period && !codmat_search)) {")

url_base = "if (tipoOc) url += `&tipo_oc=${encodeURIComponent(tipoOc)}`;"
url_new = url_base + "\n        if (codmat_search) url += `&codmat_search=${encodeURIComponent(codmat_search)}`;"
js = js.replace(url_base, url_new)

# Update DataTable render
js = js.replace("<td>${it.proveedor.substring(0,25)}</td>", "<td>${it.proveedor.substring(0,25)}</td>\n            <td style=\"font-size:0.75rem; color:#475569;\">${it.usuario}</td>")

# Fix missing column def in excel export
js = js.replace("columns: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]", "columns: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]")

# Make NroDoc clickable and pass order type + cia to modal func
oc_link = """<a href="javascript:void(0)" onclick="openGlobalTrazaModal('${it.nrodoc}', '${codcia}', '${it.tipooc}', '${year}')" style="text-decoration:none; color:var(--primary);">${it.nrodoc}</a>"""
js = js.replace("${it.nrodoc}</td>", oc_link + "</td>")

# Fix validations (we already built the raw message strings in python instead of 'Moneda difiere')
warnings_html = """
        let statusHtml = '';
        if (it.warnings && it.warnings.length > 0) {
            statusHtml = `<div style="display:flex; flex-direction:column; gap:0.2rem; align-items:center;">
                <span style="padding:0.2rem 0.5rem; background:#fffbeb; color:#b45309; border:1px solid #fde68a; border-radius:4px; font-size:0.7rem; font-weight:600;">⚠️ Discrepancia</span>
                <span style="font-size:0.6rem; color:#ef4444; text-align:center; max-width: 120px; text-wrap: wrap;">${it.warnings.join('<br>')}</span>
            </div>`;
        } else {
            statusHtml = `<span style="padding:0.2rem 0.5rem; background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; border-radius:4px; font-size:0.7rem; font-weight:600;">✓ Conciliado</span>`;
        }
"""

js = re.sub(r'let statusHtml = .*?✓ Conciliado</span>`;\s+\}', warnings_html, js, flags=re.DOTALL)

with open(js_path, "w", encoding="utf-8") as f:
    f.write(js)

print("Patch applied.")
