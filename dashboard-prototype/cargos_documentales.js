// ════════════════════════════════════════════════════════════
//  CARGOS DOCUMENTALES - Frontend JS
//  Flujo: Logística → Contabilidad → Tesorería
// ════════════════════════════════════════════════════════════

let currentCodcia = '';
let currentUser = '';
let currentRole = 'USER';
let ocsDisponibles = [];
let userPerms = []; // Almacena sub-permisos del módulo

let viewModeBandeja = 'DETALLE'; // 'CARGO' o 'DETALLE'
let viewModeHistorial = 'DETALLE'; // 'CARGO' o 'DETALLE'

function setVistaBandeja(mode) {
    viewModeBandeja = mode;
    const btnC = document.getElementById('btnVistaBandejaCargo');
    const btnD = document.getElementById('btnVistaBandejaDetalle');
    if (mode === 'CARGO') {
        btnC.style.background = '#fff'; btnC.style.color = '#1e3a5f'; btnC.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
        btnD.style.background = 'transparent'; btnD.style.color = '#64748b'; btnD.style.boxShadow = 'none';
    } else {
        btnD.style.background = '#fff'; btnD.style.color = '#1e3a5f'; btnD.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
        btnC.style.background = 'transparent'; btnC.style.color = '#64748b'; btnC.style.boxShadow = 'none';
    }
    loadCargosRecibidos();
}

function setVistaHistorial(mode) {
    viewModeHistorial = mode;
    const btnC = document.getElementById('btnVistaHistorialCargo');
    const btnD = document.getElementById('btnVistaHistorialDetalle');
    if (mode === 'CARGO') {
        btnC.style.background = '#fff'; btnC.style.color = '#1e3a5f'; btnC.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
        btnD.style.background = 'transparent'; btnD.style.color = '#64748b'; btnD.style.boxShadow = 'none';
    } else {
        btnD.style.background = '#fff'; btnD.style.color = '#1e3a5f'; btnD.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
        btnC.style.background = 'transparent'; btnC.style.color = '#64748b'; btnC.style.boxShadow = 'none';
    }
    loadHistorial();
}

// ─── Axios Global Config ────────────
axios.interceptors.request.use(config => {
    const token = localStorage.getItem('yelave_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

axios.interceptors.response.use(res => res, error => {
    return Promise.reject(error.response?.data?.detail || error.message || 'Error del servidor');
});

// Dropdown Global Click Handler
window.addEventListener('click', function(e) {
    if (!e.target.matches('.action-dropdown-btn') && !e.target.closest('.action-dropdown-btn')) {
        document.querySelectorAll('.action-dropdown-menu.show').forEach(m => m.classList.remove('show'));
    }
});

function toggleDropdown(event, btnElement) {
    event.preventDefault();
    event.stopPropagation();
    const menu = btnElement.nextElementSibling;
    const isShowing = menu.classList.contains('show');
    document.querySelectorAll('.action-dropdown-menu.show').forEach(m => m.classList.remove('show'));
    if (!isShowing) menu.classList.add('show');
}

// ─── Init ────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    loadCompanies();
    try {
        const u = JSON.parse(localStorage.getItem('yelave_user'));
        if (u) {
            currentUser = u.login;
            currentRole = u.rol || 'USER';
            if (u.login === '71941916JL' || u.login.includes('71941916JL')) currentRole = 'ADMIN';
        } else {
            const payload = JSON.parse(atob(localStorage.getItem('yelave_token').split('.')[1]));
            currentUser = payload.sub || payload.username || 'Usuario';
        }
    } catch { currentUser = 'Usuario'; }
    
    await initSecurity();
});

// ─── Security Initialization ───
async function initSecurity() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/permisos/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        
        // Buscar hijos de 'cargos_documentales'
        const cargoParent = data.modulos.find(m => m.Codigo === 'cargos_documentales');
        if (!cargoParent) return; 

        userPerms = data.modulos.filter(m => m.ParentId === cargoParent.Id);
        
        // 1. Mostrar/Ocultar áreas basadas en sub-permisos
        const checkArea = (code, tabId) => {
            const p = userPerms.find(m => m.Codigo === code);
            const isVisible = p && p.PuedeVer;
            const btn = document.getElementById(`area${tabId}`);
            if (btn) btn.style.display = isVisible ? 'flex' : 'none';
            return isVisible;
        };

        const hasLog  = checkArea('cargo_area_log', 'LOGISTICA');
        const hasCont = checkArea('cargo_area_cont', 'CONTABILIDAD');
        const hasTes  = checkArea('cargo_area_tes', 'TESORERIA');

        // Auto-seleccionar primera área disponible
        if (hasLog) setArea('LOGISTICA');
        else if (hasCont) setArea('CONTABILIDAD');
        else if (hasTes) setArea('TESORERIA');
        else {
            document.querySelector('.cargo-tabs').innerHTML = '<p style="color:red; padding:1rem;">Sin áreas autorizadas</p>';
        }

    } catch(e) { console.error('Error initSecurity:', e); }
}

async function loadCompanies() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await axios.get('/api/permisos/empresas/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const companies = res.data;
        const select = document.getElementById('filterCia');
        select.innerHTML = '<option value="">Seleccione Empresa...</option>' +
            companies.map(c => {
                const cod = (c.CodCia || c.codcia || '').trim();
                const desc = c.nomcia || c.NomCia || '';
                return `<option value="${cod}">${cod} - ${desc}</option>`;
            }).join('');
        
        const cached = localStorage.getItem('yelave_codcia');
        const cu = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        const defaultCia = cached || cu.codcia || (companies.length > 0 ? companies[0].codcia : '');

        if (defaultCia) {
            select.value = defaultCia;
            currentCodcia = defaultCia;
            setTimeout(() => select.dispatchEvent(new Event('change')), 100);
        }
        select.addEventListener('change', () => { 
            currentCodcia = select.value; 
            localStorage.setItem('yelave_codcia', select.value);
        });
    } catch (e) {
        console.error('Error loadCompanies:', e);
        document.getElementById('filterCia').innerHTML = '<option value="" disabled>Sin acceso a empresas</option>';
    }
}

// ─── Area UI Routing ────────────────────
let currentArea = 'LOGISTICA';
let currentSubTab = '';

function setArea(area) {
    currentArea = area;
    document.querySelectorAll('.cargo-tab').forEach(t => t.classList.remove('active'));
    const mainTab = document.getElementById(`area${area}`);
    if (mainTab) mainTab.classList.add('active');

    const subTabsBar = document.getElementById('subTabsBar');
    let subTabsHtml = '';

    if (area === 'LOGISTICA') {
        subTabsHtml = `
            <button class="cargo-tab" style="font-size:0.85rem; padding:0.4rem 1rem;" onclick="switchSubTab('generar_log', event)">Enviar a Contabilidad</button>
            <button class="cargo-tab" style="font-size:0.85rem; padding:0.4rem 1rem;" onclick="switchSubTab('historial', event)">Historial Logística</button>
        `;
    } else if (area === 'CONTABILIDAD') {
        subTabsHtml = `
            <button class="cargo-tab" style="font-size:0.85rem; padding:0.4rem 1rem;" onclick="switchSubTab('recibidos', event)">Bandeja Entrada (de Logística)</button>
            <button class="cargo-tab" style="font-size:0.85rem; padding:0.4rem 1rem;" onclick="switchSubTab('generar_cont', event)">Enviar a Tesorería</button>
            <button class="cargo-tab" style="font-size:0.85rem; padding:0.4rem 1rem;" onclick="switchSubTab('historial', event)">Historial Contabilidad</button>
        `;
    } else if (area === 'TESORERIA') {
        subTabsHtml = `
            <button class="cargo-tab" style="font-size:0.85rem; padding:0.4rem 1rem;" onclick="switchSubTab('recibidos', event)">Bandeja Entrada (de Contabilidad)</button>
            <button class="cargo-tab" style="font-size:0.85rem; padding:0.4rem 1rem;" onclick="switchSubTab('historial', event)">Historial Tesorería</button>
        `;
    }

    subTabsBar.innerHTML = subTabsHtml;
    // Simulate clicking the first sub-tab
    const firstSubBtn = subTabsBar.querySelector('.cargo-tab');
    if (firstSubBtn) firstSubBtn.click();
}

