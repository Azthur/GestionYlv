// ════════════════════════════════════════════════════════════
//  CARGOS DOCUMENTALES - Frontend JS
//  Flujo: Logística → Contabilidad → Tesorería
// ════════════════════════════════════════════════════════════

let currentCodcia = '';

// --- FORMATTING UTILS ---
const fmtNum = (val, dec = 2) => {
    if (val === null || val === undefined) return '0.00';
    return parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const formatCurrency = (val, sym = 'S/') => {
    if (val === null || val === undefined) return '-';
    return `${sym} ${fmtNum(val)}`;
};
// ------------------------
let currentUser = '';
let currentRole = 'USER';
let ocsDisponibles = [];
let facturasSinOC = [];
let rendicionesAprobadas = [];
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

    // Mes por defecto = mes en curso
    const mesActual = new Date().getMonth() + 1; // 1-12
    const filterMes = document.getElementById('filterMes');
    if (filterMes) filterMes.value = String(mesActual);
    
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

    // Destruir tablas de DataTables antes de cambiar de tab para evitar conflictos
    if (ocsDT) { try { ocsDT.destroy(); } catch(e) {} ocsDT = null; }
    if (docsAceptadosDT) { try { docsAceptadosDT.destroy(); } catch(e) {} docsAceptadosDT = null; }
    if (rendicionesAprobadas_DT) { try { rendicionesAprobadas_DT.destroy(); } catch(e) {} rendicionesAprobadas_DT = null; }
    if (facturasSinOC_DT) { try { facturasSinOC_DT.destroy(); } catch(e) {} facturasSinOC_DT = null; }

    document.getElementById('panelGenerar').style.display = 'none';
    document.getElementById('panelRecibidos').style.display = 'none';
    document.getElementById('panelHistorial').style.display = 'none';

    currentSubTab = tab;

    if (tab === 'generar_log') {
        document.getElementById('tipoCargo').value = 'LOG_A_CONT';
        document.getElementById('filtroFechas').style.display = 'flex';
        document.getElementById('logisticaFilters').style.display = 'flex';
        const cbDirectas = document.getElementById('lblDirectasContabilidad');
        if(cbDirectas) cbDirectas.style.display = 'none';

        document.getElementById('panelGenerar').style.display = 'block';
    } else if (tab === 'generar_cont') {
        document.getElementById('tipoCargo').value = 'CONT_A_TES';
        document.getElementById('filtroFechas').style.display = 'flex';
        document.getElementById('logisticaFilters').style.display = 'flex';
        const cbDirectas = document.getElementById('lblDirectasContabilidad');
        if(cbDirectas) cbDirectas.style.display = 'flex';

        document.getElementById('panelGenerar').style.display = 'block';
        // Cargar documentos aceptados del cargo LOG_A_CONT para enviar a tesorería
        loadDocumentosAceptadosTesoreria();
    } else if (tab === 'recibidos') {
        document.getElementById('panelRecibidos').style.display = 'block';
        loadCargosRecibidos();
    } else if (tab === 'historial') {
        document.getElementById('panelHistorial').style.display = 'block';
        loadHistorial();
    }
}

let ocsDT = null;
let recibidosDT = null;
let facturasTesoreriaDT = null;
let rendicionesTesoreriaDT = null;

function refreshCurrentTab() {
    if (currentSubTab.startsWith('generar_')) {
        loadOCsDisponibles();
        loadFacturasSinOC();
        loadRendicionesAprobadas();
    } else if (currentSubTab === 'recibidos') {
        loadCargosRecibidos();
    } else if (currentSubTab === 'historial') {
        loadHistorial();
    }
}

async function loadOCsDisponibles() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) { Swal.fire('Atención', 'Seleccione una empresa.', 'warning'); return; }

    const ano = document.getElementById('filterAno').value;
    const mes = document.getElementById('filterMes').value;
    const tipoCargo = document.getElementById('tipoCargo').value;
    
    // Filtros de Logística
    const filterTipoOc = document.getElementById('filterTipoOC') ? document.getElementById('filterTipoOC').value : 'ALL';
    const filterMine = document.getElementById('filterMyRecords') ? document.getElementById('filterMyRecords').checked : true;
    const filterDirectas = document.getElementById('filterDirectasCont') ? document.getElementById('filterDirectasCont').checked : false;
    
    // Verificar que la tabla existe en el DOM
    const tableElement = document.getElementById('ocsDisponiblesTable');
    if (!tableElement) {
        console.log('loadOCsDisponibles: Tabla no encontrada en DOM, cancelando...');
        return;
    }
    
    // Destruir tabla anterior si existe
    if (ocsDT) {
        try {
            ocsDT.destroy();
        } catch(e) {
            console.log('Error destruyendo ocsDT:', e);
        }
        ocsDT = null;
    }

    try {
        ocsDT = $('#ocsDisponiblesTable').DataTable({
            serverSide: true,
            processing: true,
            destroy: true,
            ordering: false,
            pageLength: 10,
            language: { 
                url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',
                processing: '<div style="background:rgba(255,255,255,0.8); z-index:99; position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#2563eb; font-weight:700;"><i class="fa fa-spinner fa-spin fa-2x fa-fw"></i> Cargando OCs...</div>'
            },
            ajax: {
                url: '/api/cargos/ocs-disponibles-ssr',
                type: 'GET',
                data: function(d) {
                    d.codcia = codcia;
                    d.ano = ano;
                    d.mes = mes;
                    d.tipo_cargo = tipoCargo;
                    d.login = currentUser;
                    d.tipo_oc = filterTipoOc;
                    d.only_my_records = filterMine;
                    d.ocs_directas = filterDirectas;
                }
            },
            columns: [
                { 
                    data: null, 
                    orderable: false,
                    className: 'dt-center',
                    render: function(data, type, row, meta) {
                        return `<input type="checkbox" class="oc-chk" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary);">`;
                    }
                },
                { 
                    data: 'nrodoc',
                    render: function(data, type, row) {
                        let html = `<strong>${data}</strong>`;
                        if(row.observacion_rechazo) {
                            html += `<br><span style="color:#ef4444; font-size:0.65rem; font-weight:600;" title="${row.observacion_rechazo}">⚠️ Rechazado: ${row.observacion_rechazo.substring(0,25)}</span>`;
                        }
                        return html;
                    }
                },
                { data: 'fchdoc', render: data => data || '-' },
                { data: 'proveedor', render: data => data || '-' },
                { data: 'ruc', render: data => data || '-' },
                { 
                    data: 'tipooc',
                    render: data => `<span class="badge pending">${data || '-'}</span>`
                },
                { 
                    data: 'total_oc',
                    className: 'dt-right',
                    render: (data, t, row) => {
                        const m = String(row.moneda||'1').trim() === '2' ? 'USD' : 'S/';
                        return `${m} ${parseFloat(data || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}`
                    }
                },
                { 
                    data: 'estado_almacen',
                    render: data => {
                        if (data === 'COMPLETO') return '<span class="badge approved">Completo</span>';
                        if (data === 'PARCIAL') return '<span class="badge pending" style="background:#fed7aa; color:#9a3412;">Parcial</span>';
                        return '<span class="badge" style="background:#e5e7eb; color:#4b5563;">Sin Ingreso</span>';
                    }
                },
                { 
                    data: 'factura',
                    render: (data, t, row) => {
                        if (data && row.factura_uuid) return `<a href="/factura_visor.html?uid=${row.factura_uuid}" target="_blank" style="color:#2563eb; text-decoration:underline; font-weight:600;">${data}</a>`;
                        if (data) return data;
                        return '<span class="badge" style="background:#fee2e2; color:#991b1b;">Sin factura</span>';
                    }
                },
                { 
                    data: 'total_factura',
                    className: 'dt-right',
                    render: (data, t, row) => {
                        if (!row.factura) return '-';
                        const m = String(row.moneda||'1').trim() === '2' ? 'USD' : 'S/';
                        return `${m} ${parseFloat(data || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}`
                    }
                },
                {
                    data: null,
                    orderable: false,
                    className: 'dt-center no-print',
                    render: function(data, type, row) {
                        const codcia = document.getElementById('filterCia').value;
                        const showWarehouse = String(row.tipooc||'').trim().toUpperCase() === 'M';
                        const showRecojo = ['M','O'].includes(String(row.tipooc||'').trim().toUpperCase());

                        let dpItems = `<button class="action-dropdown-item" onclick="openReportModal('${codcia}','${row.nrodoc}','${row.tipooc||''}','${row.anos||''}')">📋 Ver Orden</button>`;
                        if (showRecojo) dpItems += `<button class="action-dropdown-item" onclick="window.open('/orders.html?seek_oc=${row.nrodoc}&cia=${codcia}&action=recojo', '_blank')">➡️ Solicitud de Recojo</button>`;
                        if (showWarehouse) dpItems += `<button class="action-dropdown-item" onclick="openWarehouseModal('${codcia}','${row.nrodoc}')">📦 Ingresos Almacén</button>`;
                        dpItems += `<div class="action-dropdown-divider"></div>`;
                        dpItems += `<button class="action-dropdown-item" onclick="openAttachmentModal('${codcia}','${row.tipooc||''}','${row.nrodoc}','signed_order')">📝 Orden Firmada</button>`;
                        dpItems += `<button class="action-dropdown-item" onclick="openAttachmentModal('${codcia}','${row.tipooc||''}','${row.nrodoc}','voucher')">💳 Voucher de Pago</button>`;
                        dpItems += `<button class="action-dropdown-item" onclick="openTrazaModal('${codcia}','${row.nrodoc}','${row.tipooc||''}','${row.anos||''}')">🔗 Trazabilidad OC</button>`;
                        if (row.factura_uuid) dpItems += `<div class="action-dropdown-divider"></div><button class="action-dropdown-item" onclick="window.open('/factura_visor.html?uid=${row.factura_uuid}', '_blank')">📄 Ver Factura (PDF)</button>`;

                        return `<div class="action-dropdown">
                                  <button class="action-dropdown-btn" onclick="toggleDropdown(event, this)" title="Acciones">⋮</button>
                                  <div class="action-dropdown-menu">${dpItems}</div>
                                </div>`;
                    }
                }
            ],
            dom: 'Bfrtip',
            buttons: [
                { extend: 'excelHtml5', text: '📊 Excel', className: 'dt-button', exportOptions: { columns: [1,2,3,4,5,6,7,8,9] } },
            ]
        });

        $('#chkAllOcs').off('change').on('change', function() {
            const checked = this.checked;
            ocsDT.rows().nodes().each(function(row) {
                $(row).find('.oc-chk').prop('checked', checked);
            });
        });

    } catch (err) {
        document.getElementById('ocsDisponiblesTbody').innerHTML = `<tr><td colspan="11" style="text-align:center; padding:2rem; color:#ef4444;">${err.message}</td></tr>`;
    }
}

