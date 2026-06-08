/**
 * YELAVE ERP – Auditoría de Comprobantes (Ventas y Guías de Remisión)
 * Frontend logic: filters, data tables, sorting, pagination,
 * Excel / PDF export, and simulated SUNAT receipt visualizer.
 */

// ─── State ───────────────────────────────────────────────────────
let salesData = [];       // Raw sales data from API
let guiasData = [];       // Raw guías data from API
let empresasMap = {};     // Map codcia -> { nomcia, ruccia }

let activeTab = 'ventas'; // 'ventas' or 'guias'
let currentCia = '';
let currentYear = '';
let currentMonth = '';

// DataTable Instances
let salesDataTable = null;
let guiasDataTable = null;

const fmt = (n) => new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const getCurrencySymbol = (codmon) => parseInt(codmon) === 2 ? '$' : 'S/';

// ─── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadEmpresas();

    // Form Query submission
    document.getElementById('auditForm').addEventListener('submit', (e) => {
        e.preventDefault();
        loadData();
    });

    // Search input with simple debounce
    document.getElementById('tableSearch').addEventListener('input', debounce(applySearch, 250));

    // Tab tracking
    document.getElementById('tab-ventas').addEventListener('click', () => {
        activeTab = 'ventas';
        applySearch();
    });
    document.getElementById('tab-guias').addEventListener('click', () => {
        activeTab = 'guias';
        applySearch();
    });

    // Bind column-specific filters
    $('#salesTable thead').on('keyup change', '.column-filter', function () {
        const colIdx = $(this).closest('th').index();
        if (salesDataTable) {
            salesDataTable.column(colIdx).search(this.value).draw();
        }
    });

    $('#guiasTable thead').on('keyup change', '.column-filter', function () {
        const colIdx = $(this).closest('th').index();
        if (guiasDataTable) {
            guiasDataTable.column(colIdx).search(this.value).draw();
        }
    });
});

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── Load Empresas ───────────────────────────────────────────────
async function loadEmpresas() {
    const token = localStorage.getItem('yelave_token');
    try {
        const res = await fetch('/api/permisos/empresas/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const empresas = await res.json();
        const sel = document.getElementById('filterCia');
        sel.innerHTML = '';
        
        if (empresas.length === 0) {
            sel.innerHTML = '<option value="">Sin acceso a empresas</option>';
            return;
        }

        empresas.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.codcia;
            opt.textContent = `${e.codcia} - ${e.nomcia}`;
            sel.appendChild(opt);
            
            // Populate empresasMap for Sunat Visualizer headers
            empresasMap[e.codcia] = {
                nomcia: e.nomcia,
                ruccia: e.ruccia
            };
        });

        // Initialize Select2
        $('#filterCia').select2({ width: '100%' });

        // Set default values (Company 007 if exists, otherwise first)
        const has007 = empresas.some(e => e.codcia === '007');
        if (has007) {
            $('#filterCia').val('007').trigger('change');
        } else {
            $('#filterCia').val(empresas[0].codcia).trigger('change');
        }

        // Trigger first loading of the data
        loadData();
    } catch (err) {
        console.error('Error cargando empresas:', err);
        alert('Error al cargar la lista de empresas');
    }
}

