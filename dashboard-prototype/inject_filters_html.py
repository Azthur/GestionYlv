import re

with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

# Replace the logisticaFilters block with an expanded block
old_block = """                                <div id="logisticaFilters" style="display:flex; gap:0.75rem; align-items:flex-end;">
                                    <div class="filter-group">
                                        <label>Tipo OC</label>
                                        <select id="filterTipoOC" onchange="loadOCsDisponibles()">
                                            <option value="ALL">Todas Permitidas</option>
                                            <option value="M">Mercaderías (M)</option>
                                            <option value="S">Servicios (S)</option>
                                            <option value="T">Contabilidad (T)</option>
                                        </select>
                                    </div>
                                    <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.75rem; cursor:pointer; color:#1e293b; font-weight:600; padding:0 0.5rem; background:#f4f7f6; border:1px solid #cbd5e1; border-radius:6px; height:34px; white-space:nowrap; margin-bottom:2px;">
                                        <input type="checkbox" id="filterMyRecords" value="1" checked style="width:14px; height:14px;" onchange="loadOCsDisponibles()">
                                        Solo mis registros
                                    </label>
                                </div>"""

new_block = """                                <div id="logisticaFilters" style="display:flex; gap:0.75rem; align-items:flex-end; flex-wrap:wrap;">
                                    <div class="filter-group">
                                        <label>Tipo OC</label>
                                        <select id="filterTipoOC" onchange="loadOCsDisponibles()">
                                            <option value="ALL">Todas Permitidas</option>
                                            <option value="M">Mercaderías (M)</option>
                                            <option value="S">Servicios (S)</option>
                                            <option value="T">Contabilidad (T)</option>
                                        </select>
                                    </div>
                                    <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.75rem; cursor:pointer; color:#1e293b; font-weight:600; padding:0 0.5rem; background:#f4f7f6; border:1px solid #cbd5e1; border-radius:6px; height:34px; white-space:nowrap; margin-bottom:2px;">
                                        <input type="checkbox" id="filterMyRecords" value="1" checked style="width:14px; height:14px;" onchange="loadOCsDisponibles()">
                                        Solo mis registros
                                    </label>
                                    <label id="lblDirectasContabilidad" style="display:none; align-items:center; gap:0.4rem; font-size:0.75rem; cursor:pointer; color:#1e293b; font-weight:600; padding:0 0.5rem; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; height:34px; white-space:nowrap; margin-bottom:2px;">
                                        <input type="checkbox" id="filterDirectasCont" value="1" style="width:14px; height:14px;" onchange="loadOCsDisponibles()">
                                        + Añadir OCs Directas Cont.
                                    </label>
                                </div>"""

if old_block in html_content:
    html_content = html_content.replace(old_block, new_block)
    with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.html', 'w', encoding='utf-8') as f:
        f.write(html_content)
    print("HTML filters updated.")
else:
    print("Could not find old_block in cargos_documentales.html.")
