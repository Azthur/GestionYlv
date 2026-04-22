// ═══════════════════════════════════════════════════════════
//  Registro de Facturas - JavaScript
// ═══════════════════════════════════════════════════════════

// ─── Auth & Session ─────────────────
function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) { window.location.href = 'login.html'; return null; }
    try {
        const user = JSON.parse(localStorage.getItem('yelave_user'));
        if (!user) throw new Error();
        return user;
    } catch(e) { window.location.href = 'login.html'; return null; }
}
function renderUserInfo(user) {
    if (!user) return;
    const nameEl = document.getElementById('userNameDisplay');
    const roleEl = document.getElementById('userRoleDisplay');
    const avatarEl = document.getElementById('userAvatar');
    if (nameEl) nameEl.textContent = user.nombre || user.login;
    let roleLabel = 'Consultor';
    const login = String(user.login||'').trim().toUpperCase();
    const isSuperuser = login === '71941916JL' || login.includes('71941916JL');
    const isAdmin = String(user.rol||'').trim().toUpperCase() === 'ADMIN';
    if (isSuperuser || isAdmin) roleLabel = 'Administrador';
    else if (user.rol) roleLabel = user.rol;
    if (roleEl) roleEl.textContent = roleLabel;
    if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre||user.login)}&background=2b3954&color=fff`;
}
function logout() { localStorage.removeItem('yelave_token'); localStorage.removeItem('yelave_user'); window.location.href = 'login.html'; }
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active', sidebar.classList.contains('open'));
}

// ─── Format Utils ────────────
const fmtNum = (val, dec = 2) => {
    if (val === null || val === undefined || isNaN(val)) return '0.00';
    return parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const escapeHtml = (unsafe) => {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
};

// ─── Global State ────────────
let dtFacturas = null;
let invoiceItems = [];
let invoiceMode = 'auto';
let currentCodCia = '';

// ─── Load Companies ──────────
async function loadCompanies() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/permisos/empresas/me', { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (!res.ok) throw new Error();
        const companies = await res.json();
        
        const sel = document.getElementById('cntEmpresa');
        if (!sel) return;
        sel.innerHTML = '<option value="" disabled selected>Seleccione Empresa...</option>';
        companies.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.codcia; opt.textContent = `${c.codcia} - ${c.nomcia}`;
            sel.appendChild(opt);
        });

        // Initialize default selection from session or first available
        const savedCia = localStorage.getItem('cnt_saved_cia');
        const cu = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        const defaultCia = savedCia || cu.codcia || (companies.length > 0 ? companies[0].codcia : '');

        if (defaultCia) {
            if (Array.from(sel.options).some(o => o.value === defaultCia)) {
                sel.value = defaultCia;
                currentCodCia = defaultCia;
            }
        }
    } catch(e) {
        console.error('Error loadCompanies:', e);
        if (document.getElementById('cntEmpresa')) 
            document.getElementById('cntEmpresa').innerHTML = '<option value="" disabled>Sin acceso a empresas</option>';
    }
}

function getSelectedCia() {
    const v = document.getElementById('cntEmpresa').value;
    if (!v) {
        Swal.fire({icon:'warning', title:'Atención', text:'Seleccione una empresa primero'});
        return null;
    }
    currentCodCia = v;
    localStorage.setItem('cnt_saved_cia', v);
    return v;
}

// ─── Invoice Mode ────────────
function setInvoiceMode(mode) {
    invoiceMode = mode;
    const btnAuto = document.getElementById('btnModeAuto');
    const btnManual = document.getElementById('btnModeManual');
    const autoPanel = document.getElementById('autoSearchPanel');
    if (btnAuto) btnAuto.classList.toggle('active', mode === 'auto');
    if (btnManual) btnManual.classList.toggle('active', mode === 'manual');
    if (autoPanel) autoPanel.style.display = mode === 'auto' ? 'block' : 'none';
}

// ════════════════════════════════════════════════════════════
//  BÚSQUEDA EN COMPRAS SUNAT
// ════════════════════════════════════════════════════════════

function openSunatSearch() { document.getElementById('modalSunat').classList.add('active'); }
function openOCSearch() { document.getElementById('modalOC').classList.add('active'); }
function openFacturasTotales() { 
    switchRegTab('historial');
}
function openDialog(id) { document.getElementById(id).classList.add('active'); }
function closeDialog(id) { document.getElementById(id).classList.remove('active'); }

async function searchSunatInvoices() {
    const codcia = getSelectedCia();
    if (!codcia) return;

    const proveedor = document.getElementById('searchSunatInput').value.trim();
    if (!proveedor) {
        Swal.fire({icon:'warning', title:'Atención', text:'Ingrese RUC o Razón Social del proveedor'});
        return;
    }

    try {
        Swal.fire({ title: 'Buscando en SUNAT...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await fetch(`/api/contabilidad/compras?codcia=${codcia}&proveedor=${encodeURIComponent(proveedor)}`);
        const result = await res.json();
        
        if (!res.ok) throw new Error(result.detail || 'Error al buscar en SUNAT');
        Swal.close();

        const docs = result.data || [];
        if (docs.length === 0) {
            Swal.fire({icon:'info', title:'Sin resultados', text:'No se encontraron comprobantes para este proveedor.'});
            document.getElementById('sunatSearchResults').style.display = 'none';
            return;
        }

        const resultsDiv = document.getElementById('sunatSearchResults');
        resultsDiv.style.display = 'block';

        const tb = document.getElementById('sunatResultsTbody');
        let html = '';
        docs.forEach(c => {
            const jsonStr = escapeHtml(JSON.stringify(c));
            // Usar NroOrdenCompra/TipoOc del LEFT JOIN
            const ocInfo = c.NroOrdenCompra ? `${c.TipoOc||''}${c.NroOrdenCompra}` : '<span style="color:#94a3b8;">-</span>';
            const estadoInfo = c.FacturaId ? `<span style="background:#dcfce7;color:#166534;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;">${c.FacturaEstado||'Registrada'}</span>` : '<span style="color:#94a3b8;font-size:0.75rem;">Sin registrar</span>';
            html += `<tr>
                <td style="white-space:nowrap;">
                    <button class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; background:var(--primary); color:white; border:none;" onclick="loadSunatInvoice(this)" data-doc="${jsonStr}">Seleccionar</button>
                    <button class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--primary); border:1px solid var(--primary); margin-left:4px;" onclick="previewSunatInvoice(this)" data-doc="${jsonStr}" title="Previsualizar Datos">Ver Detalle</button>
                </td>
                <td>${c.CodTipoCDP} ${c.NumSerieCDP}-${c.NumCDP}</td>
                <td>${c.FecEmision || '-'}</td>
                <td>${(c.NomRazonSocialProveedor || '').substring(0, 30)}</td>
                <td style="text-align:right;">${c.CodMoneda} ${fmtNum(c.MtoTotalCp)}</td>
                <td>${ocInfo || '<span style="color:#94a3b8;">-</span>'}</td>
                <td>${estadoInfo}</td>
            </tr>`;
        });
        
        tb.innerHTML = html;
        document.getElementById('sunatSearchResults').style.display = 'block';

        // Inicializar DataTable si no está inicializado
        const table = $('#sunatSearchResults table');
        if ($.fn.DataTable.isDataTable(table)) {
            table.DataTable().destroy();
        }
        table.DataTable({
            pageLength: 10,
            lengthMenu: [5, 10, 25, 50],
            language: {
                search: "Buscar:",
                lengthMenu: "Mostrar _MENU_ registros",
                info: "Mostrando _START_ a _END_ de _TOTAL_ registros",
                paginate: { first: "Primero", last: "Último", next: "Siguiente", previous: "Anterior" }
            },
            order: [[1, 'desc'], [2, 'desc']],
            dom: 'Bfrtip',
            buttons: [
                { extend: 'copy', text: 'Copiar', className: 'btn btn-sm btn-outline-secondary' },
                { extend: 'excel', text: 'Excel', className: 'btn btn-sm btn-outline-success' },
                { extend: 'pdf', text: 'PDF', className: 'btn btn-sm btn-outline-danger' },
                { extend: 'print', text: 'Imprimir', className: 'btn btn-sm btn-outline-primary' }
            ]
        });

    } catch(err) {
        Swal.fire({icon:'error', title:'Error', text: err.message});
    }
}

async function loadSunatInvoice(btn) {
    try {
        const c = JSON.parse(btn.getAttribute('data-doc').replace(/&quot;/g, '"'));

        // Alerta si la factura ya está vinculada a una OC
        if (c.FacturaId && c.NroOrdenCompra) {
            const result = await Swal.fire({
                icon: 'warning',
                title: 'Factura ya vinculada',
                html: `Esta factura ya se encuentra vinculada a la OC N° <strong>${c.TipoOc||''}${c.NroOrdenCompra}</strong> con estado <strong>${c.FacturaEstado||'Registrada'}</strong>.<br>¿Desea continuar?`,
                showCancelButton: true,
                confirmButtonText: 'Sí, continuar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#2563eb'
            });
            if (!result.isConfirmed) return;
        } else if (c.FacturaId) {
            const result = await Swal.fire({
                icon: 'info',
                title: 'Factura ya registrada',
                html: `Esta factura ya está registrada con estado <strong>${c.FacturaEstado||'Registrada'}</strong>.<br>¿Desea continuar de todas formas?`,
                showCancelButton: true,
                confirmButtonText: 'Sí, continuar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#2563eb'
            });
            if (!result.isConfirmed) return;
        }

        const fEmi = c.FecEmision ? c.FecEmision.substring(0,10) : '';

        document.getElementById('invRucProv').value = c.NumDocIdProveedor || '';
        document.getElementById('invNomProv').value = c.NomRazonSocialProveedor || '';
        document.getElementById('invTipoDoc').value = c.CodTipoCDP || '01';
        document.getElementById('invSerie').value = c.NumSerieCDP || '';
        document.getElementById('invNumero').value = c.NumCDP || '';
        document.getElementById('invFecEmision').value = fEmi;
        if(document.getElementById('invFecVenc')) {
            document.getElementById('invFecVenc').value = c.FecVencPag ? c.FecVencPag.substring(0,10) : fEmi;
        }
        document.getElementById('invMoneda').value = c.CodMoneda || 'PEN';
        document.getElementById('invTipoCambio').value = (c.MtoTipoCambio) || '1.000';
        
        Swal.fire({ title: 'Obteniendo XML completo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const codcia = getSelectedCia();
        let cpeData = null;
        let fetchedItems = [];
        
        try {
            const payload = {
                codcia: codcia || '',
                proveedor: c.NumDocIdProveedor || '',
                cod_comp: c.CodTipoCDP || '01',
                serie: c.NumSerieCDP || '',
                numero: c.NumCDP || ''
            };
            
            const r = await fetch('/api/contabilidad/facturas/buscar-cpe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if(r.ok) {
                cpeData = await r.json();
                if(cpeData && cpeData.informacionItems) {
                    fetchedItems = cpeData.informacionItems;
                }
            }
        } catch(e) {
            console.error('Error fetching datoscperecibido:', e);
        }

        // Guardar cpeData globalmente para usarlo al registrar
        window.currentCpeData = cpeData;

        // ITEMS
        invoiceItems = [];
        
        if (fetchedItems.length > 0) {
            fetchedItems.forEach(item => {
                const total = parseFloat(item.mtoImpTotal) || 0;
                const pu = parseFloat(item.mtoValUnitario) || 0;
                const cant = parseFloat(item.cntItems) || 0;
                const vv = pu * cant;
                const igv = total - vv;
                
                invoiceItems.push({
                    codigo: item.desCodigo ? item.desCodigo.trim() : 'SUNAT',
                    codProv: item.desCodigo ? item.desCodigo.trim() : '',
                    desc: item.desItem ? item.desItem.trim() : 'Sin descripcion',
                    und: item.codUnidadMedida || 'NIU',
                    desUnd: item.desUnidadMedida || '',
                    cant: cant,
                    pu: pu,
                    vv: vv,
                    igv: igv,
                    total: total,
                    icbperItem: parseFloat(item.mtoICBPER) || 0,
                    descItem: parseFloat(item.mtoDesc) || 0
                });
            });
        } else {
            const bg = parseFloat(c.MtoBIGravadaDG || 0);
            const igv = parseFloat(c.MtoIgvIpmDG || 0);
            if (bg > 0) {
                invoiceItems.push({
                    codigo: 'GEN', desc: 'Por el servicio / compra', und: 'ZZ',
                    cant: 1, pu: bg, vv: bg, igv: igv, total: bg + igv
                });
            }
        }
        
        Swal.close();
        renderInvoiceItems();
        closeDialog('modalSunat');
        
        // RELLENAR CAMPOS DE RESUMEN DESDE cpeData XML completo
        if (cpeData) {
            const setInput = (id, v) => { const el = document.getElementById(id); if(el) el.value = v || ''; };
            setInput('invDirEmisor', cpeData.datosEmisor ? cpeData.datosEmisor.desDirEmis : '');
            
            // Vencimiento real desde creditos del XML
            if (cpeData.informacionCreditos && cpeData.informacionCreditos.length > 0) {
                const cred = cpeData.informacionCreditos[0];
                if (cred.fecPlazoPago && document.getElementById('invFecVenc')) {
                    const parts = cred.fecPlazoPago.split('/');
                    if (parts.length === 3) {
                        document.getElementById('invFecVenc').value = parts[2] + '-' + parts[1] + '-' + parts[0];
                    }
                }
            }

            // Resumen contable completo desde XML
            setSummaryFromCPE(cpeData, c);
        } else {
            setSummaryFromSUNAT(c);
        }
        
        document.getElementById('searchOCProv').value = c.NumDocIdProveedor || '';
        
        if (cpeData && fetchedItems.length > 0) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', showConfirmButton: false, timer: 3000, title: fetchedItems.length + ' item(s) del XML cargados' });
        }
        
    } catch(err) {
        console.error(err);
        Swal.fire({
            icon:'error', iconColor: '#ef4444',
            title:'<span style="font-size:1.25rem;">Comprobante Incompatible</span>', 
            html: '<p style="color:var(--text-muted); font-size:0.9rem;">Revise los campos o extraiga un comprobante estandar.</p>',
            confirmButtonText: 'Entendido', confirmButtonColor: 'var(--primary)'
        });
    }
}

async function previewSunatInvoice(btn) {
    try {
        const c = JSON.parse(btn.getAttribute('data-doc').replace(/&quot;/g, '"'));
        Swal.fire({ title: 'Cargando Detalles...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        const codcia = getSelectedCia();
        const payload = {
            codcia: codcia,
            proveedor: c.NumDocIdProveedor || '',
            cod_comp: c.CodTipoCDP || '01',
            serie: c.NumSerieCDP || '',
            numero: c.NumCDP || ''
        };
        
        const r = await fetch('/api/contabilidad/facturas/buscar-cpe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if(!r.ok) throw new Error('No se pudo extraer el detalle del comprobante');
        const cpeData = await r.json();
        const items = cpeData.informacionItems || [];
        
        let html = `
            <div style="text-align:left; font-size:0.85rem; color:var(--text-main);">
                <div style="margin-bottom:1rem; padding:1rem; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                        <div><strong>RUC:</strong> ${c.NumDocIdProveedor}</div>
                        <div><strong>Razón Social:</strong> ${c.NomRazonSocialProveedor}</div>
                        <div><strong>Comprobante:</strong> ${c.CodTipoCDP} ${c.NumSerieCDP}-${c.NumCDP}</div>
                        <div><strong>Fecha Emisión:</strong> ${c.FecEmision?.substring(0,10) || '-'}</div>
                        <div><strong>Moneda:</strong> ${c.CodMoneda}</div>
                        <div><strong>Monto Base (BI):</strong> ${fmtNum(c.MtoBIMGravadas || c.MtoBiGravada || c.mtoBiGravada || 0)}</div>
                        <div><strong>Monto IGV:</strong> ${fmtNum(c.MtoIgvTot || c.MtoIgvIpm || c.MtoIgv || c.mtoIgv || 0)}</div>
                        <div><strong>Total General:</strong> <span style="font-size:1.1em; color:var(--primary); font-weight:700;">${c.CodMoneda} ${fmtNum(c.MtoTotalCp)}</span></div>
                    </div>
                </div>
                <h4 style="margin:0 0 0.5rem 0; color:var(--primary); font-size:0.95rem;">Líneas del Comprobante (${items.length})</h4>
                <div style="max-height:300px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px;">
                    <table class="fluent-table" style="width:100%; border-bottom:none;">
                        <thead style="background:#f1f5f9;">
                            <tr>
                                <th style="padding:0.5rem;">Cod</th>
                                <th style="padding:0.5rem;">Descripción</th>
                                <th style="padding:0.5rem; text-align:right;">Cant.</th>
                                <th style="padding:0.5rem; text-align:right;">P.Unit</th>
                                <th style="padding:0.5rem; text-align:right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>`;
        
        if (items.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding:1rem; color:#64748b;">El comprobante no tiene detalle de ítems en el XML proporcionado por SUNAT.</td></tr>`;
        } else {
            items.forEach(it => {
                html += `<tr>
                    <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0;">${it.desCodigo || '-'}</td>
                    <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0;" title="${it.desItem || ''}">${(it.desItem || '').substring(0,40)}</td>
                    <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0; text-align:right;">${it.cntItems || 0}</td>
                    <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0; text-align:right;">${fmtNum(it.mtoValUnitario)}</td>
                    <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0; text-align:right; font-weight:600;">${fmtNum(it.mtoImpTotal)}</td>
                </tr>`;
            });
        }
        
        html += `</tbody></table></div></div>`;
        
        Swal.fire({
            title: 'Detalle de Factura (SUNAT)',
            html: html,
            width: 700,
            showCloseButton: true,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: 'var(--primary)'
        });
        
    } catch(err) {
        Swal.fire({icon:'error', title:'Error', text: err.message});
    }
}