function switchSubTab(tab, event) {
    if (event && event.currentTarget) {
        document.getElementById('subTabsBar').querySelectorAll('.cargo-tab').forEach(t => t.classList.remove('active'));
        event.currentTarget.classList.add('active');
    }

    document.getElementById('panelGenerar').style.display = 'none';
    document.getElementById('panelRecibidos').style.display = 'none';
    document.getElementById('panelHistorial').style.display = 'none';

    currentSubTab = tab;

    if (tab === 'generar_log') {
        document.getElementById('tipoCargo').value = 'LOG_A_CONT';
        document.getElementById('filtroFechas').style.display = 'flex';
        document.getElementById('panelGenerar').style.display = 'block';
    } else if (tab === 'generar_cont') {
        document.getElementById('tipoCargo').value = 'CONT_A_TES';
        document.getElementById('filtroFechas').style.display = 'none';
        document.getElementById('panelGenerar').style.display = 'block';
        loadOCsDisponibles();
    } else if (tab === 'recibidos') {
        document.getElementById('panelRecibidos').style.display = 'block';
        loadCargosRecibidos();
    } else if (tab === 'historial') {
        document.getElementById('panelHistorial').style.display = 'block';
        loadHistorial();
    }
}

let ocsDT = null;

async function loadOCsDisponibles() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) { Swal.fire('Atención', 'Seleccione una empresa.', 'warning'); return; }

    const ano = document.getElementById('filterAno').value;
    const mes = document.getElementById('filterMes').value;
    const tipoCargo = document.getElementById('tipoCargo').value;

    Swal.fire({
        title: 'Cargando OCs...',
        text: 'Por favor espere',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    if (ocsDT) { ocsDT.destroy(); ocsDT = null; }

    try {
        const res = await axios.get(`/api/cargos/ocs-disponibles?codcia=${encodeURIComponent(codcia)}&ano=${ano}&mes=${mes}&tipo_cargo=${tipoCargo}`);
        ocsDisponibles = res.data;
        Swal.close();

        const dtData = ocsDisponibles.map((oc, i) => {
            const mon = String(oc.moneda || '1').trim();
            const sym = mon === '2' ? 'USD' : 'S/';
            
            // Factura con enlace público
            let facturaCell;
            if (oc.factura && oc.factura_uuid) {
                facturaCell = `<a href="/factura_visor.html?uid=${oc.factura_uuid}" target="_blank" style="color:#2563eb; text-decoration:underline; font-weight:600;">${oc.factura}</a>`;
            } else if (oc.factura) {
                facturaCell = oc.factura;
            } else {
                facturaCell = '<span class="badge" style="background:#fee2e2; color:#991b1b;">Sin factura</span>';
            }
            const montoFactCell = oc.factura
                ? `${sym} ${parseFloat(oc.total_factura || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}`
                : '-';
                
            let almacenBadge = '';
            if (oc.estado_almacen === 'COMPLETO') {
                almacenBadge = '<span class="badge approved">Completo</span>';
            } else if (oc.estado_almacen === 'PARCIAL') {
                almacenBadge = '<span class="badge pending" style="background:#fed7aa; color:#9a3412;">Parcial</span>';
            } else {
                almacenBadge = '<span class="badge" style="background:#e5e7eb; color:#4b5563;">Sin Ingreso</span>';
            }

            let nroDocHtml = `<strong>${oc.nrodoc}</strong>`;
            if (oc.observacion_rechazo) {
                nroDocHtml += `<br><span style="color:#ef4444; font-size:0.65rem; font-weight:600;" title="${oc.observacion_rechazo}">⚠️ Rechazado: ${oc.observacion_rechazo.length > 25 ? oc.observacion_rechazo.substring(0, 25) + '...' : oc.observacion_rechazo}</span>`;
            }

            // Dropdown de acciones - Todas embebidas
            const codcia = document.getElementById('filterCia').value;
            const showWarehouse = String(oc.tipooc||'').trim().toUpperCase() === 'M';
            const showRecojo = ['M','O'].includes(String(oc.tipooc||'').trim().toUpperCase());

            let dpItems = `
                <button class="action-dropdown-item" onclick="openEmbeddedReport('${codcia}','${oc.nrodoc}','${oc.tipooc||''}','${oc.anos||''}')">
                    📋 Ver Orden
                </button>
            `;
            if (showRecojo) {
                dpItems += `<button class="action-dropdown-item" onclick="window.open('/orders.html?seek_oc=${oc.nrodoc}&cia=${codcia}&action=recojo', '_blank')">
                    ➡️ Solicitud de Recojo
                </button>`;
            }
            if (showWarehouse) {
                dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedWarehouse('${codcia}','${oc.nrodoc}')">
                    📦 Ingresos Almacén
                </button>`;
            }
            dpItems += `<div class="action-dropdown-divider"></div>`;
            dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedAttachment('${codcia}','${oc.tipooc||''}','${oc.nrodoc}','signed_order')">
                📝 Orden Firmada
            </button>`;
            dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedAttachment('${codcia}','${oc.tipooc||''}','${oc.nrodoc}','voucher')">
                💳 Voucher de Pago
            </button>`;
            dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedTraza('${codcia}','${oc.nrodoc}','${oc.tipooc||''}','${oc.anos||''}')">
                🔗 Trazabilidad OC
            </button>`;
            if (oc.factura_uuid) {
                dpItems += `<div class="action-dropdown-divider"></div>
                <button class="action-dropdown-item" onclick="window.open('/factura_visor.html?uid=${oc.factura_uuid}', '_blank')">
                    📄 Ver Factura (PDF)
                </button>`;
            }

            let actionsHtml = `
            <div class="action-dropdown">
                <button class="action-dropdown-btn" onclick="toggleDropdown(event, this)" title="Acciones">⋮</button>
                <div class="action-dropdown-menu">${dpItems}</div>
            </div>`;

            return [
                `<input type="checkbox" class="oc-chk" data-idx="${i}" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary);">`,
                nroDocHtml,
                oc.fchdoc || '-',
                oc.proveedor || '-',
                oc.ruc || '-',
                `<span class="badge pending">${oc.tipooc || '-'}</span>`,
                `${sym} ${parseFloat(oc.total_oc || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}`,
                almacenBadge,
                facturaCell,
                montoFactCell,
                actionsHtml
            ];
        });

        ocsDT = $('#ocsDisponiblesTable').DataTable({
            data: dtData,
            destroy: true,
            order: [[2, 'desc']],
            pageLength: 10,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: 'Bfrtip',
            buttons: [
                { extend: 'excelHtml5', text: '📊 Excel', className: 'dt-button', exportOptions: { columns: [1,2,3,4,5,6,7,8,9] } },
            ],
            columnDefs: [
                { targets: 0, orderable: false, searchable: false, className: 'dt-center' },
                { targets: [6, 9], className: 'dt-right' },
                { targets: 10, orderable: false, searchable: false, className: 'dt-center no-print' }
            ]
        });

        $('#chkAllOcs').off('change').on('change', function() {
            const checked = this.checked;
            ocsDT.rows().nodes().each(function(row) {
                $(row).find('.oc-chk').prop('checked', checked);
            });
        });

    } catch (err) {
        document.getElementById('ocsDisponiblesTbody').innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:#ef4444;">${err.message}</td></tr>`;
    }
}

function toggleAllOcs() {
    if (!ocsDT) return;
    const checked = document.getElementById('chkAllOcs').checked;
    ocsDT.rows().nodes().each(function(row) {
        $(row).find('.oc-chk').prop('checked', checked);
    });
}

async function generarCargo() {
    try {
        if (!ocsDT) { Swal.fire('Atención', 'Primero cargue las OCs disponibles.', 'warning'); return; }

        const selected = [];
        ocsDT.rows().nodes().each(function(row) {
            const chk = $(row).find('.oc-chk');
            if (chk.is(':checked')) {
                const idx = parseInt(chk.attr('data-idx'));
                const oc = ocsDisponibles[idx];
                selected.push({
                    nro_orden_compra: oc.nrodoc,
                    tipo_oc: oc.tipooc,
                    codcia_oc: document.getElementById('filterCia').value,
                    anos_oc: oc.anos,
                    nro_factura: oc.factura,
                    monto_oc: parseFloat(oc.total_oc || 0),
                    monto_factura: parseFloat(oc.total_factura || 0),
                    proveedor: oc.proveedor,
                    ruc_proveedor: oc.ruc
                });
            }
        });

        if (selected.length === 0) {
            Swal.fire('Atención', 'Seleccione al menos una Orden de Compra.', 'warning');
            return;
        }

        const tipoCargo = document.getElementById('tipoCargo').value;
        const areaOrigen = tipoCargo === 'LOG_A_CONT' ? 'LOGISTICA' : 'CONTABILIDAD';
        const areaDestino = tipoCargo === 'LOG_A_CONT' ? 'CONTABILIDAD' : 'TESORERIA';

        const confirm = await Swal.fire({
            title: '¿Generar Cargo de Entrega?',
            html: `<div style="text-align:left; font-size:0.9rem;">
                <p><strong>Tipo:</strong> ${areaOrigen} → ${areaDestino}</p>
                <p><strong>OCs seleccionadas:</strong> ${selected.length}</p>
                <p><strong>Monto total facturas:</strong> S/ ${selected.reduce((s, x) => s + (x.monto_factura || 0), 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}</p>
            </div>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, Generar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#2563eb'
        });

        if (!confirm.isConfirmed) return;

        const payload = {
            codcia: document.getElementById('filterCia').value,
            tipo_cargo: tipoCargo,
            usuario_origen: currentUser,
            area_origen: areaOrigen,
            area_destino: areaDestino,
            observaciones: document.getElementById('cargoObservaciones').value.trim(),
            detalle: selected
        };

        const res = await axios.post('/api/cargos/generar', payload);

        await Swal.fire({
            title: 'Cargo Generado!',
            text: `Se ha generado el Cargo N° ${res.data.NroCargo}`,
            icon: 'success',
            confirmButtonText: 'OK',
            confirmButtonColor: '#10b981'
        });

        document.getElementById('cargoObservaciones').value = '';
        setTimeout(() => switchSubTab('historial', null), 300);
        
    } catch (err) {
        Swal.fire('Error Inesperado', err.message, 'error');
        console.error("Error generating cargo:", err);
    }
}


// ════════════════════════════════════════════════════════════
//  TAB 2: CARGOS RECIBIDOS
// ════════════════════════════════════════════════════════════

let recibidosDT = null;

async function loadCargosRecibidos() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) return;

    if (recibidosDT) { recibidosDT.destroy(); recibidosDT = null; }
    const thead = $('#cargosRecibidosTable thead');
    const tbody = document.getElementById('cargosRecibidosTbody');
    
    if (viewModeBandeja === 'CARGO') {
        thead.html(`<tr>
            <th style="width:40px; text-align:center;"><input type="checkbox" id="chkAllRecibidos" onchange="toggleAllRecibidos()"></th>
            <th>N° Cargo</th><th>Flujo</th><th>Estado</th><th>Generado</th><th>Área Origen</th><th style="text-align:right;">Items</th><th style="text-align:right;">Monto Total</th><th style="width:120px;">Acciones</th>
        </tr>`);
    } else {
        thead.html(`<tr>
            <th style="width:40px; text-align:center;"><input type="checkbox" id="chkAllRecibidos" onchange="toggleAllRecibidos()"></th>
            <th>Estado İtem</th><th>N° Cargo</th><th>Generado</th><th>Origen</th><th>N° OC</th><th>Proveedor</th><th>N° Factura</th><th>Almacén</th><th style="text-align:right;">Monto</th><th style="width:120px;">Acciones</th>
        </tr>`);
    }

    tbody.innerHTML = `<tr><td colspan="${viewModeBandeja === 'CARGO' ? 9 : 11}" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando...</td></tr>`;

    try {
        const res = await axios.get(`/api/cargos/detallado/lista?codcia=${encodeURIComponent(codcia)}`);
        const allItems = res.data;
        
        let pending = [];
        if (currentArea === 'CONTABILIDAD') {
            const pendLogistica = allItems.filter(c => c.EstadoCargo === 'PENDIENTE' && c.AreaDestino === 'CONTABILIDAD');
            const devueltosTesoreria = allItems.filter(c => c.TipoCargo === 'CONT_A_TES' && c.EstadoContable === 'RECHAZADO');
            pending = [...pendLogistica, ...devueltosTesoreria];
        } else if (currentArea === 'TESORERIA') {
            pending = allItems.filter(c => (c.EstadoCargo === 'PENDIENTE' || c.EstadoCargo === 'RECIBIDO') && c.AreaDestino === 'TESORERIA');
        }

        tbody.innerHTML = '';
        if (pending.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${viewModeBandeja === 'CARGO' ? 9 : 11}" style="text-align:center; padding:2rem; color:var(--text-muted);">No hay OCs pendientes.</td></tr>`;
            return;
        }

        let dtData = [];

        if (viewModeBandeja === 'CARGO') {
            const mapCargo = {};
            pending.forEach(c => {
                if (!mapCargo[c.CargoId]) {
                    mapCargo[c.CargoId] = { CargoId: c.CargoId, NroCargo: c.NroCargo, TipoCargo: c.TipoCargo, FechaCargo: c.FechaCargo, AreaOrigen: c.AreaOrigen, EstadoCargo: c.EstadoCargo, Items: 0, MontoTotal: 0, EsDevuelto: false };
                }
                mapCargo[c.CargoId].Items++;
                mapCargo[c.CargoId].MontoTotal += parseFloat(c.MontoFactura || 0);
                if (c.TipoCargo === 'CONT_A_TES' && c.EstadoContable === 'RECHAZADO') mapCargo[c.CargoId].EsDevuelto = true;
            });

            dtData = Object.values(mapCargo).map(cg => {
                const tipoLabel = cg.TipoCargo === 'LOG_A_CONT' ? 'Log → Cont' : 'Cont → Tes';
                let estadoItem = cg.EsDevuelto 
                    ? '<span style="color:#fff; background:#dc2626; font-size:0.6rem; font-weight:700; padding:2px 6px; border-radius:4px;">⚠️ DEVUELTOS</span>' 
                    : `<span style="color:#64748b; font-size:0.65rem; font-weight:700;">${cg.EstadoCargo}</span>`;

                let dpItems = `<button class="action-dropdown-item" onclick="event.preventDefault(); openCargoDetail(${cg.CargoId})">📄 Vista Cargo</button>`;
                
                let mainButtons = '';
                if (cg.EstadoCargo === 'PENDIENTE' && !cg.EsDevuelto) {
                    mainButtons += `<button class="btn btn-primary" style="padding:0.25rem 0.5rem; font-size:0.7rem; display:inline-flex; align-items:center; gap:0.25rem;" onclick="event.preventDefault(); recibirCargo(${cg.CargoId})">📥 Recibir (${cg.Items})</button>`;
                }
                
                let actionsHtml = `<div style="display:flex; align-items:center; gap:0.5rem; white-space:nowrap;">${mainButtons}<div class="action-dropdown"><button class="action-dropdown-btn" onclick="toggleDropdown(event, this)" title="Más Acciones">⋮</button><div class="action-dropdown-menu">${dpItems}</div></div></div>`;

                return [
                    `<input type="checkbox" class="rec-chk no-print" data-cargoid="${cg.CargoId}">`,
                    `<strong>${cg.NroCargo}</strong>`, tipoLabel, estadoItem, cg.FechaCargo || '-', cg.AreaOrigen || '-',
                    `<span style="font-weight:700;">${cg.Items}</span>`, `S/ ${cg.MontoTotal.toLocaleString('es-PE', {minimumFractionDigits: 2})}`, actionsHtml
                ];
            });

            recibidosDT = $('#cargosRecibidosTable').DataTable({
                data: dtData, destroy: true, order: [[4, 'desc']], pageLength: 10,
                language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, dom: 'Bfrtip',
                buttons: [ { extend: 'excelHtml5', text: '📊 Exportar Pendientes', className: 'dt-button', exportOptions: { columns: [1,2,3,4,5,6,7] } } ],
                columnDefs: [ { targets: [0, 8], orderable: false }, { targets: [6, 7], className: 'dt-right font-semibold text-slate-800' } ]
            });
        } else {
            dtData = pending.map(c => {
                const esDevueltoTesoreria = c.TipoCargo === 'CONT_A_TES' && c.EstadoContable === 'RECHAZADO';
                let estadoItem;
                if (esDevueltoTesoreria) estadoItem = '<span style="color:#fff; background:#dc2626; font-size:0.6rem; font-weight:700; padding:2px 6px; border-radius:4px;">⚠️ DEVUELTO POR TESORERÍA</span>';
                else if (c.EstadoContable === 'RECHAZADO') estadoItem = '<span style="color:#ef4444; font-size:0.65rem; font-weight:700;">RECHAZADO</span>';
                else if (c.EstadoContable === 'ACEPTADO') estadoItem = '<span style="color:#10b981; font-size:0.65rem; font-weight:700;">ACEPTADO</span>';
                else estadoItem = '<span style="color:#64748b; font-size:0.65rem; font-weight:700;">PENDIENTE</span>';
                
                const tipoLabel = c.TipoCargo === 'LOG_A_CONT' ? 'Log → Cont' : 'Cont → Tes';

                let dpItems = `
                    <button class="action-dropdown-item" onclick="event.preventDefault(); openCargoDetail(${c.CargoId})">📄 Vista Cargo</button>
                    <button class="action-dropdown-item" onclick="openEmbeddedReport('${c.CodCiaOc||''}','${c.NroOrdenCompra||''}','${c.TipoOc||''}','')">📋 Ver Orden</button>
                `;

                let showWarehouse = String(c.TipoOc||'').trim().toUpperCase() === 'M';
                if (showWarehouse) {
                    dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedWarehouse('${c.CodCiaOc||''}','${c.NroOrdenCompra||''}')">📦 Ingresos Almacén</button>`;
                }
                dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedTraza('${c.CodCiaOc||''}','${c.NroOrdenCompra||''}','${c.TipoOc||''}','')">🔗 Trazabilidad OC</button>`;
                dpItems += `<div class="action-dropdown-divider"></div>`;
                dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedAttachment('${c.CodCiaOc||''}','${c.TipoOc||''}','${c.NroOrdenCompra||''}','signed_order')">📝 Orden Firmada</button>`;
                dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedAttachment('${c.CodCiaOc||''}','${c.TipoOc||''}','${c.NroOrdenCompra||''}','voucher')">💳 Voucher de Pago</button>`;
                
                let mainButtons = '';
                if (c.EstadoCargo === 'PENDIENTE' && !esDevueltoTesoreria) {
                    mainButtons += `<button class="btn btn-primary" style="padding:0.25rem 0.5rem; font-size:0.7rem; display:inline-flex; align-items:center; gap:0.25rem;" onclick="event.preventDefault(); recibirCargo(${c.CargoId})">📥 Recibir</button>`;
                }

                if (esDevueltoTesoreria) {
                    mainButtons += `<button class="btn btn-primary" style="padding:0.25rem 0.5rem; font-size:0.7rem; display:inline-flex; align-items:center; gap:0.25rem; background:#dc2626; border-color:#dc2626;" onclick="reenviarATesoreria(${c.CargoId}, ${c.DetalleId}, '${c.NroOrdenCompra||''}', '${c.TipoOc||''}', '${c.CodCiaOc||''}', '', '${(c.Proveedor||'').replace(/'/g,"\\'")}', '', ${c.MontoOC||0}, ${c.MontoFactura||0}, '${c.NroFactura||''}')">🔄 Reenviar a Tesorería</button>`;
                }
                if (c.FacturaUuid) {
                    dpItems += `<div class="action-dropdown-divider"></div><button class="action-dropdown-item" onclick="window.open('/factura_visor.html?uid=${c.FacturaUuid}', '_blank')">📄 Ver Factura (PDF)</button>`;
                }

                let actionsHtml = `<div style="display:flex; align-items:center; gap:0.5rem; white-space:nowrap;">${mainButtons}<div class="action-dropdown"><button class="action-dropdown-btn" onclick="toggleDropdown(event, this)" title="Más Acciones">⋮</button><div class="action-dropdown-menu">${dpItems}</div></div></div>`;
                let facturaCell = c.NroFactura || '-';
                if (c.FacturaUuid && c.NroFactura) facturaCell = `<a href="/factura_visor.html?uid=${c.FacturaUuid}" target="_blank" style="color:#2563eb; text-decoration:underline;">${c.NroFactura}</a>`;

                return [
                    `<input type="checkbox" class="rec-chk no-print" data-cargoid="${c.CargoId}">`,
                    estadoItem, `<strong>${c.NroCargo}</strong>`, c.FechaCargo || '-', tipoLabel, `<strong>${c.NroOrdenCompra || '-'}</strong>`,
                    c.Proveedor || '-', facturaCell, c.EstadoAlmacen || '-', `S/ ${parseFloat(c.MontoFactura || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}`, actionsHtml
                ];
            });

            recibidosDT = $('#cargosRecibidosTable').DataTable({
                data: dtData, destroy: true, order: [[3, 'desc']], pageLength: 10,
                language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, dom: 'Bfrtip',
                buttons: [ { extend: 'excelHtml5', text: '📊 Exportar Pendientes', className: 'dt-button', exportOptions: { columns: [1,2,3,4,5,6,7,8,9] } } ],
                columnDefs: [ { targets: [0, 10], orderable: false }, { targets: [9], className: 'dt-right font-semibold text-slate-800' } ]
            });
        }

        $('#chkAllRecibidos').off('change').on('change', function() {
            const checked = this.checked;
            recibidosDT.rows().nodes().each(function(row) {
                $(row).find('.rec-chk').prop('checked', checked);
            });
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="${viewModeBandeja === 'CARGO' ? 9 : 11}" style="color:#ef4444; text-align:center; padding:2rem;">${err.message}</td></tr>`;
    }
}

async function recibirCargo(id) {
    try {
        Swal.fire({title: 'Cargando detalle...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        const res = await axios.get(`/api/cargos/${id}`);
        const data = res.data;
        Swal.close();
        
        // Add onchange handler to toggle observation input visibility
        window.toggleObsInput = function(checkbox, id) {
            const obsInput = document.getElementById(`obs_rechazo_${id}`);
            if (checkbox.checked) {
                obsInput.style.display = 'none';
                obsInput.value = '';
            } else {
                obsInput.style.display = 'block';
            }
        };

        let htmlContent = `
            <div style="text-align:left; font-size:0.85rem; margin-bottom:1rem; color:#475569;">
                Por favor, verifique los documentos recibidos. Desmarque los que presenten inconformidades y explique el motivo de rechazo.
            </div>
            <div style="max-height:50vh; overflow-y:auto; border:1px solid #cbd5e1; border-radius:6px; text-align:left;">
                <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                    <thead style="background:#f1f5f9; position:sticky; top:0; z-index:2;">
                        <tr>
                            <th style="padding:0.5rem; border-bottom:1px solid #cbd5e1; text-align:center; width:40px;">
                                <input type="checkbox" checked onclick="document.querySelectorAll('.chk-recibir').forEach(cb => { cb.checked = this.checked; window.toggleObsInput(cb, cb.value); });" style="cursor:pointer; accent-color:#10b981;">
                            </th>
                            <th style="padding:0.5rem; border-bottom:1px solid #cbd5e1;">Evaluación OC</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.detail.map(d => `
                            <tr>
                                <td style="padding:0.4rem; border-bottom:1px solid #e2e8f0; text-align:center; vertical-align:top;">
                                    <input type="checkbox" class="chk-recibir" value="${d.Id}" checked onchange="window.toggleObsInput(this, ${d.Id})" style="cursor:pointer; accent-color:#10b981; margin-top:5px;">
                                </td>
                                <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0;">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                        <strong>OC: ${d.NroOrdenCompra || '-'}</strong>
                                        <span style="color:#64748b;">Fac: ${d.NroFactura || '-'} (S/ ${parseFloat(d.MontoOC || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})})</span>
                                    </div>
                                    <input type="text" id="obs_rechazo_${d.Id}" class="obs-rechazo-input" placeholder="Especifique el motivo de rechazo..." style="display:none; width:100%; font-size:0.75rem; padding:0.3rem; border:1px solid #ef4444; border-radius:4px; margin-top:4px;">
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        const confirm = await Swal.fire({
            title: `¿Recibir Cargo ${data.header.NroCargo}?`,
            html: htmlContent,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Confirmar Recepción/Rechazo',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#10b981',
            width: '650px'
        });

        if (!confirm.isConfirmed) return;

        const acceptedIds = [];
        const rejectedItems = [];
        let validationError = false;

        document.querySelectorAll('.chk-recibir').forEach(cb => { 
            const idInt = parseInt(cb.value);
            if (cb.checked) {
                acceptedIds.push(idInt); 
            } else {
                const obs = document.getElementById(`obs_rechazo_${idInt}`).value.trim();
                if (!obs) validationError = true;
                rejectedItems.push({ id: idInt, observacion: obs });
            }
        });

        if (validationError) {
            Swal.fire('Atención', 'Debe especificar el motivo de rechazo en todas las OCs desmarcadas.', 'warning');
            return;
        }

        Swal.fire({title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});

        await axios.post(`/api/cargos/${id}/recibir`, { 
            usuario: currentUser, 
            ids_aceptados: acceptedIds,
            items_rechazados: rejectedItems
        });

        Swal.fire('Recepción Exitosa', 'El cargo y sus ítems han sido procesados y devueltos correctamente.', 'success');
        loadCargosRecibidos();
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
}

function procesarPagoOC(detalleId, codcia, nrodoc, tipooc) {
    document.getElementById('pago_idDetalle').value = detalleId;
    document.getElementById('pago_codcia').value = codcia;
    document.getElementById('pago_nrodoc').value = nrodoc;
    document.getElementById('pago_tipooc').value = tipooc || 'O';
    
    // Default values
    document.getElementById('pago_fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('pago_moneda').value = 'PEN';
    document.getElementById('pago_banco').value = 'BCP';
    document.getElementById('pago_tipo').value = 'TRANSFERENCIA';
    document.getElementById('pago_nro_operacion').value = '';
    document.getElementById('pago_monto').value = '';
    document.getElementById('pago_adjuntos').value = '';
    document.getElementById('pago_notas').value = '';

    document.getElementById('modalPagoTesoreria').classList.add('active');
}

async function submitPagoTesoreria() {
    const detalleId = document.getElementById('pago_idDetalle').value;
    const files = document.getElementById('pago_adjuntos').files;

    if (files.length > 3) {
        Swal.fire('Atención', 'Puede subir un máximo de 3 adjuntos.', 'warning');
        return;
    }

    let formData = new FormData();
    formData.append('usuario', currentUser);
    formData.append('moneda', document.getElementById('pago_moneda').value);
    formData.append('monto', document.getElementById('pago_monto').value);
    formData.append('banco', document.getElementById('pago_banco').value);
    formData.append('tipo', document.getElementById('pago_tipo').value);
    formData.append('fecha', document.getElementById('pago_fecha').value);
    formData.append('nro_operacion', document.getElementById('pago_nro_operacion').value);
    formData.append('notas', document.getElementById('pago_notas').value);
    
    for (let i = 0; i < files.length; i++) {
        formData.append('archivos', files[i]);
    }

    try {
        document.getElementById('modalPagoTesoreria').classList.remove('active');
        Swal.fire({title: 'Registrando Pago...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        
        await axios.post(`/api/cargos/detalle/${detalleId}/pagar_completo`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        Swal.fire('Completado', 'El pago ha sido registrado y el cargo actualizado.', 'success');
        loadCargosRecibidos();
    } catch(err) {
        Swal.fire('Error', err.response?.data?.detail || err.message, 'error');
    }
}

// ════════════════════════════════════════════════════════════
//  TAB 3: HISTORIAL
// ════════════════════════════════════════════════════════════

let historialDT = null;

async function loadHistorial() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) return;

    if (historialDT) { historialDT.destroy(); historialDT = null; }
    
    const thead = $('#historialTable thead');
    const tbody = document.getElementById('historialTbody');

    if (viewModeHistorial === 'CARGO') {
        thead.html(`<tr>
            <th>N° Cargo</th><th>Estado</th><th>Fecha Cargo</th><th>Flujo</th><th>Origen</th><th>Destino</th><th style="text-align:right;">Items</th><th style="text-align:right;">Monto Total</th><th style="width:100px;">Acciones</th>
        </tr>`);
    } else {
        thead.html(`<tr>
            <th>Estado İtem</th><th>N° Cargo</th><th>Fecha Cargo</th><th>Flujo</th><th>N° OC</th><th>Proveedor</th><th>N° Factura</th><th>Almacén</th><th style="text-align:right;">Monto</th><th style="width:120px;">Acciones</th>
        </tr>`);
    }

    tbody.innerHTML = `<tr><td colspan="${viewModeHistorial === 'CARGO' ? 9 : 10}" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando historial...</td></tr>`;

    try {
        const res = await axios.get(`/api/cargos/detallado/lista?codcia=${encodeURIComponent(codcia)}`);
        const allItems = res.data;

        let validos = [];
        if (currentArea === 'LOGISTICA') validos = allItems.filter(c => c.AreaOrigen === 'LOGISTICA');
        else if (currentArea === 'CONTABILIDAD') validos = allItems.filter(c => c.AreaDestino === 'CONTABILIDAD' || c.AreaOrigen === 'CONTABILIDAD');
        else if (currentArea === 'TESORERIA') validos = allItems.filter(c => c.AreaDestino === 'TESORERIA');
        else validos = allItems;

        tbody.innerHTML = '';
        if (validos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${viewModeHistorial === 'CARGO' ? 9 : 10}" style="text-align:center; padding:2rem; color:var(--text-muted);">No hay historial para su área.</td></tr>`;
            return;
        }

        let dtData = [];

        if (viewModeHistorial === 'CARGO') {
            const mapCargo = {};
            validos.forEach(c => {
                if (!mapCargo[c.CargoId]) {
                    mapCargo[c.CargoId] = { CargoId: c.CargoId, NroCargo: c.NroCargo, TipoCargo: c.TipoCargo, FechaCargo: c.FechaCargo, AreaOrigen: c.AreaOrigen, AreaDestino: c.AreaDestino, EstadoCargo: c.EstadoCargo, Items: 0, MontoTotal: 0 };
                }
                mapCargo[c.CargoId].Items++;
                mapCargo[c.CargoId].MontoTotal += parseFloat(c.MontoFactura || 0);
            });

            dtData = Object.values(mapCargo).map(cg => {
                const tipoLabel = cg.TipoCargo === 'LOG_A_CONT' ? 'Log → Cont' : 'Cont → Tes';
                const estadoItem = `<span style="color:#64748b; font-size:0.65rem; font-weight:700;">${cg.EstadoCargo}</span>`;
                
                let dpItems = `<button class="action-dropdown-item" onclick="event.preventDefault(); openCargoDetail(${cg.CargoId})">📄 Vista Cargo Completo</button>`;
                let actionsHtml = `<div class="action-dropdown"><button class="action-dropdown-btn" onclick="toggleDropdown(event, this)" title="Acciones">⋮</button><div class="action-dropdown-menu">${dpItems}</div></div>`;

                return [
                    `<strong>${cg.NroCargo}</strong>`, estadoItem, cg.FechaCargo || '-', tipoLabel,
                    cg.AreaOrigen || '-', cg.AreaDestino || '-',
                    `<span style="font-weight:700;">${cg.Items}</span>`, `S/ ${cg.MontoTotal.toLocaleString('es-PE', {minimumFractionDigits: 2})}`, actionsHtml
                ];
            });

            historialDT = $('#historialTable').DataTable({
                data: dtData, destroy: true, order: [[2, 'desc']], pageLength: 10,
                language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, dom: 'Bfrtip',
                buttons: [ { extend: 'excelHtml5', text: '📊 Exportar Historial', className: 'dt-button', exportOptions: { columns: [0,1,2,3,4,5,6,7] } } ],
                columnDefs: [ { targets: [6, 7], className: 'dt-right font-semibold text-slate-800' } ]
            });
        } else {
            dtData = validos.map(c => {
                let estadoItem = c.EstadoContable === 'RECHAZADO' 
                    ? '<span style="color:#ef4444; font-size:0.65rem; font-weight:700;">RECHAZADO</span>' 
                    : (c.EstadoContable === 'ACEPTADO' ? '<span style="color:#10b981; font-size:0.65rem; font-weight:700;">ACEPTADO</span>' : '<span style="color:#64748b; font-size:0.65rem; font-weight:700;">PENDIENTE</span>');
                if (c.TipoCargo === 'CONT_A_TES' && c.EstadoContable === 'RECHAZADO') {
                    estadoItem = '<span style="color:#fff; background:#dc2626; font-size:0.65rem; font-weight:700; padding:2px 6px; border-radius:4px;">DEVUELTO TESORERÍA</span>';
                }

                const tipoLabel = c.TipoCargo === 'LOG_A_CONT' ? 'Log → Cont' : 'Cont → Tes';

                let dpItems = `<button class="action-dropdown-item" onclick="event.preventDefault(); openCargoDetail(${c.CargoId})">📄 Vista Cargo</button>`;
                
                if (c.NroOrdenCompra) {
                    const codcia = (c.CodCiaOc || '').trim();
                    const nrodoc = (c.NroOrdenCompra || '').trim();
                    const tipooc = (c.TipoOc || '').trim();
                    const anos = (c.AnosOc || '').trim();
                    const showWarehouse = tipooc.toUpperCase() === 'M';

                    dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedReport('${codcia}','${nrodoc}','${tipooc}','${anos}')">📋 Ver Orden</button>`;
                    if (showWarehouse) dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedWarehouse('${codcia}','${nrodoc}')">📦 Ingresos Almacén</button>`;
                    dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedTraza('${codcia}','${nrodoc}','${tipooc}','${anos}')">🔗 Trazabilidad OC</button>`;
                    dpItems += `<div class="action-dropdown-divider"></div>`;
                    dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedAttachment('${codcia}','${tipooc}','${nrodoc}','signed_order')">📝 Orden Firmada</button>`;
                    dpItems += `<button class="action-dropdown-item" onclick="openEmbeddedAttachment('${codcia}','${tipooc}','${nrodoc}','voucher')">💳 Voucher de Pago</button>`;
                }
                
                if (c.FacturaUuid) {
                    dpItems += `<div class="action-dropdown-divider"></div><button class="action-dropdown-item" onclick="window.open('/factura_visor.html?uid=${c.FacturaUuid}', '_blank')">📄 Ver Factura (PDF)</button>`;
                }

                let actionsHtml = `<div class="action-dropdown"><button class="action-dropdown-btn" onclick="toggleDropdown(event, this)" title="Acciones">⋮</button><div class="action-dropdown-menu">${dpItems}</div></div>`;
                let facturaCell = c.NroFactura || '-';
                if (c.FacturaUuid && c.NroFactura) facturaCell = `<a href="/factura_visor.html?uid=${c.FacturaUuid}" target="_blank" style="color:#2563eb; text-decoration:underline;">${c.NroFactura}</a>`;

                return [
                    estadoItem, `<strong>${c.NroCargo}</strong><br><span style="font-size:0.65rem; color:#64748b;">${c.EstadoCargo}</span>`,
                    c.FechaCargo || '-', tipoLabel, `<strong>${c.NroOrdenCompra || '-'}</strong>`, c.Proveedor || '-',
                    facturaCell, c.EstadoAlmacen || '-', `S/ ${parseFloat(c.MontoFactura || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}`, actionsHtml
                ];
            });

            historialDT = $('#historialTable').DataTable({
                data: dtData, destroy: true, order: [[2, 'desc']], pageLength: 10,
                language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, dom: 'Bfrtip',
                buttons: [ { extend: 'excelHtml5', text: '📊 Exportar Historial', className: 'dt-button', exportOptions: { columns: [0,1,2,3,4,5,6,7,8] } } ],
                columnDefs: [ { targets: [8], className: 'dt-right font-semibold text-slate-800' } ]
            });
        }

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="${viewModeHistorial === 'CARGO' ? 9 : 10}" style="color:#ef4444; text-align:center; padding:2rem;">${err.message}</td></tr>`;
    }
}

async function eliminarCargo(id) {
    const confirm = await Swal.fire({
        title: '¿Eliminar Cargo?',
        text: 'Esta acción eliminará permanentemente el cargo y su detalle.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, Eliminar',
        confirmButtonColor: '#ef4444'
    });
    if (!confirm.isConfirmed) return;

    try {
        await axios.delete(`/api/cargos/${id}`);
        Swal.fire('Eliminado', 'Cargo eliminado exitosamente.', 'success');
        loadHistorial();
        loadCargosRecibidos();
    } catch (err) {
        Swal.fire('Error', err.response?.data?.detail || err.message, 'error');
    }
}


// ════════════════════════════════════════════════════════════
//  CARGO DETAIL MODAL + REPORTE
// ════════════════════════════════════════════════════════════

async function openCargoDetail(cargoId) {
    document.getElementById('cargoDetailModal').classList.add('active');
    const content = document.getElementById('reportPreviewContent');
    
    try {
        Swal.fire({title: 'Cargando detalle...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        const res = await axios.get(`/api/cargos/${cargoId}`);
        const data = res.data;
        Swal.close();
        const h = data.header;
        const det = data.detail;

        document.getElementById('cargoDetailNro').textContent = h.NroCargo;

        const tipoLabel = h.TipoCargo === 'LOG_A_CONT'
            ? 'LOGÍSTICA → CONTABILIDAD'
            : 'CONTABILIDAD → TESORERÍA';

        let mapOC = {};
        let totalOC = 0, totalFact = 0;
        
        det.forEach(d => {
            const key = d.NroOrdenCompra || d.Id;
            if (!mapOC[key]) {
                mapOC[key] = { ...d, MontoFacturaTotal: 0, FacturasList: [], LinksHtml: [] };
                totalOC += parseFloat(d.MontoOC || 0);
                
                if (d.NroOrdenCompra) {
                    const codcia = (d.CodCiaOc || '').trim();
                    const nrodoc = (d.NroOrdenCompra || '').trim();
                    const tipooc = (d.TipoOc || '').trim();
                    mapOC[key].LinksHtml.push(`<a href="#" onclick="event.preventDefault(); openEmbeddedReport('${codcia}', '${nrodoc}', '${tipooc}', '')" class="no-print" style="color:#10b981; text-decoration:none; margin-right:4px;" title="Ver OC">🔗OC</a>`);
                    if (tipooc === 'M') {
                        mapOC[key].LinksHtml.push(`<a href="#" onclick="event.preventDefault(); openEmbeddedWarehouse('${codcia}', '${nrodoc}')" class="no-print" style="color:#f59e0b; text-decoration:none; margin-right:4px;" title="Ver Almacén">📦Almacén</a>`);
                    }
                    mapOC[key].LinksHtml.push(`<a href="#" onclick="event.preventDefault(); openEmbeddedTraza('${codcia}', '${nrodoc}', '${tipooc}', '')" class="no-print" style="color:#8b5cf6; text-decoration:none; margin-right:4px;" title="Trazabilidad">📊Traza</a>`);
                }
            }
            
            mapOC[key].MontoFacturaTotal += parseFloat(d.MontoFactura || 0);
            totalFact += parseFloat(d.MontoFactura || 0);
            
            if (d.FacturaUuid) {
                mapOC[key].LinksHtml.push(`<a href="/factura_visor.html?uid=${d.FacturaUuid}" target="_blank" class="no-print" style="color:#2563eb; text-decoration:none; margin-right:4px;" title="Ver Factura">📄</a>`);
            }

            let fHtml = d.NroFactura || '-';
            if (d.FacturaUuid && d.NroFactura) {
                fHtml = `<a href="/factura_visor.html?uid=${d.FacturaUuid}" target="_blank" style="color:#2563eb; text-decoration:underline; font-weight:600;">${d.NroFactura}</a>`;
            }
            mapOC[key].FacturasList.push({
                fHtml: fHtml,
                fch: d.fch_factura || '-',
                monto: parseFloat(d.MontoFactura || 0)
            });
        });

        const detailRows = Object.values(mapOC).map((d, i) => {
            const estadoItem = d.EstadoContable === 'RECHAZADO' 
                ? '<span style="color:#ef4444; font-size:0.65rem; font-weight:700; border:1px solid #fecaca; padding:1px 4px; border-radius:3px; background:#fef2f2;">RECHAZADO</span>' 
                : '';

            const linksHtml = d.LinksHtml.join('');
            const rspan = d.FacturasList.length;
            
            let rowsHtml = '';
            d.FacturasList.forEach((fact, idx) => {
                if (idx === 0) {
                    rowsHtml += `<tr>
                        <td style="text-align:center;" rowspan="${rspan}">${i + 1}</td>
                        <td rowspan="${rspan}"><strong>${d.NroOrdenCompra || '-'}</strong> ${estadoItem}<br><span style="font-size:0.65rem; color:#64748b;">${linksHtml}</span></td>
                        <td rowspan="${rspan}">${d.TipoOc || '-'}</td>
                        <td style="font-size:0.75rem;" rowspan="${rspan}">${d.fch_oc || '-'}</td>
                        <td style="font-size:0.75rem;" rowspan="${rspan}">${d.Proveedor || '-'}<br><small style="color:#64748b;">${d.RucProveedor || '-'}</small></td>
                        <td style="border-left: 1px solid #cbd5e1;">${fact.fHtml}</td>
                        <td style="font-size:0.75rem;">${fact.fch}</td>
                        <td style="text-align:center; font-size:0.75rem;" rowspan="${rspan}">${d.EstadoAlmacen || '-'}<br><small style="color:#64748b;">${d.fch_almacen || '-'}</small></td>
                        <td style="text-align:right;" rowspan="${rspan}">S/ ${parseFloat(d.MontoOC || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}</td>
                        <td style="text-align:right; font-weight:600;">S/ ${fact.monto.toLocaleString('es-PE', {minimumFractionDigits: 2})}</td>
                    </tr>`;
                } else {
                    rowsHtml += `<tr>
                        <td style="border-left: 1px solid #cbd5e1;">${fact.fHtml}</td>
                        <td style="font-size:0.75rem;">${fact.fch}</td>
                        <td style="text-align:right; font-weight:600;">S/ ${fact.monto.toLocaleString('es-PE', {minimumFractionDigits: 2})}</td>
                    </tr>`;
                }
            });

            if (d.OCItems) {
                rowsHtml += `<tr><td colspan="10" style="font-size:0.7rem; color:#475569; background:#f8fafc; padding:0.25rem 0.5rem; text-align:left; border-bottom:1px solid #e2e8f0; border-top:1px dashed #cbd5e1;">↳ <strong>Detalle OC:</strong> ${d.OCItems}</td></tr>`;
            }
            return rowsHtml;
        }).join('');

        content.innerHTML = `
            <div class="report-band">
                <div>
                    <h2 style="font-size:1.15rem; font-weight:700; color:#1e3a5f; margin:0 0 0.15rem;">CORPORACIÓN Y.L.V S.A.C</h2>
                    <p style="font-size:0.75rem; color:#6b7280; margin:0; line-height:1.4;">RUC: 20601234567<br>CARGO DE ENTREGA DOCUMENTAL</p>
                </div>
                <div class="report-badge-box">
                    <div class="rpt-label">CARGO DE ENTREGA</div>
                    <div class="rpt-number">${h.NroCargo}</div>
                    <div class="rpt-date">Generado: ${h.FechaCargo || '-'}</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:100px 1fr 100px 1fr; gap:0.3rem 0.75rem; font-size:0.8rem; padding:0.85rem 1rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:1.25rem;">
                <span style="font-weight:600; color:#64748b;">Tipo:</span>
                <span style="color:#0f172a; font-weight:600;">${tipoLabel}</span>
                <span style="font-weight:600; color:#64748b;">Estado:</span>
                <span style="color:#0f172a; font-weight:600;">${h.Estado}</span>
                <span style="font-weight:600; color:#64748b;">Entrega:</span>
                <span>${h.AreaOrigen} — ${h.UsuarioOrigen || '-'}</span>
                <span style="font-weight:600; color:#64748b;">Recepción:</span>
                <span>${h.UsuarioDestino ? h.AreaDestino + ' — ' + h.UsuarioDestino : '(Pendiente)'} ${h.FechaRecepcion ? '<br><small>(' + h.FechaRecepcion + ')</small>' : ''}</span>
                ${h.Observaciones ? `<span style="font-weight:600; color:#64748b;">Notas:</span><span style="grid-column:span 3;">${h.Observaciones}</span>` : ''}
            </div>

            <table class="rpt-table">
                <thead>
                    <tr>
                        <th style="width:30px; text-align:center;">N°</th>
                        <th>N° OC</th><th>Tipo</th><th>Fch. OC</th><th>Proveedor / RUC</th><th>N° Factura</th><th>Fch. Factura</th><th>Almacén</th>
                        <th style="text-align:right;">Monto OC</th><th style="text-align:right;">Monto Factura</th>
                    </tr>
                </thead>
                <tbody>${detailRows}</tbody>
                <tfoot>
                    <tr style="background:#f0f4f8; font-weight:700; border-top:2px solid #1e3a5f;">
                        <td colspan="8" style="text-align:right; border:1px solid #cbd5e1;">TOTALES (${det.length} documentos):</td>
                        <td style="text-align:right; border:1px solid #cbd5e1;">S/ ${totalOC.toLocaleString('es-PE', {minimumFractionDigits: 2})}</td>
                        <td style="text-align:right; border:1px solid #cbd5e1;">S/ ${totalFact.toLocaleString('es-PE', {minimumFractionDigits: 2})}</td>
                    </tr>
                </tfoot>
            </table>

            <div style="margin-top:1.25rem; padding:0.65rem 1rem; border:1px solid #94a3b8; border-radius:6px; font-size:0.7rem; text-align:center; color:#475569; background:#f8fafc;">
                Declaro haber recibido la documentación arriba descrita en conformidad y buen estado.<br>
                Cualquier observación deberá ser comunicada dentro de las 24 horas siguientes a la recepción.
            </div>

            <div class="report-signatures">
                <div class="sig-block">
                    <div style="height:60px;"></div>
                    <div class="sig-line">ENTREGADO POR<br><span style="font-weight:400; color:#64748b;">${h.AreaOrigen}<br>${h.UsuarioOrigen || '_______________'}</span><br><small style="font-weight:normal; font-size:0.65rem; color:#94a3b8;">${h.FechaCargo || ''}</small></div>
                </div>
                <div class="sig-block">
                    <div style="height:60px;"></div>
                    <div class="sig-line">RECIBIDO POR<br><span style="font-weight:400; color:#64748b;">${h.AreaDestino}<br>${h.UsuarioDestino || '_______________'}</span><br><small style="font-weight:normal; font-size:0.65rem; color:#94a3b8;">${h.FechaRecepcion || '-'}</small></div>
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444;">${err.message}</div>`;
    }
}

function closeCargoDetail() {
    document.getElementById('cargoDetailModal').classList.remove('active');
}

function printCargoReport() {
    window.print();
}

// ════════════════════════════════════════════════════════════
//  REENVIAR A TESORERÍA (Devueltos)
// ════════════════════════════════════════════════════════════

async function reenviarATesoreria(cargoId, detalleId, nroOc, tipoOc, codciaOc, anosOc, proveedor, ruc, montoOc, montoFactura, nroFactura) {
    const { value: nota } = await Swal.fire({
        title: '🔄 Reenviar a Tesorería',
        html: `<div style="text-align:left; font-size:0.85rem; margin-bottom:1rem;">
            <p><strong>OC:</strong> ${nroOc} | <strong>Proveedor:</strong> ${proveedor}</p>
            <p>Indique las subsanaciones realizadas:</p></div>`,
        input: 'textarea',
        inputPlaceholder: 'Describa las correcciones realizadas...',
        showCancelButton: true,
        confirmButtonText: 'Reenviar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#2563eb',
        inputValidator: (val) => { if (!val) return 'Debe indicar la subsanación.'; }
    });
    if (!nota) return;

    try {
        Swal.fire({ title: 'Reenviando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const payload = {
            codcia: document.getElementById('filterCia').value,
            tipo_cargo: 'CONT_A_TES',
            usuario_origen: currentUser,
            area_origen: 'CONTABILIDAD',
            area_destino: 'TESORERIA',
            observaciones: `REENVÍO - Subsanación: ${nota}`,
            detalle: [{ nro_orden_compra: nroOc, tipo_oc: tipoOc, codcia_oc: codciaOc, anos_oc: anosOc || '', nro_factura: nroFactura || '', monto_oc: parseFloat(montoOc || 0), monto_factura: parseFloat(montoFactura || 0), proveedor: proveedor || '', ruc_proveedor: ruc || '' }]
        };
        await axios.post('/api/cargos/generar', payload);
        Swal.fire({ icon: 'success', title: '¡Reenviado!', text: `La OC ${nroOc} fue reenviada a Tesorería.`, timer: 2000, showConfirmButton: false });
        loadCargosRecibidos();
        loadHistorial();
    } catch (err) {
        Swal.fire('Error', String(err), 'error');
    }
}

// ════════════════════════════════════════════════════════════
//  MODALES EMBEBIDOS
// ════════════════════════════════════════════════════════════

async function openEmbeddedReport(codcia, nrodoc, tipooc, anos) {
    document.getElementById('secondaryModal_cargos').classList.add('active');
    document.getElementById('secondaryModalTitle').textContent = `Orden de Compra ${nrodoc}`;
    const content = document.getElementById('secondaryModalContent');
    content.innerHTML = '<div style="text-align:center; padding:3rem; color:#94a3b8;">Cargando reporte OC...</div>';
    try {
        let url = `/api/logistics/orders/${encodeURIComponent(nrodoc)}/report?codcia=${encodeURIComponent(codcia)}&tipo_oc=${encodeURIComponent(tipooc)}`;
        if (anos) url += `&year=${encodeURIComponent(anos)}`;
        const res = await axios.get(url);
        const { header, items, company } = res.data;
        const sym = header.codmon || 'S/';
        let itemsHtml = items.map((it, i) => `<tr>
            <td style="text-align:center;">${it.item_display || (i+1)}</td>
            <td style="font-family:monospace; font-size:0.725rem;">${it.codmat || '-'}</td>
            <td style="font-weight:500;">${it.desmat || '-'}</td>
            <td style="text-align:center;">${it.undstk || '-'}</td>
            <td style="text-align:right;">${parseFloat(it.candes||0).toFixed(2)}</td>
            <td style="text-align:right; font-weight:600;">${parseFloat(it.cant_ingresada||0).toFixed(2)}</td>
            <td style="text-align:right;">${parseFloat(it.preuni||0).toFixed(2)}</td>
            <td style="text-align:right; font-weight:600; color:var(--primary);">${sym} ${parseFloat(it.imptot||0).toLocaleString('es-PE',{minimumFractionDigits:2})}</td>
        </tr>`).join('');
        content.innerHTML = `
            <div class="report-band"><div><h2 style="font-size:1.15rem; font-weight:700; color:#1e3a5f; margin:0;">${company?.nomcia||'EMPRESA'}</h2><p style="font-size:0.75rem; color:#6b7280; margin:0;">RUC: ${company?.ruccia||'-'}</p></div>
            <div class="report-badge-box"><div class="rpt-label">ORDEN DE COMPRA</div><div class="rpt-number">${header.nrodoc}</div><div class="rpt-date">${header.fchdoc||'-'}</div></div></div>
            <div style="display:grid; grid-template-columns:100px 1fr 100px 1fr; gap:0.3rem 0.75rem; font-size:0.8rem; padding:0.85rem 1rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:1rem;">
                <span style="font-weight:600; color:#64748b;">Proveedor:</span><span>${header.nomaux||'-'}</span>
                <span style="font-weight:600; color:#64748b;">RUC:</span><span>${header.rucaux||'-'}</span>
                <span style="font-weight:600; color:#64748b;">Dirección:</span><span style="grid-column:span 3;">${header.diraux||'-'}</span>
                ${header.glodoc?`<span style="font-weight:600; color:#64748b;">Nota:</span><span style="grid-column:span 3;">${header.glodoc}</span>`:''}
            </div>
            <table class="rpt-table"><thead><tr><th style="width:30px; text-align:center;">N°</th><th>Código</th><th>Producto</th><th>Und</th><th style="text-align:right;">Cant</th><th style="text-align:right;">Recib</th><th style="text-align:right;">Precio</th><th style="text-align:right;">Total</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot><tr style="background:#f0f4f8; font-weight:700;"><td colspan="7" style="text-align:right;">TOTAL:</td><td style="text-align:right;">${sym} ${parseFloat(header.imptot||0).toLocaleString('es-PE',{minimumFractionDigits:2})}</td></tr></tfoot></table>`;
    } catch (err) { content.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444;">❌ ${err}</div>`; }
}

async function openEmbeddedWarehouse(codcia, nrodoc) {
    document.getElementById('secondaryModal_cargos').classList.add('active');
    document.getElementById('secondaryModalTitle').textContent = `Almacén - OC ${nrodoc}`;
    const content = document.getElementById('secondaryModalContent');
    content.innerHTML = '<div style="text-align:center; padding:3rem; color:#94a3b8;">Cargando ingresos almacén...</div>';
    try {
        const res = await axios.get(`/api/logistics/orders/${encodeURIComponent(nrodoc)}/warehouse-entry?codcia=${encodeURIComponent(codcia)}`);
        const entries = res.data;
        if (entries.length === 0) { content.innerHTML = '<div style="text-align:center; padding:3rem; color:#94a3b8;">No hay ingresos a almacén.</div>'; return; }
        let rows = entries.map(e => `<tr><td style="text-align:center; font-weight:600;">${e.nro_ingreso}</td><td>${e.fecha_ingreso||'-'}</td><td style="text-align:center;"><span class="badge pending">${e.almacen}</span></td><td style="text-align:center;">${e.tipo_movimiento}</td><td style="font-family:monospace; font-size:0.75rem;">${e.codigo_material}</td><td>${e.descripcion}</td><td style="text-align:right; font-weight:600; color:var(--primary);">${parseFloat(e.cantidad_ingresada||0).toFixed(4)}</td></tr>`).join('');
        content.innerHTML = `<h3 style="font-size:1rem; font-weight:700; color:#1e3a5f; margin-bottom:1rem;">📦 Ingresos Almacén — OC ${nrodoc}</h3>
        <table class="rpt-table"><thead><tr><th>N° Ingreso</th><th>Fecha</th><th>Almacén</th><th>Tipo</th><th>Código</th><th>Descripción</th><th style="text-align:right;">Cantidad</th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch (err) { content.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444;">❌ ${err}</div>`; }
}

async function openEmbeddedTraza(codcia, nrodoc, tipooc, anos) {
    document.getElementById('secondaryModal_cargos').classList.add('active');
    document.getElementById('secondaryModalTitle').textContent = `Trazabilidad - OC ${nrodoc}`;
    const content = document.getElementById('secondaryModalContent');
    content.innerHTML = '<div style="text-align:center; padding:3rem; color:#94a3b8;">Cargando trazabilidad...</div>';
    try {
        let url = `/api/contabilidad/trazabilidad/${encodeURIComponent(nrodoc)}?codcia=${encodeURIComponent(codcia)}`;
        if (tipooc) url += `&tipo_oc=${encodeURIComponent(tipooc)}`;
        if (anos) url += `&year=${encodeURIComponent(anos)}`;
        const res = await axios.get(url);
        const data = res.data; const r = data.resumen;
        const fmtN = (v) => v!=null?parseFloat(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'0.00';
        let itemsHtml = (data.items||[]).map(it => `<tr><td style="font-family:monospace; font-size:0.75rem;">${it.codmat||'-'}</td><td>${it.desmat||'-'}</td><td style="text-align:right;">${fmtN(it.cant_oc)}</td><td style="text-align:right; color:#22c55e;">${fmtN(it.cant_almacen)}</td><td style="text-align:right; color:#8b5cf6;">${fmtN(it.cant_facturada)}</td></tr>`).join('');
        content.innerHTML = `<h3 style="font-size:1rem; font-weight:700; color:#1e3a5f; margin-bottom:1rem;">🔗 Trazabilidad — OC ${nrodoc}</h3>
        <div style="display:flex; gap:1rem; margin-bottom:1rem; flex-wrap:wrap;">
            <div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.75rem; text-align:center;"><div style="font-size:1.2rem; font-weight:700; color:#1e3a5f;">${r.total_items_oc||0}</div><div style="font-size:0.7rem; color:#64748b;">Items OC</div></div>
            <div style="flex:1; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:0.75rem; text-align:center;"><div style="font-size:1.2rem; font-weight:700; color:#22c55e;">${fmtN(r.total_almacen)}</div><div style="font-size:0.7rem; color:#64748b;">Almacén</div></div>
            <div style="flex:1; background:#faf5ff; border:1px solid #e9d5ff; border-radius:8px; padding:0.75rem; text-align:center;"><div style="font-size:1.2rem; font-weight:700; color:#8b5cf6;">${fmtN(r.total_facturado)}</div><div style="font-size:0.7rem; color:#64748b;">Facturado</div></div>
        </div>
        <table class="rpt-table"><thead><tr><th>Código</th><th>Descripción</th><th style="text-align:right;">Cant. OC</th><th style="text-align:right;">Almacén</th><th style="text-align:right;">Facturado</th></tr></thead><tbody>${itemsHtml}</tbody></table>`;
    } catch (err) { content.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444;">❌ ${err}</div>`; }
}

async function openEmbeddedAttachment(codcia, tipooc, nrodoc, docType) {
    document.getElementById('secondaryModal_cargos').classList.add('active');
    const title = docType==='signed_order'?'Orden Firmada':'Voucher de Pago';
    document.getElementById('secondaryModalTitle').textContent = `${title} - OC ${nrodoc}`;
    const content = document.getElementById('secondaryModalContent');
    content.innerHTML = '<div style="text-align:center; padding:3rem; color:#94a3b8;">Cargando archivos...</div>';
    try {
        const url = `/api/logistics/attachments/list?codcia=${encodeURIComponent(codcia)}&tipooc=${encodeURIComponent(tipooc)}&nrodoc=${encodeURIComponent(nrodoc)}&doc_type=${docType}`;
        const res = await axios.get(url);
        const files = res.data;
        if (files.length===0) { content.innerHTML = `<div style="text-align:center; padding:3rem; color:#94a3b8;">No hay archivos de ${title}.</div>`; return; }
        let filesHtml = files.map(f => {
            const isImg = f.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            return `<div style="display:flex; align-items:center; justify-content:space-between; padding:0.75rem; background:white; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:0.5rem;">
                <span style="font-size:0.8rem; font-weight:500;">${isImg?'🖼️':'📄'} ${f.filename}</span>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    ${isImg?`<img src="${f.url}" style="max-height:40px; border-radius:4px;">`:''}
                    <a href="${f.url}" target="_blank" style="font-size:0.75rem; color:#2563eb; text-decoration:underline;">Abrir</a>
                </div></div>`;
        }).join('');
        content.innerHTML = `<h3 style="font-size:1rem; font-weight:700; color:#1e3a5f; margin-bottom:1rem;">📎 ${title} — OC ${nrodoc}</h3>${filesHtml}`;
    } catch (err) { content.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444;">❌ ${err}</div>`; }
}
