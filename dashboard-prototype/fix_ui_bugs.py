import sys
import re
import pyodbc

# 1. Update Database Roles and webmodulos
conn_str = "Driver={SQL Server};Server=localhost\\SQLEXPRESS;Database=yelave;Trusted_Connection=yes;"
try:
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    
    # Insert module if not exists
    cursor.execute("SELECT Id FROM WebModulos WHERE Codigo = 'trazabilidad_global'")
    row = cursor.fetchone()
    
    if not row:
        cursor.execute("INSERT INTO WebModulos (Codigo, Nombre, RutaHtml, Seccion, Orden) VALUES ('trazabilidad_global', 'Trazabilidad Global', '/trazabilidad_global.html', 'Contabilidad', 23)")
        conn.commit()
        cursor.execute("SELECT Id FROM WebModulos WHERE Codigo = 'trazabilidad_global'")
        row = cursor.fetchone()
        
    modulo_id = row[0]
    
    # Assign to ADMIN directly, and also CONTABILIDAD, LOGISTICA
    for r in ['ADMIN', 'LOGISTICA', 'CONTABILIDAD', 'GERENCIA']:
        cursor.execute("SELECT Id FROM WebPermisos WHERE Rol = ? AND ModuloId = ?", (r, modulo_id))
        if not cursor.fetchone():
            cursor.execute("INSERT INTO WebPermisos (Rol, ModuloId, PuedeVer, PuedeEditar, PuedeEliminar, PuedeAprobar) VALUES (?, ?, 1, 1, 1, 1)", (r, modulo_id))
    conn.commit()
    print("DB Seed successful")
    
except Exception as e:
    print("DB error:", e)


# 2. Update HTML
html_path = r"c:\SistemaGestionyelave\dashboard-prototype\trazabilidad_global.html"
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Add CSS patch for max width
css_patch = '<style>.content { max-width: 98% !important; padding: 1.5rem 1vw !important; }</style>'
if css_patch not in html:
    html = html.replace('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="style.css">\n    ' + css_patch)

# Add Modal
modal_html = """
    <!-- Modal: Búsqueda de Productos -->
    <div class="modal-overlay" id="productSearchModal">
        <div class="modal glass-modal" style="max-width:700px; width:95%; display:flex; flex-direction:column; max-height:85vh;">
            <div class="modal-header">
                <h3>Buscador de Materiales</h3>
                <button class="close-btn" onclick="closeProductModal()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-body" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
                    <input type="text" id="productSearchInput" placeholder="Escriba código o nombre y presione Enter..." style="flex:1; padding:0.6rem; border:1px solid var(--border-dark); border-radius:var(--radius-sm); font-family:var(--font); font-size:1rem;">
                    <button class="btn btn-primary" onclick="triggerProductSearch()">Buscar</button>
                </div>
                <div style="flex:1; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                        <thead style="position:sticky; top:0; background:#f1f5f9; z-index:1;">
                            <tr>
                                <th style="padding:0.6rem; text-align:left; border-bottom:1px solid #cbd5e1;">Código</th>
                                <th style="padding:0.6rem; text-align:left; border-bottom:1px solid #cbd5e1;">Descripción</th>
                                <th style="padding:0.6rem; text-align:center; border-bottom:1px solid #cbd5e1;">Tipo</th>
                            </tr>
                        </thead>
                        <tbody id="productSearchTbody">
                            <tr><td colspan="3" style="text-align:center; padding:2rem; color:#94a3b8;">Escriba para buscar en AlmmMatg</td></tr>
                        </tbody>
                    </table>
                </div>
                <div style="margin-top:1rem; text-align:right;">
                    <button class="btn btn-outline" onclick="clearProductSelection()">Limpiar Filtro Actual</button>
                </div>
            </div>
        </div>
    </div>
"""

# inject right before Scripts 
if 'id="productSearchModal"' not in html:
    html = html.replace('    <!-- Scripts -->', modal_html + '\n    <!-- Scripts -->')

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)

print("HTML patched")