// ─── Fetch Data ──────────────────────────────────────────────────
async function loadData() {
    const cia = document.getElementById('filterCia').value;
    const year = document.getElementById('filterYear').value;
    const month = document.getElementById('filterMonth').value;

    if (!cia) {
        alert('Por favor, seleccione una empresa.');
        return;
    }

    currentCia = cia;
    currentYear = year;
    currentMonth = month;

    showLoader(true);
    const token = localStorage.getItem('yelave_token');

    try {
        const [ventasRes, guiasRes] = await Promise.all([
            fetch(`/api/auditoria-comprobantes/ventas?codcia=${cia}&year=${year}&month=${month}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`/api/auditoria-comprobantes/guias?codcia=${cia}&year=${year}&month=${month}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        if (!ventasRes.ok) throw new Error(`Ventas HTTP ${ventasRes.status}`);
        if (!guiasRes.ok) throw new Error(`Guías HTTP ${guiasRes.status}`);

        salesData = await ventasRes.json();
        guiasData = await guiasRes.json();

        // Clear search inputs
        document.getElementById('tableSearch').value = '';
        document.querySelectorAll('.column-filter').forEach(inp => inp.value = '');

        // Render tables
        renderSalesTable();
        renderGuiasTable();
        updateKPIs();
    } catch (err) {
        console.error(err);
        alert('Error al consultar comprobantes: ' + err.message);
    } finally {
        showLoader(false);
    }
}

function showLoader(show) {
    document.getElementById('loaderOverlay').classList.toggle('active', show);
}

// ─── Apply Search Query ──────────────────────────────────────────
function applySearch() {
    const query = (document.getElementById('tableSearch').value || '').trim();
    if (salesDataTable) {
        salesDataTable.search(query).draw();
    }
    if (guiasDataTable) {
        guiasDataTable.search(query).draw();
    }
}

// ─── Update KPI Panels ───────────────────────────────────────────
function updateKPIs() {
    // 1. VENTAS KPIs
    const activeSales = salesData.filter(r => r.flgest !== 'E');
    const totalSoles = activeSales.reduce((sum, r) => sum + (parseInt(r.codmon) === 1 ? (r.imptot || 0) : 0), 0);
    const totalUsd = activeSales.reduce((sum, r) => sum + (parseInt(r.codmon) === 2 ? (r.imptot || 0) : 0), 0);
    
    document.getElementById('kpiSalesTotal').textContent = `S/ ${fmt(totalSoles)}`;
    document.getElementById('kpiSalesTotalSub').textContent = `S/ ${fmt(totalSoles)} + $ ${fmt(totalUsd)}`;

    const totalSalesDocs = salesData.length;
    document.getElementById('kpiSalesCount').textContent = totalSalesDocs;
    
    const factCount = salesData.filter(r => r.coddoc === 'FACT').length;
    const boleCount = salesData.filter(r => r.coddoc === 'BOLE').length;
    const ncrCount = salesData.filter(r => r.coddoc === 'N/CR' || r.coddoc === 'N/A' || r.coddoc === 'N/C').length;
    document.getElementById('kpiSalesCountSub').textContent = `${factCount} FACT + ${boleCount} BOLE + ${ncrCount} N/C`;

    const detracCount = activeSales.filter(r => r.detrac === true || r.detrac === 1 || String(r.detrac).toLowerCase() === 'true').length;
    document.getElementById('kpiSalesDetrac').textContent = detracCount;
    document.getElementById('kpiSalesDetracSub').textContent = `${detracCount} comprobantes afectos`;

    const salesAnulados = salesData.filter(r => r.flgest === 'E').length;
    const salesAnulPct = totalSalesDocs > 0 ? ((salesAnulados / totalSalesDocs) * 100).toFixed(1) : '0.0';
    document.getElementById('kpiSalesAnul').textContent = salesAnulados;
    document.getElementById('kpiSalesAnulSub').textContent = `${salesAnulPct}% de anulación ERP`;

    // 2. GUIAS KPIs
    const totalGuias = guiasData.length;
    document.getElementById('kpiGuiasCount').textContent = totalGuias;
    document.getElementById('kpiGuiasCountSub').textContent = `Total guías en el mes`;

    // Success if URL/url is not empty
    const guiasSuccess = guiasData.filter(r => r.url && r.url.trim() !== '').length;
    document.getElementById('kpiGuiasExito').textContent = guiasSuccess;
    document.getElementById('kpiGuiasExitoSub').textContent = `Enviadas correctamente`;

    // Error if URL is empty AND (Resultado or Respuesta has content)
    const guiasError = guiasData.filter(r => (!r.url || r.url.trim() === '') && ((r.RESULTADO && r.RESULTADO.trim() !== '') || (r.RESPUESTA && r.RESPUESTA.trim() !== ''))).length;
    document.getElementById('kpiGuiasError').textContent = guiasError;
    document.getElementById('kpiGuiasErrorSub').textContent = `Errores de validación`;

    const guiasAnuladas = guiasData.filter(r => r.flgest === 'E').length;
    document.getElementById('kpiGuiasAnul').textContent = guiasAnuladas;
    document.getElementById('kpiGuiasAnulSub').textContent = `Estado E`;
}

// ─── Render Sales Table ──────────────────────────────────────────
function renderSalesTable() {
    if (salesDataTable) {
        salesDataTable.destroy();
        salesDataTable = null;
    }

    const tbody = document.getElementById('salesTableBody');
    if (salesData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" class="text-center py-4 text-muted">No se encontraron comprobantes de venta</td></tr>';
        document.getElementById('salesTableInfo').textContent = `Mostrando 0 comprobantes`;
        return;
    }

    tbody.innerHTML = salesData.map(r => {
        const sym = getCurrencySymbol(r.codmon);
        const fch = r.fchdoc ? r.fchdoc.slice(0, 10) : '';
        
        let tdBadge = '';
        if (r.coddoc === 'FACT') tdBadge = '<span class="badge bg-primary">FACT</span>';
        else if (r.coddoc === 'BOLE') tdBadge = '<span class="badge bg-info text-dark">BOLE</span>';
        else if (r.coddoc === 'N/CR' || r.coddoc === 'N/A' || r.coddoc === 'N/C') tdBadge = `<span class="badge bg-warning text-dark">${r.coddoc.trim()}</span>`;
        else tdBadge = `<span class="badge bg-secondary">${r.coddoc}</span>`;

        const isDetrac = r.detrac === true || r.detrac === 1 || String(r.detrac).toLowerCase() === 'true';
        const detracBadge = isDetrac 
            ? '<span class="badge bg-warning text-dark" style="font-size:0.7rem;">SÍ</span>' 
            : '<span class="text-muted" style="font-size:0.7rem;">NO</span>';

        // SUNAT status mapping
        let sunatStatusHtml = '';
        if (r.URL) {
            sunatStatusHtml = `<a href="${r.URL}" target="_blank" class="btn btn-sm btn-link text-accent p-0" style="text-decoration:none;">
                <i class="fas fa-external-link-alt me-1"></i>Aceptado
            </a>`;
        } else if (r.RESPUESTA) {
            sunatStatusHtml = `<span class="text-danger" title="${r.RESPUESTA.replace(/"/g, '&quot;')}" style="font-size:0.8rem; cursor:pointer;">
                <i class="fas fa-exclamation-circle me-1"></i>Rechazado/Error
            </span>`;
        } else {
            sunatStatusHtml = `<span class="text-warning" style="font-size:0.8rem;">
                <i class="fas fa-clock me-1"></i>Pendiente
            </span>`;
        }

        // ERP status mapping
        const erpBadge = r.flgest === 'E' 
            ? '<span class="badge bg-danger" style="font-size:0.7rem;">Anulado</span>' 
            : '<span class="badge bg-success" style="font-size:0.7rem;">Emitido</span>';

        return `<tr data-nrodoc="${r.nrodoc}" data-coddoc="${r.coddoc}">
            <td>${r.codcia}</td>
            <td>${fch}</td>
            <td class="text-center">${tdBadge}</td>
            <td><strong>${r.nrodoc}</strong></td>
            <td>
                <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary);">${r.nomaux}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${r.rucaux}</div>
            </td>
            <td class="text-right">${sym} ${fmt(r.impnet)}</td>
            <td class="text-right">${sym} ${fmt(r.impigv)}</td>
            <td class="text-right" style="font-weight:600; color:var(--text-primary);">${sym} ${fmt(r.imptot)}</td>
            <td class="text-center text-muted" style="font-size:0.8rem;">${r.nroped || '-'}</td>
            <td class="text-center text-muted" style="font-size:0.8rem;">${r.nroref || '-'}</td>
            <td class="text-center">${detracBadge}</td>
            <td>${sunatStatusHtml}</td>
            <td class="text-center">${erpBadge}</td>
            <td class="text-center">
                <div class="d-flex justify-content-center gap-1">
                    <button class="btn btn-glass btn-sm px-2" onclick="showVentaDetail('${r.coddoc}', '${r.nrodoc}')" style="color:var(--accent); font-size:0.75rem;" title="Ver Detalle XML/SUNAT">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-glass btn-sm px-2" onclick="showVentaPayments('${r.coddoc}', '${r.nrodoc}')" style="color:#10b981; font-size:0.75rem;" title="Ver Historial de Pagos y Saldo">
                        <i class="fas fa-money-bill-wave"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    // Initialize DataTable
    salesDataTable = $('#salesTable').DataTable({
        pageLength: 20,
        lengthMenu: [10, 20, 50, 100],
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.8/i18n/es-ES.json'
        },
        order: [], // Keep backend sorting
        searching: true,
        paging: true,
        info: true,
        autoWidth: false,
        columnDefs: [
            { targets: [13], orderable: false }
        ],
        dom: 'rtip'
    });

    // Update table info and KPIs dynamically on draw (search, paginate, filter)
    salesDataTable.on('draw', () => {
        const filteredCount = salesDataTable.rows({ filter: 'applied' }).count();
        document.getElementById('salesTableInfo').textContent = `Mostrando ${filteredCount} comprobantes`;
        updateKPIsFromFiltered();
    });

    // Initial table info count
    document.getElementById('salesTableInfo').textContent = `Mostrando ${salesData.length} comprobantes`;
}

// ─── Render Guias Table ──────────────────────────────────────────
function renderGuiasTable() {
    if (guiasDataTable) {
        guiasDataTable.destroy();
        guiasDataTable = null;
    }

    const tbody = document.getElementById('guiasTableBody');
    if (guiasData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-muted">No se encontraron guías de remisión</td></tr>';
        document.getElementById('guiasTableInfo').textContent = `Mostrando 0 guías`;
        return;
    }

    tbody.innerHTML = guiasData.map(r => {
        const fch = r.fchdoc ? r.fchdoc.slice(0, 10) : '';
        
        let pathHtml = `<div style="font-size:0.78rem;" title="Partida: ${r.ptopar}"><strong>P:</strong> ${(r.ptopar || '').substring(0, 35)}...</div>
                        <div style="font-size:0.78rem; color:var(--text-muted);" title="Llegada: ${r.ptolle}"><strong>L:</strong> ${(r.ptolle || '').substring(0, 35)}...</div>`;

        let carrierHtml = r.nomtra 
            ? `<div style="font-weight:500; font-size:0.8rem;">${r.nomtra}</div>
               <div style="font-size:0.72rem; color:var(--text-muted);">${r.codtra || ''}</div>`
            : '<span class="text-muted">-</span>';

        let driverHtml = r.nomcho
            ? `<div style="font-weight:500; font-size:0.8rem;">${r.nomcho}</div>
               <div style="font-size:0.72rem; color:var(--text-muted);">DNI: ${r.dni || ''} | Placa: ${r.nrovehi || ''}</div>`
            : '<span class="text-muted">-</span>';

        let refDocHtml = '';
        if (r.nroped && r.nroped.trim() !== '') refDocHtml += `<div style="font-size:0.75rem;">Ped: ${r.nroped}</div>`;
        if (r.nrofac && r.nrofac.trim() !== '') refDocHtml += `<div style="font-size:0.75rem; font-weight:600; color:var(--accent);">Fac: ${r.nrofac}</div>`;
        if (!refDocHtml) refDocHtml = '<span class="text-muted">-</span>';

        // SUNAT status mapping
        let sunatStatusHtml = '';
        if (r.url) {
            sunatStatusHtml = `<a href="${r.url}" target="_blank" class="btn btn-sm btn-link text-accent p-0" style="text-decoration:none;">
                <i class="fas fa-external-link-alt me-1"></i>Aceptado
            </a>`;
        } else if (r.RESULTADO || r.RESPUESTA) {
            const errInfo = r.RESULTADO || r.RESPUESTA || '';
            sunatStatusHtml = `<span class="text-danger" title="${errInfo.replace(/"/g, '&quot;')}" style="font-size:0.8rem; cursor:pointer;">
                <i class="fas fa-exclamation-circle me-1"></i>Rechazado/Error
            </span>`;
        } else {
            sunatStatusHtml = `<span class="text-warning" style="font-size:0.8rem;">
                <i class="fas fa-clock me-1"></i>Pendiente
            </span>`;
        }

        // ERP status mapping
        const erpBadge = r.flgest === 'E' 
            ? '<span class="badge bg-danger" style="font-size:0.7rem;">Anulado</span>' 
            : '<span class="badge bg-success" style="font-size:0.7rem;">Emitido</span>';

        return `<tr data-nrodoc="${r.nrodoc}">
            <td>${r.codcia}</td>
            <td>${fch}</td>
            <td><strong>${r.nrodoc}</strong></td>
            <td>
                <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary);">${r.nomaux}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${r.rucaux}</div>
            </td>
            <td>${pathHtml}</td>
            <td>${carrierHtml}</td>
            <td>${driverHtml}</td>
            <td class="text-center">${refDocHtml}</td>
            <td>${sunatStatusHtml}</td>
            <td class="text-center">${erpBadge}</td>
            <td class="text-center">
                <button class="btn btn-glass btn-sm px-2" onclick="showGuiaDetail('${r.nrodoc}')" style="color:var(--accent); font-size:0.75rem;">
                    <i class="fas fa-eye me-1"></i>Ver
                </button>
            </td>
        </tr>`;
    }).join('');

    // Initialize DataTable
    guiasDataTable = $('#guiasTable').DataTable({
        pageLength: 20,
        lengthMenu: [10, 20, 50, 100],
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.8/i18n/es-ES.json'
        },
        order: [], // Keep backend sorting
        searching: true,
        paging: true,
        info: true,
        autoWidth: false,
        columnDefs: [
            { targets: [10], orderable: false }
        ],
        dom: 'rtip'
    });

    // Update table info and KPIs dynamically on draw (search, paginate, filter)
    guiasDataTable.on('draw', () => {
        const filteredCount = guiasDataTable.rows({ filter: 'applied' }).count();
        document.getElementById('guiasTableInfo').textContent = `Mostrando ${filteredCount} guías`;
        updateKPIsFromFiltered();
    });

    // Initial table info count
    document.getElementById('guiasTableInfo').textContent = `Mostrando ${guiasData.length} guías`;
}

// DataTables handles sorting natively

// ─── Detail Modals Visualizers ───────────────────────────────────
async function showVentaDetail(coddoc, nrodoc) {
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = `Visualizador de Comprobante de Venta`;
    modalBody.innerHTML = `
        <div class="text-center py-5">
            <div class="loader-ring mx-auto mb-3"></div>
            <div class="text-muted">Cargando detalles del comprobante...</div>
        </div>
    `;
    modal.classList.add('active');

    const token = localStorage.getItem('yelave_token');
    try {
        const res = await fetch(`/api/auditoria-comprobantes/ventas/detail?codcia=${currentCia}&coddoc=${encodeURIComponent(coddoc)}&nrodoc=${encodeURIComponent(nrodoc)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        const h = data.header;
        const items = data.items;
        const sym = getCurrencySymbol(h.codmon);
        const fch = h.fchdoc ? h.fchdoc.slice(0, 10) : '';

        // Get company data
        const ciaInfo = empresasMap[currentCia] || { nomcia: 'YELAVE NATURE S.A.C.', ruccia: '20507801634' };
        
        let docName = 'FACTURA ELECTRÓNICA';
        if (h.coddoc === 'BOLE') docName = 'BOLETA DE VENTA ELECTRÓNICA';
        else if (h.coddoc === 'N/CR' || h.coddoc === 'N/A' || h.coddoc === 'N/C') docName = 'NOTA DE CRÉDITO ELECTRÓNICA';

        // Build QR content
        const qrContent = `${ciaInfo.ruccia}|${h.coddoc}|${h.nrodoc}|${h.impigv}|${h.imptot}|${fch}|${h.rucaux}|`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qrContent)}`;

        let html = `
            <div class="sunat-doc">
                <div class="sunat-header">
                    <div class="sunat-header-left">
                        <h3 style="margin:0 0 0.5rem 0; color:#1e3a8a; font-family:'Outfit', sans-serif; font-weight:800; font-size:1.5rem;">${ciaInfo.nomcia}</h3>
                        <p style="margin:0; color:#475569; font-size:0.8rem;">Calle Los Geranios 329, Urb. Jardín, Lince, Lima</p>
                        <p style="margin:0; color:#475569; font-size:0.8rem;">Teléfono: (01) 421-2290 | Email: ventas@yelave.org.pe</p>
                    </div>
                    <div class="sunat-header-ruc">
                        <h4>R.U.C. N° ${ciaInfo.ruccia}</h4>
                        <div class="doc-type">${docName}</div>
                        <div class="doc-num">${h.nrodoc}</div>
                    </div>
                </div>

                <div class="sunat-grid">
                    <div class="sunat-panel">
                        <h5>Datos del Adquiriente</h5>
                        <div class="sunat-row"><strong>Cliente:</strong> <span>${h.nomaux}</span></div>
                        <div class="sunat-row"><strong>R.U.C./D.N.I.:</strong> <span>${h.rucaux}</span></div>
                        <div class="sunat-row"><strong>Dirección:</strong> <span>${h.diraux || '-'}</span></div>
                    </div>
                    <div class="sunat-panel">
                        <h5>Información General</h5>
                        <div class="sunat-row"><strong>Fecha Emisión:</strong> <span>${fch}</span></div>
                        <div class="sunat-row"><strong>Moneda:</strong> <span>${parseInt(h.codmon) === 2 ? 'DÓLARES AMERICANOS (USD)' : 'SOLES (PEN)'}</span></div>
                        <div class="sunat-row"><strong>Forma de Pago:</strong> <span>${h.nompgo || 'CONTADO'}</span></div>
                        <div class="sunat-row"><strong>Vendedor:</strong> <span>${h.nomven || '-'}</span></div>
                    </div>
                </div>

                <table class="sunat-table">
                    <thead>
                        <tr>
                            <th style="width: 8%;">Cant.</th>
                            <th style="width: 10%;">U.M.</th>
                            <th style="width: 15%;">Código</th>
                            <th>Descripción</th>
                            <th style="width: 12%; text-align:right;">P. Unit.</th>
                            <th style="width: 12%; text-align:right;">Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(itm => `
                            <tr>
                                <td>${fmt(itm.candes)}</td>
                                <td>${itm.undvta || 'UND'}</td>
                                <td>${itm.codmat || '-'}</td>
                                <td>${itm.desmat}</td>
                                <td class="text-right">${fmt(itm.preuni)}</td>
                                <td class="text-right">${fmt(itm.implin)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
        `;

        // Detracción Warning
        const isDetrac = h.detrac === true || h.detrac === 1 || String(h.detrac).toLowerCase() === 'true';
        if (isDetrac) {
            html += `
                <div style="background:#fef3c7; border:1px solid #f59e0b; border-radius:6px; padding:0.75rem; margin-bottom:1.5rem; color:#b45309; font-size:0.78rem;">
                    <i class="fas fa-exclamation-triangle me-1"></i>
                    <strong>Operación sujeta al Sistema de Pago de Obligaciones Tributarias (SPOT) - Detracción</strong>
                </div>
            `;
        }

        html += `
                <div class="sunat-footer">
                    <div style="display:flex; gap:1.25rem; align-items:center; flex:1;">
                        <img src="${qrUrl}" alt="QR Sunat" style="border:1px solid #cbd5e1; padding:4px; background:#fff; border-radius:4px;">
                        <div style="display:flex; flex-direction:column; gap:0.25rem;">
                            <div class="sunat-hash-box">
                                <strong>HASH:</strong> ${h.UUID || 'Pendiente de firma/envío'}
                            </div>
                            <div style="font-size:0.7rem; color:#64748b;">
                                Representación impresa del Comprobante de Pago Electrónico. Consulta en: ${h.URL || 'No disponible'}
                            </div>
                        </div>
                    </div>
                    <div class="sunat-totals">
                        <div class="sunat-total-row">
                            <span>Op. Gravada:</span>
                            <span>${sym} ${fmt(h.impnet)}</span>
                        </div>
                        <div class="sunat-total-row">
                            <span>I.G.V. (18.00%):</span>
                            <span>${sym} ${fmt(h.impigv)}</span>
                        </div>
                        <div class="sunat-total-row grand-total">
                            <span>TOTAL:</span>
                            <span>${sym} ${fmt(h.imptot)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modalBody.innerHTML = html;
    } catch (err) {
        console.error(err);
        modalBody.innerHTML = `
            <div class="alert alert-danger m-4">
                <i class="fas fa-exclamation-triangle me-2"></i>Error al cargar el detalle del comprobante: ${err.message}
            </div>
        `;
    }
}

async function showGuiaDetail(nrodoc) {
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = `Visualizador de Guía de Remisión`;
    modalBody.innerHTML = `
        <div class="text-center py-5">
            <div class="loader-ring mx-auto mb-3"></div>
            <div class="text-muted">Cargando detalles de la guía...</div>
        </div>
    `;
    modal.classList.add('active');

    const token = localStorage.getItem('yelave_token');
    try {
        const res = await fetch(`/api/auditoria-comprobantes/guias/${nrodoc}/detail?codcia=${currentCia}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        const h = data.header;
        const items = data.items;
        const fch = h.fchdoc ? h.fchdoc.slice(0, 10) : '';

        // Get company data
        const ciaInfo = empresasMap[currentCia] || { nomcia: 'YELAVE NATURE S.A.C.', ruccia: '20507801634' };

        // Build QR
        const qrContent = `${ciaInfo.ruccia}|09|${h.nrodoc}|0|0|${fch}|${h.rucaux}|`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qrContent)}`;

        let html = `
            <div class="sunat-doc">
                <div class="sunat-header">
                    <div class="sunat-header-left">
                        <h3 style="margin:0 0 0.5rem 0; color:#1e3a8a; font-family:'Outfit', sans-serif; font-weight:800; font-size:1.5rem;">${ciaInfo.nomcia}</h3>
                        <p style="margin:0; color:#475569; font-size:0.8rem;">Calle Los Geranios 329, Urb. Jardín, Lince, Lima</p>
                        <p style="margin:0; color:#475569; font-size:0.8rem;">Teléfono: (01) 421-2290 | Email: logistica@yelave.org.pe</p>
                    </div>
                    <div class="sunat-header-ruc">
                        <h4>R.U.C. N° ${ciaInfo.ruccia}</h4>
                        <div class="doc-type">GUÍA DE REMISIÓN REMITENTE</div>
                        <div class="doc-num">${h.nrodoc}</div>
                    </div>
                </div>

                <div class="sunat-grid">
                    <div class="sunat-panel" style="grid-column: span 2;">
                        <h5>Puntos de Partida / Llegada</h5>
                        <div class="sunat-row"><strong>Pto. Partida:</strong> <span>${h.ptopar || '-'}</span></div>
                        <div class="sunat-row"><strong>Pto. Llegada:</strong> <span>${h.ptolle || '-'}</span></div>
                    </div>
                </div>

                <div class="sunat-grid">
                    <div class="sunat-panel">
                        <h5>Datos del Destinatario</h5>
                        <div class="sunat-row"><strong>Razón Social:</strong> <span>${h.nomaux}</span></div>
                        <div class="sunat-row"><strong>R.U.C./D.N.I.:</strong> <span>${h.rucaux}</span></div>
                    </div>
                    <div class="sunat-panel">
                        <h5>Información de Traslado</h5>
                        <div class="sunat-row"><strong>Fecha Traslado:</strong> <span>${fch}</span></div>
                        <div class="sunat-row"><strong>Doc. Referencia:</strong> <span>${h.nrofac ? 'FAC ' + h.nrofac : (h.nroped ? 'PED ' + h.nroped : '-')}</span></div>
                    </div>
                </div>

                <div class="sunat-grid">
                    <div class="sunat-panel">
                        <h5>Datos del Transportista</h5>
                        <div class="sunat-row"><strong>Transportista:</strong> <span>${h.nomtra || 'TRANSPORTE PRIVADO'}</span></div>
                        <div class="sunat-row"><strong>R.U.C.:</strong> <span>${h.ructra || '-'}</span></div>
                    </div>
                    <div class="sunat-panel">
                        <h5>Datos del Conductor / Vehículo</h5>
                        <div class="sunat-row"><strong>Conductor:</strong> <span>${h.nomcho || '-'}</span></div>
                        <div class="sunat-row"><strong>D.N.I.:</strong> <span>${h.dni || '-'}</span></div>
                        <div class="sunat-row"><strong>N° Licencia:</strong> <span>${h.nrobre || '-'}</span></div>
                        <div class="sunat-row"><strong>Placa Vehículo:</strong> <span>${h.nrovehi || '-'}</span></div>
                    </div>
                </div>

                <table class="sunat-table">
                    <thead>
                        <tr>
                            <th style="width: 10%;">Item</th>
                            <th style="width: 20%;">Código</th>
                            <th>Descripción</th>
                            <th style="width: 15%;">U.M.</th>
                            <th style="width: 15%; text-align:right;">Cantidad</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(itm => `
                            <tr>
                                <td>${parseInt(itm.nroitm) + 1}</td>
                                <td>${itm.codmat || '-'}</td>
                                <td>${itm.desmat}</td>
                                <td>${itm.undstk || 'UND'}</td>
                                <td class="text-right">${fmt(itm.candes)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="sunat-footer">
                    <div style="display:flex; gap:1.25rem; align-items:center; width:100%;">
                        <img src="${qrUrl}" alt="QR Sunat" style="border:1px solid #cbd5e1; padding:4px; background:#fff; border-radius:4px;">
                        <div style="display:flex; flex-direction:column; gap:0.25rem; flex:1;">
                            <div class="sunat-hash-box">
                                <strong>TICKET/RESPUESTA:</strong> ${h.RESULTADO || h.RESPUESTA || 'Pendiente de firma/envío'}
                            </div>
                            <div style="font-size:0.7rem; color:#64748b;">
                                Representación impresa de la Guía de Remisión Remitente Electrónica. Consulta en: ${h.url || 'No disponible'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modalBody.innerHTML = html;
    } catch (err) {
        console.error(err);
        modalBody.innerHTML = `
            <div class="alert alert-danger m-4">
                <i class="fas fa-exclamation-triangle me-2"></i>Error al cargar el detalle de la guía: ${err.message}
            </div>
        `;
    }
}

// ─── Modal Close Helper ──────────────────────────────────────────
function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('active');
}

// ─── Excel Exports ───────────────────────────────────────────────
window.exportSalesExcel = function() {
    const dataToExport = getFilteredSalesData();
    if (dataToExport.length === 0) return alert('No hay ventas para exportar');
    
    const rows = dataToExport.map(r => ({
        'Empresa': r.codcia,
        'Fecha': r.fchdoc ? r.fchdoc.slice(0, 10) : '',
        'T.D.': r.coddoc,
        'Documento': r.nrodoc,
        'RUC Aux': r.rucaux,
        'Cliente': r.nomaux,
        'Moneda': parseInt(r.codmon) === 2 ? 'USD' : 'PEN',
        'Imp. Neto': r.impnet,
        'IGV': r.impigv,
        'Total': r.imptot,
        'Pedido': r.nroped || '',
        'Guía Ref': r.nroref || '',
        'Detracción': (r.detrac === true || r.detrac === 1 || String(r.detrac).toLowerCase() === 'true') ? 'SÍ' : 'NO',
        'Estado ERP': r.flgest === 'E' ? 'Anulado' : 'Emitido',
        'URL SUNAT': r.URL || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoria_Ventas');
    
    // Auto-size columns slightly
    ws['!cols'] = [
        { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 15 },
        { wch: 40 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 40 }
    ];

    XLSX.writeFile(wb, `Reporte_Ventas_Auditoria_${currentCia}_${currentYear}_${currentMonth}.xlsx`);
};

window.exportGuiasExcel = function() {
    const dataToExport = getFilteredGuiasData();
    if (dataToExport.length === 0) return alert('No hay guías para exportar');

    const rows = dataToExport.map(r => ({
        'Empresa': r.codcia,
        'Fecha': r.fchdoc ? r.fchdoc.slice(0, 10) : '',
        'Guía': r.nrodoc,
        'RUC Destinatario': r.rucaux,
        'Destinatario': r.nomaux,
        'Partida': r.ptopar || '',
        'Llegada': r.ptolle || '',
        'Transportista': r.nomtra || '',
        'Vehículo': r.nrovehi || '',
        'Conductor': r.nomcho || '',
        'DNI Conductor': r.dni || '',
        'Ped / Fac': (r.nrofac ? 'FAC ' + r.nrofac : (r.nroped ? 'PED ' + r.nroped : '')),
        'Estado ERP': r.flgest === 'E' ? 'Anulado' : 'Emitido',
        'URL SUNAT': r.url || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoria_Guias');

    ws['!cols'] = [
        { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 40 },
        { wch: 30 }, { wch: 30 }, { wch: 35 }, { wch: 12 }, { wch: 25 },
        { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 40 }
    ];

    XLSX.writeFile(wb, `Reporte_Guias_Auditoria_${currentCia}_${currentYear}_${currentMonth}.xlsx`);
};

// ─── PDF Exports ─────────────────────────────────────────────────
window.exportSalesPDF = function() {
    const dataToExport = getFilteredSalesData();
    if (dataToExport.length === 0) return alert('No hay ventas para exportar');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Reporte de Ventas - Auditoría de Comprobantes`, 14, 15);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Filtros: Cia: ${currentCia} | Año: ${currentYear} | Mes: ${currentMonth}`, 14, 20);

    const head = [['Empresa', 'Fecha', 'T.D.', 'Serie-Nro', 'Cliente', 'Mon', 'Neto', 'IGV', 'Total', 'Detrac.', 'Sunat', 'ERP']];
    const dataRows = dataToExport.map(r => [
        r.codcia,
        r.fchdoc ? r.fchdoc.slice(0, 10) : '',
        r.coddoc,
        r.nrodoc,
        (r.nomaux || '').substring(0, 45),
        parseInt(r.codmon) === 2 ? 'USD' : 'PEN',
        fmt(r.impnet),
        fmt(r.impigv),
        fmt(r.imptot),
        (r.detrac === true || r.detrac === 1 || String(r.detrac).toLowerCase() === 'true') ? 'SÍ' : 'NO',
        r.URL ? 'Aceptado' : (r.RESPUESTA ? 'Error' : 'Pendiente'),
        r.flgest === 'E' ? 'Anulado' : 'Emitido'
    ]);

    // Add totals row
    const activeSales = dataToExport.filter(r => r.flgest !== 'E');
    const totPen = activeSales.reduce((sum, r) => sum + (parseInt(r.codmon) === 1 ? (r.imptot || 0) : 0), 0);
    const totUsd = activeSales.reduce((sum, r) => sum + (parseInt(r.codmon) === 2 ? (r.imptot || 0) : 0), 0);
    
    dataRows.push([
        '', '', '', '', 'TOTALES ACTIVOS', '', '', '', 
        `S/ ${fmt(totPen)}\n$ ${fmt(totUsd)}`, 
        '', '', ''
    ]);

    doc.autoTable({
        head: head,
        body: dataRows,
        startY: 25,
        theme: 'striped',
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        columnStyles: {
            6: { halign: 'right' },
            7: { halign: 'right' },
            8: { halign: 'right', fontStyle: 'bold' }
        },
        willDrawCell: function(data) {
            if (data.row.section === 'body' && String(data.row.raw[4] || '') === 'TOTALES ACTIVOS') {
                doc.setFillColor(230, 230, 240);
                doc.setFont('', 'bold');
            }
        }
    });

    doc.save(`Reporte_Ventas_Auditoria_${currentCia}_${currentYear}_${currentMonth}.pdf`);
};

window.exportGuiasPDF = function() {
    const dataToExport = getFilteredGuiasData();
    if (dataToExport.length === 0) return alert('No hay guías para exportar');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Reporte de Guías de Remisión - Auditoría`, 14, 15);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Filtros: Cia: ${currentCia} | Año: ${currentYear} | Mes: ${currentMonth}`, 14, 20);

    const head = [['Empresa', 'Fecha', 'N° Guía', 'Destinatario', 'Partida', 'Llegada', 'Vehículo/Placa', 'Chofer/DNI', 'Fac/Ped', 'Sunat', 'ERP']];
    const dataRows = dataToExport.map(r => [
        r.codcia,
        r.fchdoc ? r.fchdoc.slice(0, 10) : '',
        r.nrodoc,
        (r.nomaux || '').substring(0, 35),
        (r.ptopar || '').substring(0, 30),
        (r.ptolle || '').substring(0, 30),
        r.nrovehi || '-',
        (r.nomcho || '').substring(0, 20),
        (r.nrofac ? 'FAC ' + r.nrofac : (r.nroped ? 'PED ' + r.nroped : '')),
        r.url ? 'Aceptado' : ((r.RESULTADO || r.RESPUESTA) ? 'Error' : 'Pendiente'),
        r.flgest === 'E' ? 'Anulado' : 'Emitido'
    ]);

    doc.autoTable({
        head: head,
        body: dataRows,
        startY: 25,
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.5 }
    });

    doc.save(`Reporte_Guias_Auditoria_${currentCia}_${currentYear}_${currentMonth}.pdf`);
};

// ─── Filtered Data Helpers & Dynamic KPIs ──────────────────────────
function getFilteredSalesData() {
    if (!salesDataTable) return salesData;
    const visibleRows = salesDataTable.rows({ filter: 'applied' }).nodes().toArray();
    const visibleKeys = new Set(visibleRows.map(tr => {
        const nrodoc = tr.getAttribute('data-nrodoc');
        const coddoc = tr.getAttribute('data-coddoc');
        return `${coddoc}|${nrodoc}`;
    }));
    return salesData.filter(r => visibleKeys.has(`${r.coddoc}|${r.nrodoc}`));
}

function getFilteredGuiasData() {
    if (!guiasDataTable) return guiasData;
    const visibleRows = guiasDataTable.rows({ filter: 'applied' }).nodes().toArray();
    const visibleKeys = new Set(visibleRows.map(tr => tr.getAttribute('data-nrodoc')));
    return guiasData.filter(r => visibleKeys.has(r.nrodoc));
}

function updateKPIsFromFiltered() {
    const currentSales = getFilteredSalesData();
    const currentGuias = getFilteredGuiasData();

    // 1. VENTAS KPIs
    const activeSales = currentSales.filter(r => r.flgest !== 'E');
    const totalSoles = activeSales.reduce((sum, r) => sum + (parseInt(r.codmon) === 1 ? (r.imptot || 0) : 0), 0);
    const totalUsd = activeSales.reduce((sum, r) => sum + (parseInt(r.codmon) === 2 ? (r.imptot || 0) : 0), 0);
    
    document.getElementById('kpiSalesTotal').textContent = `S/ ${fmt(totalSoles)}`;
    document.getElementById('kpiSalesTotalSub').textContent = `S/ ${fmt(totalSoles)} + $ ${fmt(totalUsd)}`;

    const totalSalesDocs = currentSales.length;
    document.getElementById('kpiSalesCount').textContent = totalSalesDocs;
    
    const factCount = currentSales.filter(r => r.coddoc === 'FACT').length;
    const boleCount = currentSales.filter(r => r.coddoc === 'BOLE').length;
    const ncrCount = currentSales.filter(r => r.coddoc === 'N/CR' || r.coddoc === 'N/A' || r.coddoc === 'N/C').length;
    document.getElementById('kpiSalesCountSub').textContent = `${factCount} FACT + ${boleCount} BOLE + ${ncrCount} N/C`;

    const detracCount = activeSales.filter(r => r.detrac === true || r.detrac === 1 || String(r.detrac).toLowerCase() === 'true').length;
    document.getElementById('kpiSalesDetrac').textContent = detracCount;
    document.getElementById('kpiSalesDetracSub').textContent = `${detracCount} comprobantes afectos`;

    const salesAnulados = currentSales.filter(r => r.flgest === 'E').length;
    const salesAnulPct = totalSalesDocs > 0 ? ((salesAnulados / totalSalesDocs) * 100).toFixed(1) : '0.0';
    document.getElementById('kpiSalesAnul').textContent = salesAnulados;
    document.getElementById('kpiSalesAnulSub').textContent = `${salesAnulPct}% de anulación ERP`;

    // 2. GUIAS KPIs
    const totalGuias = currentGuias.length;
    document.getElementById('kpiGuiasCount').textContent = totalGuias;
    document.getElementById('kpiGuiasCountSub').textContent = `Total guías en el mes`;

    const guiasSuccess = currentGuias.filter(r => r.url && r.url.trim() !== '').length;
    document.getElementById('kpiGuiasExito').textContent = guiasSuccess;
    document.getElementById('kpiGuiasExitoSub').textContent = `Enviadas correctamente`;

    const guiasError = currentGuias.filter(r => (!r.url || r.url.trim() === '') && ((r.RESULTADO && r.RESULTADO.trim() !== '') || (r.RESPUESTA && r.RESPUESTA.trim() !== ''))).length;
    document.getElementById('kpiGuiasError').textContent = guiasError;
    document.getElementById('kpiGuiasErrorSub').textContent = `Errores de validación`;

    const guiasAnuladas = currentGuias.filter(r => r.flgest === 'E').length;
    document.getElementById('kpiGuiasAnul').textContent = guiasAnuladas;
    document.getElementById('kpiGuiasAnulSub').textContent = `Estado E`;
}

// ─── Document Payments History & Balance Visualizer ───────────────
async function showVentaPayments(coddoc, nrodoc) {
    const modal = document.getElementById('paymentsModal');
    const modalBody = document.getElementById('paymentsModalBody');

    modalBody.innerHTML = `
        <div class="text-center py-5">
            <div class="loader-ring mx-auto mb-3"></div>
            <div class="text-muted" style="color: var(--text-muted);">Cargando historial de pagos y saldo...</div>
        </div>
    `;
    modal.classList.add('active');

    const token = localStorage.getItem('yelave_token');
    try {
        const res = await fetch(`/api/auditoria-comprobantes/ventas/payments?codcia=${currentCia}&coddoc=${encodeURIComponent(coddoc)}&nrodoc=${encodeURIComponent(nrodoc)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        const doc = data.document;
        const payments = data.payments;
        
        const symDoc = getCurrencySymbol(doc.mon_doc);
        const fchDoc = doc.fchdoc ? doc.fchdoc.slice(0, 10) : '';

        // Determine status text & class
        const isPaid = parseFloat(doc.sdodoc) === 0;
        const statusBadge = isPaid 
            ? '<span class="badge bg-success" style="font-size:0.75rem;">CANCELADO</span>' 
            : `<span class="badge bg-warning text-dark" style="font-size:0.75rem;">PENDIENTE</span>`;

        let headerHtml = `
            <div class="card corporate-panel p-3 mb-4" style="background: rgba(255,255,255,0.01); border-color: var(--border);">
                <div class="row g-3">
                    <div class="col-md-6">
                        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600; letter-spacing:0.5px;">Cliente</div>
                        <div style="font-size:0.95rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${doc.nomaux}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted); margin-top:1px;">Cód/RUC: ${doc.codaux}</div>
                    </div>
                    <div class="col-md-3">
                        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600; letter-spacing:0.5px;">Documento</div>
                        <div style="font-size:0.95rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${doc.coddoc.trim()} ${doc.nrodoc}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted); margin-top:1px;">Fch. Emisión: ${fchDoc}</div>
                    </div>
                    <div class="col-md-3 text-end">
                        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600; letter-spacing:0.5px;">Estado</div>
                        <div style="margin-top:4px;">${statusBadge}</div>
                    </div>
                </div>
                <hr style="margin:1rem 0; opacity:0.1;">
                <div class="row g-3 text-center">
                    <div class="col-4">
                        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Total Doc.</div>
                        <div style="font-size:1.15rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${symDoc} ${fmt(doc.imptot)}</div>
                    </div>
                    <div class="col-4">
                        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Total Pagado</div>
                        <div style="font-size:1.15rem; font-weight:700; color:#10b981; margin-top:2px;">${symDoc} ${fmt(doc.total_pagado)}</div>
                    </div>
                    <div class="col-4">
                        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Saldo Pendiente</div>
                        <div style="font-size:1.15rem; font-weight:700; color:${isPaid ? '#10b981' : '#ef4444'}; margin-top:2px;">${symDoc} ${fmt(doc.sdodoc)}</div>
                    </div>
                </div>
            </div>
        `;

        let paymentsTableHtml = '';
        if (payments.length === 0) {
            paymentsTableHtml = `
                <div class="text-center py-4 text-muted border border-dashed rounded" style="border-color: var(--border);">
                    <i class="fas fa-info-circle me-1"></i> No se encontraron movimientos de caja / pagos para este documento.
                </div>
            `;
        } else {
            const rowsHtml = payments.map(p => {
                const fchCan = p.fchcan ? p.fchcan.slice(0, 10) : '';
                const symPago = getCurrencySymbol(p.mon_pago);
                return `
                    <tr>
                        <td>${fchCan}</td>
                        <td><strong>${p.coddoc.trim()} ${p.nrodoc.trim()}</strong></td>
                        <td><span class="badge bg-light text-dark" style="font-size:0.68rem;">${p.jt}</span></td>
                        <td class="text-right">${symPago} ${fmt(p.imp_pago)}</td>
                        <td class="text-right text-muted">${fmt(p.tc_pago)}</td>
                        <td class="text-right" style="font-weight:600; color:var(--text-primary);">${symDoc} ${fmt(p.imp_cancel_doc)}</td>
                        <td class="text-muted" title="${p.glodoc || ''}" style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            ${p.glodoc || '-'}
                        </td>
                        <td class="text-muted" style="font-size:0.75rem;">
                            ${p.codbco ? `${p.codbco.trim()} - Dep: ${p.NroDep || '-'}` : '-'}
                        </td>
                    </tr>
                `;
            }).join('');

            paymentsTableHtml = `
                <h5 style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; font-family: 'Outfit', sans-serif;">
                    <i class="fas fa-history me-1 text-primary"></i> Detalle de Pagos Recibidos
                </h5>
                <div class="report-table-wrapper" style="max-height:40vh; border-color:var(--border);">
                    <table class="report-table table" style="margin-top:0; font-size:0.75rem;">
                        <thead>
                            <tr style="background: rgba(99, 102, 241, 0.08);">
                                <th>Fecha</th>
                                <th>N° Planilla/Caja</th>
                                <th>Tipo Pago</th>
                                <th class="text-right">Monto Pago</th>
                                <th class="text-right">T.C.</th>
                                <th class="text-right">Pago en Mon. Doc</th>
                                <th>Glosa</th>
                                <th>Banco / Depósito</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            `;
        }

        modalBody.innerHTML = headerHtml + paymentsTableHtml;

    } catch (err) {
        console.error(err);
        modalBody.innerHTML = `
            <div class="alert alert-danger m-4">
                <i class="fas fa-exclamation-triangle me-2"></i>Error al consultar el historial de pagos: ${err.message}
            </div>
        `;
    }
}

function closePaymentsModal() {
    document.getElementById('paymentsModal').classList.remove('active');
}

window.showVentaPayments = showVentaPayments;
window.closePaymentsModal = closePaymentsModal;