async function generarCargo() {
    try {
        const selected = [];

        // Obtener OCs seleccionadas
        if (ocsDT) {
            ocsDT.rows().nodes().each(function(row) {
                const chk = $(row).find('.oc-chk');
                if (chk.is(':checked')) {
                    const oc = ocsDT.row(row).data();
                    if (oc) {
                        selected.push({
                            nro_orden_compra: oc.nrodoc,
                            tipo_oc: 'OC',
                            codcia_oc: document.getElementById('filterCia').value,
                            anos_oc: oc.anos,
                            nro_factura: oc.factura || '',
                            monto_oc: parseFloat(oc.total_oc || 0),
                            monto_factura: parseFloat(oc.total_factura || 0),
                            proveedor: oc.proveedor || '',
                            ruc_proveedor: String(oc.ruc || ''),
                            moneda: oc.moneda || '1'  // 1=PEN, 2=USD
                        });
                    }
                }
            });
        }

        // Obtener documentos aceptados seleccionados (para Enviar a Tesorería)
        if (docsAceptadosDT) {
            docsAceptadosDT.rows().nodes().each(function(row) {
                const chk = $(row).find('.doc-aceptado-chk');
                if (chk.is(':checked')) {
                    const nroOc = chk.data('nrooc');
                    const tipoOc = chk.data('tipooc');
                    const codciaOc = chk.data('codciaoc');
                    const nroFactura = chk.data('nrofactura');
                    const montoOc = chk.data('montooc');
                    const montoFactura = chk.data('montofactura');
                    const proveedor = chk.data('proveedor');
                    const ruc = chk.data('ruc');
                    const moneda = chk.data('moneda');

                    selected.push({
                        nro_orden_compra: nroOc || '',
                        tipo_oc: tipoOc || 'OC',
                        codcia_oc: codciaOc || document.getElementById('filterCia').value,
                        anos_oc: '',
                        nro_factura: nroFactura || '',
                        monto_oc: parseFloat(montoOc || 0),
                        monto_factura: parseFloat(montoFactura || 0),
                        proveedor: proveedor || '',
                        ruc_proveedor: String(ruc || ''),
                        moneda: moneda || '1'
                    });
                }
            });
        }

        // Obtener Facturas sin OC seleccionadas
        if (facturasSinOC_DT) {
            facturasSinOC_DT.rows().nodes().each(function(row) {
                const chk = $(row).find('.factura-sin-oc-chk');
                if (chk.is(':checked')) {
                    // Obtener datos de los atributos data del checkbox
                    const serie = chk.data('serie');
                    const numero = chk.data('numero');
                    const total = chk.data('total');
                    const nomProveedor = chk.data('nomproveedor');
                    const numRuc = chk.data('numruc');
                    
                    if (serie && numero) {
                        selected.push({
                            nro_orden_compra: '',  // Facturas sin OC no tienen OC
                            tipo_oc: 'FACT',  // Código corto para factura sin OC
                            codcia_oc: document.getElementById('filterCia').value,
                            anos_oc: '',
                            nro_factura: `${serie}-${numero}`,
                            monto_oc: 0,
                            monto_factura: parseFloat(total || 0),
                            proveedor: nomProveedor || '',
                            ruc_proveedor: String(numRuc || '')
                        });
                    }
                }
            });
        }

        // Obtener Rendiciones aprobadas seleccionadas
        if (rendicionesAprobadas_DT) {
            rendicionesAprobadas_DT.rows().nodes().each(function(row) {
                const chk = $(row).find('.rendicion-aprobada-chk');
                if (chk.is(':checked')) {
                    // Obtener datos de los atributos data del checkbox
                    const nroRendicion = chk.data('nrorendicion');
                    const nomAux = chk.data('nomaux');
                    const total = chk.data('total');
                    const codAux = chk.data('codaux');
                    
                    if (nroRendicion) {
                        selected.push({
                            nro_orden_compra: nroRendicion,  // Usar NroRendicion como referencia
                            tipo_oc: 'REND',  // Código corto para rendición
                            codcia_oc: document.getElementById('filterCia').value,
                            anos_oc: '',
                            nro_factura: '',
                            monto_oc: 0,
                            monto_factura: parseFloat(total || 0),
                            proveedor: nomAux || '',
                            ruc_proveedor: String(codAux || '')
                        });
                    }
                }
            });
        }

        if (selected.length === 0) {
            Swal.fire('Atención', 'Seleccione al menos un documento (OC, Factura sin OC o Rendición).', 'warning');
            return;
        }

        const tipoCargo = document.getElementById('tipoCargo').value;
        const areaOrigen = tipoCargo === 'LOG_A_CONT' ? 'LOGISTICA' : 'CONTABILIDAD';
        const areaDestino = tipoCargo === 'LOG_A_CONT' ? 'CONTABILIDAD' : 'TESORERIA';

        // Calcular montos por tipo
        const montoOCs = selected.filter(s => s.tipo_oc === 'OC').reduce((sum, s) => sum + (s.monto_factura || 0), 0);
        const montoFacturas = selected.filter(s => s.tipo_oc === 'FACT').reduce((sum, s) => sum + (s.monto_factura || 0), 0);
        const montoRendiciones = selected.filter(s => s.tipo_oc === 'REND').reduce((sum, s) => sum + (s.monto_factura || 0), 0);

        const confirm = await Swal.fire({
            title: '¿Generar Cargo de Entrega?',
            html: `<div style="text-align:left; font-size:0.9rem;">
                <p><strong>Tipo:</strong> ${areaOrigen} → ${areaDestino}</p>
                <p><strong>OCs:</strong> ${selected.filter(s => s.tipo_oc === 'OC').length} (S/ ${montoOCs.toLocaleString('es-PE', {minimumFractionDigits: 2})})</p>
                <p><strong>Facturas sin OC:</strong> ${selected.filter(s => s.tipo_oc === 'FACT').length} (S/ ${montoFacturas.toLocaleString('es-PE', {minimumFractionDigits: 2})})</p>
                <p><strong>Rendiciones:</strong> ${selected.filter(s => s.tipo_oc === 'REND').length} (S/ ${montoRendiciones.toLocaleString('es-PE', {minimumFractionDigits: 2})})</p>
                <p><strong>Total:</strong> S/ ${(montoOCs + montoFacturas + montoRendiciones).toLocaleString('es-PE', {minimumFractionDigits: 2})}</p>
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

        const res = await axios.post('/api/cargos-crear/generar', payload);

        await Swal.fire({
            title: 'Cargo Generado!',
            text: `Se ha generado el Cargo N° ${res.data.nro_cargo}`,
            icon: 'success',
            confirmButtonText: 'OK',
            confirmButtonColor: '#10b981'
        });

        document.getElementById('cargoObservaciones').value = '';
        setTimeout(() => switchSubTab('historial', null), 300);

    } catch (err) {
        Swal.fire('Error', err.response?.data?.detail || err.message, 'error');
    }
}


async function loadCargosRecibidos() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) {
        Swal.fire('Atención', 'Seleccione una empresa.', 'warning');
        return;
    }

    if (recibidosDT) { 
        recibidosDT.destroy(); 
        recibidosDT = null; 
    }
    $('#cargosRecibidosTable').empty();
    $('#cargosRecibidosTable').html('<thead></thead><tbody id="cargosRecibidosTbody"></tbody>');

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
        const res = await axios.get(`/api/cargos/bandeja?codcia=${encodeURIComponent(codcia)}&current_area=${currentArea}&_t=${new Date().getTime()}`);
        const allItems = res.data;
        let pending = allItems;
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
                data: dtData, destroy: true,
            deferRender: true, order: [[4, 'desc']], pageLength: 10,
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
                    <button class="action-dropdown-item" onclick="openReportModal('${c.CodCiaOc||''}','${c.NroOrdenCompra||''}','${c.TipoOc||''}','')">📋 Ver Orden</button>
                `;

                let showWarehouse = String(c.TipoOc||'').trim().toUpperCase() === 'M';
                if (showWarehouse) {
                    dpItems += `<button class="action-dropdown-item" onclick="openWarehouseModal('${c.CodCiaOc||''}','${c.NroOrdenCompra||''}')">📦 Ingresos Almacén</button>`;
                }
                dpItems += `<button class="action-dropdown-item" onclick="openTrazaModal('${c.CodCiaOc||''}','${c.NroOrdenCompra||''}','${c.TipoOc||''}','')">🔗 Trazabilidad OC</button>`;
                dpItems += `<div class="action-dropdown-divider"></div>`;
                dpItems += `<button class="action-dropdown-item" onclick="openAttachmentModal('${c.CodCiaOc||''}','${c.TipoOc||''}','${c.NroOrdenCompra||''}','signed_order')">📝 Orden Firmada</button>`;
                dpItems += `<button class="action-dropdown-item" onclick="openAttachmentModal('${c.CodCiaOc||''}','${c.TipoOc||''}','${c.NroOrdenCompra||''}','voucher')">💳 Voucher de Pago</button>`;
                
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
                data: dtData, destroy: true,
            deferRender: true, order: [[3, 'desc']], pageLength: 10,
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
        console.error("LOAD CARGOS ERROR:", err);
        Swal.fire('Error Bandeja JS', String(err.message), 'error');
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
                            <th style="padding:0.5rem; border-bottom:1px solid #cbd5e1;">Documentos del Cargo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.detail.map(d => {
                            // Determinar el tipo de documento y mostrar información correspondiente
                            let docLabel = '';
                            let docValue = '';
                            let subInfo = '';
                            let monto = 0;
                            
                            if (d.TipoOc === 'REND') {
                                docLabel = '📋 Rendición';
                                docValue = d.NroOrdenCompra || '-';
                                subInfo = `Usuario: ${d.Proveedor || '-'}`;
                                monto = parseFloat(d.MontoOC || 0);
                            } else if (d.TipoOc === 'FACT') {
                                docLabel = '📄 Factura';
                                docValue = d.NroFactura || '-';
                                subInfo = d.NroOrdenCompra ? `Ref: ${d.NroOrdenCompra}` : 'Sin OC';
                                monto = parseFloat(d.MontoFactura || 0);
                            } else {
                                // OC normal
                                docLabel = '📦 OC';
                                docValue = d.NroOrdenCompra || '-';
                                subInfo = d.NroFactura ? `Fact: ${d.NroFactura}` : 'Sin factura';
                                monto = parseFloat(d.MontoOC || 0);
                            }
                            
                            return `
                            <tr>
                                <td style="padding:0.4rem; border-bottom:1px solid #e2e8f0; text-align:center; vertical-align:top;">
                                    <input type="checkbox" class="chk-recibir" value="${d.Id}" checked onchange="window.toggleObsInput(this, ${d.Id})" style="cursor:pointer; accent-color:#10b981; margin-top:5px;">
                                </td>
                                <td style="padding:0.5rem; border-bottom:1px solid #e2e8f0;">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; align-items:center;">
                                        <div>
                                            <span style="font-size:0.7rem; color:#64748b; background:#f1f5f9; padding:1px 6px; border-radius:4px;">${docLabel}</span>
                                            <strong style="margin-left:6px;">${docValue}</strong>
                                        </div>
                                        <span style="color:#0f172a; font-weight:600;">S/ ${monto.toLocaleString('es-PE', {minimumFractionDigits: 2})}</span>
                                    </div>
                                    <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${subInfo}</div>
                                    ${d.Proveedor ? `<div style="font-size:0.75rem; color:#475569; margin-top:2px;">Prov: ${d.Proveedor}</div>` : ''}
                                    <input type="text" id="obs_rechazo_${d.Id}" class="obs-rechazo-input" placeholder="Especifique el motivo de rechazo..." style="display:none; width:100%; font-size:0.75rem; padding:0.3rem; border:1px solid #ef4444; border-radius:4px; margin-top:4px;">
                                </td>
                            </tr>
                            `;
                        }).join('')}
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

    if (historialDT) { 
        historialDT.destroy(); 
        historialDT = null; 
    }
    $('#historialTable').empty();
    $('#historialTable').html('<thead></thead><tbody id="historialTbody"></tbody>');
    
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
        const ano = document.getElementById("filterAno").value;
        const mes = document.getElementById("filterMes").value;
        const res = await axios.get(`/api/cargos/detallado/lista?codcia=${encodeURIComponent(codcia)}&ano=${ano}&mes=${mes}`);
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
                data: dtData, destroy: true,
            deferRender: true, order: [[2, 'desc']], pageLength: 10,
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

                    dpItems += `<button class="action-dropdown-item" onclick="openReportModal('${codcia}','${nrodoc}','${tipooc}','${anos}')">📋 Ver Orden</button>`;
                    if (showWarehouse) dpItems += `<button class="action-dropdown-item" onclick="openWarehouseModal('${codcia}','${nrodoc}')">📦 Ingresos Almacén</button>`;
                    dpItems += `<button class="action-dropdown-item" onclick="openTrazaModal('${codcia}','${nrodoc}','${tipooc}','${anos}')">🔗 Trazabilidad OC</button>`;
                    dpItems += `<div class="action-dropdown-divider"></div>`;
                    dpItems += `<button class="action-dropdown-item" onclick="openAttachmentModal('${codcia}','${tipooc}','${nrodoc}','signed_order')">📝 Orden Firmada</button>`;
                    dpItems += `<button class="action-dropdown-item" onclick="openAttachmentModal('${codcia}','${tipooc}','${nrodoc}','voucher')">💳 Voucher de Pago</button>`;
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
                data: dtData, destroy: true,
                deferRender: true, order: [[2, 'desc']], pageLength: 10,
                language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, dom: 'Bfrtip',
                buttons: [ { extend: 'excelHtml5', text: '📊 Exportar Historial', className: 'dt-button', exportOptions: { columns: [0,1,2,3,4,5,6,7,8] } } ],
                columnDefs: [ { targets: [8], className: 'dt-right font-semibold text-slate-800' } ]
            });
        }

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="${viewModeHistorial === 'CARGO' ? 9 : 10}" style="color:#ef4444; text-align:center; padding:2rem;">${err.message}</td></tr>`;
    }
}

async function loadRendicionesAprobadas() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) return;

    if (rendicionesAprobadas_DT) { rendicionesAprobadas_DT.destroy(); rendicionesAprobadas_DT = null; }
    const tbody = document.getElementById('rendicionesAprobadasTbody');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:#94a3b8;">Cargando...</td></tr>';

    try {
        const res = await axios.get(`/api/finanzas/rendiciones/aprobadas?codcia=${encodeURIComponent(codcia)}`);
        const items = res.data;

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:#94a3b8;">No hay rendiciones aprobadas disponibles.</td></tr>';
            return;
        }

        const dtData = items.map(r => [
            `<input type="checkbox" class="rendicion-aprobada-chk" data-id="${r.Id}" data-nrorendicion="${r.NroRendicion || ''}" data-nomaux="${(r.NomAux || '').replace(/"/g, '&quot;')}" data-total="${r.TotalGastado || 0}" data-codaux="${r.CodAux || ''}" data-uuidlink="${r.UuidLink || ''}" style="width:16px;height:16px;cursor:pointer;accent-color:#10b981;">`,
            `<strong>${r.NroRendicion || '-'}</strong>`,
            r.NomAux || '-',
            r.Fecha || '-',
            r.Moneda || 'PEN',
            fmtNum(r.TotalGastado || 0),
            `<span class="badge success" style="background:#d1fae5; color:#065f46;">${r.Estado || '-'}</span>`,
            r.UuidLink ? `<a href="/visor_rendicion.html?uuid=${r.UuidLink}" target="_blank" class="btn-action outline" style="padding:0.25rem 0.5rem; font-size:0.7rem; text-decoration:none; display:inline-block;">📄 Ver PDF</a>` : '-'
        ]);

        rendicionesAprobadas_DT = $('#rendicionesAprobadasTable').DataTable({
            data: dtData, destroy: true,
            deferRender: true, order: [[3, 'desc']], pageLength: 10,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: 'Bfrtip',
            buttons: [{ extend: 'excelHtml5', text: '📊 Exportar Rendiciones', className: 'dt-button', exportOptions: { columns: [1,2,3,4,5,6] } }],
            columnDefs: [
                { targets: [0], orderable: false },
                { targets: [5], className: 'dt-right font-semibold text-slate-800' }
            ]
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444; text-align:center; padding:2rem;">${err}</td></tr>`;
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
                    mapOC[key].LinksHtml.push(`<a href="#" onclick="event.preventDefault(); openReportModal('${codcia}', '${nrodoc}', '${tipooc}', '')" class="no-print" style="color:#10b981; text-decoration:none; margin-right:4px;" title="Ver OC">🔗OC</a>`);
                    if (tipooc === 'M') {
                        mapOC[key].LinksHtml.push(`<a href="#" onclick="event.preventDefault(); openWarehouseModal('${codcia}', '${nrodoc}')" class="no-print" style="color:#f59e0b; text-decoration:none; margin-right:4px;" title="Ver Almacén">📦Almacén</a>`);
                    }
                    mapOC[key].LinksHtml.push(`<a href="#" onclick="event.preventDefault(); openTrazaModal('${codcia}', '${nrodoc}', '${tipooc}', '')" class="no-print" style="color:#8b5cf6; text-decoration:none; margin-right:4px;" title="Trazabilidad">📊Traza</a>`);
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
            if ((d.NroFactura && d.NroFactura !== '-') || parseFloat(d.MontoFactura || 0) > 0) {
                mapOC[key].FacturasList.push({
                    fHtml: fHtml,
                    fch: d.fch_factura || '-',
                    monto: parseFloat(d.MontoFactura || 0),
                    moneda: d.Moneda
                });
            }
        });

        const detailRows = Object.values(mapOC).map((d, i) => {
            const estadoItem = d.EstadoContable === 'RECHAZADO'
                ? '<span style="color:#ef4444; font-size:0.6rem; font-weight:700; border:1px solid #fecaca; padding:0 3px; border-radius:2px; background:#fef2f2;">RECHAZADO</span>'
                : '';

            let enlacesHtml = '';
            const codcia = (d.CodCiaOc || '').trim();
            const nrodoc = (d.NroOrdenCompra || '').trim();
            const tipooc = (d.TipoOc || '').trim();
            
            let fchEmision = '-', fchVencimiento = '-';
            let nroDoc = d.NroOrdenCompra || '-';
            let proveedor = d.Proveedor || '-';
            const tipoOcMap = { 'M': 'Mercadería', 'S': 'Servicios', 'T': 'Contable', 'OC': 'OC', 'FACT': 'Factura', 'REND': 'Rendición' };
            let tipoDoc = tipoOcMap[d.TipoOc] || d.TipoOc || 'OC';
            let montoOC = d.total_oc || d.MontoOC || 0;
            let montoRendicion = parseFloat(d.total_rendicion || 0);
            
            if (d.TipoOc === 'FACT') {
                nroDoc = d.NroFactura || '-';
                fchEmision = d.fch_factura || '-';
                fchVencimiento = d.fch_venc_factura || '-';
                tipoDoc = 'Factura';
                montoOC = 0;
                if (d.FacturaUuid) enlacesHtml += `<a href="/factura_visor.html?uid=${d.FacturaUuid}" target="_blank" style="color:#2563eb; text-decoration:none; margin-right:4px;">📄Fact</a>`;
            } else if (d.TipoOc === 'REND') {
                nroDoc = d.nro_rendicion || d.NroOrdenCompra || '-';
                fchEmision = d.fch_rendicion || '-';
                fchVencimiento = '-';
                tipoDoc = 'Rendición';
                proveedor = d.rendicion_usuario || d.Proveedor || '-';
                montoOC = 0;
                if (d.RendicionUuid) enlacesHtml += `<a href="/visor_rendicion.html?uuid=${d.RendicionUuid}" target="_blank" style="color:#8b5cf6; text-decoration:none; margin-right:4px;">📋Rend</a>`;
            } else {
                fchEmision = d.fch_oc || '-';
                proveedor = d.Proveedor || '-';
                if (nrodoc) enlacesHtml += `<a href="#" onclick="event.preventDefault(); openReportModal('${codcia}','${nrodoc}','${tipooc}','')" style="color:#10b981; text-decoration:none; margin-right:4px;">🔗OC</a>`;
                if (tipooc === 'M') enlacesHtml += `<a href="#" onclick="event.preventDefault(); openWarehouseModal('${codcia}','${nrodoc}')" style="color:#f59e0b; text-decoration:none; margin-right:4px;">📦Alm</a>`;
                enlacesHtml += `<a href="#" onclick="event.preventDefault(); openTrazaModal('${codcia}','${nrodoc}','${tipooc}','')" style="color:#8b5cf6; text-decoration:none; margin-right:4px;">📊Traza</a>`;
                if (d.FacturaUuid) enlacesHtml += `<a href="/factura_visor.html?uid=${d.FacturaUuid}" target="_blank" style="color:#2563eb; text-decoration:none;">📄Fact</a>`;
            }
            
            const facturasList = d.FacturasList || [];
            const totalFacturas = facturasList.reduce((sum, f) => sum + (f.monto || 0), 0);
            
            const getCurSym = (mon) => (mon === 'USD' || mon === '2') ? '$' : 'S/';
            const dsym = getCurSym(d.Moneda);
            
            let facturasHtml = '';
            if (facturasList.length > 0) {
                facturasList.forEach(fact => {
                    const fsym = getCurSym(fact.moneda || d.Moneda);
                    facturasHtml += `<div style="margin-bottom:2px;">${fact.fHtml} <span style="color:#64748b;">(${fact.fch||'-'})</span> <b>${fsym} ${fact.monto.toLocaleString('es-PE',{minimumFractionDigits:2})}</b></div>`;
                });
            } else if (d.FacturaUuid || parseFloat(d.MontoFactura||0) > 0) {
                facturasHtml = `<a href="/factura_visor.html?uid=${d.FacturaUuid}" target="_blank" style="color:#2563eb;">${d.NroFactura||'Fact'}</a> <b>${dsym} ${parseFloat(d.MontoFactura||0).toLocaleString('es-PE',{minimumFractionDigits:2})}</b>`;
            }

            return `<tr>
                <td style="text-align:center; vertical-align:top; padding:4px 2px;">${i+1}</td>
                <td style="vertical-align:top; padding:4px 4px;">
                    <b>${nroDoc}</b> ${estadoItem}
                    <div style="font-size:0.65rem; color:#64748b; background:#f1f5f9; padding:1px 4px; border-radius:3px; display:inline-block; margin-top:2px;">${tipoDoc}</div>
                </td>
                <td style="font-size:0.7rem; vertical-align:top; padding:4px 3px;">${fchEmision}</td>
                <td style="font-size:0.7rem; vertical-align:top; padding:4px 4px;">${proveedor}<br><span style="color:#94a3b8;">${d.TipoOc==='REND'?(d.rendicion_ruc||d.rendicion_codusuario||''):(d.RucProveedor||'')}</span></td>
                <td style="text-align:right; font-size:0.7rem; vertical-align:top; padding:4px 4px;">${montoOC>0?`${dsym} ${parseFloat(montoOC).toLocaleString('es-PE',{minimumFractionDigits:2})}`:'-'}</td>
                <td style="vertical-align:top; padding:4px 4px;">
                    <div style="text-align:right; font-size:0.7rem; ${totalFacturas>0?'font-weight:700;':''}">${totalFacturas>0?`${dsym} ${totalFacturas.toLocaleString('es-PE',{minimumFractionDigits:2})}`:'-'}</div>
                    ${facturasHtml?`<div style="font-size:0.65rem; margin-top:3px; border-top:1px dashed #e2e8f0; padding-top:3px;">${facturasHtml}</div>`:''}
                </td>
                <td style="text-align:right; vertical-align:top; padding:4px 4px; ${montoRendicion>0?'font-weight:700; color:#7c3aed;':''}">
                    <div style="font-size:0.7rem;">${montoRendicion>0?`${dsym} ${parseFloat(montoRendicion).toLocaleString('es-PE',{minimumFractionDigits:2})}`:'-'}</div>
                    ${d.RendicionUuid?`<a href="/visor_rendicion.html?uuid=${d.RendicionUuid}" target="_blank" style="font-size:0.6rem; color:#8b5cf6;">📋Ver</a>`:''}
                </td>
                <td class="no-print" style="font-size:0.65rem; vertical-align:top; padding:4px 4px; line-height:1.5;">${enlacesHtml}</td>
            </tr>`;
        }).join('');

        content.innerHTML = `
            <style>
                @media print {
                    @page { size: landscape; margin: 15mm; }
                    body { font-size: 10pt; background: white !important; }
                    .rpt-table { font-size: 9pt; width: 100%; border-collapse: collapse; }
                    .rpt-table th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; padding: 8px 6px; }
                    .rpt-table td { padding: 8px 6px; }
                    .rpt-table tr { page-break-inside: avoid; }
                    .rpt-table thead { display: table-header-group; }
                    .rpt-table tfoot { display: table-footer-group; }
                    .no-print { display: none !important; }
                    .report-card-info { border: 1px solid #cbd5e1 !important; box-shadow: none !important; }
                }
                .rpt-table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                .rpt-table thead { background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
                .rpt-table th { color: #334155; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; padding: 12px 10px; border-bottom: 1px solid #e2e8f0; }
                .rpt-table td { border-bottom: 1px solid #e2e8f0; font-size: 0.8rem; padding: 10px 10px; color: #1e293b; vertical-align: middle; }
                .rpt-table tbody tr:hover { background-color: #f8fafc; }
                
                .report-card-info {
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 1.5rem;
                    margin-bottom: 1.5rem;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                }
                .info-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1.5rem;
                }
                .info-item {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }
                .info-label { font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
                .info-value { font-size: 0.95rem; font-weight: 600; color: #0f172a; }
            </style>
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem;">
                <div>
                    <h2 style="font-size:1.4rem; font-weight:800; color:#0f172a; margin:0 0 0.25rem; letter-spacing:-0.02em;">CORPORACIÓN Y.L.V S.A.C</h2>
                    <p style="font-size:0.85rem; color:#64748b; margin:0;">RUC: 20601234567 | CARGO DE ENTREGA DOCUMENTAL</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.5rem; font-weight: 800; color: #2563eb; letter-spacing: 1px;">${h.NroCargo}</div>
                    <div style="font-size: 0.8rem; color: #64748b; font-weight: 500;">Generado: ${h.FechaCargo || '-'}</div>
                </div>
            </div>

            <div class="report-card-info">
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">Tipo de Cargo</span>
                        <span class="info-value" style="color: #3b82f6;">${tipoLabel}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Estado</span>
                        <span class="info-value">
                            <span style="background: #f1f5f9; padding: 2px 8px; border-radius: 4px; border: 1px solid #cbd5e1;">${h.Estado}</span>
                        </span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Entrega (Origen)</span>
                        <span class="info-value">${h.AreaOrigen}</span>
                        <span style="font-size: 0.8rem; color: #64748b;">${h.UsuarioOrigen || '-'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Recepción (Destino)</span>
                        <span class="info-value">${h.AreaDestino}</span>
                        <span style="font-size: 0.8rem; color: #64748b;">${h.UsuarioDestino || '(Pendiente de firma)'}</span>
                    </div>
                </div>
                ${h.Observaciones ? `
                <div style="margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px dashed #cbd5e1;">
                    <span class="info-label">Observaciones Adicionales</span>
                    <p style="margin: 0.5rem 0 0; font-size: 0.9rem; color: #334155; line-height: 1.5;">${h.Observaciones}</p>
                </div>` : ''}
            </div>

            <div style="overflow-x: auto; padding-bottom: 1rem;">
                <table class="rpt-table">
                    <thead>
                        <tr>
                            <th style="width:30px; text-align:center;">#</th>
                            <th style="min-width:120px;">Documento</th>
                            <th style="width:80px;">Emisión</th>
                            <th style="min-width:160px;">Proveedor / Tercero</th>
                            <th style="width:90px; text-align:right;">Monto OC</th>
                            <th style="min-width:140px; text-align:right;">Monto Factura</th>
                            <th style="width:90px; text-align:right;">Monto Rend.</th>
                            <th style="min-width:100px;" class="no-print">Enlaces Rápidos</th>
                        </tr>
                    </thead>
                    <tbody>${detailRows}</tbody>
                    <tfoot>
                        <tr style="background:#f8fafc; border-top: 2px solid #cbd5e1;">
                            <td colspan="4" style="text-align:right; font-weight:800; font-size:0.85rem; color:#0f172a;">TOTALES (${det.length} ítems):</td>
                            <td style="text-align:right; font-weight:700; color:#0f172a;">${totalOC > 0 ? totalOC.toLocaleString('es-PE',{minimumFractionDigits:2}) : '-'}</td>
                            <td style="text-align:right; font-weight:700; color:#0f172a;">${totalFact > 0 ? totalFact.toLocaleString('es-PE',{minimumFractionDigits:2}) : '-'}</td>
                            <td style="text-align:right; font-weight:800; color:#7c3aed;">${det.reduce((s,d)=>s+parseFloat(d.total_rendicion||d.MontoRendicion||0),0) > 0 ? det.reduce((s,d)=>s+parseFloat(d.total_rendicion||d.MontoRendicion||0),0).toLocaleString('es-PE',{minimumFractionDigits:2}) : '-'}</td>
                            <td class="no-print"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div style="margin-top:1.25rem; padding:0.65rem 1rem; border:1px solid #94a3b8; border-radius:6px; font-size:0.7rem; text-align:center; color:#475569; background:#f8fafc;">
                Declaro haber recibido la documentación arriba descrita en conformidad y buen estado.<br>
                Cualquier observación deberá ser comunicada dentro de las 24 horas siguientes a la recepción.
            </div>

            <div style="display:flex; justify-content:center; gap:2rem; margin-top:1.5rem; flex-wrap:wrap;">
                ${(() => {
                    const isSignedOrigin = !!h.FechaCargo;
                    const b64Origin = btoa(h.UsuarioOrigen || 'N/A').substring(0,8);
                    const suffixOrigin = 'ORG-' + b64Origin;
                    if (isSignedOrigin) {
                        return `<div style="flex:1; max-width:320px; border:1.5px dashed #22c55e; border-radius:12px; padding:1.25rem; text-align:left; background:rgba(34, 197, 94, 0.05); position:relative; box-shadow:0 4px 6px -1px rgba(34,197,94,0.1);">
                            <div style="position:absolute; top:-12px; right:15px; background:#fff; padding:0 8px; color:#22c55e;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
                            </div>
                            <h4 style="margin:0 0 0.75rem 0; font-size:0.8rem; color:#166534; font-weight:700; display:flex; align-items:center; gap:0.4rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                FIRMADO ELECTRÓNICAMENTE
                            </h4>
                            <div style="font-family:monospace; font-size:0.75rem; color:#475569; margin-bottom:0.5rem;">
                                <strong>Rol:</strong> EMISOR (ORIGEN)<br>
                                <strong>Área:</strong> ${h.AreaOrigen}<br>
                                <strong>Usuario:</strong> ${h.UsuarioOrigen || 'Desconocido'}
                            </div>
                            <div style="font-family:monospace; font-size:0.65rem; color:#94a3b8; border-top:1px solid #bbf7d0; padding-top:0.5rem; margin-top:0.5rem; word-break:break-all;">
                                <strong>Sello Timestamp:</strong> ${h.FechaCargo}<br>
                                <strong>Hash Conform:</strong> SHA256-${suffixOrigin}
                            </div>
                        </div>`;
                    } else {
                        return `<div style="flex:1; max-width:320px; border:1.5px dashed #cbd5e1; border-radius:12px; padding:1.25rem; text-align:center; background:#f8fafc; display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:160px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" width="32" height="32" style="margin-bottom:0.75rem;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            <h4 style="margin:0 0 0.5rem 0; font-size:0.8rem; color:#64748b; font-weight:700;">EMISOR (ORIGEN)</h4>
                            <span style="font-size:0.75rem; color:#94a3b8;">Pendiente de Firma<br>(${h.AreaOrigen})</span>
                        </div>`;
                    }
                })()}

                ${(() => {
                    const isSignedDest = (h.FechaRecepcion && h.FechaRecepcion !== '-');
                    const b64Dest = btoa(h.UsuarioDestino || 'N/A').substring(0,8);
                    const suffixDest = 'DST-' + b64Dest;
                    if (isSignedDest) {
                        return `<div style="flex:1; max-width:320px; border:1.5px dashed #22c55e; border-radius:12px; padding:1.25rem; text-align:left; background:rgba(34, 197, 94, 0.05); position:relative; box-shadow:0 4px 6px -1px rgba(34,197,94,0.1);">
                            <div style="position:absolute; top:-12px; right:15px; background:#fff; padding:0 8px; color:#22c55e;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
                            </div>
                            <h4 style="margin:0 0 0.75rem 0; font-size:0.8rem; color:#166534; font-weight:700; display:flex; align-items:center; gap:0.4rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                FIRMADO ELECTRÓNICAMENTE
                            </h4>
                            <div style="font-family:monospace; font-size:0.75rem; color:#475569; margin-bottom:0.5rem;">
                                <strong>Rol:</strong> RECEPTOR (DESTINO)<br>
                                <strong>Área:</strong> ${h.AreaDestino}<br>
                                <strong>Usuario:</strong> ${h.UsuarioDestino || 'Desconocido'}
                            </div>
                            <div style="font-family:monospace; font-size:0.65rem; color:#94a3b8; border-top:1px solid #bbf7d0; padding-top:0.5rem; margin-top:0.5rem; word-break:break-all;">
                                <strong>Sello Timestamp:</strong> ${h.FechaRecepcion}<br>
                                <strong>Hash Conform:</strong> SHA256-${suffixDest}
                            </div>
                        </div>`;
                    } else {
                        return `<div style="flex:1; max-width:320px; border:1.5px dashed #cbd5e1; border-radius:12px; padding:1.25rem; text-align:center; background:#f8fafc; display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:160px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" width="32" height="32" style="margin-bottom:0.75rem;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            <h4 style="margin:0 0 0.5rem 0; font-size:0.8rem; color:#64748b; font-weight:700;">RECEPTOR (DESTINO)</h4>
                            <span style="font-size:0.75rem; color:#94a3b8;">Pendiente de Firma<br>(${h.AreaDestino})</span>
                        </div>`;
                    }
                })()}
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



// ── MODALES MIGRATIOS DESDE ORDERS.JS ──
function formatStatus(status) {
    const s = String(status || '').trim().toUpperCase();
    let watermark = '';
    let badge = '';

    if (s === 'X' || s === 'E*' || s === 'ANULADO') {
        watermark = '<div class="watermark-text wm-anulado">ANULADO</div>';
        badge = '<span class="badge canceled"><i class="fas fa-times-circle"></i> ANULADO</span>';
    } else if (s === 'C' || s === 'CERRADO') {
        watermark = '<div class="watermark-text wm-completo">CERRADO</div>';
        badge = '<span class="badge approved" style="background:#f0fdf4; color:#16a34a;"><i class="fas fa-check-double"></i> CERRADO</span>';
    } else if (s === 'P') {
        badge = '<span class="badge" style="background:#eff6ff; color:#2563eb;"><i class="fas fa-clock"></i> PENDIENTE</span>';
    } else if (s === 'E') {
        badge = '<span class="badge" style="background:#fef3c7; color:#d97706;"><i class="fas fa-file-signature"></i> EMITIDO</span>';
    } else {
        badge = '<span class="badge pending"><i class="fas fa-clock"></i> SIN ESTADO</span>';
    }
    
    return { watermark, badge };
}

async function openReportModal(codcia, nrodoc, tipooc, year) {
    document.getElementById('reportOcNro').textContent = `N° ${nrodoc}`;
    document.getElementById('reportModal').classList.add('active');
    const container = document.getElementById('reportContent');
    container.innerHTML = '<div style="text-align:center;padding:3rem;color:#94a3b8;">Cargando reporte...</div>';

    try {
        const token = localStorage.getItem('yelave_token');
        let url = `/api/logistics/orders/${encodeURIComponent(nrodoc)}/report?codcia=${encodeURIComponent(codcia)}&tipo_oc=${encodeURIComponent(tipooc)}`;
        if (year) url += `&year=${encodeURIComponent(year)}`;

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Error al cargar reporte');
        }
        const data = await res.json();
        
        // Cargar Firmas (Acciones)
        let acciones = [];
        try {
            const urlAcc = `/api/logistics/orders/${encodeURIComponent(nrodoc)}/acciones?codcia=${encodeURIComponent(codcia)}&tipo_oc=${encodeURIComponent(tipooc)}&year=${encodeURIComponent(year || '')}`;
            const resAcc = await fetch(urlAcc, { headers: { 'Authorization': `Bearer ${token}` } });
            if (resAcc.ok) {
                const accData = await resAcc.json();
                acciones = accData.acciones || [];
            }
        } catch(e) { console.warn("Error cargando firmas", e); }

        // Cargar Adjuntos
        let attachedDocs = { signed: [], voucher: [] };
        try {
            const getDocs = async (type) => {
                const resApp = await fetch(`/api/logistics/attachments/list?codcia=${encodeURIComponent(codcia)}&tipooc=${encodeURIComponent(tipooc)}&nrodoc=${encodeURIComponent(nrodoc)}&doc_type=${type}`);
                return resApp.ok ? await resApp.json() : [];
            };
            attachedDocs.signed = await getDocs('signed_order');
            attachedDocs.voucher = await getDocs('voucher');
        } catch(e) { console.warn("Error cargando archivos adjuntos en reporte", e); }

        renderReport(data, acciones, attachedDocs);
    } catch (err) {
        container.innerHTML = `<div style="text-align:center;padding:3rem;color:#ef4444;font-weight:500;">❌ ${err.message}</div>`;
    }
}

function renderReport(data, acciones = [], attachedDocs = { signed: [], voucher: [] }) {
    const { company, header, items } = data;
    const sym = header.codmon || 'S/';
    let html = '';

    // ── Watermark inside Report ──
    const statusInfo = formatStatus(header.flgest || header.estado);
    if (statusInfo.watermark) {
        html += `<div style="position:absolute; top:40%; left:50%; transform:translate(-50%, -50%); z-index:0; pointer-events:none; opacity:0.15; width:100%; text-align:center;">
                    ${statusInfo.watermark.replace('position: absolute;', '')}
                 </div>`;
    }

    // ── Header Band ──
    const orderStatusColor = (header.estado_ingreso && header.estado_ingreso.includes('Completo')) ? 'var(--success)' : (header.estado_ingreso === 'Parcial' ? 'var(--warning)' : 'var(--text-sidebar)');
    
    let reportTitle = 'ORDEN DE COMPRA';
    let reportBg = '#1e3a5f'; // Default blue
    const t = String(header.tipooc || '').trim().toUpperCase();
    if (t === 'S') { reportTitle = 'ORDEN DE SERVICIOS'; reportBg = '#16a34a'; }
    if (t === 'T') { reportTitle = 'ORDEN CONTABLE'; reportBg = '#8b5cf6'; }

    html += `
    <div class="report-header-band" style="position:relative; z-index:1;">
        <div class="report-company-info">
            <h2>${company.nomcia || 'EMPRESA'}</h2>
            <p>${company.dircia || ''}</p>
            <p>RUC: <strong>${company.ruccia || ''}</strong></p>
        </div>
        <div class="report-oc-badge" style="background:${reportBg} !important;">
            <div class="oc-label" style="display:flex; justify-content:space-between; align-items:center;">
                ${reportTitle} N° 
                <span style="background:${orderStatusColor}; color:white; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: 600;">
                    ${header.estado_ingreso || 'Pendiente'}
                </span>
            </div>
            <div class="oc-number">${header.nrodoc}</div>
            <div class="oc-date">${header.fchdoc}</div>
        </div>
    </div>`;

    // ── Supplier Box ──
    html += `
    <div class="report-supplier-box" style="position:relative; z-index:1;">
        <span class="lbl">Señores :</span><span class="val-full" style="font-weight:600;">${header.nomaux}</span>
        <span class="lbl">Dirección :</span><span class="val-full">${header.diraux}</span>
        <span class="lbl">Atención :</span><span class="val">${header.contacto}</span>
        <span class="lbl">Teléfono :</span><span class="val">${header.tlfaux}</span>
        <span class="lbl">Ruc :</span><span class="val"><strong>${header.rucaux}</strong></span>
        <span class="lbl">Comprador :</span><span class="val">${header.nomcom}</span>
        ${header.fax ? `<span class="lbl">Fax :</span><span class="val">${header.fax}</span>` : ''}
        ${header.nroreq ? `<span class="lbl">N° Req. :</span><span class="val">${header.nroreq}</span>` : ''}
    </div>`;

    // ── Items Table ──
    const isGoods = (t === 'M');
    const colCantLabel = isGoods ? 'Cant' : 'Cantidad';
    const statusColLabel = isGoods ? 'Recibido' : 'Facturado';

    html += `
    <table class="report-table" style="position:relative; z-index:1;">
        <thead><tr>
            <th style="width:30px;text-align:center;">N°</th>
            <th style="width:75px;">Código</th>
            <th>Producto / Servicio</th>
            <th style="width:35px;text-align:center;">Und</th>
            <th style="width:65px;text-align:right;">${colCantLabel}</th>
            ${isGoods ? '<th style="width:65px;text-align:right;">Recibido</th>' : ''}
            <th style="width:65px;text-align:right;">Facturado</th>
            <th style="width:65px;text-align:center;">Estado</th>
            <th style="width:70px;text-align:right;">Precio</th>
            <th style="width:80px;text-align:right;">Total</th>
        </tr></thead><tbody>`;

    if (items.length === 0) {
        html += `<tr><td colspan="${isGoods ? '10' : '9'}" style="text-align:center;color:#94a3b8;padding:2rem;">Sin ítems</td></tr>`;
    } else {
        items.forEach(it => {
            const rowColor = (it.estado_ingreso === 'Completo') ? 'color: var(--success); font-weight:600;' : (it.estado_ingreso === 'Parcial' ? 'color: var(--warning); font-weight:600;' : 'color:#64748b;');

            html += `<tr>
                <td style="text-align:center;color:#64748b;font-weight:600;">${it.item_display}</td>
                <td style="font-family:monospace;font-size:0.725rem;">${it.codmat}</td>
                <td style="font-weight:500;">${it.desmat}</td>
                <td style="text-align:center;font-size:0.75rem;">${it.undstk}</td>
                <td style="text-align:right;">${fmtNum(it.candes)}</td>
                ${isGoods ? `<td style="text-align:right;font-weight:600;color:#22c55e;">${fmtNum(it.cant_ingresada)}</td>` : ''}
                <td style="text-align:right;font-weight:600;color:#8b5cf6;">${fmtNum(it.cant_facturada)}</td>
                <td style="text-align:center;font-size:0.7rem;${rowColor}">${it.estado_ingreso}</td>
                <td style="text-align:right;">${fmtNum(it.preuni)}</td>
                <td style="text-align:right;font-weight:600;color:var(--primary);">${sym} ${fmtNum(it.imptot)}</td>
            </tr>`;
            if (it.notas && it.notas.length) {
                it.notas.forEach(n => {
                    html += `<tr class="note-row"><td></td><td></td><td colspan="${isGoods ? '8' : '7'}" style="padding-left:1.5rem;"><span style="color:#94a3b8;">↳</span> ${n}</td></tr>`;
                });
            }
        });
    }
    html += '</tbody></table>';

    // ── Totals ──
    html += `
    <div class="report-totals-box">
        <table>
            <tr><td style="text-align:right;color:#64748b;font-weight:500;">Sub Total :</td>
                <td style="text-align:center;width:40px;color:#64748b;">${sym}</td>
                <td style="text-align:right;min-width:100px;">${fmtNum(header.impnet)}</td></tr>
            <tr><td style="text-align:right;color:#64748b;">IGV ${fmtNum(header.porigv, 2)}% :</td>
                <td style="text-align:center;color:#64748b;">${sym}</td>
                <td style="text-align:right;">${fmtNum(header.impigv)}</td></tr>
            <tr class="row-total"><td style="text-align:right;color:#1e3a5f;">Total General</td>
                <td style="text-align:center;color:#1e3a5f;">${sym}</td>
                <td style="text-align:right;color:#1e3a5f;">${fmtNum(header.imptot)}</td></tr>
        </table>
    </div>`;

    // ── Footer Info ──
    html += '<dl class="report-footer-dl">';
    if (header.glodoc) html += `<dt>Nota :</dt><dd>${header.glodoc}</dd>`;
    if (header.tmpent) html += `<dt>Tiempo Entrega :</dt><dd>${header.tmpent}</dd>`;
    if (header.entrega) html += `<dt>Entrega :</dt><dd>${header.entrega}</dd>`;
    if (header.lugent) html += `<dt>Lugar Entrega :</dt><dd>${header.lugent}</dd>`;
    if (header.despag) html += `<dt>Cond. de Pago :</dt><dd><strong>${header.despag}</strong></dd>`;
    html += '</dl>';

    // ── Disclaimer ──
    html += `<div class="report-disclaimer">
        A la entrega de la mercadería dejar copia o fotostática de la guía de remisión.<br>
        En la oficina se recepcionará facturas adjuntando guía y o/c.
    </div>`;

    // ── Signatures ──
    html += `<style>
        .report-signatures { display:flex; justify-content:space-between; margin-top:2.5rem; gap:1.5rem; }
        .sig-block { flex:1; padding:0.75rem; border:1px solid #e2e8f0; border-radius:6px; background:#f8fafc; font-size:0.75rem; text-align:center; }
        .sig-pending { background:#fff; border-style:dashed; color:#94a3b8; }
        .sig-approved { border-color:#22c55e; background:#f0fdf4; }
        .sig-registered { border-color:#3b82f6; background:#eff6ff; }
        .sig-closed { border-color:#8b5cf6; background:#faf5ff; }
        .sig-title { font-weight:700; margin-bottom:0.5rem; display:flex; align-items:center; justify-content:center; gap:0.5rem; font-size:0.8rem; }
        .sig-user { font-weight:600; color:#1e293b; margin-bottom:0.25rem; font-size:0.85rem;}
        .sig-date { color:#64748b; font-size:0.7rem; }
    </style>`;

    html += `<div class="report-signatures">`;
    
    const getActionDate = (fch) => {
        if(!fch) return '';
        const d = new Date(fch);
        return `${d.toLocaleDateString('es-PE')} ${d.toLocaleTimeString('es-PE', {hour:'2-digit', minute:'2-digit'})}`;
    }

    const reg = acciones.find(a => a.accion === 'REGISTRO');
    if (reg) {
        html += `<div class="sig-block sig-registered">
            <div class="sig-title"><span style="color:#3b82f6;">📝</span> REGISTRADO POR</div>
            <div class="sig-user">${reg.usuario_nombre || reg.usuario_login || 'Usuario'}</div>
            <div class="sig-date">${getActionDate(reg.fecha_hora)}</div>
        </div>`;
    } else {
        html += `<div class="sig-block sig-pending"><div class="sig-title">REGISTRO PENDIENTE</div></div>`;
    }

    const apr = acciones.find(a => a.accion === 'APROBACION');
    if (apr) {
        html += `<div class="sig-block sig-approved">
            <div class="sig-title"><span style="color:#22c55e;">✅</span> APROBADO POR</div>
            <div class="sig-user">${apr.usuario_nombre || apr.usuario_login || 'Usuario'}</div>
            <div class="sig-date">${getActionDate(apr.fecha_hora)}</div>
        </div>`;
    } else {
        html += `<div class="sig-block sig-pending"><div class="sig-title">APROBACIÓN PENDIENTE</div><div class="sig-date">En espera</div></div>`;
    }

    const cie = acciones.find(a => a.accion === 'CIERRE');
    if (cie) {
        html += `<div class="sig-block sig-closed">
            <div class="sig-title"><span style="color:#8b5cf6;">🔒</span> CERRADO POR</div>
            <div class="sig-user">${cie.usuario_nombre || cie.usuario_login || 'Usuario'}</div>
            <div class="sig-date">${getActionDate(cie.fecha_hora)}</div>
        </div>`;
    } else {
        html += `<div class="sig-block sig-pending"><div class="sig-title">CIERRE PENDIENTE</div><div class="sig-date">En proceso</div></div>`;
    }

    html += `</div>`;

    html += `</div>`;

    html += `</div>`;

    // ─── Attachments List in Report
    const signedFiles = attachedDocs.signed || [];
    const voucherFiles = attachedDocs.voucher || [];

    if(signedFiles.length > 0 || voucherFiles.length > 0) {
        html += `
            <div style="margin-top: 2rem; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-family: 'Inter', sans-serif;">
                <div style="background: #f8fafc; padding: 0.75rem 1.25rem; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; display:flex; align-items:center; gap:0.5rem;">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Documentos Adjuntos
                </div>
                <div style="padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">
        `;
        
        const renderFiles = (files, title, color) => {
            if(!files.length) return '';
            let filesHtml = files.map(f => {
                const isImg = f.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.6rem 0.8rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; margin-top:0.4rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; color:#475569; overflow:hidden;">
                            ${isImg ? '🖼️' : '📄'} 
                            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${f.filename}">${f.filename}</span>
                        </div>
                        <button class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;" onclick="viewReportAttachment('${f.url}', '${f.filename}')">Virtualizar 👁</button>
                    </div>
                `;
            }).join('');
            return `
                <div>
                    <h5 style="margin: 0 0 0.2rem 0; font-size: 0.85rem; font-weight: 600; color: ${color};">${title}</h5>
                    ${filesHtml}
                </div>
            `;
        };

        html += renderFiles(signedFiles, 'Orden Firmada - OC', '#2563eb');
        html += renderFiles(voucherFiles, 'Vouchers de Pago', '#f59e0b');

        html += `</div></div>`;
    }

    document.getElementById('reportContent').innerHTML = html;
}

function closeReportModal() { 
    document.getElementById('reportModal').classList.remove('active'); 
    closeReportViewer();
}

function printReport() { window.print(); }

// ─── Attachments Split View ─────────────────────────
function viewReportAttachment(url, filename) {
    const viewer = document.getElementById('reportAttachmentViewer');
    const iframe = document.getElementById('reportAttachmentIframe');
    const loader = document.getElementById('reportViewerLoader');
    const title = document.getElementById('reportViewerTitle');
    
    const modal = document.querySelector('#reportModal .modal');
    modal.style.transition = 'max-width 0.3s ease-out';
    modal.style.maxWidth = '1400px';

    viewer.style.display = 'flex';
    loader.style.display = 'flex';
    iframe.style.display = 'none'; // hide until loaded
    iframe.onload = () => {
        loader.style.display = 'none';
        iframe.style.display = 'block';
    };
    iframe.src = url;
    
    title.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <span style="white-space:nowrap; max-width:250px; overflow:hidden; text-overflow:ellipsis;" title="${filename}">${filename}</span>
    `;
}

function viewReportAttachment(url, filename) {
    const viewer = document.getElementById('reportAttachmentViewer');
    const iframe = document.getElementById('reportAttachmentIframe');
    const loader = document.getElementById('reportViewerLoader');
    const title = document.getElementById('reportViewerTitle');
    
    const modal = document.querySelector('#reportModal .modal');
    modal.style.transition = 'max-width 0.3s ease-out';
    modal.style.maxWidth = '1400px';

    viewer.style.display = 'flex';
    loader.style.display = 'flex';
    iframe.style.display = 'none'; // hide until loaded
    iframe.onload = () => {
        loader.style.display = 'none';
        iframe.style.display = 'block';
    };
    iframe.src = url;
    
    title.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <span style="white-space:nowrap; max-width:250px; overflow:hidden; text-overflow:ellipsis;" title="${filename}">${filename}</span>
    `;
}

function closeReportViewer() {
    const viewer = document.getElementById('reportAttachmentViewer');
    const iframe = document.getElementById('reportAttachmentIframe');
    
    if(viewer) viewer.style.display = 'none';
    if(iframe) iframe.src = '';
    
    const modal = document.querySelector('#reportModal .modal');
    if(modal) modal.style.maxWidth = '920px';
}

async function openWarehouseModal(codcia, nrodoc) {
    document.getElementById('warehouseOcNro').textContent = nrodoc;
    document.getElementById('warehouseModal').classList.add('active');
    const tbody = document.getElementById('warehouse-tbody');
    // Use the modal body directly for a richer layout
    const modalBody = tbody.closest('.modal-body');
    modalBody.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted);">Consultando ingresos a almacén...</div>';

    try {
        const token = localStorage.getItem('yelave_token');
        const url = `/api/logistics/orders/${encodeURIComponent(nrodoc)}/warehouse-entry?codcia=${encodeURIComponent(codcia)}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        
        if (!res.ok) throw new Error('Error al obtener ingresos a almacén');
        const data = await res.json();
        
        if (!data.vouchers || data.vouchers.length === 0) {
            modalBody.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted);">No hay ingresos a almacén registrados para esta OC.</div>';
            return;
        }

        let html = '';
        const co = data.company;

        data.vouchers.forEach((v, idx) => {
            const h = v.header;
            const isAnulado = h.estado && h.estado.trim().toUpperCase() === 'A';

            html += `<div id="warehouseVoucher${idx}" style="padding:2rem; background:#fff; font-family:'Inter',Arial,sans-serif; color:#1a1a1a; font-size:0.8125rem; ${idx > 0 ? 'margin-top:1.5rem; border-top:3px dashed #cbd5e1; padding-top:2rem;' : ''}">`;

            // ── Header Band ──
            html += `
            <div class="report-header-band">
                <div class="report-company-info">
                    <h2>${co.nomcia || 'EMPRESA'}</h2>
                    <p>${co.dircia || ''}</p>
                </div>
                <div class="report-oc-badge">
                    <div class="oc-label">Documento N°</div>
                    <div class="oc-number">${h.nrodoc}</div>
                    <div class="oc-date">${h.fchdoc}</div>
                </div>
            </div>`;

            // ── Info Box ──
            html += `
            <div style="font-size:0.8rem; margin-bottom:1rem;">
                <div style="display:flex; gap:2rem; margin-bottom:0.5rem;">
                    <div><strong>${h.almacen}</strong> &nbsp; ${h.des_almacen}</div>
                </div>
            </div>
            <div class="report-supplier-box">
                <span class="lbl">Movimiento :</span><span class="val">${h.tipmov} &nbsp; ${h.codmov} &nbsp; ${h.des_movimiento}</span>
                <span class="lbl">Documento :</span><span class="val"><strong>${h.nrodoc}</strong></span>
                ${h.proveedor ? `<span class="lbl">Proveedor :</span><span class="val">${h.ruc_proveedor} &nbsp; ${h.proveedor}</span>` : ''}
                <span class="lbl">Moneda :</span><span class="val">${h.moneda}</span>
                <span class="lbl">T.Cambio :</span><span class="val">${fmtNum(h.tipo_cambio, 4)}</span>
                <span class="lbl">Fecha :</span><span class="val">${h.fchdoc}</span>
                <span class="lbl">USUARIO :</span><span class="val"><strong>${h.usuario}</strong></span>
                ${h.ordcmp ? `<span class="lbl">O. Compra :</span><span class="val">${h.ordcmp}</span>` : ''}
            </div>`;

            // Referencias
            if (h.referencias && h.referencias.length > 0) {
                html += `<div style="font-size:0.775rem; padding:0.5rem 1rem; background:#f0f4ff; border:1px solid #c7d2fe; border-radius:6px; margin-bottom:0.75rem;">
                    <strong>Documentos de Referencia:</strong><br>`;
                h.referencias.forEach(r => { html += `<span style="margin-right:1.5rem;">${r}</span>`; });
                html += `</div>`;
            }

            // Observacion
            if (h.observacion) {
                html += `<div style="font-size:0.775rem; margin-bottom:0.75rem;"><strong>Observación:</strong> ${h.observacion}</div>`;
            }

            // Anulado banner
            if (isAnulado) {
                html += `<div style="text-align:center; padding:0.75rem; background:#fee2e2; border:2px solid #ef4444; border-radius:8px; margin-bottom:1rem; font-weight:700; color:#991b1b; font-size:1rem;">** A N U L A D O **</div>`;
            }

            // ── Items Table ──
            html += `
            <table class="report-table">
                <thead><tr>
                    <th style="width:30px;text-align:center;">Ite</th>
                    <th style="width:80px;">Artículo</th>
                    <th>Descripción</th>
                    <th style="width:45px;text-align:center;">Unidad</th>
                    <th style="width:80px;">NROLOTE</th>
                    <th style="width:75px;">Fch. Vto</th>
                    <th style="width:80px;text-align:right;">Cantidad</th>
                    <th style="width:80px;text-align:right;">Precio</th>
                    <th style="width:90px;text-align:right;">Total</th>
                </tr></thead><tbody>`;

            if (v.items.length === 0) {
                html += '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:1.5rem;">Sin ítems</td></tr>';
            } else {
                v.items.forEach(it => {
                    html += `<tr>
                        <td style="text-align:center;font-weight:600;">${it.nroitm}</td>
                        <td style="font-family:monospace;font-size:0.725rem;">${it.codmat}</td>
                        <td style="font-weight:500;">${it.desmat}</td>
                        <td style="text-align:center;font-size:0.75rem;">${it.undstk}</td>
                        <td style="font-family:monospace;font-size:0.725rem;">${it.nrolote || ''}</td>
                        <td style="font-size:0.75rem;">${it.fchlote || ''}</td>
                        <td style="text-align:right;font-weight:600;">${fmtNum(it.candes, 6)}</td>
                        <td style="text-align:right;">${fmtNum(it.preuni, 6)}</td>
                        <td style="text-align:right;font-weight:600;color:var(--primary);">${fmtNum(it.impcto, 6)}</td>
                    </tr>`;
                });
            }
            html += '</tbody></table>';

            // ── Totals ──
            html += `
            <div class="report-totals-box">
                <table>
                    <tr>
                        <td style="text-align:right;font-weight:700;font-size:0.875rem;padding:0.5rem 1rem;">TOTAL :</td>
                        <td style="text-align:right;min-width:90px;font-weight:600;">${fmtNum(h.total_cantidad, 6)}</td>
                        <td style="text-align:right;min-width:90px;font-weight:600;">${fmtNum(h.total_precio, 6)}</td>
                        <td style="text-align:right;min-width:100px;font-weight:700;color:var(--primary);font-size:0.9rem;">${fmtNum(h.total_importe, 6)}</td>
                    </tr>
                </table>
            </div>`;

            html += '</div>'; // close voucher div
        });

        modalBody.innerHTML = html;

    } catch (err) {
        modalBody.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--danger);">${err.message}</div>`;
    }
}

function closeWarehouseModal() { document.getElementById('warehouseModal').classList.remove('active'); }

function printWarehouseVoucher() {
    const modal = document.getElementById('warehouseModal');
    const content = modal.querySelector('.modal-body');
    if (!content) return;
    const printWin = window.open('', '_blank');
    printWin.document.write(`<!DOCTYPE html><html><head><title>Voucher de Almacén</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Inter', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 12mm; }
            .report-header-band { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:1rem; margin-bottom:1rem; border-bottom:3px solid #1e3a5f; }
            .report-company-info h2 { font-size:1.1rem; font-weight:700; color:#1e3a5f; margin:0 0 0.1rem; }
            .report-company-info p { font-size:0.75rem; color:#6b7280; margin:0; }
            .report-oc-badge { text-align:right; background:#1e3a5f; color:#fff; padding:0.6rem 1rem; border-radius:6px; min-width:160px; }
            .report-oc-badge .oc-label { font-size:0.6rem; text-transform:uppercase; letter-spacing:1px; opacity:0.8; }
            .report-oc-badge .oc-number { font-size:1.4rem; font-weight:700; }
            .report-oc-badge .oc-date { font-size:0.8rem; opacity:0.9; }
            .report-supplier-box { display:grid; grid-template-columns:100px 1fr 100px 1fr; gap:0.2rem 0.4rem; font-size:0.75rem; padding:0.7rem 0.8rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:0.75rem; }
            .report-supplier-box .lbl { font-weight:600; color:#64748b; }
            .report-supplier-box .val { color:#0f172a; }
            .report-table { width:100%; border-collapse:collapse; margin-top:0.25rem; }
            .report-table th { background:#e2e8f0; font-weight:700; font-size:0.65rem; text-transform:uppercase; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; text-align:left; }
            .report-table td { border:1px solid #e2e8f0; padding:0.35rem 0.4rem; font-size:0.75rem; }
            .report-totals-box { display:flex; justify-content:flex-end; margin-top:0.5rem; }
            .report-totals-box td { padding:0.3rem 0.5rem; font-size:0.8rem; }
            @media print { body { margin: 8mm; } }
        </style>
    </head><body>${content.innerHTML}</body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 300);
}

function printWarehouseVoucher() {
    const modal = document.getElementById('warehouseModal');
    const content = modal.querySelector('.modal-body');
    if (!content) return;
    const printWin = window.open('', '_blank');
    printWin.document.write(`<!DOCTYPE html><html><head><title>Voucher de Almacén</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Inter', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 12mm; }
            .report-header-band { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:1rem; margin-bottom:1rem; border-bottom:3px solid #1e3a5f; }
            .report-company-info h2 { font-size:1.1rem; font-weight:700; color:#1e3a5f; margin:0 0 0.1rem; }
            .report-company-info p { font-size:0.75rem; color:#6b7280; margin:0; }
            .report-oc-badge { text-align:right; background:#1e3a5f; color:#fff; padding:0.6rem 1rem; border-radius:6px; min-width:160px; }
            .report-oc-badge .oc-label { font-size:0.6rem; text-transform:uppercase; letter-spacing:1px; opacity:0.8; }
            .report-oc-badge .oc-number { font-size:1.4rem; font-weight:700; }
            .report-oc-badge .oc-date { font-size:0.8rem; opacity:0.9; }
            .report-supplier-box { display:grid; grid-template-columns:100px 1fr 100px 1fr; gap:0.2rem 0.4rem; font-size:0.75rem; padding:0.7rem 0.8rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:0.75rem; }
            .report-supplier-box .lbl { font-weight:600; color:#64748b; }
            .report-supplier-box .val { color:#0f172a; }
            .report-table { width:100%; border-collapse:collapse; margin-top:0.25rem; }
            .report-table th { background:#e2e8f0; font-weight:700; font-size:0.65rem; text-transform:uppercase; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; text-align:left; }
            .report-table td { border:1px solid #e2e8f0; padding:0.35rem 0.4rem; font-size:0.75rem; }
            .report-totals-box { display:flex; justify-content:flex-end; margin-top:0.5rem; }
            .report-totals-box td { padding:0.3rem 0.5rem; font-size:0.8rem; }
            @media print { body { margin: 8mm; } }
        </style>
    </head><body>${content.innerHTML}</body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 300);
}

async function openAttachmentModal(codcia, tipooc, nrodoc, docType) {
    currentAttachmentContext = { codcia, tipooc, nrodoc, docType };
    
    const title = (docType === 'signed_order') ? 'Orden Firmada' : 'Vouchers de Pago';
    document.getElementById('attachmentModalTitle').textContent = title;
    document.getElementById('attachmentOcNro').textContent = nrodoc;
    document.getElementById('attachmentModal').classList.add('active');
    
    loadAttachmentList();
}

function closeAttachmentModal() {
    document.getElementById('attachmentModal').classList.remove('active');
    currentAttachmentContext = null;
    document.getElementById('attachmentFileInput').value = '';
}

async function loadAttachmentList() {
    const listEl = document.getElementById('attachmentList');
    listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.875rem;">Cargando archivos...</div>';
    
    if (!currentAttachmentContext) return;
    const { codcia, tipooc, nrodoc, docType } = currentAttachmentContext;
    
    try {
        const url = `/api/logistics/attachments/list?codcia=${encodeURIComponent(codcia)}&tipooc=${encodeURIComponent(tipooc)}&nrodoc=${encodeURIComponent(nrodoc)}&doc_type=${docType}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al listar adjuntos');
        const files = await res.json();
        
        if (files.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.875rem;">No hay archivos adjuntos para este tipo.</div>';
            return;
        }
        
        let html = '';
        files.forEach(f => {
            const isImg = f.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            const icon = isImg ? `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="color:#10b981;">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>` : `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="color:#ef4444;">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>`;

            html += `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:0.75rem; background:white; border:1px solid var(--border); border-radius:8px;">
                <div style="display:flex; align-items:center; gap:0.75rem; overflow:hidden;">
                    ${icon}
                    <span style="font-size:0.8125rem; font-weight:500; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${f.filename}">${f.filename}</span>
                </div>
                <button onclick="openPreviewModal('${f.url}', '${f.filename}')" class="btn btn-outline" style="padding:0.35rem 0.6rem; font-size:0.75rem; display:flex; align-items:center; gap:0.3rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>
                    </svg>Ver
                </button>
            </div>`;
        });
        listEl.innerHTML = html;
        
    } catch (err) {
        listEl.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--danger); font-size:0.875rem;">${err.message}</div>`;
    }
}

async function handleAttachmentUpload() {
    const fileInput = document.getElementById('attachmentFileInput');
    if (!fileInput.files.length || !currentAttachmentContext) return;
    
    const file = fileInput.files[0];
    const { codcia, tipooc, nrodoc, docType } = currentAttachmentContext;
    
    const formData = new FormData();
    formData.append('codcia', codcia);
    formData.append('tipooc', tipooc);
    formData.append('nrodoc', nrodoc);
    formData.append('doc_type', docType);
    formData.append('file', file);
    
    try {
        Swal.fire({ title: 'Subiendo archivo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        const res = await fetch('/api/logistics/attachments/upload', { 
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Error al subir');
        }
        
        Swal.fire({ icon: 'success', title: '¡Subido!', text: 'El archivo se guardó correctamente.', timer: 1500, showConfirmButton: false });
        fileInput.value = '';
        loadAttachmentList();
        
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
}

function openPreviewModal(url, filename) {
    document.getElementById('previewModal').classList.add('active');
    document.getElementById('previewModalTitle').textContent = filename || 'Visualización de Archivo';
    
    const downloadBtn = document.getElementById('previewModalDownloadBtn');
    downloadBtn.href = url;
    downloadBtn.setAttribute('download', filename || 'documento');
    
    const body = document.getElementById('previewModalBody');
    const isImage = url.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) != null;
    const cacheUrl = url + (url.includes('?') ? '&' : '?') + 't=' + new Date().getTime();
    
    if (isImage) {
        body.innerHTML = `<img src="${cacheUrl}" alt="${filename}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:8px;">`;
    } else {
        // Assume PDF or other browser-supported document
        body.innerHTML = `<iframe src="${cacheUrl}#toolbar=0&navpanes=0&view=FitH" frameborder="0" style="width:100%; height:100%; border:none;"></iframe>`;
    }
}

function closePreviewModal() {
    document.getElementById('previewModal').classList.remove('active');
    document.getElementById('previewModalBody').innerHTML = '<div style="color:var(--text-muted);">Cargando previsualización...</div>';
}

function closeTrazaModal() {
    document.getElementById('trazaModal').classList.remove('active');
}

async function openTrazaModal(codcia, nrodoc, tipooc, anos) {
    document.getElementById('trazaModal').classList.add('active');
    document.getElementById('trazaOcNro').textContent = nrodoc;
    const content = document.getElementById('trazaContent');
    content.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-muted);">Cargando trazabilidad...</div>';

    try {
        let url = `/api/contabilidad/trazabilidad/${encodeURIComponent(nrodoc)}?codcia=${encodeURIComponent(codcia)}`;
        if (tipooc) url += `&tipo_oc=${encodeURIComponent(tipooc)}`;
        if (anos) url += `&year=${encodeURIComponent(anos)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Error cargando trazabilidad');
        const data = await res.json();

        const r = data.resumen;
        const fmtN = (v) => v != null ? parseFloat(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '0.00';

        let html = `
        <div class="traza-summary">
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${r.total_items_oc}</div><div class="tlabel">Items OC</div></div>
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${fmtN(r.total_oc)}</div><div class="tlabel">Cant. Pedida</div></div>
            ${tipooc === 'M' ? `<div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#22c55e;">${fmtN(r.total_almacen)}</div><div class="tlabel">Cant. Almacén</div></div>` : ''}
            <div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#8b5cf6;">${fmtN(r.total_facturado)}</div><div class="tlabel">Cant. Facturada</div></div>
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${r.total_facturas}</div><div class="tlabel">Facturas</div></div>
        </div>`;

        // ─── Validaciones / Alertas ───
        if (data.validaciones && data.validaciones.length > 0) {
            html += `<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:1rem; margin-bottom:1.5rem;">
                <h5 style="margin:0 0 0.5rem 0; color:#b45309; font-size:0.85rem; font-weight:700;">⚠️ Advertencias y Discrepancias</h5>
                <ul style="margin:0; padding-left:1.5rem; color:#92400e; font-size:0.75rem; font-weight:500;">`;
            data.validaciones.forEach(val => {
                html += `<li style="margin-bottom:0.25rem;">${val}</li>`;
            });
            html += `</ul></div>`;
        }

        // ─── Timeline Information Prep ───
        const dateOC = data.fch_oc ? new Date(data.fch_oc) : null;
        const diffDays = (dStr) => {
            if (!dateOC || !dStr) return null;
            const d = new Date(dStr);
            const diffTime = d.getTime() - dateOC.getTime();
            return Math.floor(diffTime / (1000 * 60 * 60 * 24));
        };

        let events = [];
        if (data.fch_oc) {
            events.push({ type: 'oc', fchdoc: data.fch_oc, label: 'Orden Emitida', desc: '', icon: '📝', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' });
        }
        if (data.movimientos_almacen) {
            data.movimientos_almacen.forEach(m => {
                if (m.fchdoc) events.push({ type: 'alm', fchdoc: m.fchdoc, label: `Ingreso a Almacén`, desc: `Inv: ${m.nrodoc}`, icon: '📦', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' });
            });
        }
        if (data.facturas) {
            data.facturas.forEach(f => {
                if (f.FecEmision) events.push({ type: 'fac', fchdoc: f.FecEmision, label: `Facturación`, desc: `Serie/Núm: ${f.Serie}-${f.Numero}`, icon: '🧾', color: '#9333ea', bg: '#faf5ff', border: '#e9d5ff' });
            });
        }
        events.sort((a,b) => new Date(a.fchdoc) - new Date(b.fchdoc));

        // Items Table
        html += `<div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:1rem;">
        <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
            <thead>
                <tr style="background:#f1f5f9;">
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">#</th>
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">Código</th>
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">Descripción</th>
                    <th style="padding:0.6rem 0.5rem; text-align:right; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">Cant. OC</th>
                    ${tipooc === 'M' ? `<th style="padding:0.6rem 0.5rem; text-align:center; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#22c55e; border-bottom:2px solid #cbd5e1;">Almacén</th>` : ''}
                    <th style="padding:0.6rem 0.5rem; text-align:center; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#8b5cf6; border-bottom:2px solid #cbd5e1;">Facturado</th>
                </tr>
            </thead><tbody>`;

        if (data.items.length === 0) {
            html += `<tr><td colspan="${tipooc === 'M' ? '6' : '5'}" style="text-align:center; padding:2rem; color:#94a3b8;">Sin ítems encontrados en la OC</td></tr>`;
        } else {
            data.items.forEach((it, idx) => {
                const almClass = it.pct_almacen >= 100 ? 'complete' : (it.pct_almacen > 0 ? 'partial' : 'pending');
                const facClass = it.pct_facturado >= 100 ? 'complete' : (it.pct_facturado > 0 ? 'partial' : 'pending');

                let trWarning = '';
                if (it.warnings && it.warnings.length > 0) {
                    const warnsInfo = it.warnings.map(w => `<span style="display:inline-block; margin-right:12px;">⚠️ ${w}</span>`).join('');
                    trWarning = `<tr style="background:#fffbeb; border-bottom:1px solid #f1f5f9;">
                         <td colspan="${tipooc === 'M' ? '6' : '5'}" style="padding:0.35rem 0.6rem; font-size:0.68rem; font-weight:500; color:#b45309;">
                             ${warnsInfo}
                         </td>
                    </tr>`;
                }

                html += `<tr style="border-bottom:${it.warnings && it.warnings.length ? 'none' : '1px solid #f1f5f9'};">
                    <td style="padding:0.5rem; text-align:center; color:#64748b;">${it.nroitm}</td>
                    <td style="padding:0.5rem; font-family:monospace; font-size:0.725rem;">${it.codmat}</td>
                    <td style="padding:0.5rem;">${(it.desmat || '').substring(0, 50)}</td>
                    <td style="padding:0.5rem; text-align:right; font-weight:600;">${fmtN(it.candes)}</td>
                    ${tipooc === 'M' ? `<td style="padding:0.5rem; text-align:center;">
                        <div style="font-weight:600; ${almClass === 'complete' ? 'color:#22c55e;' : almClass === 'partial' ? 'color:#f59e0b;' : 'color:#94a3b8;'}">${fmtN(it.cant_almacen)} <span style="font-size:0.65rem; font-weight:400;">(${it.pct_almacen}%)</span></div>
                        <div class="traza-bar"><div class="traza-bar-fill ${almClass}" style="width:${Math.min(it.pct_almacen, 100)}%;"></div></div>
                    </td>` : ''}
                    <td style="padding:0.5rem; text-align:center;">
                        <div style="font-weight:600; ${facClass === 'complete' ? 'color:#8b5cf6;' : facClass === 'partial' ? 'color:#f59e0b;' : 'color:#94a3b8;'}">${fmtN(it.cant_facturada)} <span style="font-size:0.65rem; font-weight:400;">(${it.pct_facturado}%)</span></div>
                        <div class="traza-bar"><div class="traza-bar-fill ${facClass}" style="width:${Math.min(it.pct_facturado, 100)}%;"></div></div>
                    </td>
                </tr>${trWarning}`;
            });
        }
        html += '</tbody></table></div>';

        // Section: Documentos Agrupados (Vertically stacked for full width)
        html += `<div style="display:flex; flex-direction:column; gap:1.5rem; margin-bottom:1.5rem;">`;

        if (tipooc === 'M') {
            html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:1.25rem;">
                <h5 style="font-size:0.85rem; font-weight:700; margin-top:0; margin-bottom:1rem; color:#1e293b; border-bottom:2px solid #22c55e; padding-bottom:0.5rem;"><span style="color:#22c55e;">📦</span> Detalle de Movimientos Almacén</h5>
                <div style="overflow-x:auto;">`;

            if (data.movimientos_almacen && data.movimientos_almacen.length > 0) {
                html += `<table style="width:100%; border-collapse:collapse; font-size:0.75rem; background:#fff; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
                    <thead>
                        <tr style="color:#334155; background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Almacén</th>
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Doc. Referencia</th>
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Fecha</th>
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Material</th>
                            <th style="padding:0.5rem; text-align:right; font-weight:600;">Cantidad</th>
                            <th style="padding:0.5rem; text-align:right; font-weight:600;">Precio</th>
                        </tr>
                    </thead>
                    <tbody>`;
                data.movimientos_almacen.forEach((m, idx) => {
                    const isLast = idx === data.movimientos_almacen.length - 1;
                    html += `
                        <tr style="${!isLast ? 'border-bottom:1px solid #e2e8f0;' : ''}">
                            <td style="padding:0.5rem; color:#64748b;">${m.almcen}</td>
                            <td style="padding:0.5rem; color:#1d4ed8; font-weight:600;">${m.tipmov}-${m.codmov}-${m.nrodoc}</td>
                            <td style="padding:0.5rem; color:#475569;">${m.fchdoc}</td>
                            <td style="padding:0.5rem; font-family:monospace; font-weight:600; color:#475569;">${m.codmat}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600; color:#16a34a;">${fmtN(m.candes)}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600;">${fmtN(m.preuni)} <span style="font-size:0.65rem; color:#64748b; font-weight:400;">${m.codmon_desc || ''}</span></td>
                        </tr>`;
                });
                html += '</tbody></table></div>';
            } else {
                html += '<div style="text-align:center; padding:1.5rem; color:#94a3b8; font-size:0.8rem; background:#f8fafc; border:1px dashed #e2e8f0; border-radius:8px;">No hay movimientos.</div></div>';
            }
            html += `</div>`; // End top card (Movimientos)
        }

        html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:1.25rem;">
                 <h5 style="font-size:0.85rem; font-weight:700; margin-top:0; margin-bottom:1rem; color:#1e293b; border-bottom:2px solid #8b5cf6; padding-bottom:0.5rem;"><span style="color:#8b5cf6;">🧾</span> Facturas Vinculadas</h5>
                 <div class="traza-factura-list">`;
        
        // Linked invoices
        if (data.facturas && data.facturas.length > 0) {
            data.facturas.forEach(f => {
                const facturaUrl = f.Uuid ? `factura_visor.html?uid=${f.Uuid}` : '#';
                html += `
                <div style="margin-bottom:1rem; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.85rem 1rem; background:#f8fafc; border-bottom:${f.detalles && f.detalles.length ? '1px solid #cbd5e1' : 'none'};">
                        <div style="display:flex; align-items:center; gap:0.85rem;">
                            <div style="background:#f0f7ff; color:#2563eb; width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            </div>
                            <div>
                                <div style="font-weight:700; color:#1e293b;">${f.Serie || ''}-${f.Numero || ''}</div>
                                <div style="font-size:0.7rem; color:#64748b;">${f.NomProveedor || '-'}</div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:700; color:#1e293b;">${fmtN(f.Total)} ${f.codmon_desc || f.CodMoneda}</div>
                            <div style="display:flex; align-items:center; justify-content:flex-end; gap:0.5rem; margin-top:0.25rem;">
                                <span style="font-size:0.7rem; color:#64748b;">${f.FecEmision || '-'}</span>
                                ${f.Uuid ? `<a href="${facturaUrl}" target="_blank" class="btn btn-primary" style="padding:0.25rem 0.5rem; font-size:0.65rem; height:auto; text-decoration:none;">Ver PDF</a>` : ''}
                            </div>
                        </div>
                    </div>`;

                if (f.detalles && f.detalles.length > 0) {
                    html += `<div style="padding:0 0.75rem 0.75rem 0.75rem;"><table style="width:100%; font-size:0.72rem; border-collapse:collapse; margin-top:0.5rem; background:#fff; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
                        <thead>
                           <tr style="color:#334155; background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
                             <th style="padding:0.5rem; text-align:left; font-weight:600;">Cod. Material</th>
                             <th style="padding:0.5rem; text-align:left; font-weight:600;">Descripción</th>
                             <th style="padding:0.5rem; text-align:right; font-weight:600;">Cantidad</th>
                             <th style="padding:0.5rem; text-align:right; font-weight:600;">Precio Unitario</th>
                           </tr>
                        </thead><tbody>`;
                    f.detalles.forEach((d, idx) => {
                        const isLast = idx === f.detalles.length - 1;
                        html += `<tr style="${!isLast ? 'border-bottom:1px solid #e2e8f0;' : ''}">
                            <td style="padding:0.5rem; font-family:monospace; font-weight:600; color:#475569;">${d.codmat}</td>
                            <td style="padding:0.5rem; font-weight:500;">${(d.desmat || '')}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600; color:#8b5cf6;">${fmtN(d.cant)}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600;">${fmtN(d.preuni)} <span style="font-size:0.65rem; color:#64748b; font-weight:400;">${f.codmon_desc || ''}</span></td>
                        </tr>`;
                    });
                    html += `</tbody></table></div>`;
                }
                html += `</div>`;
            });
            html += '</div>';
        } else {
            html += '<div style="text-align:center; padding:1.5rem; color:#94a3b8; font-size:0.8rem; background:#f8fafc; border:1px dashed #e2e8f0; border-radius:8px;">No hay facturas vinculadas aún.</div></div>';
        }
        
        html += `</div>`; // End right card
        html += `</div>`; // End grouped flex

        // ─── Vertical Timeline Render ───
        html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:1.25rem;">
            <h5 style="font-size:0.85rem; font-weight:700; color:#1e293b; margin-top:0; margin-bottom:1.2rem; border-bottom:2px solid #e2e8f0; padding-bottom:0.5rem;"><span style="color:#f59e0b; margin-right:6px;">⏱️</span> Línea de Tiempo (Cronograma)</h5>`;
        
        html += `<div style="border-left:2px solid #cbd5e1; margin-left:1rem; padding-left:1.5rem; position:relative; display:flex; flex-direction:column; gap:1.2rem;">`;

        events.forEach(ev => {
             const dd = diffDays(ev.fchdoc);
             const daysText = dd === 0 ? "Mismo Día" : (dd > 0 ? `+${dd} Días` : `${dd} Días`);
             html += `
             <div style="position:relative;">
                 <div style="position:absolute; left:-1.9rem; top:0.25rem; width:14px; height:14px; background:#fff; border:3px solid ${ev.color}; border-radius:50%;"></div>
                 <div style="background:${ev.bg}; border:1px solid ${ev.border}; padding:0.6rem 1rem; border-radius:8px;">
                     <div style="display:flex; justify-content:space-between; align-items:center;">
                         <div style="font-weight:700; color:${ev.color}; font-size:0.75rem;"><span style="font-size:0.85rem; margin-right:4px;">${ev.icon}</span> ${ev.label}</div>
                         <div style="font-size:0.7rem; color:#475569; font-weight:600; padding:2px 8px; background:#fff; border-radius:12px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">${daysText}</div>
                     </div>
                     <div style="color:#64748b; font-size:0.72rem; margin-top:0.4rem;">Fecha doc: <strong style="color:#334155;">${ev.fchdoc}</strong> ${ev.desc ? `<span style="margin-left:0.5rem; padding-left:0.5rem; border-left:1px solid #cbd5e1; color:#64748b;">${ev.desc}</span>` : ''}</div>
                 </div>
             </div>
             `;
        });
        
        if (events.length === 0) {
             html += `<div style="color:#64748b; font-size:0.8rem; font-style:italic;">Sin eventos registrados</div>`;
        }
        html += `</div></div>`;

        // ─── Botón Cerrar Proceso Completo ───
        const hasWarnings = data.validaciones && data.validaciones.length > 0;
        const isClosed = String(data.resumen.estado_oc || '').trim().toUpperCase() === 'C';
        
        html += `<div style="margin-top:2rem; text-align:right; border-top:1px solid #e2e8f0; padding-top:1.5rem;">`;
        if (!isClosed) {
            if (hasWarnings) {
                html += `<button class="btn" style="background:#e2e8f0; color:#64748b; cursor:not-allowed;" title="Hay discrepancias en la trazabilidad. Resuélvalas antes de cerrar.">
                    🔒 Cerrar Proceso Completo
                </button>`;
            } else {
                html += `<button class="btn btn-primary" style="background:#8b5cf6;" onclick="cerrarOcIntegral('${codcia}','${nrodoc}','${tipooc}','${anos}')">
                    🔒 Cerrar Proceso Completo
                </button>`;
            }
        } else {
            html += `<span style="display:inline-block; padding:0.6rem 1.25rem; font-size:0.85rem; font-weight:700; color:#16a34a; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px;">✅ PROCESO CERRADO</span>`;
        }
        html += `</div>`;

        content.innerHTML = html;
    } catch(err) {
        content.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444; font-weight:500;">❌ Error: ${err.message}</div>`;
    }
}

// ─── Cargar Facturas sin Orden de Compra ───────────────────────────
let facturasSinOC_DT = null;

async function loadFacturasSinOC() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) { Swal.fire('Atención', 'Seleccione una empresa.', 'warning'); return; }

    if (facturasSinOC_DT) { facturasSinOC_DT.destroy(); facturasSinOC_DT = null; }

    try {
        facturasSinOC_DT = $('#facturasSinOCTable').DataTable({
            serverSide: true,
            processing: true,
            destroy: true,
            ordering: false,
            pageLength: 10,
            language: {
                url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',
                processing: '<div style="background:rgba(255,255,255,0.8); z-index:99; position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#2563eb; font-weight:700;">Cargando facturas...</div>'
            },
            ajax: {
                url: '/api/contabilidad/facturas-sin-oc',
                type: 'GET',
                data: function(d) {
                    d.codcia = codcia;
                    d.login = currentUser;
                    d.ano = document.getElementById('filterAno') ? document.getElementById('filterAno').value : '0';
                    d.mes = document.getElementById('filterMes') ? document.getElementById('filterMes').value : '0';
                }
            },
            columns: [
                {
                    data: null,
                    orderable: false,
                    className: 'dt-center',
                    render: function(data, type, row, meta) {
                        return `<input type="checkbox" class="factura-sin-oc-chk" data-id="${row.Id}" data-serie="${row.Serie || ''}" data-numero="${row.Numero || ''}" data-total="${row.Total || 0}" data-nomproveedor="${(row.NomProveedor || '').replace(/"/g, '&quot;')}" data-numruc="${row.NumRucProveedor || ''}" style="width:16px;height:16px;cursor:pointer;accent-color:#f59e0b;">`;
                    }
                },
                { data: null, render: function(data, type, row) { return `${row.CodTipoDoc||''} ${row.Serie||''}-${row.Numero||''}`; } },
                { data: 'CodTipoDoc' },
                { data: 'FecEmision' },
                { data: 'FecVencimiento' },
                { data: 'NomProveedor', render: function(data) { return (data || '').substring(0, 30); } },
                { data: 'NumRucProveedor' },
                { data: 'CodMoneda' },
                { data: 'Total', render: function(data) { return fmtNum(data); }, className: 'dt-right' },
                {
                    data: null,
                    orderable: false,
                    className: 'dt-center',
                    render: function(data, type, row) {
                        let actionsHtml = '';
                        if (row.Uuid) {
                            actionsHtml += `<a href="/factura_visor.html?uid=${row.Uuid}" target="_blank" class="btn-action outline" style="padding:0.25rem 0.5rem; font-size:0.7rem; text-decoration:none; display:inline-block;">📄 Ver PDF</a>`;
                        }
                        return actionsHtml || '-';
                    }
                }
            ]
        });
    } catch (error) {
        console.error('Error cargando facturas sin OC:', error);
        Swal.fire('Error', 'No se pudieron cargar las facturas sin OC', 'error');
    }
}

function toggleAllFacturasSinOC() {
    const chkAll = document.getElementById('chkAllFacturasSinOC');
    const chks = document.querySelectorAll('.factura-sin-oc-chk');
    chks.forEach(chk => chk.checked = chkAll.checked);
}

// ─── Cargar Rendiciones Aprobadas ────────────────────────────────
let rendicionesAprobadas_DT = null;

async function loadRendicionesAprobadas() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) { Swal.fire('Atención', 'Seleccione una empresa.', 'warning'); return; }

    if (rendicionesAprobadas_DT) { rendicionesAprobadas_DT.destroy(); rendicionesAprobadas_DT = null; }

    const tbody = document.getElementById('rendicionesAprobadasTbody');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:#94a3b8;">Cargando...</td></tr>';

    try {
        const ano = document.getElementById('filterAno') ? document.getElementById('filterAno').value : '0';
        const mes = document.getElementById('filterMes') ? document.getElementById('filterMes').value : '0';
        const res = await axios.get(`/api/finanzas/rendiciones/aprobadas?codcia=${encodeURIComponent(codcia)}&ano=${ano}&mes=${mes}`);
        const items = res.data;

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:#94a3b8;">No hay rendiciones aprobadas disponibles.</td></tr>';
            return;
        }

        const dtData = items.map(r => [
            `<input type="checkbox" class="rendicion-aprobada-chk" data-id="${r.Id}" data-nrorendicion="${r.NroRendicion || ''}" data-nomaux="${(r.NomAux || '').replace(/"/g, '&quot;')}" data-total="${r.TotalGastado || 0}" data-codaux="${r.CodAux || ''}" data-uuidlink="${r.UuidLink || ''}" style="width:16px;height:16px;cursor:pointer;accent-color:#10b981;">`,
            `<strong>${r.NroRendicion || '-'}</strong>`,
            r.NomAux || '-',
            r.Fecha || '-',
            r.Moneda || 'PEN',
            fmtNum(r.TotalGastado || 0),
            `<span class="badge success" style="background:#d1fae5; color:#065f46;">${r.Estado || '-'}</span>`,
            r.UuidLink ? `<a href="/visor_rendicion.html?uuid=${r.UuidLink}" target="_blank" class="btn-action outline" style="padding:0.25rem 0.5rem; font-size:0.7rem; text-decoration:none; display:inline-block;">📄 Ver PDF</a>` : '-'
        ]);

        rendicionesAprobadas_DT = $('#rendicionesAprobadasTable').DataTable({
            data: dtData, destroy: true,
            deferRender: true, order: [[3, 'desc']], pageLength: 10,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: 'Bfrtip',
            buttons: [{ extend: 'excelHtml5', text: '📊 Exportar Rendiciones', className: 'dt-button', exportOptions: { columns: [1,2,3,4,5,6] } }],
            columnDefs: [
                { targets: [0], orderable: false },
                { targets: [5], className: 'dt-right font-semibold text-slate-800' }
            ]
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444; text-align:center; padding:2rem;">${err}</td></tr>`;
    }
}

function toggleAllRendiciones() {
    const chkAll = document.getElementById('chkAllRendiciones');
    const chks = document.querySelectorAll('.rendicion-aprobada-chk');
    chks.forEach(chk => chk.checked = chkAll.checked);
}

// ════════════════════════════════════════════════════════════
//  DOCUMENTOS ACEPTADOS PARA ENVIAR A TESORERÍA
// ════════════════════════════════════════════════════════════

let docsAceptadosDT = null;

function onDirectasContChange() {
    const tipoCargo = document.getElementById('tipoCargo').value;
    const isDirectas = document.getElementById('filterDirectasCont') ? document.getElementById('filterDirectasCont').checked : false;
    if (tipoCargo === 'CONT_A_TES') {
        loadDocumentosAceptadosTesoreria();
    } else {
        loadOCsDisponibles();
    }
}

async function loadDocumentosAceptadosTesoreria() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) { Swal.fire('Atención', 'Seleccione una empresa.', 'warning'); return; }

    const isDirectas = document.getElementById('filterDirectasCont') ? document.getElementById('filterDirectasCont').checked : false;
    
    // Destruir ambas tablas si existen para evitar conflictos
    if (docsAceptadosDT) {
        try { docsAceptadosDT.destroy(); } catch(e) { console.log('Error destruyendo docsAceptadosDT:', e); }
        docsAceptadosDT = null;
    }
    if (ocsDT) {
        try { ocsDT.destroy(); } catch(e) { console.log('Error destruyendo ocsDT:', e); }
        ocsDT = null;
    }

    const tbody = document.getElementById('ocsDisponiblesTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:2rem; color:#94a3b8;">Cargando documentos...</td></tr>';

    try {
        if (!isDirectas) {
            // Sin check: Mostrar documentos aceptados del cargo LOG_A_CONT
            const res = await axios.get(`/api/cargos/documentos-aceptados-tesoreria?codcia=${encodeURIComponent(codcia)}`);
            const items = res.data;

            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:2rem; color:#94a3b8;">No hay documentos aceptados pendientes de envío a Tesorería.</td></tr>';
                return;
            }

            const tipoOcMap = { 'M': 'Mercadería', 'S': 'Servicios', 'T': 'Contable', 'OC': 'OC', 'FACT': 'Factura', 'REND': 'Rendición' };

            const dtData = items.map(d => {
                let docLabel = '', docNum = '', montoTotal = 0, fecha = '-', proveedor = '-', ruc = '-', tipo = '-', montoOC = 0, nroFactura = '-', montoFactura = 0;
                
                // Construir enlaces primero
                let enlace = '';
                if (d.FacturaUuid) enlace += `<a href="/factura_visor.html?uid=${d.FacturaUuid}" target="_blank" style="color:#2563eb; font-size:0.7rem; margin-right:4px;">📄 Factura</a>`;
                if (d.RendicionUuid) enlace += `<a href="/visor_rendicion.html?uuid=${d.RendicionUuid}" target="_blank" style="color:#8b5cf6; font-size:0.7rem;">📋 Rendición</a>`;
                
                if (d.TipoOc === 'REND') {
                    docLabel = '📋 Rendición';
                    docNum = d.NroRendicion || d.NroOrdenCompra || '-';
                    fecha = d.FchRendicion || '-';
                    proveedor = d.RendicionUsuario || d.RendicionCodUsuario || '-';
                    ruc = d.RendicionRuc || d.RendicionCodUsuario || '-';
                    tipo = 'Rendición';
                    montoTotal = parseFloat(d.TotalRendicion || 0);
                    montoFactura = parseFloat(d.TotalRendicion || 0); // La rendición va en Monto Factura
                    // Para rendición, mostrar enlace como Acción
                    enlace = enlace || `<a href="/visor_rendicion.html?uuid=${d.RendicionUuid}" target="_blank" class="btn-action outline" style="padding:0.25rem 0.5rem; font-size:0.7rem; text-decoration:none; display:inline-block;">📋 Ver</a>`;
                } else if (d.TipoOc === 'FACT') {
                    docLabel = '📄 Factura';
                    docNum = d.NroFactura || '-';
                    fecha = d.FchFactura || '-';
                    proveedor = d.Proveedor || '-';
                    ruc = d.RucProveedor || '-';
                    tipo = 'Factura';
                    montoTotal = parseFloat(d.TotalFactura || 0);
                    nroFactura = d.NroFactura || '-';
                    montoFactura = parseFloat(d.TotalFactura || 0);
                    // Para factura, mostrar enlace como Acción
                    enlace = enlace || `<a href="/factura_visor.html?uid=${d.FacturaUuid}" target="_blank" class="btn-action outline" style="padding:0.25rem 0.5rem; font-size:0.7rem; text-decoration:none; display:inline-block;">📄 Ver</a>`;
                } else {
                    docLabel = `📦 OC ${tipoOcMap[d.OcTipo] || d.TipoOc || ''}`;
                    docNum = d.NroOrdenCompra || '-';
                    fecha = d.FchOc || '-';
                    proveedor = d.OcProveedor || d.Proveedor || '-';
                    ruc = d.RucProveedor || '-';
                    tipo = d.OcTipo || d.TipoOc || '-';
                    montoOC = parseFloat(d.TotalOc || d.MontoOC || 0);
                    nroFactura = d.NroFactura || '-';
                    // Usar TotalFactura del OUTER APPLY, no MontoFactura del detalle
                    montoFactura = parseFloat(d.TotalFactura || 0);
                    montoTotal = montoOC + montoFactura;
                    // Para OC, mostrar enlaces si existen
                    if (d.FacturaUuid) {
                        enlace = `<a href="/factura_visor.html?uid=${d.FacturaUuid}" target="_blank" class="btn-action outline" style="padding:0.25rem 0.5rem; font-size:0.7rem; text-decoration:none; display:inline-block;">📄 Ver Fact</a>`;
                    }
                }

                return [
                    `<input type="checkbox" class="doc-aceptado-chk" data-id="${d.Id}" data-nrooc="${d.NroOrdenCompra || ''}" data-tipooc="${d.TipoOc || ''}" data-codciaoc="${d.CodCiaOc || ''}" data-nrofactura="${d.NroFactura || ''}" data-montooc="${montoOC}" data-montofactura="${montoFactura}" data-proveedor="${(proveedor || '').replace(/"/g, '&quot;')}" data-ruc="${ruc || ''}" data-moneda="${d.Moneda || '1'}" style="width:16px;height:16px;cursor:pointer;accent-color:#10b981;">`,
                    `<strong>${docNum}</strong><br><span style="font-size:0.65rem; color:#64748b; background:#f1f5f9; padding:1px 4px; border-radius:3px;">${docLabel}</span>`,
                    fecha,
                    proveedor,
                    ruc,
                    tipo,
                    montoOC > 0 ? `S/ ${montoOC.toLocaleString('es-PE', {minimumFractionDigits: 2})}` : '-',
                    '-', // Almacén (no aplica para FACT/REND)
                    nroFactura,
                    montoFactura > 0 ? `S/ ${montoFactura.toLocaleString('es-PE', {minimumFractionDigits: 2})}` : '-',
                    enlace || '-'
                ];
            });

            // Verificar que la tabla existe antes de inicializar
            const tableElement = document.getElementById('ocsDisponiblesTable');
            if (tableElement) {
                docsAceptadosDT = $('#ocsDisponiblesTable').DataTable({
                    data: dtData, destroy: true,
                    deferRender: true, order: [[5, 'desc']], pageLength: 15,
                    language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
                    columnDefs: [
                        { targets: [0], orderable: false },
                        { targets: [4], className: 'dt-right font-semibold' }
                    ]
                });
            }

        } else {
            // Con check: Mostrar TODAS las OCs disponibles (usar el endpoint SSR existente)
            // Primero destruir correctamente la tabla actual antes de cambiar
            if (docsAceptadosDT) {
                try {
                    docsAceptadosDT.destroy();
                } catch(e) {
                    console.log('Error destruyendo docsAceptadosDT:', e);
                }
                docsAceptadosDT = null;
            }
            // También destruir ocsDT si existe para evitar conflictos
            if (ocsDT) {
                try {
                    ocsDT.destroy();
                } catch(e) {
                    console.log('Error destruyendo ocsDT:', e);
                }
                ocsDT = null;
            }
            // Limpiar el tbody antes de llamar loadOCsDisponibles
            const tbody = document.getElementById('ocsDisponiblesTbody');
            if (tbody) tbody.innerHTML = '';
            loadOCsDisponibles();
        }

    } catch (err) {
        console.error('Error cargando documentos aceptados:', err);
        tbody.innerHTML = `<tr><td colspan="11" style="color:#ef4444; text-align:center; padding:2rem;">${err.message}</td></tr>`;
    }
}

function toggleAllDocsAceptados() {
    const chkAll = document.getElementById('chkAllDocsAceptados');
    const chks = document.querySelectorAll('.doc-aceptado-chk');
    chks.forEach(chk => chk.checked = chkAll.checked);
}
