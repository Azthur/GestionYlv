with open('C:/SistemaGestionyelave/dashboard-prototype/users.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Add the Tab Button
tab_tiendas_btn = '<button class="tab-btn" onclick="switchTab(\\\'tab-tiendas-rendicion\\\', this)" style="padding:0.75rem 1.5rem; border:none; background:none; cursor:pointer; font-size:0.85rem; font-weight:600; color:var(--text-muted); border-bottom:2px solid transparent; transition:all 0.3s;">Tiendas Rendición x Usuario</button>'
content = content.replace(
    '<button class="tab-btn" onclick="switchTab(\\\'tab-vendedores\\\', this)" style="padding:0.75rem 1.5rem; border:none; background:none; cursor:pointer; font-size:0.85rem; font-weight:600; color:var(--text-muted); border-bottom:2px solid transparent; transition:all 0.3s;">Vendedores x Usuario</button>',
    '<button class="tab-btn" onclick="switchTab(\\\'tab-vendedores\\\', this)" style="padding:0.75rem 1.5rem; border:none; background:none; cursor:pointer; font-size:0.85rem; font-weight:600; color:var(--text-muted); border-bottom:2px solid transparent; transition:all 0.3s;">Vendedores x Usuario</button>\\n                ' + tab_tiendas_btn
)

# Add the Section Tab
section_tiendas = """
            <!-- TAB: Tiendas Rendicion por Usuario -->
            <section class="content fade-in tab-panel" id="tab-tiendas-rendicion" style="display:none;">
                <div class="card glass-panel" style="padding:1.5rem;">
                    <div class="table-header" style="margin-bottom:1rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
                        <h3>Tiendas Rendición por Usuario</h3>
                        <div class="select-wrapper" style="min-width:200px;">
                            <select id="selTiendaUser" onchange="loadUserTiendas()" style="padding:0.5rem 1rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);font-size:0.85rem;">
                                <option value="">-- Seleccionar Usuario --</option>
                            </select>
                        </div>
                        <div class="select-wrapper" style="min-width:200px;">
                            <select id="selTiendaCia" onchange="loadUserTiendas()" style="padding:0.5rem 1rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);font-size:0.85rem;">
                                <option value="">-- Seleccionar Empresa --</option>
                            </select>
                        </div>
                        <button class="btn btn-primary" onclick="saveUserTiendas()" style="margin-left:auto;padding:0.5rem 1.25rem;font-size:0.8rem;">Guardar Tiendas</button>
                    </div>
                    <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1rem;">Marque las tiendas rendición asociadas a este usuario para la empresa seleccionada.</p>
                    <div id="tiendas-checkboxes" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:0.5rem;">
                        <p style="color:var(--text-muted);font-size:0.85rem;">Seleccione un usuario y una empresa para ver sus tiendas asignadas.</p>
                    </div>
                </div>
            </section>
"""

content = content.replace(
    '        </main>',
    section_tiendas + '\\n        </main>'
)

with open('C:/SistemaGestionyelave/dashboard-prototype/users.html', 'w', encoding='utf-8') as f:
    f.write(content)
