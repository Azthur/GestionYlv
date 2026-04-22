import sys
import re

html_path = r"c:\SistemaGestionyelave\dashboard-prototype\trazabilidad_global.html"
js_path = r"c:\SistemaGestionyelave\dashboard-prototype\trazabilidad_global.js"

# 1. Update HTML
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Replace the filterCodmat input with a clickable search input group
old_input = """<input type="text" id="filterCodmat" placeholder="Buscar POLAWAX, 0001...">"""
new_input = """<div class="input-group" style="display:flex; cursor:pointer;" onclick="openProductModal()">
                            <input type="text" id="filterCodmat" placeholder="Seleccionar Producto" readonly style="flex:1; cursor:pointer; background-color:#f8fafc; border-right:none; border-top-right-radius:0; border-bottom-right-radius:0;">
                            <button type="button" class="btn" style="background:#e2e8f0; border:1px solid var(--border-dark); border-left:none; border-top-left-radius:0; border-bottom-left-radius:0; padding:0 0.75rem; color:#475569;">
                                🔍
                            </button>
                        </div>"""
html = html.replace(old_input, new_input)

# Let's add the productSearchModal at the end just before trazaModal
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

# inject right before trazaModal (since trazaModal is in js generation or orders html but I injected it before Scripts)
if modal_html not in html:
    html = html.replace('    <!-- Modal: Trazabilidad OC → Almacén → Factura -->', modal_html + '\n    <!-- Modal: Trazabilidad OC → Almacén → Factura -->')

# Make sure the table wrapper is actually wide if needed. ScrollX does the magic on datatables.
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
    
# 2. Update JS
with open(js_path, "r", encoding="utf-8") as f:
    js = f.read()

# Swap lines
# Old: 
# <td style="font-size:0.75rem; color:#475569;">${it.usuario}</td>
#             <td style="font-family:monospace; color:#475569;">${it.codmat}</td>

old_cols = """<td style="font-size:0.75rem; color:#475569;">${it.usuario}</td>
            <td style="font-family:monospace; color:#475569;">${it.codmat}</td>"""
new_cols = """<td style="font-family:monospace; color:#475569;">${it.codmat}</td>
            <td style="font-size:0.75rem; color:#475569;">${it.usuario}</td>"""
js = js.replace(old_cols, new_cols)

# Add scrollX to DataTable
js = js.replace("pageLength: 50,", "scrollX: true,\n        pageLength: 50,")

# Add the functionality for productSearchModal
extra_js = """
// ─── Modal Buscador de Productos ───
function openProductModal() {
    document.getElementById('productSearchModal').classList.add('active');
    setTimeout(() => document.getElementById('productSearchInput').focus(), 100);
}

function closeProductModal() {
    document.getElementById('productSearchModal').classList.remove('active');
}

function clearProductSelection() {
    document.getElementById('filterCodmat').value = '';
    closeProductModal();
    loadGlobalTrazabilidad();
}

document.getElementById('productSearchInput')?.addEventListener('keyup', (e) => {
    if(e.key === 'Enter') triggerProductSearch();
});

async function triggerProductSearch() {
    const q = document.getElementById('productSearchInput').value.trim();
    if (q.length < 2) return;
    const codcia = document.getElementById('filterCia').value;
    const tbody = document.getElementById('productSearchTbody');
    
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:2rem; color:#64748b;">Buscando...</td></tr>';
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`http://localhost:8000/api/contabilidad/items/autocomplete?codcia=${encodeURIComponent(codcia)}&q=${encodeURIComponent(q)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error buscando');
        const json = await res.json();
        
        let html = '';
        if (json.data && json.data.length > 0) {
            json.data.forEach(m => {
                html += `<tr style="cursor:pointer; border-bottom:1px solid #e2e8f0;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''" onclick="selectProduct('${m.codigo}', '${m.descripcion}')">
                    <td style="padding:0.6rem; font-family:monospace; color:#2563eb; font-weight:600;">${m.codigo}</td>
                    <td style="padding:0.6rem;">${m.descripcion}</td>
                    <td style="padding:0.6rem; text-align:center;"><span style="font-size:0.7rem; background:#eff6ff; color:#1d4ed8; padding:0.15rem 0.4rem; border-radius:4px;">${m.tipo}</span></td>
                </tr>`;
            });
        } else {
            html = '<tr><td colspan="3" style="text-align:center; padding:2rem; color:#64748b;">No se encontraron coincidencias.</td></tr>';
        }
        tbody.innerHTML = html;
        
    } catch(err) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:2rem; color:#ef4444;">Error de red</td></tr>';
    }
}

function selectProduct(cod, desc) {
    document.getElementById('filterCodmat').value = cod;
    closeProductModal();
    loadGlobalTrazabilidad();
}
"""

if "function openProductModal" not in js:
    with open(js_path, "a", encoding="utf-8") as f:
        f.write("\n" + extra_js)

print("Columns swapped, scrollX array patched, Product Modal injected!")