// ════════════════════════════════════════════════════════════
//  VINCULACIÓN ORDEN DE COMPRA
// ════════════════════════════════════════════════════════════

async function searchPendingOC() {
    const codcia = getSelectedCia();
    if (!codcia) return;

    let rucFactura = document.getElementById('invRucProv').value.trim();
    if(rucFactura) {
        document.getElementById('searchOCProv').value = rucFactura;
    }

    const proveedor = document.getElementById('searchOCProv').value.trim();
    const tipo = document.getElementById('buscarTipoOC') ? document.getElementById('buscarTipoOC').value : '';

    console.log('searchPendingOC - codcia:', codcia, 'proveedor:', proveedor, 'tipo:', tipo);

    if (!proveedor) {
        Swal.fire({icon:'warning', title:'Atención', text:'Ingrese RUC del proveedor para buscar OC. Si la factura ya tiene RUC, se usará ese.'});
        return;
    }

    try {
        const token = localStorage.getItem('yelave_token');
        let url = `/api/logistics/orders?codcia=${codcia}&proveedor=${encodeURIComponent(proveedor)}&only_my_records=false`;
        if (tipo) url += `&tipo_oc=${tipo}`;

        console.log('searchPendingOC - URL:', url);

        Swal.fire({ title: 'Buscando OC Pendientes...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('Error al buscar OCs');
        const ocs = await res.json();
        console.log('searchPendingOC - ocs result:', ocs);
        Swal.close();

        if (ocs.length === 0) {
            Swal.fire({icon:'info', title:'Sin resultados', text:'No se encontraron OCs para este proveedor.'});
            document.getElementById('ocSearchResults').style.display = 'none';
            return;
        }

        const tb = document.getElementById('ocResultsTbody');
        let html = '';
        ocs.forEach(o => {
            let monStr = (o.moneda||'').toString().trim();
            if (monStr === '1' || monStr === '1.0' || monStr === 'S/') monStr = 'S/';
            else if (monStr === '2' || monStr === '2.0' || monStr === 'USD') monStr = 'USD';
            // Parsear facturas vinculadas en formato: "CodTipoDoc-Serie-Numero|Id, ..."
            const factVincStr = o.facturas_vinculadas || '';
            let factVincHTML = '<span style="color:#94a3b8;font-size:0.75rem;">Ninguna</span>';
            if (factVincStr) {
                const facturas = factVincStr.split(',').map(f => f.trim());
                const factLinks = facturas.map(f => {
                    const [num, id] = f.split('|');
                    return `<a href="javascript:void(0)" onclick="viewFacturaDetail(${id})" style="color:#2563eb;text-decoration:none;font-size:0.75rem;margin-right:4px;" title="Ver detalle">${num}</a>`;
                });
                factVincHTML = factLinks.join(', ');
            }

            html += `<tr>
                <td style="white-space:nowrap;">
                    <button class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; background:#f59e0b; color:white; border:none;" onclick="loadOCDetails('${o.nrodoc}', '${o.tipooc}', '${o.anos}', '${o.ruc}', '${escapeHtml(o.proveedor)}', '${monStr}', '${escapeHtml(factVincStr)}')">Vincular</button>
                    <button class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:#f59e0b; border:1px solid #f59e0b; margin-left:4px;" onclick="previewOCDetails('${o.nrodoc}', '${o.tipooc}', '${o.anos}')" title="Ver Contenido OC">Ver Info</button>
                </td>
                <td><span style="font-weight:600;">${o.tipooc}</span> ${o.nrodoc}</td>
                <td>${o.fchdoc ? o.fchdoc.substring(0,10) : '-'}</td>
                <td>${(o.proveedor || '').substring(0,30)}</td>
                <td style="font-family:monospace; font-size:0.8rem;">${o.ruc}</td>
                <td style="text-align:right; font-weight:600;"><span style="color:var(--text-muted); font-size:0.75rem; margin-right:4px;">${monStr}</span>${fmtNum(o.total)}</td>
                <td>${factVincHTML}</td>
            </tr>`;
        });
        
        tb.innerHTML = html;
        document.getElementById('ocSearchResults').style.display = 'block';

        // Inicializar DataTable si no está inicializado
        const table = $('#ocSearchResults table');
        if ($.fn.DataTable.isDataTable(table)) {
            table.DataTable().destroy();
        }
        table.DataTable({
            pageLength: 10,
            lengthMenu: [5, 10, 25, 50],
            language: {
                search: "Buscar:",
                lengthMenu: "Mostrar _MENU_ registros",
                info: "Mostrando _START_ a _END_ de _TOTAL_ registros",
                paginate: { first: "Primero", last: "Último", next: "Siguiente", previous: "Anterior" }
            },
            order: [[1, 'desc'], [2, 'desc']],
            dom: 'Bfrtip',
            buttons: [
                { extend: 'copy', text: 'Copiar', className: 'btn btn-sm btn-outline-secondary' },
                { extend: 'excel', text: 'Excel', className: 'btn btn-sm btn-outline-success' },
                { extend: 'pdf', text: 'PDF', className: 'btn btn-sm btn-outline-danger' },
                { extend: 'print', text: 'Imprimir', className: 'btn btn-sm btn-outline-primary' }
            ]
        });

    } catch(err) {
        Swal.fire({icon:'error', title:'Error', text: err.message});
    }
}

async function loadOCDetails(nrodoc, tipooc, anos, ruc, prov, moneda, factVincStr) {
    const codcia = getSelectedCia();
    if (!codcia) return;

    // Alerta si la OC ya tiene facturas vinculadas
    if (factVincStr && factVincStr.trim()) {
        const facturas = factVincStr.split(',').map(f => f.trim());
        const factLinks = facturas.map(f => {
            const [num] = f.split('|');
            return `<strong>${num}</strong>`;
        }).join(', ');
        const result = await Swal.fire({
            icon: 'warning',
            title: 'OC ya vinculada',
            html: `Esta OC ya se encuentra vinculada a las facturas: ${factLinks}.<br>¿Desea continuar?`,
            showCancelButton: true,
            confirmButtonText: 'Sí, continuar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#f59e0b'
        });
        if (!result.isConfirmed) return;
    }

    try {
        Swal.fire({ title: 'Obteniendo OC...', text: 'Descargando líneas pendientes', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await fetch(`/api/logistics/orders/${nrodoc}/report?codcia=${codcia}&tipo_oc=${tipooc}&year=${anos}`);
        if (!res.ok) throw new Error('La OC no contiene items pendientes o no existe en el año indicado.');
        const ocData = await res.json();
        Swal.close();

        document.getElementById('invNroOC').value = nrodoc;
        document.getElementById('invTipoOC').value = tipooc;
        document.getElementById('invAnosOC').value = anos;

        closeDialog('modalOC');
        
        // STRICT VALIDATION REDUCED TO WARNING (As requested by user: "quiero vincular asi no concidean lo puevo enalzar yo")
        const currentInvRuc = document.getElementById('invRucProv').value.trim();
        if (currentInvRuc && currentInvRuc !== ruc.trim()) {
            Swal.fire({icon:'warning', title:'RUC Diferente', text:'El RUC de la Orden de Compra no coincide con el RUC de la factura actual. Verifique antes de cruzarla.'});
            // allowed to continue
        }

        if (!currentInvRuc) {
            document.getElementById('invRucProv').value = ruc;
            document.getElementById('invNomProv').value = prov;
            document.getElementById('invMoneda').value = moneda;
        }

        // LOGICA DE VINCULACION OC (MANUAL POR USUARIO):
        // En lugar de autovincular y reemplazar, levantamos la vista de conciliación
        // para que el usuario seleccione y evalúe.
        window.currentOCDetalle = window.currentOCDetalle || [];
        
        const detalles = ocData.items || [];
        
        // Agregar nuevas líneas al detalle global (para validación en memoria y mult-oc)
        detalles.forEach(d => {
            const pend = parseFloat(d.candes || d.canpend || d.cantidad || 0) - parseFloat(d.cant_ingresada || 0);
            window.currentOCDetalle.push({
                codigo: d.codmat || d.codart || '',
                canpend: pend > 0 ? pend : 0, // Ensure no negative pending
                precio_unitario: parseFloat(d.preuni || d.precio_unitario || 0),
                oc_origen: tipooc + ' ' + (nrodoc || ocData.header?.nrodoc || '')
            });
        });

        const currOcInput = document.getElementById('invNroOC');
        if (currOcInput && currOcInput.value && currOcInput.value !== (ocData.header?.nrodoc || '')) {
            const arr = currOcInput.value.split(',').map(s=>s.trim()).filter(x=>x);
            if (!arr.includes(ocData.header?.nrodoc)) {
                arr.push(ocData.header?.nrodoc || '');
                currOcInput.value = arr.join(', ').substring(0, 50);
            }
        }

        // Levantar Modal
        openConciliarOCModal(ocData);
        
        
    } catch(err) {
        Swal.fire({
            icon:'warning', 
            title:'<span style="font-size:1.25rem;">Orden Vacía o No Encontrada</span>', 
            html: `<p style="color:var(--text-muted); font-size:0.9rem;">${err.message}</p>`,
            confirmButtonText: 'Volver',
            confirmButtonColor: 'var(--primary)'
        });
    }
}

async function previewOCDetails(nrodoc, tipooc, anos) {
    const codcia = getSelectedCia();
    if (!codcia) return;

    try {
        Swal.fire({ title: 'Obteniendo OC...', text: 'Descargando líneas de Orden de Compra', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await fetch(`/api/logistics/orders/${nrodoc}/report?codcia=${codcia}&tipo_oc=${tipooc}&year=${anos}`);
        if (!res.ok) throw new Error('La OC no contiene items pendientes o no existe.');
        const ocData = await res.json();
        Swal.close();

        const detalles = ocData.items || [];
        const cab = ocData.header || {};

        let monCab = (cab.codmon || cab.moneda || '').toString().trim();
        if (monCab === '1' || monCab === '1.0' || monCab === 'S/') monCab = 'S/';
        else if (monCab === '2' || monCab === '2.0' || monCab === 'USD') monCab = 'USD';

        let html = `
            <div style="text-align:left; font-size:0.85rem; color:var(--text-main);">
                <div style="margin-bottom:1rem; padding:1rem; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                        <div><strong>Proveedor:</strong> ${cab.rucaux || cab.ruc || '-'} - ${cab.nomaux || cab.proveedor || '-'}</div>
                        <div><strong>Orden:</strong> ${tipooc} ${nrodoc}</div>
                        <div><strong>Fecha OC:</strong> ${cab.fchdoc || '-'}</div>
                        <div><strong>Moneda:</strong> ${monCab}</div>
                        <div><strong>Total OC:</strong> ${fmtNum(cab.imptot || cab.total || 0)}</div>
                        <div><strong>Estado:</strong> ${(cab.flgest || '').trim() === 'P' ? 'Pendiente' : 'Parcial/Fact.'}</div>
                    </div>
                </div>
                <h4 style="margin:0 0 0.5rem 0; color:#f59e0b; font-size:0.95rem;">Ítems Pendientes por Ingresar (${detalles.length})</h4>
                <div style="max-height:300px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px;">
                    <table class="fluent-table" style="width:100%; border-bottom:none;">
                        <thead style="background:#f1f5f9;">
                            <tr>
                                <th style="padding:0.5rem;">Cod</th>
                                <th style="padding:0.5rem;">Descripción</th>
                                <th style="padding:0.5rem; text-align:right;">Pend.</th>
                                <th style="padding:0.5rem; text-align:right;">Precio</th>
                                <th style="padding:0.5rem; text-align:right;">SubT.</th>
                            </tr>
                        </thead>
                        <tbody>`;
        
        if (detalles.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding:1rem; color:#64748b;">No hay ítems pendientes en esta OC.</td></tr>`;
        } else {
            detalles.forEach(it => {
                const pend = parseFloat(it.candes || it.canpend || it.cantidad || 0) - parseFloat(it.cant_ingresada || 0);
                const p = parseFloat(it.preuni || it.precio_unitario || 0);
                html += `<tr>
                    <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0;">${it.codmat || it.codart || '-'}</td>
                    <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0;" title="${it.desmat || it.desart || ''}">${(it.desmat || it.desart || '').substring(0,40)}</td>
                    <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0; text-align:right;">${pend}</td>
                    <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0; text-align:right;">${fmtNum(p)}</td>
                    <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0; text-align:right; font-weight:600;">${fmtNum(pend * p)}</td>
                </tr>`;
            });
        }
        
        html += `</tbody></table></div></div>`;
        
        Swal.fire({
            title: 'Detalle de Orden de Compra',
            html: html,
            width: 700,
            showCloseButton: true,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#f59e0b'
        });
        
    } catch(err) {
        Swal.fire({icon:'error', title:'Error', text: err.message});
    }
}
// ════════════════════════════════════════════════════════════
//  VISTA CONCILIACIÓN OC
// ════════════════════════════════════════════════════════════

window.tempOcDataList = [];
window.tempOcGlobalData = null;

function openConciliarOCModal(ocData) {
    window.tempOcGlobalData = ocData;
    window.tempOcDataList = [];
    
    // Si la factura está vacía o solo tiene un GEN genérico, lo limpiamos para una carga limpia
    if (invoiceItems.length === 1 && invoiceItems[0].codigo === 'GEN') {
        invoiceItems = [];
    }

    const detalles = ocData.items || [];
    const invoiceUsed = invoiceItems.map(() => false);

    detalles.forEach((d, j) => {
        let matchFacturaIdx = -1;
        const dCant = parseFloat(d.candes || d.canpend || d.cantidad || 0) - parseFloat(d.cant_ingresada || 0);
        const dPu = parseFloat(d.preuni || d.precio_unitario || 0);

        for (let i=0; i<invoiceItems.length; i++) {
             if(invoiceUsed[i] || invoiceItems[i].fromOC) continue;
             const it = invoiceItems[i];
             if (Math.abs(it.cant - dCant) < 0.01 && Math.abs(it.pu - dPu) <= 0.05) {
                 matchFacturaIdx = i; break;
             }
        }
        if (matchFacturaIdx === -1) {
             for (let i=0; i<invoiceItems.length; i++) {
                 if(invoiceUsed[i] || invoiceItems[i].fromOC) continue;
                 if (Math.abs(invoiceItems[i].cant - dCant) < 0.01) { matchFacturaIdx = i; break; }
             }
        }
        // Asignación fallback simple (top-down)
        if (matchFacturaIdx === -1) {
            matchFacturaIdx = invoiceUsed.findIndex((u, i) => !u && !invoiceItems[i].fromOC);
        }
        
        let invItemRef = null;
        if(matchFacturaIdx >= 0) {
           invoiceUsed[matchFacturaIdx] = true;
           invItemRef = invoiceItems[matchFacturaIdx];
        }

        window.tempOcDataList.push({
            ocItem: d,
            cantPendiente: dCant,
            precioOc: dPu,
            cantIngresar: dCant,
            matchFacturaIdx: matchFacturaIdx,
            invItem: invItemRef,
            include: true // checkbox by default
        });
    });

    renderConciliacionTable();
    openDialog('modalConciliarOC');
}

function renderConciliacionTable() {
    const tb = document.getElementById('conciliarOCTbody');
    let html = '';
    let difAlerts = [];

    window.tempOcDataList.forEach((row, i) => {
        const d = row.ocItem;
        let precioFacturaStr = '-';
        let estadoCruces = '<span style="color:#10b981; font-weight:600; font-size:0.75rem;">NUEVO</span>';
        
        if (row.invItem) {
            precioFacturaStr = fmtNum(row.invItem.pu);
            if (Math.abs(row.invItem.pu - row.precioOc) > 0.05) {
                estadoCruces = `<span style="color:#ef4444; font-weight:600; font-size:0.75rem;">VINCULA (DIF. PRECIO)</span>`;
                if(row.include) difAlerts.push(`El ítem <b>${d.codmat || d.codart || '-'}</b> tiene diferente precio en la factura (${fmtNum(row.invItem.pu)} vs ${fmtNum(row.precioOc)}).`);
            } else {
                estadoCruces = `<span style="color:#10b981; font-weight:600; font-size:0.75rem;">VINCULA (OK)</span>`;
            }
        }

        if (row.cantIngresar < row.cantPendiente && row.include) {
            if(!row.invItem || Math.abs(row.invItem.pu - row.precioOc) <= 0.05) {
                estadoCruces = `<span style="color:#f59e0b; font-weight:600; font-size:0.75rem;">VINCULA (PARCIAL)</span>`;
            }
            difAlerts.push(`El ítem <b>${d.codmat || d.codart || '-'}</b> ingresará parcialmente (${row.cantIngresar} de ${row.cantPendiente}).`);
        }

        if (row.cantIngresar > row.cantPendiente && row.include) {
            estadoCruces = `<span style="color:#ef4444; font-weight:600; font-size:0.75rem;">VINCULA (EXCEDE)</span>`;
            difAlerts.push(`El ítem <b>${d.codmat || d.codart || '-'}</b> excede la cantidad de la OC (${row.cantIngresar} de ${row.cantPendiente}).`);
        }

        html += `
            <tr style="background:${row.include ? 'white' : '#f8fafc'}">
                <td style="text-align:center;"><input type="checkbox" onchange="window.tempOcDataList[${i}].include=this.checked; renderConciliacionTable();" ${row.include ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary);"></td>
                <td style="${!row.include?'text-decoration:line-through;color:#94a3b8;':''}">${d.codmat || d.codart || '-'}</td>
                <td style="${!row.include?'text-decoration:line-through;color:#94a3b8;':''}" title="${d.desmat || d.desart || ''}">${d.desmat || d.desart ? (d.desmat || d.desart).substring(0,40)+'...' : ''}</td>
                <td style="text-align:right; font-weight:500;">${row.cantPendiente}</td>
                <td style="text-align:right; border-right: 2px solid var(--border-soft); padding: 0.3rem;">
                    <input type="number" step="0.01" class="modern-input highlight-edit" style="width:80px; text-align:right; padding:0.25rem 0.5rem; ${!row.include?'opacity:0.5;pointer-events:none;':''}" value="${row.cantIngresar}" onchange="updateConciliarCant(${i}, this.value)">
                </td>
                <td style="text-align:right;">${fmtNum(row.precioOc)}</td>
                <td style="text-align:right; font-weight:600;">${precioFacturaStr}</td>
                <td>${row.include ? estadoCruces : '<span style="color:var(--text-muted); font-size:0.75rem;">OMITIDO</span>'}</td>
            </tr>
        `;
    });

    tb.innerHTML = html;

    const alertBox = document.getElementById('conciliarOCAlert');
    if (difAlerts.length > 0) {
        alertBox.style.display = 'block';
        alertBox.style.background = '#fffbeb';
        alertBox.style.borderLeft = '4px solid #f59e0b';
        alertBox.style.color = '#92400e';
        alertBox.innerHTML = `<strong>Avisos de Cruce:</strong><br><ul style="margin:0; padding-left:1.5rem; margin-top:0.4rem;">` + difAlerts.map(a=>`<li>${a}</li>`).join('') + `</ul>`;
    } else {
        alertBox.style.display = 'none';
        alertBox.innerHTML = '';
    }
}

function updateConciliarCant(idx, val) {
    let v = parseFloat(val);
    if (isNaN(v)) v = 0;
    window.tempOcDataList[idx].cantIngresar = v;
    renderConciliacionTable();
}

function confirmarConciliacionOC() {
    const dataList = window.tempOcDataList;
    if(!dataList || dataList.length === 0) {
        closeDialog('modalConciliarOC');
        return;
    }

    let isDifPrice = false;
    dataList.forEach(row => {
        if (!row.include || row.cantIngresar <= 0) return;
        if (row.invItem && Math.abs(row.invItem.pu - row.precioOc) > 0.05) isDifPrice = true;
    });

    if (isDifPrice) {
        Swal.fire({
            icon: 'warning',
            title: 'Diferencia en Costos',
            text: 'Existen diferencias en el precio unitario entre la Orden de Compra y la Factura. Si continúa, se priorizará la integración a la cuenta con los montos de la factura, pero se conservarán las variaciones con fines de auditoría. ¿Desea continuar con el cruce?',
            showCancelButton: true,
            confirmButtonText: 'Sí, cruzar de todas formas',
            cancelButtonText: 'Revisar manual'
        }).then((result) => {
            if(result.isConfirmed) processConfirmConciliacionOC();
        });
    } else {
        processConfirmConciliacionOC();
    }
}

function processConfirmConciliacionOC() {
    const dataList = window.tempOcDataList;
    
    dataList.forEach(row => {
        if (!row.include || row.cantIngresar <= 0) return;

        const d = row.ocItem;
        const ocOrigenTracker = ((d.codtipdococ||'') + (d.numdococ||'')) || (window.tempOcGlobalData.header?.nrodoc || '');

        const codmat = d.codmat || d.codart || '';
        const desmat = d.desmat || d.desart || '';
        const und = d.undstk || d.codund || 'NIU';

        if (row.matchFacturaIdx >= 0) {
            // Existe en la factura original y se emparejó, sólo ENRIQUECEMOS
            const item = invoiceItems[row.matchFacturaIdx];
            item.codProv = item.codigo || item.codProv || '';
            item.codigo = codmat || item.codigo;
            
            // Requerimiento: "al guardar la descripcion tambien aparesca la descripcion de la OC"
            if (desmat) {
                if (item.desc && item.desc.trim() !== desmat.trim()) {
                    item.desc = `${item.desc.trim()} [Ref OC: ${desmat.trim()}]`;
                } else {
                    item.desc = desmat;
                }
            }
            
            item.cant = row.cantIngresar;
            item.vv = item.cant * item.pu;
            item.igv = item.vv * 0.18;
            item.total = item.vv + item.igv;
            
            item.fromOC = true;
            item.oc_origen = ocOrigenTracker;
        } else {
            // No existe en factura (Ítem NUEVO inyectado de la OC)
            const vv = row.cantIngresar * row.precioOc;
            const igv = vv * 0.18;
            invoiceItems.push({
                codigo: codmat,
                codProv: '',
                desc: desmat,
                und: und,
                cant: row.cantIngresar,
                pu: row.precioOc,
                vv: vv,
                igv: igv,
                total: vv + igv,
                fromOC: true,
                oc_origen: ocOrigenTracker
            });
        }
    });

    renderInvoiceItems();
    closeDialog('modalConciliarOC');
}

function clearOC() {
    document.getElementById('invNroOC').value = '';
    document.getElementById('invTipoOC').value = '';
    document.getElementById('invAnosOC').value = '';
    document.getElementById('ocSearchResults').style.display = 'none';
    window.currentOCDetalle = [];
}

// ════════════════════════════════════════════════════════════
//  ITEMS y CALCULOS
// ════════════════════════════════════════════════════════════

function renderInvoiceItems() {
    const tb = document.getElementById('invItemsTbody');
    if (invoiceItems.length === 0) {
        tb.innerHTML = '<tr id="invNoItems"><td colspan="12" style="text-align:center; padding:2rem; color:var(--text-muted);">Sin ítems. Busque un comprobante SUNAT, cargue una OC o agregue ítems manualmente.</td></tr>';
        updateTotals(0,0,0);
        return;
    }
    
    let html = '';
    let totG = 0, totE = 0, totI = 0, igvT = 0, totT = 0, subT = 0;
    
    invoiceItems.forEach((it, i) => {
        subT += it.vv;
        igvT += it.igv;
        totT += it.total;
        
        let tp = it.tipoOp || 'gravada';
        if(tp === 'gravada') totG += it.vv;
        else if(tp === 'exonerada') totE += it.vv;
        else if(tp === 'inafecta') totI += it.vv;

        let warning = '';
        if (window.currentOCDetalle && window.currentOCDetalle.length > 0 && it.fromOC) {
            const matchOC = window.currentOCDetalle.find(o => o.codigo === it.codigo);
            if (matchOC) {
                if (it.cant > matchOC.canpend) warning += `<i style="color:#ef4444;font-size:0.7rem;display:block;">Excede cant. OC (${matchOC.canpend})</i>`;
                if (Math.abs(it.pu - matchOC.precio_unitario) > 0.01) warning += `<i style="color:#f59e0b;font-size:0.7rem;display:block;">Precio difiere de OC (${fmtNum(matchOC.precio_unitario)})</i>`;
            }
        }

        html += `
            <tr>
                <td>${i+1}</td>
                <td style="text-align:center;">
                    <input type="checkbox" id="itemExtraCheck_${i}" ${it.extraData && (it.extraData.inci || it.extraData.fabricante || it.extraData.obs1 || it.extraData.obs2 || it.extraData.obs3 || it.extraData.obs4) ? 'checked' : ''} onchange="toggleItemExtraData(${i})" title="Agregar más datos">
                </td>
                <td>
                    <div style="display:flex; gap:0.2rem;">
                        <input type="text" class="item-input-cell" style="width:70%; font-weight:600; color:var(--primary);" value="${it.codigo}" onchange="updateItem(${i}, 'codigo', this.value)" readonly>
                        <button class="btn-sec" style="width:30%; padding:0.2rem; display:flex; align-items:center; justify-content:center;" onclick="openItemSearchModal(${i})" title="Buscar en Catálogo">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </button>
                    </div>
                </td>
                <td><input type="text" class="item-input-edit" placeholder="Opcional..." value="${it.codProv || ''}" onchange="updateItem(${i}, 'codProv', this.value)" title="Código de Referencia del Proveedor / Factura"></td>
                <td>
                    <input type="text" class="item-input-edit" style="width:100%;" value="${it.desc}" onchange="updateItem(${i}, 'desc', this.value)">
                    ${it.oc_origen ? `<div style="font-size:0.65rem; color:#f59e0b; margin-top:2px; font-weight:600;">Origen: ${it.oc_origen}</div>` : ''}
                </td>
                <td><input type="text" class="item-input-edit" style="width:50px; text-align:center;" value="${it.und}" onchange="updateItem(${i}, 'und', this.value)"></td>
                <td>
                    <input type="number" step="0.01" class="item-input-edit highlight-edit" style="width:70px; text-align:right;" value="${it.cant}" onchange="updateItem(${i}, 'cant', this.value)" title="Edite para declarar recepción parcial">
                    ${warning}
                </td>
                <td><input type="number" step="0.0001" class="item-input-edit" style="width:80px; text-align:right;" value="${it.pu}" onchange="updateItem(${i}, 'pu', this.value)"></td>
                <td style="text-align:right; font-weight:500;">${fmtNum(it.vv)}</td>
                <td><input type="number" step="0.01" class="item-input-edit" style="width:60px; text-align:right;" value="${it.igv}" onchange="updateItem(${i}, 'igv', this.value)"></td>
                <td style="text-align:right; font-weight:600; color:var(--primary);">${fmtNum(it.total)}</td>
                <td style="text-align:center;">
                    <div style="display:flex; justify-content:center; gap:0.25rem;">
                        <button class="btn-flat" style="padding:4px; color:#2563eb;" onclick="editInvoiceItem(${i})" title="Editar Cálculos / Lógica de Impuesto">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </button>
                        <button class="btn-flat" style="padding:4px; color:#ef4444;" onclick="removeInvoiceItem(${i})" title="Eliminar fila">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });    
    tb.innerHTML = html;
    updateTotals(subT, igvT, totT, totG, totE, totI);
    runValidationInsights();
}

function runValidationInsights() {
    const valPanel = document.getElementById('validationInsights');
    const valAlerts = document.getElementById('validationAlerts');
    if (window.currentOCDetalle && window.currentOCDetalle.length > 0) {
        let hasWarnings = false;
        let msgs = '';
        invoiceItems.forEach(it => {
            if (!it.fromOC) return;
            const match = window.currentOCDetalle.find(o => o.codigo === it.codigo);
            if (match) {
                if(it.cant > match.canpend) { hasWarnings=true; msgs+=`&bull; Ítem ${it.codigo}: Cantidad excede (${it.cant} > ${match.canpend})<br>`; }
                if(Math.abs(it.pu - match.precio_unitario) > 0.01) { hasWarnings=true; msgs+=`&bull; Ítem ${it.codigo}: Precio difiere de OC (${fmtNum(match.precio_unitario)})<br>`; }
            }
        });
        if (hasWarnings) {
            valPanel.style.display = 'block';
            valAlerts.innerHTML = msgs;
            valAlerts.style.borderLeftColor = '#ef4444';
            valAlerts.style.background = '#fef2f2';
        } else {
            valPanel.style.display = 'block';
            valAlerts.innerHTML = '<span style="color:#10b981;">✓ Líneas coinciden correctamente con la Orden de Compra.</span>';
            valAlerts.style.borderLeftColor = '#10b981';
            valAlerts.style.background = '#f0fdf4';
        }
    } else {
        if(valPanel) valPanel.style.display = 'none';
    }
}

// ── BÚSQUEDA DE ÍTEM (MODAL) ──
function openItemSearchModal(idx) {
    document.getElementById('searchItemTargetIndex').value = idx;
    document.getElementById('catalogoSearchInput').value = '';
    document.getElementById('catalogoSearchResults').innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.9rem;">Escriba al menos 2 caracteres...</div>';
    document.getElementById('modalSearchItem').classList.add('active');
    setTimeout(() => document.getElementById('catalogoSearchInput').focus(), 100);
}

let _acDebounce;
async function executeCatalogSearch(q) {
    q = q.trim();
    const resDiv = document.getElementById('catalogoSearchResults');
    if (q.length < 2) { 
        resDiv.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.9rem;">Escriba al menos 2 caracteres...</div>';
        return; 
    }
    
    clearTimeout(_acDebounce);
    _acDebounce = setTimeout(async () => {
        const codcia = getSelectedCia();
        if(!codcia) return;
        try {
            const res = await fetch(`/api/contabilidad/items/autocomplete?codcia=${codcia}&q=${encodeURIComponent(q)}`);
            if(!res.ok) throw new Error();
            const items = await res.json();
            
            if(items.length===0) {
                resDiv.innerHTML = '<div style="padding:2rem; text-align:center; color:#94a3b8; font-size:0.9rem;">No se encontraron resultados.</div>';
            } else {
                resDiv.innerHTML = items.map(it => {
                    let badgeColor = it.tipo === 'Producto' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 
                                     it.tipo === 'Servicio' ? 'bg-blue-100 text-blue-800 border-blue-200' : 
                                     'bg-purple-100 text-purple-800 border-purple-200';
                    return `
                    <div style="padding:0.75rem 1rem; border:1px solid var(--border-soft); border-radius:8px; cursor:pointer; font-size:0.85rem; transition:all 0.15s; background:white; display:flex; gap:1rem; align-items:center;" 
                          onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translateY(-1px)';" onmouseout="this.style.borderColor='var(--border-soft)'; this.style.transform='none';"
                          onclick="selectModalItem('${escapeHtml(it.codigo)}', '${escapeHtml(it.descripcion)}')">
                          <span style="display:inline-block; padding:0.2rem 0.5rem; font-size:0.7rem; font-weight:600; border-radius:4px; ${badgeColor.replace(/bg-([a-z]+)-100/g, 'background:#eff6ff').replace(/text-([a-z]+)-800/g, 'color:#1e40af')} text-transform:uppercase; min-width:70px; text-align:center;">${it.tipo}</span> 
                          <span style="font-weight:600; min-width:100px;">${it.codigo}</span> 
                          <span>${it.descripcion}</span>
                    </div>`
                }).join('');
            }
        } catch(e) { 
            resDiv.innerHTML = '<div style="padding:2rem; text-align:center; color:#ef4444; font-size:0.9rem;">Error en la búsqueda.</div>';
        }
    }, 350);
}

function openNewItemSearch() {
    document.getElementById('searchItemTargetIndex').value = '-1';
    document.getElementById('catalogoSearchInput').value = '';
    document.getElementById('catalogoSearchResults').innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.9rem;">Escriba al menos 2 caracteres...</div>';
    document.getElementById('modalSearchItem').classList.add('active');
    setTimeout(() => document.getElementById('catalogoSearchInput').focus(), 100);
}

function selectModalItem(codigo, desc) {
    closeDialog('modalSearchItem');
    const idxStr = document.getElementById('searchItemTargetIndex').value;
    
    if (idxStr === '-1') {
        // En vez de agregar fila vacía directa, abrimos la ventana de IMPUESTOS Y LÓGICA MANUAL
        document.getElementById('manualDesc').value = codigo === 'USER-LIBRE' ? desc : (codigo + ' - ' + desc);
        document.getElementById('manualCant').value = '1.00';
        document.getElementById('manualPrecio').value = '0.00';
        document.getElementById('manualTipoOp').value = 'gravada';
        document.getElementById('manualPorcIgv').value = '18.0';
        document.getElementById('manualIncluyeIgv').value = 'SI';
        toggleManualIgvOptions();
        
        // Save the chosen code temporally to an attribute to be able to push it properly
        document.getElementById('modalManualEntry').setAttribute('data-pending-code', codigo === 'USER-LIBRE' ? 'MANUAL' : codigo);
        document.getElementById('modalManualEntry').setAttribute('data-edit-index', '-1');
        
        document.getElementById('modalManualEntry').classList.add('active');
        setTimeout(() => { document.getElementById('manualCant').focus(); }, 100);
    } else {
        const idx = parseInt(idxStr, 10);
        if (!isNaN(idx) && invoiceItems[idx]) {
            invoiceItems[idx].codigo = codigo;
            invoiceItems[idx].desc = desc;
            renderInvoiceItems();
        }
    }
}

function updateItem(index, field, value) {
    if(!invoiceItems[index]) return;
    const it = invoiceItems[index];
    
    if (field === 'cant' || field === 'pu' || field === 'igv') {
        it[field] = parseFloat(value) || 0;
        it.vv = it.cant * it.pu;
        if (field !== 'igv') it.igv = it.vv * 0.18;
        it.total = it.vv + it.igv;
    } else {
        it[field] = value;
    }
    renderInvoiceItems();
}

function addInvoiceItem() {
    document.getElementById('manualDesc').value = '';
    document.getElementById('manualCant').value = '1.00';
    document.getElementById('manualPrecio').value = '0.00';
    document.getElementById('manualTipoOp').value = 'gravada';
    document.getElementById('manualPorcIgv').value = '18.0';
    document.getElementById('manualIncluyeIgv').value = 'SI';
    toggleManualIgvOptions();
    document.getElementById('modalManualEntry').setAttribute('data-edit-index', '-1');
    document.getElementById('modalManualEntry').classList.add('active');
    setTimeout(() => document.getElementById('manualDesc').focus(), 100);
}

function editInvoiceItem(index) {
    const it = invoiceItems[index];
    if(!it) return;
    
    document.getElementById('manualDesc').value = it.desc;
    document.getElementById('manualCant').value = it.cant;
    document.getElementById('manualPrecio').value = it.pu;
    document.getElementById('manualTipoOp').value = it.tipoOp || 'gravada';
    
    if ((it.tipoOp || 'gravada') === 'gravada') {
        const perc = it.vv > 0 ? (it.igv / it.vv) * 100 : 18.0;
        document.getElementById('manualPorcIgv').value = perc.toFixed(1);
    } else {
        document.getElementById('manualPorcIgv').value = '0.0';
    }
    
    document.getElementById('manualIncluyeIgv').value = 'NO';
    toggleManualIgvOptions();
    
    document.getElementById('modalManualEntry').setAttribute('data-edit-index', index);
    document.getElementById('modalManualEntry').setAttribute('data-pending-code', it.codigo);
    document.getElementById('modalManualEntry').classList.add('active');
}

function toggleManualIgvOptions() {
    const op = document.getElementById('manualTipoOp').value;
    const block = document.getElementById('manualIgvBlock');
    if (op === 'gravada') {
        block.style.display = 'grid';
    } else {
        block.style.display = 'none';
        document.getElementById('manualPorcIgv').value = '0.0';
    }
}

function injectManualItem() {
    const desc = document.getElementById('manualDesc').value.trim();
    if (!desc) { Swal.fire('Error', 'Ingrese una descripción', 'warning'); return; }
    
    const cant = parseFloat(document.getElementById('manualCant').value) || 1;
    let precio = parseFloat(document.getElementById('manualPrecio').value) || 0;
    
    const op = document.getElementById('manualTipoOp').value;
    const porcIgv = op === 'gravada' ? (parseFloat(document.getElementById('manualPorcIgv').value) || 18.0) : 0;
    const incluyeIgv = document.getElementById('manualIncluyeIgv').value === 'SI';
    
    let pu = 0, vv = 0, igv = 0, total = 0;
    
    if (op === 'gravada') {
        if (incluyeIgv) {
            total = precio * cant;
            vv = total / (1 + (porcIgv / 100));
            igv = total - vv;
            pu = vv / cant;
        } else {
            vv = precio * cant;
            pu = precio;
            igv = vv * (porcIgv / 100);
            total = vv + igv;
        }
    } else {
        vv = precio * cant;
        pu = precio;
        igv = 0;
        total = vv;
    }
    
    const codeToInject = document.getElementById('modalManualEntry').getAttribute('data-pending-code') || 'MANUAL';
    
    const obj = {
        codigo: codeToInject, 
        desc: desc,
        und: 'NIU',
        cant: cant,
        pu: pu,
        vv: vv,
        igv: igv,
        total: total,
        tipoOp: op
    };
    
    const editIdx = document.getElementById('modalManualEntry').getAttribute('data-edit-index');
    if (editIdx && editIdx !== '-1') {
        const i = parseInt(editIdx);
        obj.codProv = invoiceItems[i].codProv;
        obj.und = invoiceItems[i].und;
        obj.fromOC = invoiceItems[i].fromOC;
        obj.oc_origen = invoiceItems[i].oc_origen;
        invoiceItems[i] = obj;
    } else {
        invoiceItems.push(obj);
    }
    
    renderInvoiceItems();
    closeDialog('modalManualEntry');
}

function removeInvoiceItem(index) {
    invoiceItems.splice(index, 1);
    renderInvoiceItems();
}

function toggleItemExtraData(index) {
    console.log('toggleItemExtraData called with index:', index);
    // Abrir modal en lugar de expandir fila
    openItemExtraModal(index);
}

function openItemExtraModal(index) {
    // Crear modal dinámicamente si no existe
    let modal = document.getElementById('modalItemExtraData');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalItemExtraData';
        modal.className = 'fluent-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;backdrop-filter:blur(4px);background:rgba(15,23,42,0.4);z-index:1000;display:none;align-items:center;justify-content:center;';
        modal.innerHTML = `
            <div class="fluent-dialog" style="max-width:700px;background:white;border-radius:12px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);display:flex;flex-direction:column;max-height:85vh;border:1px solid rgba(255,255,255,0.1);">
                <div class="fluent-dialog-header" style="padding:1.5rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;">
                    <div>
                        <h3 class="fluent-dialog-title" style="margin:0;font-size:1.2rem;font-weight:700;">Datos Adicionales del Ítem</h3>
                        <div style="font-size:0.85rem;color:#64748b;margin-top:0.25rem;">INCI, Fabricante y Observaciones</div>
                    </div>
                    <button class="fluent-dialog-close" onclick="closeItemExtraModal()" style="background:#f1f5f9;border:none;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#64748b;">
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="fluent-dialog-body" style="padding:1.5rem;overflow-y:auto;background:white;display:flex;flex-direction:column;gap:1.25rem;">
                    <input type="hidden" id="itemExtraIndex">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                        <div class="input-group"><label>INCI</label><input type="text" id="itemExtraINCI" class="modern-input" placeholder="Código INCI"></div>
                        <div class="input-group"><label>Nombre del Fabricante</label><input type="text" id="itemExtraFabricante" class="modern-input" placeholder="Nombre del fabricante"></div>
                    </div>
                    <div style="border-top:1px solid #e2e8f0;padding-top:1rem;">
                        <div style="font-weight:600;font-size:0.85rem;color:#0f172a;margin-bottom:0.75rem;">Fecha de Vencimiento del Ítem</div>
                        <div class="input-group" style="margin-bottom:1rem;">
                            <label>Fecha de Vencimiento</label>
                            <input type="date" id="itemExtraFechaVencimiento" class="modern-input">
                        </div>
                        <div style="font-weight:600;font-size:0.85rem;color:#0f172a;margin-bottom:0.75rem;">Observaciones y Archivos</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:0.75rem;">
                            <div class="input-group"><label>Observación 1</label><input type="text" id="itemExtraObs1" class="modern-input" placeholder="Descripción..."></div>
                            <div class="input-group"><label>Archivos</label><input type="file" id="itemExtraFiles1" multiple accept=".pdf,.jpg,.png,.xlsx,.docx" class="modern-input"></div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:0.75rem;">
                            <div class="input-group"><label>Observación 2</label><input type="text" id="itemExtraObs2" class="modern-input" placeholder="Descripción..."></div>
                            <div class="input-group"><label>Archivos</label><input type="file" id="itemExtraFiles2" multiple accept=".pdf,.jpg,.png,.xlsx,.docx" class="modern-input"></div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:0.75rem;">
                            <div class="input-group"><label>Observación 3</label><input type="text" id="itemExtraObs3" class="modern-input" placeholder="Descripción..."></div>
                            <div class="input-group"><label>Archivos</label><input type="file" id="itemExtraFiles3" multiple accept=".pdf,.jpg,.png,.xlsx,.docx" class="modern-input"></div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                            <div class="input-group"><label>Observación 4</label><input type="text" id="itemExtraObs4" class="modern-input" placeholder="Descripción..."></div>
                            <div class="input-group"><label>Archivos</label><input type="file" id="itemExtraFiles4" multiple accept=".pdf,.jpg,.png,.xlsx,.docx" class="modern-input"></div>
                        </div>
                    </div>
                </div>
                <div style="padding:1rem 1.5rem;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:0.75rem;">
                    <button class="btn-sec" onclick="closeItemExtraModal()" style="padding:0.6rem 1rem;border-radius:6px;border:1px solid #e2e8f0;background:white;font-weight:500;cursor:pointer;">Cancelar</button>
                    <button class="btn-sec" onclick="saveItemExtraData()" style="padding:0.6rem 1rem;border-radius:6px;border:1px solid #2563eb;background:#2563eb;color:white;font-weight:500;cursor:pointer;">Guardar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    document.getElementById('itemExtraIndex').value = index;
    
    // Cargar datos existentes si los hay
    const item = invoiceItems[index];
    const extraData = item.extraData || {
        inci: '',
        fabricante: '',
        fecha_vencimiento: '',
        obs1: '',
        obs2: '',
        obs3: '',
        obs4: '',
        files: {}
    };
    
    document.getElementById('itemExtraINCI').value = extraData.inci || '';
    document.getElementById('itemExtraFabricante').value = extraData.fabricante || '';
    document.getElementById('itemExtraFechaVencimiento').value = extraData.fecha_vencimiento || '';
    document.getElementById('itemExtraObs1').value = extraData.obs1 || '';
    document.getElementById('itemExtraObs2').value = extraData.obs2 || '';
    document.getElementById('itemExtraObs3').value = extraData.obs3 || '';
    document.getElementById('itemExtraObs4').value = extraData.obs4 || '';
    
    // Limpiar inputs de archivos
    document.getElementById('itemExtraFiles1').value = '';
    document.getElementById('itemExtraFiles2').value = '';
    document.getElementById('itemExtraFiles3').value = '';
    document.getElementById('itemExtraFiles4').value = '';
    
    // Mostrar archivos existentes si los hay
    const itemArchivos = extraData.files || {};
    console.log(`openItemExtraModal - Item ${index}, extraData:`, extraData);
    console.log(`openItemExtraModal - Item ${index}, files:`, itemArchivos);
    
    for (let i = 1; i <= 4; i++) {
        const obsField = `obs${i}`;
        const archivosObs = itemArchivos[obsField] || [];
        console.log(`openItemExtraModal - obs${i}:`, archivosObs);
        const filesDiv = document.getElementById(`itemExtraFiles${i}Preview`);
        if (filesDiv) {
            filesDiv.remove();
        }
        
        if (archivosObs.length > 0) {
            const previewDiv = document.createElement('div');
            previewDiv.id = `itemExtraFiles${i}Preview`;
            previewDiv.style.cssText = 'margin-top:0.5rem;font-size:0.8rem;color:#64748b;';
            let html = '<div style="font-weight:600;margin-bottom:0.25rem;">Archivos existentes:</div>';
            archivosObs.forEach((a, idx) => {
                const ext = (a.name||a.NombreArchivo||'').split('.').pop().toUpperCase();
                const color = ext === 'PDF' ? '#ef4444' : ext === 'XML' ? '#10b981' : '#6366f1';
                const fileId = a.id || a.Id;
                const fileName = a.name || a.NombreArchivo || 'Archivo sin nombre';
                html += `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
                    <span style="background:${color};color:white;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;">${ext}</span>
                    <span style="flex:1;">${fileName}</span>
                    ${fileId ? `<button onclick="deleteItemFile(${fileId}, '${obsField}', ${index})" style="padding:0.15rem 0.4rem;font-size:0.65rem;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️</button>` : ''}
                </div>`;
            });
            previewDiv.innerHTML = html;
            document.getElementById(`itemExtraFiles${i}`).parentNode.appendChild(previewDiv);
        }
    }
    
    // Mostrar modal
    modal.style.display = 'flex';
}

async function deleteItemFile(archivoId, obsField, itemIndex) {
    if (!confirm('¿Está seguro de eliminar este archivo?')) return;
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/contabilidad/facturas/items/archivos/${archivoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            // Eliminar archivo de la memoria local
            if (invoiceItems[itemIndex].extraData.files && invoiceItems[itemIndex].extraData.files[obsField]) {
                invoiceItems[itemIndex].extraData.files[obsField] = invoiceItems[itemIndex].extraData.files[obsField].filter(f => f.id !== archivoId);
            }
            
            // Recargar el modal para actualizar la vista
            openItemExtraModal(itemIndex);
            
            Swal.fire({
                icon: 'success',
                title: 'Eliminado',
                text: 'Archivo eliminado correctamente',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000
            });
        } else {
            throw new Error('Error al eliminar archivo');
        }
    } catch (err) {
        console.error('Error al eliminar archivo:', err);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo eliminar el archivo'
        });
    }
}

function closeItemExtraModal() {
    document.getElementById('modalItemExtraData').style.display = 'none';
}

async function saveItemExtraData() {
    const index = parseInt(document.getElementById('itemExtraIndex').value);
    
    // Inicializar extraData si no existe
    if (!invoiceItems[index].extraData) {
        invoiceItems[index].extraData = {
            inci: '',
            fabricante: '',
            obs1: '',
            obs2: '',
            obs3: '',
            obs4: '',
            files: {}
        };
    }
    
    // Preservar archivos existentes
    const existingFiles = invoiceItems[index].extraData.files || {};
    
    // Guardar datos de texto
    invoiceItems[index].extraData.inci = document.getElementById('itemExtraINCI').value;
    invoiceItems[index].extraData.fabricante = document.getElementById('itemExtraFabricante').value;
    invoiceItems[index].extraData.fecha_vencimiento = document.getElementById('itemExtraFechaVencimiento').value;
    invoiceItems[index].extraData.obs1 = document.getElementById('itemExtraObs1').value;
    invoiceItems[index].extraData.obs2 = document.getElementById('itemExtraObs2').value;
    invoiceItems[index].extraData.obs3 = document.getElementById('itemExtraObs3').value;
    invoiceItems[index].extraData.obs4 = document.getElementById('itemExtraObs4').value;
    
    // Guardar archivos (múltiples por observación)
    const fileInputs = [
        { field: 'obs1', input: 'itemExtraFiles1' },
        { field: 'obs2', input: 'itemExtraFiles2' },
        { field: 'obs3', input: 'itemExtraFiles3' },
        { field: 'obs4', input: 'itemExtraFiles4' }
    ];
    
    for (const { field, input } of fileInputs) {
        const fileInput = document.getElementById(input);
        if (fileInput.files.length > 0) {
            console.log(`saveItemExtraData - Procesando ${field}: ${fileInput.files.length} archivos`);
            // Guardar archivos directamente en memoria sin clonar
            if (!invoiceItems[index].extraData.files[field]) {
                invoiceItems[index].extraData.files[field] = [];
            }
            for (const file of fileInput.files) {
                // Mantener el archivo original sin clonar
                invoiceItems[index].extraData.files[field].push(file);
                console.log(`Archivo guardado en memoria: ${field}, ${file.name}, size: ${file.size}`);
            }
            // No limpiar el input para que el usuario pueda ver qué archivos seleccionó
        }
    }
    
    console.log(`saveItemExtraData - Archivos en memoria después de guardar:`, invoiceItems[index].extraData.files);
    
    // Marcar checkbox como seleccionado
    const checkbox = document.getElementById(`itemExtraCheck_${index}`);
    if (checkbox) checkbox.checked = true;
    
    closeItemExtraModal();
    Swal.fire({
        icon: 'success',
        title: 'Guardado',
        text: 'Datos adicionales guardados correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000
    });
}

function updateItemExtra(index, field, value) {
    if (!invoiceItems[index].extraData) {
        invoiceItems[index].extraData = {};
    }
    invoiceItems[index].extraData[field] = value;
}

async function handleItemFileUpload(index, obsField, input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    if (!invoiceItems[index].extraData) {
        invoiceItems[index].extraData = {};
    }
    if (!invoiceItems[index].extraData.files) {
        invoiceItems[index].extraData.files = {};
    }
    
    // Guardar archivo en memoria para subir después de guardar la factura
    if (!invoiceItems[index].extraData.files[obsField]) {
        invoiceItems[index].extraData.files[obsField] = [];
    }
    invoiceItems[index].extraData.files[obsField].push(file);
    
    console.log(`Archivo guardado en memoria: item ${index}, obs ${obsField}, archivo ${file.name}`);
    
    // Solo subir inmediatamente si estamos editando (ya tenemos factura_id)
    if (window.editingFacturaId) {
        const formData = new FormData();
        formData.append('item_index', index);
        formData.append('obs_field', obsField);
        formData.append('archivo', file);
        formData.append('created_by', JSON.parse(localStorage.getItem('yelave_user') || '{}').login || 'SISTEMA');
        
        try {
            const res = await fetch(`/api/contabilidad/facturas/${window.editingFacturaId}/items/archivos/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (res.ok) {
                const result = await res.json();
                invoiceItems[index].extraData.files[obsField] = {
                    name: result.filename,
                    path: result.path,
                    size: result.size
                };
                
                // Mostrar indicador de archivo subido
                const inputLabel = input.previousElementSibling;
                if (inputLabel) {
                    inputLabel.style.borderColor = '#10b981';
                    inputLabel.title = `Archivo subido: ${result.filename}`;
                }
            } else {
                console.error('Error al subir archivo de item');
            }
        } catch (err) {
            console.error('Error al subir archivo:', err);
        }
    }
}

function updateTotals(subt, igv, tot, totG=0, totE=0, totI=0) {
    document.getElementById('invSubTotalDisplay').textContent = fmtNum(subt);
    document.getElementById('invIGVDisplay').textContent = fmtNum(igv);
    document.getElementById('invTotalDisplay').textContent = fmtNum(tot);
    
    const gEl = document.getElementById('invGravadoDisplay');
    const eEl = document.getElementById('invExoneradoDisplay');
    const iEl = document.getElementById('invInafectoDisplay');
    
    // Si viene de items y los totales desagregados son mayores a 0, actualizar
    if (gEl && (parseFloat(gEl.textContent) === 0 || totG > 0)) gEl.textContent = fmtNum(totG > 0 ? totG : subt);
    if (eEl && totE > 0) eEl.textContent = fmtNum(totE);
    if (iEl && totI > 0) iEl.textContent = fmtNum(totI);
    // Ensure ICBPER from items
    let icbperTotal = 0;
    invoiceItems.forEach(i => { if(i.icbper) icbperTotal += i.icbper; });
    const icbEl = document.getElementById('invICBPERDisplay');
    if (icbEl) icbEl.textContent = fmtNum(icbperTotal);
}

function setSummaryFromSUNAT(data) {
    // Called when extracting CPE from SUNAT API — fills all breakdown fields
    console.log('setSummaryFromSUNAT called with data:', data);
    const setVal = (id, v) => { const el = document.getElementById(id); if(el) { el.textContent = fmtNum(v || 0); console.log(`Set ${id} to ${fmtNum(v || 0)}`); } else { console.warn(`Element ${id} not found`); }};
    setVal('invGravadoDisplay', data.MtoBIGravadaDG || data.mtoBIGravadaDG || data.mtoOperGravada);
    setVal('invExoneradoDisplay', data.mtoOperExonerada || data.MtoOperExonerada);
    setVal('invInafectoDisplay', data.MtoValorAdqNG || data.mtoValorAdqNG || data.mtoOperInafecta);
    setVal('invAnticiposDisplay', data.mtoAnticipos || data.MtoAnticipos);
    setVal('invISCDisplay', data.mtoISC || data.MtoISC);
    setVal('invICBPERDisplay', data.mtoICBPER || data.MtoICBPER);
    setVal('invOtrosCargosDisplay', data.mtoOtrosCargos || data.MtoOtrosCargos);
    setVal('invOtrosTribDisplay', data.mtoOtrosTrib || data.MtoOtrosTrib);
    setVal('invSubTotalDisplay', data.MtoBIGravadaDG || data.mtoBIGravadaDG || data.mtoOperGravada);
    setVal('invIGVDisplay', data.MtoIgvIpmDG || data.mtoIgvIpmDG || data.mtoIGV);
    setVal('invTotalDisplay', data.MtoTotalCp || data.mtoTotalCp || data.mtoImporteTotal);
    // Detracción
    if (data.informacionDetraccion && data.informacionDetraccion.length > 0) {
        const det = data.informacionDetraccion[0];
        const setInput = (id, v) => { const el = document.getElementById(id); if(el) el.value = v || ''; };
        setInput('invDetBienServicio', det.desBienServicio);
        setInput('invDetMedioPago', det.medioPago);
        setInput('invDetNroCuenta', det.nroCuenta);
        setInput('invDetPorcentaje', det.porDetraccion);
        setInput('invDetMonto', det.mtoDetraccion);
    }
    
    // Información de crédito - fallback si no trae datos
    const setInput = (id, v) => { const el = document.getElementById(id); if(el) el.value = v || ''; };
    const total = data.MtoTotalCp || data.mtoTotalCp || data.mtoImporteTotal || 0;
    const fecEmision = data.FecEmision || '';
    
    if (!data.informacionCreditos || data.informacionCreditos.length === 0) {
        // Si no trae información de crédito, poner 1 cuota con fecha de vencimiento (o emisión) y monto total
        setInput('invCreditoNumCuota', '1');
        setInput('invCreditoMontoCuota', fmtNum(total));
        // Usar fecha de vencimiento si existe, si no usar fecha de emisión
        const fecPlazo = sunatRow.FecVencPag ? sunatRow.FecVencPag.substring(0,10) : fecEmision;
        setInput('invCreditoFecPlazo', fecPlazo);
        setInput('invCreditoMtoPendiente', fmtNum(total));
    }
}

function agregarGuiaManual() {
    const guiaInput = document.getElementById('invGuiaManual');
    const guia = guiaInput.value.trim();
    if (!guia) return;
    
    const listDiv = document.getElementById('docsRelacionadosList');
    const currentText = listDiv.textContent;
    
    if (currentText === 'Sin documentos relacionados') {
        listDiv.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.25rem 0; border-bottom:1px solid #e2e8f0;">
            <span>${guia}</span>
            <button onclick="this.parentElement.remove()" style="color:#ef4444; border:none; background:none; cursor:pointer;">×</button>
        </div>`;
    } else {
        listDiv.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.25rem 0; border-bottom:1px solid #e2e8f0;">
            <span>${guia}</span>
            <button onclick="this.parentElement.remove()" style="color:#ef4444; border:none; background:none; cursor:pointer;">×</button>
        </div>`;
    }
    
    guiaInput.value = '';
    
    const badge = document.getElementById('badgeGuias');
    if (badge) {
        badge.style.display = 'inline-flex';
        badge.textContent = 'docs';
    }
}

function setSummaryFromCPE(cpeData, sunatRow) {
    // Función enriquecida que lee TODA la data del XML (datoscperecibido)
    console.log('setSummaryFromCPE called with cpeData:', cpeData);
    console.log('setSummaryFromCPE called with sunatRow:', sunatRow);
    
    const setVal = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = fmtNum(v || 0); };
    const setInput = (id, v) => { const el = document.getElementById(id); if(el) el.value = v || ''; };
    
    // Decidir de donde leer los montos: procedenciaMasiva o procedenciaIndivual
    const pm = cpeData.procedenciaMasiva || {};
    const pi = cpeData.procedenciaIndivual || cpeData.procedenciaIndividual || {};
    
    console.log('pm (procedenciaMasiva):', pm);
    console.log('pi (procedenciaIndivual):', pi);
    
    // Montos principales (priorizar XML sobre SUNAT row)
    const gravado = pm.mtoTotalValVentaGrabado || pi.mtoOpGravado || sunatRow.MtoBIGravadaDG || 0;
    const exonerado = pm.mtoTotalValVentaExonerado || pi.mtoOpExonerado || sunatRow.mtoOperExonerada || 0;
    const inafecto = pm.mtoTotalValVentaInafecto || pi.mtoOpInafecto || sunatRow.MtoValorAdqNG || 0;
    const igv = pm.mtoSumIGV || pi.mtoIGV || sunatRow.MtoIgvIpmDG || 0;
    const isc = pm.mtoSumISC || pi.mtoISC || 0;
    const icbper = pm.mtoSumICBPER || pi.mtoICBPER || 0;
    const anticipos = pm.mtoTotalAnticipo || pi.mtoAnticipos || 0;
    const otrosCargos = pm.mtoSumOtrosCargos || pi.mtoOtrosCargos || 0;
    const otrosTrib = pm.mtoSumOtrosTributos || pi.mtoOtrosTributos || 0;
    const total = pm.mtoImporteTotal || pi.mtoImporteTotal || sunatRow.MtoTotalCp || 0;
    
    console.log('Calculated values - gravado:', gravado, 'exonerado:', exonerado, 'inafecto:', inafecto, 'igv:', igv, 'total:', total);
    
    setVal('invGravadoDisplay', gravado);
    setVal('invExoneradoDisplay', exonerado);
    setVal('invInafectoDisplay', inafecto);
    setVal('invAnticiposDisplay', anticipos);
    setVal('invISCDisplay', isc);
    setVal('invICBPERDisplay', icbper);
    setVal('invOtrosCargosDisplay', otrosCargos);
    setVal('invOtrosTribDisplay', otrosTrib);
    setVal('invSubTotalDisplay', gravado);
    setVal('invIGVDisplay', igv);
    setVal('invTotalDisplay', total);
    
    // DETRACCION (desde XML completo)
    if (cpeData.informacionDetraccion && cpeData.informacionDetraccion.length > 0) {
        const det = cpeData.informacionDetraccion[0];
        setInput('invDetLeyenda', det.desLeyenda);
        setInput('invDetBienServicio', det.desBienServicio);
        setInput('invDetMedioPago', det.medioPago);
        setInput('invDetNroCuenta', det.nroCuenta);
        setInput('invDetPorcentaje', det.porDetraccion);
        setInput('invDetMonto', det.mtoDetraccion);
    } else if (sunatRow.informacionDetraccion && sunatRow.informacionDetraccion.length > 0) {
        // Fallback a la fila de SUNAT si el XML no trajo detracciones
        const det = sunatRow.informacionDetraccion[0];
        setInput('invDetBienServicio', det.desBienServicio);
        setInput('invDetMedioPago', det.medioPago);
        setInput('invDetNroCuenta', det.nroCuenta);
        setInput('invDetPorcentaje', det.porDetraccion);
        setInput('invDetMonto', det.mtoDetraccion);
    }
    
    // NOTA DE CREDITO / DEBITO
    if (cpeData.datoRelacionado) {
        const dr = cpeData.datoRelacionado;
        setInput('invCodTipoNota', dr.codTipNota);
        setInput('invDesMotivo', dr.desMotivo);
        if (cpeData.desTipoNota) setInput('invDesTipoNota', cpeData.desTipoNota);
        if (dr.documentosModificaList && dr.documentosModificaList.length > 0) {
            const dm = dr.documentosModificaList[0];
            setInput('invDocModificaSerie', dm.numSerieRelac);
            setInput('invDocModificaNumero', dm.numCpeRelac);
            setInput('invDocModificaTipo', dm.codCpeRelac);
        }
        // Auto-abrir sección NC y mostrar badge
        const secNC = document.getElementById('secNotaCredito');
        if (secNC) secNC.open = true;
        const badgeNC = document.getElementById('badgeNC');
        if (badgeNC) { badgeNC.style.display = 'inline-flex'; badgeNC.textContent = 'NC'; }
    }
    
    // TOTAL EN LETRAS
    if (cpeData.desMtoTotalLetras) {
        setInput('invMtoTotalLetras', cpeData.desMtoTotalLetras.trim());
    }
    
    // CREDITOS / CUOTAS
    if (cpeData.informacionCreditos && cpeData.informacionCreditos.length > 0) {
        const cred = cpeData.informacionCreditos[0];
        setInput('invCreditoMtoPendiente', fmtNum(cred.mtoPagoPendiente || 0));
        
        // Convertir fecha de DD/MM/YYYY a YYYY-MM-DD para input type="date"
        let fecPlazo = '';
        if (cred.fecPlazoPago) {
            const parts = cred.fecPlazoPago.split('/');
            if (parts.length === 3) {
                fecPlazo = parts[2] + '-' + parts[1] + '-' + parts[0];
            }
        }
        setInput('invCreditoFecPlazo', fecPlazo);
        setInput('invCreditoNumCuotas', cred.numCuotas || '0');
        
        // Detalle de cuotas
        const cuotasDiv = document.getElementById('creditoCuotasDetail');
        if (cuotasDiv && cred.numCuotasList && cred.numCuotasList.length > 0) {
            let html = '<div style="border:1px solid var(--border-soft); border-radius:6px; overflow:hidden; margin-top:0.25rem;">';
            html += '<table style="width:100%; font-size:0.78rem; border-collapse:collapse;">';
            html += '<tr style="background:#f8fafc;"><th style="padding:0.4rem; text-align:left; font-weight:600; border-bottom:1px solid var(--border-soft);">Cuota</th><th style="padding:0.4rem; text-align:right; font-weight:600; border-bottom:1px solid var(--border-soft);">Monto</th><th style="padding:0.4rem; text-align:right; font-weight:600; border-bottom:1px solid var(--border-soft);">Vencimiento</th></tr>';
            cred.numCuotasList.forEach(cuota => {
                html += '<tr><td style="padding:0.35rem 0.4rem;">Cuota ' + cuota.numcuota + '</td><td style="padding:0.35rem 0.4rem; text-align:right; font-weight:600;">' + fmtNum(cuota.mtoCuota) + '</td><td style="padding:0.35rem 0.4rem; text-align:right; color:var(--text-muted);">' + (cuota.fecVencimiento || '') + '</td></tr>';
            });
            html += '</table></div>';
            cuotasDiv.innerHTML = html;
        }
        
        // Auto-abrir sección y badge
        const secCred = document.getElementById('secCreditos');
        if (secCred) secCred.open = true;
        const badge = document.getElementById('badgeCreditos');
        if (badge) { badge.style.display = 'inline-flex'; badge.textContent = (cred.numCuotas || 1) + ' cuota(s)'; }
    } else {
        // Si no hay créditos, asumir contado y llenar con valores por defecto
        const totalFactura = pm.mtoImporteTotal || pi.mtoImporteTotal || sunatRow.MtoTotalCp || 0;
        if (totalFactura > 0) {
            setInput('invCreditoMtoPendiente', fmtNum(totalFactura));
            
            // Convertir fecha de emisión a formato YYYY-MM-DD
            let fecEmision = '';
            const fecEmisionRaw = cpeData.fecEmision || sunatRow.FecEmision || '';
            if (fecEmisionRaw) {
                const parts = fecEmisionRaw.split('/');
                if (parts.length === 3) {
                    fecEmision = parts[2] + '-' + parts[1] + '-' + parts[0];
                }
            }
            setInput('invCreditoFecPlazo', fecEmision);
            setInput('invCreditoNumCuotas', '1');
            
            // Mostrar detalle de cuota única
            const cuotasDiv = document.getElementById('creditoCuotasDetail');
            if (cuotasDiv) {
                cuotasDiv.innerHTML = '<div style="font-size:0.78rem; color:var(--text-muted);">Pago al contado: 1 cuota de ' + fmtNum(totalFactura) + '</div>';
            }
        }
    }
    
    // GUIAS DE REMISION / DOCS RELACIONADOS
    if (cpeData.informacionDocumentosRelacionados && cpeData.informacionDocumentosRelacionados.length > 0) {
        const docsDiv = document.getElementById('docsRelacionadosList');
        if (docsDiv) {
            let html = '<div style="display:flex; flex-direction:column; gap:0.5rem;">';
            cpeData.informacionDocumentosRelacionados.forEach(doc => {
                html += '<div style="display:flex; align-items:center; gap:0.75rem; padding:0.5rem 0.75rem; background:#fffbeb; border:1px solid #fde68a; border-radius:6px;">';
                html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
                html += '<div><span style="font-weight:600; color:#92400e;">' + (doc.desCpeRel || doc.codCpeRel) + '</span>';
                html += '<span style="margin-left:0.5rem; font-weight:500;">' + (doc.numSerieDocRel || '') + '-' + (doc.numDocRel || '') + '</span></div>';
                html += '</div>';
            });
            html += '</div>';
            docsDiv.innerHTML = html;
        }
        const secGuias = document.getElementById('secGuias');
        if (secGuias) secGuias.open = true;
        const badgeGuias = document.getElementById('badgeGuias');
        if (badgeGuias) { badgeGuias.style.display = 'inline-flex'; badgeGuias.textContent = cpeData.informacionDocumentosRelacionados.length + ' doc(s)'; }
    }
    
    // OBSERVACION SUNAT
    if (cpeData.desObservacion && cpeData.desObservacion !== '-') {
        setInput('invObservaciones', cpeData.desObservacion.trim());
    }
}

function clearInvoiceForm() {
    document.querySelectorAll('.modern-input').forEach(el => {
        if (el.id !== 'invTipoDoc' && el.id !== 'invMoneda' && el.id !== 'cntEmpresa') {
            el.value = '';
        }
    });
    document.getElementById('invTipoCambio').value = 1;
    clearOC();
    invoiceItems = [];
    window.currentCpeData = null;
    window.editingFacturaId = null;
    
    // Limpiar UI generada dinamicamente
    const docsDiv = document.getElementById('docsRelacionadosList');
    if(docsDiv) docsDiv.innerHTML = '<div style="color:var(--text-muted);font-style:italic;">No hay documentos relacionados</div>';

    const existingFilesDiv = document.getElementById('existingFilesPreview');
    if (existingFilesDiv) existingFilesDiv.innerHTML = '';
    
    const fileListP = document.getElementById('fileListPreview');
    if (fileListP) fileListP.innerHTML = '';
    const adjInput = document.getElementById('invAdjuntosInput');
    if (adjInput) adjInput.value = '';

    const setVal = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = fmtNum(v || 0); };
    setVal('invGravadoDisplay', 0);
    setVal('invExoneradoDisplay', 0);
    setVal('invInafectoDisplay', 0);
    setVal('invAnticiposDisplay', 0);
    setVal('invISCDisplay', 0);
    setVal('invICBPERDisplay', 0);
    setVal('invOtrosCargosDisplay', 0);
    setVal('invOtrosTribDisplay', 0);
    setVal('invSubTotalDisplay', 0);
    setVal('invIGVDisplay', 0);
    setVal('invTotalDisplay', 0);
    
    const cuotasDiv = document.getElementById('cuotasCreditoList');
    if(cuotasDiv) cuotasDiv.innerHTML = '';
    
    document.querySelectorAll('.info-accordion-header span.badge').forEach(b => {
        b.style.display = 'none';
        b.textContent = '';
    });
    
    document.querySelectorAll('.info-accordion').forEach(acc => acc.open = false);
    
    renderInvoiceItems();
}

// ════════════════════════════════════════════════════════════
//  REGISTRO y LISTADO
// ════════════════════════════════════════════════════════════

async function registrarFactura() {
    const codcia = getSelectedCia();
    if (!codcia) return;

    if (!document.getElementById('invRucProv').value || !document.getElementById('invSerie').value || !document.getElementById('invNumero').value) {
        Swal.fire({icon:'warning', title:'Atención', text:'RUC, Serie y Número son obligatorios para guardar la cabecera.'});
        return;
    }

    // Validar Información de Pago/Créditos
    const creditoFecPlazo = document.getElementById('invCreditoFecPlazo')?.value;
    const creditoNumCuotas = document.getElementById('invCreditoNumCuota')?.value;
    if (!creditoFecPlazo && !creditoNumCuotas) {
        Swal.fire({icon:'warning', title:'Atención', text:'Información de Pago/Créditos es obligatoria. Por favor complete la fecha de plazo o el número de cuotas.'});
        return;
    }

    if (invoiceItems.length === 0) {
        const conf = await Swal.fire({
            icon:'warning', title:'Sin ítems',
            text:'Está a punto de guardar una factura sin detalle. ¿Desea continuar?',
            showCancelButton: true, confirmButtonText: 'Sí, guardar', cancelButtonText: 'Cancelar'
        });
        if (!conf.isConfirmed) return;
    }

    // VALIDACION CANTIDAD CONTRA OC
    let exceedsOC = false;
    let partialInvoice = false;

    if (window.currentOCDetalle && window.currentOCDetalle.length > 0) {
        // Evaluate overall quantities matched against OC
        for (let it of invoiceItems) {
            const match = window.currentOCDetalle.find(o => o.codigo === it.codigo);
            if (match) {
                if (it.cant > match.canpend) exceedsOC = true;
                if (it.cant < match.canpend) partialInvoice = true;
            } else if (it.fromOC) {
                // Should not happen unless user changes code manually
            }
        }
    }

    if (exceedsOC) {
        const conf = await Swal.fire({
            icon:'warning', title:'Exceso de Cantidad',
            text:'Algunas cantidades de los ítems superan el saldo pendiente en la Orden de Compra. ¿Desea continuar el registro de todas formas?',
            showCancelButton: true, confirmButtonText: 'Sí, guardar y exceder', cancelButtonText: 'Revisar ítems'
        });
        if (!conf.isConfirmed) return;
    } else if (partialInvoice && document.getElementById('invNroOC').value) {
        // Just an info to user
        const conf = await Swal.fire({
            icon:'info', title:'Facturación Parcial',
            text:'Usted está facturando una cantidad menor al saldo de la Orden de Compra. Se registrará como un ingreso parcial.',
            showCancelButton: true, confirmButtonText: 'Continuar', cancelButtonText: 'Cancelar'
        });
        if (!conf.isConfirmed) return;
    }

    const dirEmisorEl = document.getElementById('invDirEmisor');
    
    // Compute totals from items
    let subTotalCalc = 0, igvCalc = 0, totalCalc = 0;
    invoiceItems.forEach(i => { subTotalCalc += i.vv; igvCalc += i.igv; totalCalc += i.total; });
    console.log('registrarFactura - Calculated totals:', { subTotalCalc, igvCalc, totalCalc });
    console.log('registrarFactura - invoiceItems:', invoiceItems);

    const payload = {
        id: window.editingFacturaId,
        codcia,
        num_ruc_proveedor: document.getElementById('invRucProv').value.trim(),
        nom_proveedor: document.getElementById('invNomProv').value.trim(),
        cod_tipo_doc: document.getElementById('invTipoDoc').value,
        serie: document.getElementById('invSerie')?.value.trim().toUpperCase(),
        numero: document.getElementById('invNumero')?.value.trim(),
        fec_emision: document.getElementById('invFecEmision')?.value || null,
        fec_vencimiento: document.getElementById('invFecVenc')?.value || null,
        cod_moneda: document.getElementById('invMoneda')?.value || 'PEN',
        tipo_cambio: parseFloat(document.getElementById('invTipoCambio')?.value) || 1.0,
        sub_total: subTotalCalc,
        igv: igvCalc,
        total: totalCalc,
        // Accounting breakdown (read from summary panel)
        mto_gravado: parseFloat((document.getElementById('invGravadoDisplay')?.textContent || '0').replace(/,/g, '')) || 0,
        mto_exonerado: parseFloat((document.getElementById('invExoneradoDisplay')?.textContent || '0').replace(/,/g, '')) || 0,
        mto_inafecto: parseFloat((document.getElementById('invInafectoDisplay')?.textContent || '0').replace(/,/g, '')) || 0,
        mto_anticipos: parseFloat((document.getElementById('invAnticiposDisplay')?.textContent || '0').replace(/,/g, '')) || 0,
        mto_isc: parseFloat((document.getElementById('invISCDisplay')?.textContent || '0').replace(/,/g, '')) || 0,
        mto_icbper: parseFloat((document.getElementById('invICBPERDisplay')?.textContent || '0').replace(/,/g, '')) || 0,
        mto_otros_cargos: parseFloat((document.getElementById('invOtrosCargosDisplay')?.textContent || '0').replace(/,/g, '')) || 0,
        otros_tributos: parseFloat((document.getElementById('invOtrosTribDisplay')?.textContent || '0').replace(/,/g, '')) || 0,
        // Detracción
        det_bien_servicio: document.getElementById('invDetBienServicio')?.value.trim() || null,
        det_medio_pago: document.getElementById('invDetMedioPago')?.value.trim() || null,
        det_nro_cuenta: document.getElementById('invDetNroCuenta')?.value.trim() || null,
        det_porcentaje: parseFloat(document.getElementById('invDetPorcentaje')?.value) || null,
        det_monto: parseFloat((document.getElementById('invDetMonto')?.value || '0').replace(/,/g, '')) || null,
        // General
        dir_emisor: dirEmisorEl ? dirEmisorEl.value.trim() : '',
        observaciones: document.getElementById('invObservaciones') ? document.getElementById('invObservaciones').value.trim() : '',
        nro_orden_compra: document.getElementById('invNroOC')?.value.trim() || null,
        tipo_oc: document.getElementById('invTipoOC')?.value || null,
        anos_oc: document.getElementById('invAnosOC')?.value.trim() || null,
        modo_registro: invoiceMode === 'auto' ? 'AUTO' : 'MANUAL',
        // Campos XML adicionales (del cpeData)
        nom_comercial_prov: window.currentCpeData?.datosEmisor?.desNomComercialEmis || null,
        dir_proveedor: window.currentCpeData?.datosEmisor?.desDirEmis || null,
        ubigeo_proveedor: window.currentCpeData?.datosEmisor?.ubigeoEmis || null,
        dir_receptor_factura: window.currentCpeData?.datosReceptor?.dirDetCliente || null,
        cod_tip_transaccion: window.currentCpeData?.codTipTransaccion || null,
        ind_estado_cpe: window.currentCpeData?.indEstadoCpe || null,
        ind_procedencia: window.currentCpeData?.indProcedencia || null,
        placa_vehicular: window.currentCpeData?.placaVehicular || null,
        mto_total_letras: window.currentCpeData?.desMtoTotalLetras || (document.getElementById('invMtoTotalLetras')?.value) || null,
        nom_comercial_emisor: window.currentCpeData?.datosEmisor?.desNomComercialEmis || null,
        created_by: JSON.parse(localStorage.getItem('yelave_user') || '{}').login || 'SISTEMA',
        // Nota de crédito / débito
        cod_tipo_nota: document.getElementById('invCodTipoNota')?.value || null,
        des_tipo_nota: document.getElementById('invDesTipoNota')?.value || window.currentCpeData?.desTipoNota || null,
        des_motivo: document.getElementById('invDesMotivo')?.value || window.currentCpeData?.desObservacion || null,
        doc_modifica_serie: document.getElementById('invDocModificaSerie')?.value || null,
        doc_modifica_numero: document.getElementById('invDocModificaNumero')?.value || null,
        doc_modifica_tipo: document.getElementById('invDocModificaTipo')?.value || null,
        doc_modifica_fecha: document.getElementById('invDocModificaFecha')?.value || null,
        // Créditos - leer del formulario o de CPE data
        credito_mto_pendiente: parseFloat((document.getElementById('invCreditoMtoPendiente')?.value || '0').replace(/,/g, '')) || parseFloat(window.currentCpeData?.informacionCreditos?.[0]?.mtoPagoPendiente) || 0,
        credito_fec_plazo: document.getElementById('invCreditoFecPlazo')?.value || window.currentCpeData?.informacionCreditos?.[0]?.fecPlazoPago || null,
        credito_num_cuotas: parseInt(document.getElementById('invCreditoNumCuota')?.value) || parseInt(window.currentCpeData?.informacionCreditos?.[0]?.numCuotas) || 1,
        credito_cuotas_json: window.currentCpeData?.informacionCreditos?.[0]?.numCuotasList ? JSON.stringify(window.currentCpeData.informacionCreditos[0].numCuotasList) : null,
        // Docs relacionados
        docs_relacionados_json: window.currentCpeData?.informacionDocumentosRelacionados ? JSON.stringify(window.currentCpeData.informacionDocumentosRelacionados) : null,
        // XML raw completo para auditoría
        xml_data_json: window.currentCpeData ? JSON.stringify(window.currentCpeData) : null,
        // Detracción leyenda
        det_leyenda: document.getElementById('invDetLeyenda')?.value || null,
        items: invoiceItems.map((i, idx) => ({
            nro_item: idx + 1,
            cod_material: i.codigo,
            cod_proveedor: i.codProv || null,
            descripcion: i.desc,
            unidad_medida: i.und,
            des_unidad_medida: i.desUnd || null,
            cantidad: i.cant,
            precio_unitario: i.pu,
            sub_total: i.vv,
            igv: i.igv,
            total: i.total,
            mto_icbper_item: i.icbperItem || 0,
            mto_descuento: i.descItem || 0,
            cantidad_oc: i.fromOC && window.currentOCDetalle ? (window.currentOCDetalle.find(o=>o.codigo===i.codigo)||{}).canpend || null : null,
            extra_data: (() => {
                if (!i.extraData) return null;
                const { files, ...rest } = i.extraData;
                return rest;
            })()
        }))
    };
    console.log('registrarFactura - payload.created_by:', payload.created_by);

    try {
        Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/contabilidad/facturas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            let errorMsg = 'Error al guardar';
            if (data.detail) {
                if (Array.isArray(data.detail)) {
                    errorMsg = data.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join('\n');
                } else {
                    errorMsg = data.detail;
                }
            }
            throw new Error(errorMsg);
        }
        // Upload pending files if any
        const fileInput = document.getElementById('invAdjuntosInput');
        if (fileInput && fileInput.files.length > 0 && data.id) {
            for (const file of fileInput.files) {
                const fd = new FormData();
                fd.append('archivo', file);
                fd.append('tipo_doc', file.name.split('.').pop().toUpperCase());
                fd.append('created_by', '');
                await fetch(`/api/contabilidad/facturas/${data.id}/archivos`, { method: 'POST', body: fd });
            }
        }

        // Upload item files from memory
        const createdBy = JSON.parse(localStorage.getItem('yelave_user') || '{}').login || 'SISTEMA';
        console.log('registrarFactura - Iniciando subida de archivos de items');
        let archivosSubidos = 0;
        for (let i = 0; i < invoiceItems.length; i++) {
            const item = invoiceItems[i];
            console.log(`registrarFactura - Item ${i}:`, item.extraData);
            if (item.extraData && item.extraData.files) {
                console.log(`registrarFactura - Item ${i} tiene archivos:`, item.extraData.files);
                for (const obsField in item.extraData.files) {
                    const files = item.extraData.files[obsField];
                    console.log(`registrarFactura - Item ${i}, obs ${obsField}:`, files);
                    if (Array.isArray(files)) {
                        for (const file of files) {
                            // Verificar que sea un archivo válido (File object) - saltar archivos existentes (con id)
                            console.log(`registrarFactura - Verificando archivo: item ${i}, obs ${obsField}, file:`, file);
                            console.log(`registrarFactura - file.name: ${file.name}, file.size: ${file.size}, file.id: ${file.id}`);
                            if (!file || !file.name || file.size === 0 || file.id) {
                                console.log(`Skipping file (existing or invalid): item ${i}, obs ${obsField}`, file);
                                continue;
                            }
                            const fd = new FormData();
                            fd.append('item_index', i);
                            fd.append('obs_field', obsField);
                            fd.append('archivo', file);
                            fd.append('created_by', createdBy);
                            try {
                                const res = await fetch(`/api/contabilidad/facturas/${data.id}/items/archivos/upload`, { method: 'POST', body: fd });
                                if (res.ok) {
                                    archivosSubidos++;
                                    console.log(`Archivo de item subido: item ${i}, obs ${obsField}, archivo ${file.name}`);
                                } else {
                                    console.error(`Error al subir archivo de item: item ${i}, obs ${obsField}, status ${res.status}`);
                                }
                            } catch (err) {
                                console.error(`Error al subir archivo de item: item ${i}, obs ${obsField}`, err);
                            }
                        }
                    }
                }
            }
        }
        console.log(`registrarFactura - Total archivos de items subidos: ${archivosSubidos}`);

        await Swal.fire({
            icon: 'success', 
            title: '¡Guardado!', 
            text: 'Comprobante registrado correctamente.', 
            timer: 1500, 
            showConfirmButton: false
        });
        
        clearInvoiceForm();
        window.editingFacturaId = null;
        loadFacturas();

    } catch(err) {
        Swal.fire({icon:'error', title:'Error', text: err.message});
    }
}

async function loadFacturas() {
    const codcia = getSelectedCia();
    if (!codcia) return;

    if (dtFacturas) { dtFacturas.destroy(); dtFacturas = null; }

    try {
        const user = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        const login = user.login || 'SISTEMA';
        console.log('loadFacturas - user:', user, 'login:', login);
        
        const res = await fetch(`/api/contabilidad/facturas?codcia=${codcia}&created_by=${encodeURIComponent(login)}`);
        if (!res.ok) throw new Error('Error al cargar');
        const list = await res.json();

        const data = list.map(f => {
            const tipoMap = { '01': '01-Factura', '02': '02-Recibo Honorarios', '03': '03-Boleta', '07': '07-Nota Crédito', '08': '08-Nota Débito' };
            const tipoComprobante = tipoMap[f.CodTipoDoc] || `${f.CodTipoDoc}-Otro`;
            const fechaRegistro = f.CreatedAt ? f.CreatedAt.substring(0,10) : '-';
            // Debug fecha de vencimiento
            console.log('loadFacturas - factura:', f.Serie + '-' + f.Numero, 'CreditoFecPlazo:', f.CreditoFecPlazo, 'FecVencimiento:', f.FecVencimiento);
            const fechaVencimiento = f.CreditoFecPlazo ? f.CreditoFecPlazo.substring(0,10) : (f.FecVencimiento ? f.FecVencimiento.substring(0,10) : '-');
            
            return [
                f.Id,
                `${f.Serie||''}-${f.Numero||''}`,
                tipoComprobante,
                f.FecEmision ? f.FecEmision.substring(0,10) : '-',
                fechaRegistro,
                fechaVencimiento,
                (f.NomProveedor||'').substring(0,35),
                f.NumRucProveedor || '-',
                f.CodMoneda || '-',
                fmtNum(f.Total),
                f.NroOrdenCompra ? `${f.TipoOc||''}${f.NroOrdenCompra}` : '-',
                f.ModoRegistro === 'AUTO' ? '<span style="background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">AUTO</span>' : '<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">MANUAL</span>',
                f.CreatedBy || 'SISTEMA',
                f.Estado === 'Anulada' ? '<span style="background:#fef2f2;color:#ef4444;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">ELIMINADO</span>' : 
                f.Estado === 'Cerrado' ? '<span style="background:#faf5ff;color:#8b5cf6;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">🔒 CERRADO</span>' :
                f.Estado === 'Contabilizado' ? '<span style="background:#fefce8;color:#a16207;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">📘 CONTABILIZADO</span>' :
                '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">REGISTRADO</span>',
                `<div style="display:flex; justify-content:center; gap:4px; white-space:nowrap;">
                    <button class="btn-flat" style="padding:4px; color:#2563eb;" onclick="viewFacturaDetail(${f.Id})" title="Ver Detalle"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>
                    ${(f.Estado === 'Cerrado' || f.Estado === 'Contabilizado') 
                        ? `<button class="btn-flat" style="padding:4px; color:#cbd5e1; cursor:not-allowed;" title="No se puede Editar (${f.Estado})"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>` + 
                          `<button class="btn-flat" style="padding:4px; color:#cbd5e1; cursor:not-allowed;" title="No se puede Eliminar (${f.Estado})"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`
                        : `<button class="btn-flat" style="padding:4px; color:#f59e0b;" onclick="openEditRegistro(${f.Id})" title="Editar / Adjuntar"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>` + 
                          `<button class="btn-flat" style="padding:4px; color:#ef4444;" onclick="eliminarFactura(${f.Id}, '${f.Serie||''}-${f.Numero||''}')" title="Eliminar"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`
                    }
                </div>`
            ];
        });

        dtFacturas = $('#facturasTable').DataTable({
            data: data, destroy: true,
            deferRender: true, order: [[0, 'desc']], pageLength: 15, scrollX: true,
            autoWidth: false,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: '<"dt-top"lfB>rt<"dt-bottom"ip>',
            buttons: [
                { extend: 'excelHtml5', text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> Excel', className: 'btn-export', exportOptions: { columns: [0,1,2,3,4,5,6,7,8,9,10,11,12] } },
                { extend: 'pdfHtml5', text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> PDF', className: 'btn-export', orientation: 'landscape', exportOptions: { columns: [0,1,2,3,4,5,6,7,8,9,10,11,12] } },
                { extend: 'print', text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg> Imprimir', className: 'btn-export', exportOptions: { columns: [0,1,2,3,4,5,6,7,8,9,10,11,12] } }
            ],
            columnDefs: [
                { targets: 10, width: '80px', orderable: false, className: 'dt-body-center' },
                { targets: 5, className: 'dt-body-right' }
            ]
        });
        
    } catch(err) {
        const tbEl = document.getElementById('historialTbody');
        if(tbEl) tbEl.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#ef4444;">${err.message}</td></tr>`;
    }
}

async function viewFacturaDetail(id) {
    try {
        const res = await fetch(`/api/contabilidad/facturas/${id}`);
        if (!res.ok) throw new Error('No se pudo cargar el detalle');
        const data = await res.json();
        
        if (!document.getElementById('facturaDetailModal')) return; 

        window.currentFacturaViewData = data; // Cache para impresión
        const cab = data.cabecera || data;
        const items = data.items || [];
        const archivos = data.archivos || [];
        
        let archivosHTML = '';
        if (archivos.length > 0) {
            archivos.forEach(a => {
                const ext = (a.NombreArchivo||'').split('.').pop().toUpperCase();
                const color = ext === 'PDF' ? '#ef4444' : ext === 'XML' ? '#10b981' : '#6366f1';
                archivosHTML += `<div style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0; border-bottom:1px dashed #cbd5e1;">
                    <span style="background:${color}; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:600;">${ext}</span>
                    <a href="/api/contabilidad/archivos/${a.Id}/descargar" target="_blank" style="color:#2563eb; text-decoration:none; font-size:0.85rem; font-weight:500;">${a.NombreArchivo}</a>
                </div>`;
            });
        }

        let itemsHTML = '';
        items.forEach((it, i) => {
            const sub = it.SubTotal || (it.cantidad ? it.cantidad*it.precio_unitario : 0) || 0;
            const igv = it.IGV || 0;
            itemsHTML += `<tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px; color:#1e293b;">${i+1}</td>
                <td style="padding:10px; color:#1e293b;">${it.CodMaterial || it.codigo || '-'}</td>
                <td style="padding:10px; color:#1e293b;">${it.Descripcion || it.descripcion || '-'}</td>
                <td style="padding:10px; color:#1e293b; text-align:right;">${it.Cantidad || it.cantidad || 0}</td>
                <td style="padding:10px; color:#1e293b; text-align:right;">${fmtNum(it.PrecioUnitario || it.precio_unitario)}</td>
                <td style="padding:10px; color:#1e293b; text-align:right;">${fmtNum(sub)}</td>
                <td style="padding:10px; color:#1e293b; text-align:right;">${fmtNum(igv)}</td>
                <td style="padding:10px; font-weight:700; color:#0f172a; text-align:right;">${fmtNum(it.Total || it.total)}</td>
            </tr>`;
        });

        let html = `
            <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-bottom:1.5rem; border-bottom:1px solid #e2e8f0; padding-bottom:1rem;">
                <button type="button" onclick="printFacturaLocal()" style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; padding: 0.55rem 1.2rem; font-weight:600; font-size:0.85rem; border-radius:8px; display:inline-flex; align-items:center; transition: all 0.2s; cursor:pointer; font-family:inherit;" onmouseover="this.style.background='#f8fafc';this.style.transform='translateY(-1px)'" onmouseout="this.style.background='#ffffff';this.style.transform='none'">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" style="margin-right:6px;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg> Imprimir
                </button>
                <button type="button" onclick="printFacturaLocal()" style="background:#2563eb; color:white; border:1px solid #2563eb; padding: 0.55rem 1.2rem; font-weight:600; font-size:0.85rem; border-radius:8px; display:inline-flex; align-items:center; transition: all 0.2s; cursor:pointer; font-family:inherit; box-shadow:0 2px 8px rgba(37,99,235,0.3);" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='none'">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" style="margin-right:6px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> Exportar PDF
                </button>
            </div>
            
            <div style="background:#ffffff; max-width:900px; margin: 0 auto; padding: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 2rem;">
                    <div>
                        <h1 style="margin: 0; font-size: 1.5rem; color: #0f172a; text-transform:uppercase; letter-spacing: 1px;">CONSTANCIA DE REGISTRO - ERP</h1>
                        <p style="color:#64748b; font-size:0.9rem; margin-top:0.35rem;">Recepción de Compras / Facturas</p>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0; font-size: 1.6rem; color: #0f172a;">${cab.CodTipoDoc || '01'} ${cab.Serie||''}-${cab.Numero||''}</h2>
                        <p style="font-weight: 600; color: #334155; margin-top: 0.35rem; font-size:0.9rem;">Emisión: ${cab.FecEmision || '-'} &nbsp;|&nbsp; Vence: ${cab.FecVencimiento || '-'}</p>
                        <p style="color:#64748b; font-size:0.85rem;">Moneda: ${cab.CodMoneda || 'PEN'} (TC: ${cab.TipoCambio || 1})</p>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2.5rem;">
                    <div style="background:#f8fafc; padding: 1.5rem; border-radius: 8px; border:1px solid #f1f5f9;">
                        <h3 style="font-size: 0.8rem; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin: 0 0 1rem 0;">Datos del Proveedor</h3>
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.85rem;">
                            <strong>Razón Social:</strong> <span style="text-align:right;">${cab.NomProveedor || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.85rem;">
                            <strong>RUC:</strong> <span>${cab.NumRucProveedor || '-'}</span>
                        </div>
                        <div style="display:flex; flex-direction:column; font-size:0.85rem; margin-bottom:0.75rem;">
                            <strong style="margin-bottom:0.25rem;">Dirección Fiscal:</strong>
                            <span style="color:#475569;">${cab.DirEmisor || '-'}</span>
                        </div>
                    </div>

                    <div style="background:#f8fafc; padding: 1.5rem; border-radius: 8px; border:1px solid #f1f5f9;">
                        <h3 style="font-size: 0.8rem; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin: 0 0 1rem 0;">Datos Operativos</h3>
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.85rem;">
                            <strong>Orden de Compra:</strong> <span>${cab.NroOrdenCompra ? (cab.TipoOc||'') + cab.NroOrdenCompra : 'Ninguna'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.85rem;">
                            <strong>Doc. que Modifica:</strong> <span>${cab.DocModificaSerie ? cab.DocModificaSerie+'-'+cab.DocModificaNumero : '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.85rem;">
                            <strong>Modo Registro:</strong> <span>${cab.ModoRegistro || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.85rem;">
                            <strong>Estado:</strong> <span style="font-weight:700; color:#10b981;">${cab.Estado || '-'}</span>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 2.5rem;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <thead style="background:#f8fafc; border-top:1px solid #e2e8f0; border-bottom:2px solid #cbd5e1;">
                            <tr>
                                <th style="padding:10px; text-align:left; color:#475569;">#</th>
                                <th style="padding:10px; text-align:left; color:#475569;">Código</th>
                                <th style="padding:10px; text-align:left; color:#475569;">Descripción</th>
                                <th style="padding:10px; text-align:right; color:#475569;">Cant.</th>
                                <th style="padding:10px; text-align:right; color:#475569;">P.Unit</th>
                                <th style="padding:10px; text-align:right; color:#475569;">SubTotal</th>
                                <th style="padding:10px; text-align:right; color:#475569;">IGV</th>
                                <th style="padding:10px; text-align:right; color:#475569;">Total</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHTML}</tbody>
                    </table>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <div style="width:50%; background:#f8fafc; border: 1px dashed #cbd5e1; border-radius:8px; padding:1.25rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="#10b981" fill="none" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            <span style="font-weight:700; color:#334155; font-size:0.9rem;">Verificación Electrónica</span>
                        </div>
                        <div style="font-size:0.8rem; color:#64748b; margin-bottom:0.25rem;"><strong>UUID:</strong><br><code style="background:#e2e8f0; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${cab.Uuid || 'Pendiente'}</code></div>
                        <div style="font-size:0.8rem; color:#64748b; word-break:break-all; margin-top:0.75rem;">
                            <strong>URL Pública de Acceso Libre:</strong><br>
                            <a href="${window.location.origin}/factura_visor.html?uid=${cab.Uuid}" style="color:#2563eb;" target="_blank">${window.location.origin}/factura_visor.html?uid=${cab.Uuid}</a>
                        </div>
                    </div>

                    <div style="width: 350px; background:#f8fafc; padding:1.5rem; border-radius:12px; border:1px solid #e2e8f0;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.85rem;"><span style="color:#64748b;">Op. Gravada:</span> <strong>${fmtNum(cab.MtoGravado || cab.SubTotal)}</strong></div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.85rem;"><span style="color:#64748b;">Op. Inafecta/Exo:</span> <strong>${fmtNum((cab.MtoInafecto||0) + (cab.MtoExonerado||0))}</strong></div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.85rem;"><span style="color:#64748b;">IGV (18%):</span> <strong>${fmtNum(cab.IGV || (cab.Total - cab.SubTotal))}</strong></div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.85rem;"><span style="color:#64748b;">Otros Tributos:</span> <strong>${fmtNum(cab.OtrosTributos || 0)}</strong></div>
                        <div style="display:flex; justify-content:space-between; margin-top:1rem; padding-top:1rem; border-top:2px solid #cbd5e1; font-size:1.1rem; color:#0f172a;">
                            <strong>TOTAL PAGO:</strong> <strong style="color:#2563eb;">${cab.CodMoneda||'PEN'} ${fmtNum(cab.Total || cab.total)}</strong>
                        </div>
                    </div>
                </div>

                ${archivosHTML ? `
                <div style="margin-top: 2rem; padding-top:1.5rem; border-top: 1px dashed #cbd5e1;">
                    <h3 style="font-size: 0.8rem; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin: 0 0 1rem 0;">Documentos Adjuntos</h3>
                    ${archivosHTML}
                </div>
                ` : ''}
            </div>
        `;
        
        document.getElementById('facturaDetailContent').innerHTML = html;
        document.getElementById('facturaDetailModal').classList.add('active');
        
    } catch(err) {
        Swal.fire({icon:'error', title:'Error', text: err.message});
    }
}

function closeFacturaDetail() {
    window.currentFacturaViewData = null;
    if(document.getElementById('facturaDetailModal')) document.getElementById('facturaDetailModal').classList.remove('active');
}

function printFacturaLocal() {
    const rootData = window.currentFacturaViewData;
    if(!rootData) return;
    
    const data = rootData.cabecera || rootData;
    const items = rootData.items || [];
    const publicUrl = data.Uuid ? `${window.location.origin}/factura_visor.html?uid=${data.Uuid}` : '';

    let itemsHtml = '';
    items.forEach((it, i) => {
        itemsHtml += `
            <tr>
                <td style="padding:10px; border-bottom:1px solid #e2e8f0;">${i+1}</td>
                <td style="padding:10px; border-bottom:1px solid #e2e8f0;">${it.CodMaterial || it.codigo || '-'}</td>
                <td style="padding:10px; border-bottom:1px solid #e2e8f0;">${it.Descripcion || it.descripcion || '-'}</td>
                <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right;">${it.Cantidad || it.cantidad || 0}</td>
                <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right;">${fmtNum(it.PrecioUnitario || it.precio_unitario)}</td>
                <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right;">${fmtNum(it.SubTotal || (it.cantidad*it.precio_unitario) || 0)}</td>
                <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right;">${fmtNum(it.IGV || 0)}</td>
                <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right; font-weight:bold;">${fmtNum(it.Total || it.total)}</td>
            </tr>
        `;
    });

    const printHtmlString = `
        <html>
        <head>
            <title>Registro Comprobante ${data.Serie||''}-${data.Numero||''}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                body { font-family: 'Inter', sans-serif; color: #0f172a; line-height: 1.5; padding: 40px; margin: 0; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px;}
                .header h1 { margin: 0; font-size: 24px; color: #1e293b; letter-spacing: -0.5px; }
                .header p { margin: 4px 0; font-size: 14px; color: #64748b; }
                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                .info-box { background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #f1f5f9; }
                .info-box h3 { margin: 0 0 15px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; }
                .info-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
                .info-row strong { color: #334155; font-weight: 600; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
                th { text-align: left; padding: 10px; background: #f1f5f9; color: #475569; font-weight: 600; border-bottom: 2px solid #cbd5e1; }
                .main-totals-container { display: flex; justify-content: space-between; align-items: flex-start; }
                .url-box { font-size: 12px; color: #64748b; background: #f8fafc; border: 1px dashed #cbd5e1; padding: 15px; border-radius: 8px; width: 45%; word-break: break-all; }
                .totals { width: 320px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #f1f5f9;}
                .totals div { display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
                .totals div:last-child { border-bottom: none; border-top: 2px solid #cbd5e1; padding-top: 10px; margin-top: 5px; padding-bottom: 0; font-weight: 700; font-size: 16px; color: #0f172a;}
                .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 11px; }
                @media print {
                    body { padding: 0; -webkit-print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1>CONSTANCIA DE REGISTRO - ERP</h1>
                    <p>Recepción de Compras / Facturas</p>
                </div>
                <div style="text-align: right;">
                    <p style="font-weight: 700; color: #0f172a; font-size:18px;">${data.CodTipoDoc || '01'} ${data.Serie||''}-${data.Numero||''}</p>
                    <p>Emisión: ${data.FecEmision || '-'} &nbsp;|&nbsp; Vence: ${data.FecVencimiento || '-'}</p>
                    <p>Moneda: ${data.CodMoneda || 'PEN'} (TC: ${data.TipoCambio || 1})</p>
                </div>
            </div>

            <div class="info-grid">
                <div class="info-box">
                    <h3>Datos del Proveedor</h3>
                    <div class="info-row"><strong>Razón Social:</strong> <span>${data.NomProveedor || ''}</span></div>
                    <div class="info-row"><strong>RUC:</strong> <span>${data.NumRucProveedor || ''}</span></div>
                    <div class="info-row"><strong>Dirección:</strong> <span>${data.DirEmisor || '-'}</span></div>
                    <div class="info-row"><strong>Nombre Com.:</strong> <span>${data.NomComercialEmisor || '-'}</span></div>
                </div>
                <div class="info-box">
                    <h3>Datos Operativos</h3>
                    <div class="info-row"><strong>Orden de Compra:</strong> <span>${data.NroOrdenCompra ? (data.TipoOc||'') + data.NroOrdenCompra : 'Ninguna'}</span></div>
                    <div class="info-row"><strong>Observaciones:</strong> <span>${data.Observaciones || '-'}</span></div>
                    <div class="info-row"><strong>Estado Registro:</strong> <span style="font-weight:700; color:#10b981;">${data.Estado || 'Registrada'}</span></div>
                    <div class="info-row"><strong>Dcto Modifica (NC/ND):</strong> <span>${data.DocModificaSerie ? data.DocModificaSerie+'-'+data.DocModificaNumero : '-'}</span></div>
                </div>
            </div>

            <table>
                <thead>
                    <tr><th>#</th><th>Código</th><th>Descripción</th><th style="text-align:right;">Cant.</th><th style="text-align:right;">P.Unit</th><th style="text-align:right;">SubTotal</th><th style="text-align:right;">IGV</th><th style="text-align:right;">Total</th></tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div class="main-totals-container">
                <div class="url-box">
                    <strong style="display:block; margin-bottom:5px; color:#334155;">Verificación Electrónica:</strong>
                    UUID: ${data.Uuid || 'Pendiente'}<br><br>
                    URL Pública de Acceso Libre:<br>
                    <a href="${publicUrl}" style="color:#2563eb;">${publicUrl}</a>
                </div>

                <div class="totals">
                    <div><span>Op. Gravada:</span> <span>${fmtNum(data.MtoGravado || data.SubTotal)}</span></div>
                    <div><span>Op. Inafecta:</span> <span>${fmtNum(data.MtoInafecto || 0)}</span></div>
                    <div><span>Op. Exonerada:</span> <span>${fmtNum(data.MtoExonerado || 0)}</span></div>
                    <div><span>IGV:</span> <span>${fmtNum(data.IGV || (data.Total - data.SubTotal))}</span></div>
                    <div><span>Otros Tributos:</span> <span>${fmtNum(data.OtrosTributos || 0)}</span></div>
                    <div><span>ICBPER:</span> <span>${fmtNum(data.MtoICBPER || 0)}</span></div>
                    <div><span>TOTAL GENERAL:</span> <span>${data.CodMoneda||'PEN'} ${fmtNum(data.Total || data.total)}</span></div>
                </div>
            </div>

            <div class="footer">
                Documento generado por ERP el ${new Date().toLocaleString()} | Registrado por: ${data.CreatedBy || 'SISTEMA'}
            </div>
        </body>
        </html>
    `;
    
    let iframe = document.getElementById('native-print-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'native-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
    }
    
    const doc = iframe.contentWindow || iframe.contentDocument.document || iframe.contentDocument;
    doc.document.open();
    doc.document.write(printHtmlString);
    doc.document.close();
    
    // Wait for everything to load inside iframe, then trigger print natively
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 500);
}

async function eliminarFactura(id, label) {
    const result = await Swal.fire({
        icon: 'warning', title: 'Eliminar Registro',
        html: `¿Está seguro de eliminar el registro <strong>${label}</strong>?<br>Esta acción borrará la operación por completo.`,
        showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Sí, Eliminar', cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`/api/contabilidad/facturas/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');
        Swal.fire({icon:'success', title:'Eliminado', text:'El registro fue eliminado permanentemente.', timer: 1500, showConfirmButton: false});
        loadFacturas();
    } catch(err) {
        Swal.fire({icon:'error', title:'Error', text: err.message});
    }
}

// ════════════════════════════════════════════════════════════
//  EDITAR REGISTRO EXISTENTE (ADJUNTAR ARCHIVOS)
// ════════════════════════════════════════════════════════════
async function openEditRegistro(id) {
    try {
        Swal.fire({ title: 'Cargando registro...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await fetch(`/api/contabilidad/facturas/${id}`);
        if (!res.ok) throw new Error('No se pudo cargar el registro');
        const data = await res.json();
        const cab = data.cabecera || data;
        const items = data.items || [];
        const archivos = data.archivos || [];
        console.log('openEditRegistro - archivos:', archivos);
        Swal.close();

        // Switch to registro tab
        switchRegTab('registro');

        // Clear current form first
        clearInvoiceForm();

        // Check if there are existing files to show
        const existingFilesDiv = document.getElementById('existingFilesPreview');
        if (existingFilesDiv) {
            if (archivos.length > 0) {
                let html = '<div style="font-weight:600; margin-bottom:0.5rem; color:#334155; padding-bottom:0.25rem; border-bottom:1px solid #e2e8f0;">Documentos Existentes:</div>';
                archivos.forEach(a => {
                    const ext = (a.NombreArchivo||'').split('.').pop().toUpperCase();
                    const color = ext === 'PDF' ? '#ef4444' : ext === 'XML' ? '#10b981' : '#6366f1';
                    html += `<div style="display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0;">
                        <span style="background:${color}; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:600;">${ext}</span>
                        <a href="/api/contabilidad/archivos/${a.Id}/descargar" target="_blank" style="font-size:0.8rem; color:#2563eb; text-decoration:none;">${a.NombreArchivo}</a>
                    </div>`;
                });
                existingFilesDiv.innerHTML = html;
            } else {
                existingFilesDiv.innerHTML = '';
            }
        }

        // Fill header fields
        const setVal = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
        setVal('invRucProv', cab.NumRucProveedor);
        setVal('invNomProv', cab.NomProveedor);
        setVal('invTipoDoc', cab.CodTipoDoc);
        setVal('invSerie', cab.Serie);
        setVal('invNumero', cab.Numero);
        setVal('invFecEmision', cab.FecEmision);
        setVal('invFecVenc', cab.FecVencimiento);
        setVal('invMoneda', cab.CodMoneda);
        // Sincronizar Fecha Plazo Pago con Fecha de Vencimiento
        setVal('invCreditoFecPlazo', cab.FecVencimiento || cab.CreditoFecPlazo);
        setVal('invTipoCambio', cab.TipoCambio || 1);
        setVal('invDirEmisor', cab.DirEmisor);
        setVal('invObservaciones', cab.Observaciones);
        setVal('invNroOC', cab.NroOrdenCompra);
        setVal('invTipoOC', cab.TipoOc);
        setVal('invAnosOC', cab.AnosOc);
        // NC/ND fields
        setVal('invCodTipoNota', cab.CodTipoNota);
        setVal('invDesTipoNota', cab.DesTipoNota);
        setVal('invDesMotivo', cab.DesMotivo);
        setVal('invDocModificaSerie', cab.DocModificaSerie);
        setVal('invDocModificaNumero', cab.DocModificaNumero);
        setVal('invDocModificaTipo', cab.DocModificaTipo);
        setVal('invDocModificaFecha', cab.DocModificaFecha);
        // Detracción
        setVal('invDetBienServicio', cab.DetBienServicio);
        setVal('invDetMedioPago', cab.DetMedioPago);
        setVal('invDetNroCuenta', cab.DetNroCuenta);
        setVal('invDetPorcentaje', cab.DetPorcentaje);
        setVal('invDetMonto', cab.DetMonto);
        setVal('invDetLeyenda', cab.DetLeyenda);

        // Load docs relacionados
        window.currentCpeData = window.currentCpeData || {};
        if (cab.DocsRelacionadosJson) {
            try {
                window.currentCpeData.informacionDocumentosRelacionados = JSON.parse(cab.DocsRelacionadosJson);
                const docsDiv = document.getElementById('docsRelacionadosList');
                if (docsDiv) {
                    let html = '<div style="display:flex; flex-direction:column; gap:0.5rem;">';
                    window.currentCpeData.informacionDocumentosRelacionados.forEach(doc => {
                        html += '<div style="display:flex; align-items:center; gap:0.75rem; padding:0.5rem 0.75rem; background:#fffbeb; border:1px solid #fde68a; border-radius:6px;">';
                        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
                        html += '<div><span style="font-weight:600; color:#92400e;">' + (doc.desCpeRel || doc.codCpeRel || 'Doc') + '</span>';
                        html += '<span style="margin-left:0.5rem; font-weight:500;">' + (doc.numSerieDocRel || '') + '-' + (doc.numDocRel || '') + '</span></div>';
                        html += '</div>';
                    });
                    html += '</div>';
                    docsDiv.innerHTML = html;
                }
            } catch(e) {
                console.error('Error parsing DocsRelacionadosJson:', e);
            }
        }

        // Fill credit data
        setVal('invCreditoNumCuota', cab.CreditoNumCuotas);
        setVal('invCreditoMontoCuota', cab.CreditoMontoCuota);
        setVal('invCreditoFecPlazo', cab.CreditoFecPlazo);
        setVal('invCreditoMtoPendiente', cab.CreditoMtoPendiente);

        // Fill items
        invoiceItems = items.map(it => {
            console.log(`editFactura - Item ${it.CodMaterial}, archivos del backend:`, it.archivos);
            // Limpiar files corruptos del extraData (objetos vacíos serializados de File objects)
            let extraData = it.extraData || {};
            // Eliminar la propiedad files del extraData del backend (siempre se reconstruye desde la tabla de archivos)
            delete extraData.files;
            // Rellenar campos desde columnas individuales si no están en extraData
            extraData = {
                inci: extraData.inci || it.Inci || '',
                fabricante: extraData.fabricante || it.Fabricante || '',
                fecha_vencimiento: extraData.fecha_vencimiento || it.FechaVencimientoItem || '',
                obs1: extraData.obs1 || it.Obs1 || '',
                obs2: extraData.obs2 || it.Obs2 || '',
                obs3: extraData.obs3 || it.Obs3 || '',
                obs4: extraData.obs4 || it.Obs4 || '',
                files: {}
            };
            
            // Agrupar archivos por obsField desde la tabla CntFacturaDetArchivos
            if (it.archivos && it.archivos.length > 0) {
                extraData.files = {};
                for (const archivo of it.archivos) {
                    const obsField = archivo.ObsField;
                    if (!extraData.files[obsField]) {
                        extraData.files[obsField] = [];
                    }
                    extraData.files[obsField].push({
                        id: archivo.Id,
                        name: archivo.NombreArchivo,
                        path: archivo.RutaArchivo,
                        size: archivo.TamanioBytes,
                        createdAt: archivo.CreatedAt
                    });
                }
                console.log(`editFactura - Item ${it.CodMaterial}, archivos agrupados:`, extraData.files);
            }
            
            return {
                codigo: it.CodMaterial || '',
                codProv: '',
                desc: it.Descripcion || '',
                und: it.UnidadMedida || 'NIU',
                cant: it.Cantidad || 0,
                pu: it.PrecioUnitario || 0,
                vv: it.SubTotal || 0,
                igv: it.IGV || 0,
                total: it.Total || 0,
                tipoOp: (it.IGV > 0) ? 'gravada' : 'inafecta',
                extraData: extraData
            };
        });
        renderInvoiceItems();

        // Set mode to manual since we're editing
        setInvoiceMode('manual');

        // Store editing ID so registrarFactura knows to update instead of insert
        window.editingFacturaId = id;

        Swal.fire({
            icon: 'info', title: 'Modo Edición',
            html: `Registro <strong>${cab.Serie||''}-${cab.Numero||''}</strong> cargado en el formulario.<br>Modifique lo que necesite y presione <strong>Registrar Comprobante</strong> para guardar.`,
            timer: 3000, showConfirmButton: false
        });

    } catch(err) {
        Swal.fire({icon:'error', title:'Error', text: err.message});
    }
}

// ════════════════════════════════════════════════════════════
//  FILE UPLOAD HELPERS
// ════════════════════════════════════════════════════════════
function updateFileList() {
    const input = document.getElementById('invAdjuntosInput');
    const preview = document.getElementById('fileListPreview');
    if (!input || !preview) return;
    
    if (input.files.length === 0) {
        preview.innerHTML = '';
        return;
    }
    
    let html = '';
    for (const f of input.files) {
        const ext = f.name.split('.').pop().toUpperCase();
        const sizeKB = (f.size / 1024).toFixed(1);
        const color = ext === 'PDF' ? '#ef4444' : ext === 'XML' ? '#10b981' : '#6366f1';
        html += `<div style="display:flex; align-items:center; gap:0.75rem; padding:0.5rem 0; border-bottom:1px solid var(--border-soft); font-size:0.85rem;">
            <span style="background:${color}; color:white; padding:2px 8px; border-radius:4px; font-size:0.7rem; font-weight:600;">${ext}</span>
            <span style="flex:1;">${f.name}</span>
            <span style="color:var(--text-xs);">${sizeKB} KB</span>
        </div>`;
    }
    preview.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
//  TAB NAVIGATION
// ════════════════════════════════════════════════════════════
function switchRegTab(tabId) {
    document.querySelectorAll('.reg-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('panelRegistro').style.display = 'none';
    document.getElementById('panelHistorial').style.display = 'none';

    if (tabId === 'registro') {
        document.getElementById('tabBtnRegistro').classList.add('active');
        document.getElementById('tabBtnRegistro').style.background = 'white';
        document.getElementById('tabBtnRegistro').style.color = 'var(--text-main)';
        document.getElementById('tabBtnRegistro').style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        document.getElementById('tabBtnHistorial').style.background = 'transparent';
        document.getElementById('tabBtnHistorial').style.color = 'var(--text-muted)';
        document.getElementById('tabBtnHistorial').style.boxShadow = 'none';
        
        document.getElementById('panelRegistro').style.display = 'grid';
    } else {
        document.getElementById('tabBtnHistorial').classList.add('active');
        document.getElementById('tabBtnHistorial').style.background = 'white';
        document.getElementById('tabBtnHistorial').style.color = 'var(--text-main)';
        document.getElementById('tabBtnHistorial').style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        document.getElementById('tabBtnRegistro').style.background = 'transparent';
        document.getElementById('tabBtnRegistro').style.color = 'var(--text-muted)';
        document.getElementById('tabBtnRegistro').style.boxShadow = 'none';
        
        document.getElementById('panelHistorial').style.display = 'grid';
        loadFacturas();
    }
}

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user) return;
    renderUserInfo(user);
    await loadCompanies();

    const savedCia = localStorage.getItem('cnt_saved_cia');
    if (savedCia) {
        const el = document.getElementById('cntEmpresa');
        if (el && el.querySelector(`option[value="${savedCia}"]`)) {
            el.value = savedCia;
            currentCodCia = savedCia;
        }
    }
    
    document.getElementById('cntEmpresa').addEventListener('change', (e) => {
        localStorage.setItem('cnt_saved_cia', e.target.value);
        if(e.target.value) {
            currentCodCia = e.target.value;
            clearInvoiceForm();
            loadFacturas();
        }
    });

    if (currentCodCia) {
        loadFacturas();
    }
});

function filterTable(tbodyId, filterText) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const filter = filterText.toLowerCase();
    const rows = tbody.getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        const rowText = rows[i].innerText.toLowerCase();
        if (rowText.includes(filter)) {
            rows[i].style.display = '';
        } else {
            rows[i].style.display = 'none';
        }
    }
}
