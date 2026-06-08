/**
 * YELAVE ERP – Historial de Cancelaciones (Cobros y Caja)
 * Frontend logic: filters, select2, DataTables, Excel/PDF exports, detail modals.
 */

// ─── State ───────────────────────────────────────────────────────
let cancelacionesData = []; // Raw data from API
let cancelacionesTable = null; // DataTable instance
let queryParams = {
    codcia: '',
    fechaInicio: '',
    fechaFin: ''
};

const fmt = (n) => new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const getCurrencyLabel = (mon) => parseInt(mon) === 2 ? 'USD' : 'PEN';
const getCurrencySymbol = (mon) => parseInt(mon) === 2 ? '$' : 'S/';

// ─── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadEmpresas();
    setDefaultDates();

    // Form submit
    document.getElementById('cancelacionesForm').addEventListener('submit', (e) => {
        e.preventDefault();
        loadReport();
    });

    // Search input
    document.getElementById('tableSearch').addEventListener('input', debounce(applySearch, 250));

    // Bind column-specific filters
    $('#cancelacionesTable thead').on('keyup change', '.column-filter', function () {
        const colIdx = $(this).closest('th').index();
        if (cancelacionesTable) {
            cancelacionesTable.column(colIdx).search(this.value).draw();
        }
    });
});

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function setDefaultDates() {
    const now = new Date();
    // Default start date to first day of the current month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById('fechaInicio').value = start.toISOString().slice(0, 10);
    document.getElementById('fechaFin').value = now.toISOString().slice(0, 10);
}

// ─── Load Empresas ───────────────────────────────────────────────
async function loadEmpresas() {
    const token = localStorage.getItem('yelave_token');
    try {
        const res = await fetch('/api/historial-cancelaciones/empresas', {
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
        });

        // Initialize Select2
        $('#filterCia').select2({
            placeholder: "Seleccione empresa(s)",
            allowClear: true,
            width: '100%'
        });

        // Try to default to '007' if available
        const has007 = empresas.some(e => e.codcia === '007');
        if (has007) {
            $('#filterCia').val(['007']).trigger('change');
        } else {
            $('#filterCia').val([empresas[0].codcia]).trigger('change');
        }
    } catch (err) {
        console.error('Error cargando empresas:', err);
        alert('Error al cargar la lista de empresas');
    }
}

// ─── Fetch Report Data ────────────────────────────────────────────
async function loadReport() {
    const ciaArr = $('#filterCia').val();
    const codcia = ciaArr ? ciaArr.join(',') : '';
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;

    if (!codcia) {
        alert('Por favor, seleccione al menos una empresa.');
        return;
    }

    queryParams = { codcia, fechaInicio, fechaFin };
    showLoader(true);
    const token = localStorage.getItem('yelave_token');

    try {
        const url = `/api/historial-cancelaciones/report?codcia=${codcia}&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        cancelacionesData = result.data || [];

        // Clear search inputs
        document.getElementById('tableSearch').value = '';
        document.querySelectorAll('.column-filter').forEach(inp => inp.value = '');

        // Show/hide containers
        document.getElementById('resultsContainer').style.display = 'block';
        document.getElementById('emptyState').style.display = 'none';

        // Render table
        renderTable();
        
        // Update KPIs
        updateKPIs(cancelacionesData);
    } catch (err) {
        console.error(err);
        alert('Error al consultar historial de cancelaciones: ' + err.message);
    } finally {
        showLoader(false);
    }
}

function showLoader(show) {
    document.getElementById('loaderOverlay').classList.toggle('active', show);
}

// ─── Render Data Table ───────────────────────────────────────────
function renderTable() {
    if (cancelacionesTable) {
        cancelacionesTable.destroy();
        cancelacionesTable = null;
    }

    const tbody = document.getElementById('cancelacionesTbody');
    if (cancelacionesData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" class="text-center py-4 text-muted">No se encontraron cobros o cancelaciones en este rango</td></tr>';
        document.getElementById('tableInfo').textContent = `Mostrando 0 registros`;
        return;
    }

    tbody.innerHTML = cancelacionesData.map((r, idx) => {
        const fchCan = r.fchcan ? r.fchcan.slice(0, 10) : '';
        const docRef = `${r.codref.trim()} ${r.nroref.trim()}`;
        const cajaRef = `${r.coddoc.trim()} ${r.nrodoc.trim()}`;
        
        const monDocStr = getCurrencyLabel(r.mon_doc);
        const monPagoStr = getCurrencyLabel(r.mon_pago);
        
        const symDoc = getCurrencySymbol(r.mon_doc);
        const symPago = getCurrencySymbol(r.mon_pago);

        return `
        <tr data-index="${idx}">
            <td>${r.CodCia}</td>
            <td>${fchCan}</td>
            <td><strong>${cajaRef}</strong></td>
            <td>
                <div style="font-weight:600; font-size:0.82rem; color:var(--text-primary);">${r.NomAux}</div>
                <div style="font-size:0.72rem; color:var(--text-muted);">${r.codaux}</div>
            </td>
            <td><strong>${docRef}</strong></td>
            <td class="text-center"><span class="badge bg-secondary" style="font-size:0.7rem;">${monDocStr}</span></td>
            <td class="text-right">${symDoc} ${fmt(r.imp_doc)}</td>
            <td class="text-right" style="font-weight:600; color:var(--primary);">${symPago} ${fmt(r.imp_pago)}</td>
            <td class="text-center"><span class="badge bg-info text-dark" style="font-size:0.7rem;">${monPagoStr}</span></td>
            <td class="text-right text-muted">${fmt(r.tc_pago)}</td>
            <td class="text-right" style="font-weight:600; color:var(--text-primary);">${symDoc} ${fmt(r.imp_cancel_doc)}</td>
            <td class="text-muted" title="${r.glodoc || ''}" style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${r.glodoc || '-'}
            </td>
            <td><span class="badge bg-light text-dark" style="font-size:0.7rem; font-weight:600;">${r.jt}</span></td>
            <td class="text-center">
                <button type="button" class="btn btn-glass btn-sm px-2 py-1" onclick="showDetail(${idx})" style="color:var(--primary); font-size:0.72rem;">
                    <i class="fas fa-eye me-1"></i>Ver
                </button>
            </td>
        </tr>`;
    }).join('');

    // Initialize DataTable
    cancelacionesTable = $('#cancelacionesTable').DataTable({
        pageLength: 20,
        lengthMenu: [10, 20, 50, 100],
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.8/i18n/es-ES.json'
        },
        order: [], // keep API order (date DESC, Caja DESC)
        searching: true,
        paging: true,
        info: true,
        autoWidth: false,
        columnDefs: [
            { targets: [13], orderable: false }
        ],
        dom: 'rtip'
    });

    // Update table info & KPIs on filter/search draw
    cancelacionesTable.on('draw', () => {
        const filteredCount = cancelacionesTable.rows({ filter: 'applied' }).count();
        document.getElementById('tableInfo').textContent = `Mostrando ${filteredCount} registros`;
        
        // Dynamic KPIs update
        const filteredData = getFilteredData();
        updateKPIs(filteredData);
    });

    // Set initial count label
    document.getElementById('tableInfo').textContent = `Mostrando ${cancelacionesData.length} registros`;
}

// Helper to get currently visible/filtered rows from DataTable
function getFilteredData() {
    if (!cancelacionesTable) return cancelacionesData;
    const visibleRows = cancelacionesTable.rows({ filter: 'applied' }).nodes().toArray();
    const visibleIndexes = visibleRows.map(tr => parseInt(tr.getAttribute('data-index')));
    return visibleIndexes.map(idx => cancelacionesData[idx]);
}

// ─── Update KPIs ─────────────────────────────────────────────────
function updateKPIs(dataList) {
    let totalPen = 0;
    let totalUsd = 0;
    let totalCount = dataList.length;

    dataList.forEach(r => {
        const monPago = parseInt(r.mon_pago);
        const impPago = parseFloat(r.imp_pago) || 0;
        
        if (monPago === 1) {
            totalPen += impPago;
        } else {
            totalUsd += impPago;
        }
    });

    document.getElementById('kpiSolesTotal').textContent = `S/ ${fmt(totalPen)}`;
    document.getElementById('kpiDolaresTotal').textContent = `$ ${fmt(totalUsd)}`;
    document.getElementById('kpiTransacciones').textContent = totalCount;
}

// ─── Search Box filter ───────────────────────────────────────────
function applySearch() {
    const q = (document.getElementById('tableSearch').value || '').trim();
    if (cancelacionesTable) {
        cancelacionesTable.search(q).draw();
    }
}

// ─── Detail Modal ────────────────────────────────────────────────
window.showDetail = async function(idx) {
    const r = cancelacionesData[idx];
    if (!r) return;
    
    const codcia = r.CodCia;
    const coddoc = r.coddoc;
    const nrodoc = r.nrodoc;
    
    showLoader(true);
    const token = localStorage.getItem('yelave_token');
    
    try {
        const url = `/api/historial-cancelaciones/caja/detail?codcia=${codcia}&coddoc=${coddoc}&nrodoc=${nrodoc}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        const caja = data.caja;
        const detalles = data.detalles || [];
        
        // Group details by Payment Type (jt) + GroupName
        const groups = {};
        detalles.forEach(item => {
            const key = `${item.jt} || ${item.GroupName}`;
            if (!groups[key]) {
                groups[key] = {
                    jt: item.jt,
                    groupName: item.GroupName,
                    items: []
                };
            }
            groups[key].items.push(item);
        });

        const printDate = new Date().toLocaleDateString('es-PE');
        const cajaDateStr = caja.fchdoc ? formatDatePE(caja.fchdoc) : '-';
        
        const badgeHtml = caja.flgest === 'C' 
            ? `<span class="badge bg-success text-white px-3 py-1" style="font-weight:700;">CAJA CERRADA</span>`
            : `<span class="badge bg-warning text-dark px-3 py-1" style="font-weight:700;">CAJA PENDIENTE</span>`;
            
        let tablesHtml = '';
        let grandTotalSoles = 0;
        let grandTotalDolares = 0;

        // Iterate groups
        for (const key in groups) {
            const grp = groups[key];
            let subtotalSoles = 0;
            let subtotalDolares = 0;

            let rowsHtml = grp.items.map(item => {
                const fchDocRef = item.fchdoc_ref ? formatDatePE(item.fchdoc_ref) : '-';
                const fchPago = item.fchDep ? formatDatePE(item.fchDep) : (item.fchcan ? formatDatePE(item.fchcan) : '-');
                const symDoc = getCurrencySymbol(item.mon_doc);
                
                const isSoles = parseInt(item.mon_pago) === 1;
                const solesAmt = isSoles ? item.imp_pago : 0;
                const dolaresAmt = !isSoles ? item.imp_pago : 0;
                
                subtotalSoles += solesAmt;
                subtotalDolares += dolaresAmt;
                
                grandTotalSoles += solesAmt;
                grandTotalDolares += dolaresAmt;

                const estadoLabel = item.estado_conciliado === 'Conc.' 
                    ? '<span class="text-success" style="font-weight:600;"><i class="fas fa-check-circle me-1"></i>Conc.</span>'
                    : '<span class="text-warning" style="font-weight:600;"><i class="fas fa-hourglass-half me-1"></i>Pend.</span>';

                return `
                    <tr>
                        <td class="text-center">${item.codref.trim()}</td>
                        <td><strong>${item.nroref.trim()}</strong></td>
                        <td class="text-center">${fchDocRef}</td>
                        <td class="text-center">${item.codaux}</td>
                        <td><div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.NomAux}">${item.NomAux}</div></td>
                        <td><div style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.nomven || ''}">${item.nomven || '-'}</div></td>
                        <td class="text-center">${item.usuario || '-'}</td>
                        <td><strong>${item.NroDep || '-'}</strong></td>
                        <td class="text-center">${fchPago}</td>
                        <td class="text-center">${symDoc}</td>
                        <td class="text-right" style="font-weight: 500;">${solesAmt > 0 ? fmt(solesAmt) : '0.00'}</td>
                        <td class="text-right" style="font-weight: 500;">${dolaresAmt > 0 ? fmt(dolaresAmt) : '0.00'}</td>
                        <td class="text-center">${estadoLabel}</td>
                    </tr>
                `;
            }).join('');

            tablesHtml += `
                <div class="payment-group-section mb-4" style="page-break-inside: avoid;">
                    <div class="payment-group-header py-2 px-3 mb-2" style="background: rgba(255, 255, 255, 0.03); border-left: 4px solid var(--primary); font-weight: 700; font-size: 0.85rem; display: flex; justify-content: space-between;">
                        <span>${grp.jt} &nbsp;&nbsp;&nbsp;&nbsp; Cuenta: ${grp.groupName}</span>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm caja-detail-table" style="font-size:0.78rem; margin-bottom: 0;">
                            <thead>
                                <tr style="border-bottom: 2px solid var(--border);">
                                    <th class="text-center" style="width: 60px;">T/D</th>
                                    <th style="width: 100px;">Nº DOCUM.</th>
                                    <th class="text-center" style="width: 85px;">FCH. DOC.</th>
                                    <th class="text-center" style="width: 80px;">CODIGO</th>
                                    <th>RAZON SOCIAL</th>
                                    <th>NOMVEN</th>
                                    <th class="text-center" style="width: 80px;">USUARIO</th>
                                    <th style="width: 100px;">Nº OPER.</th>
                                    <th class="text-center" style="width: 85px;">FECHA</th>
                                    <th class="text-center" style="width: 40px;">MON.</th>
                                    <th class="text-right" style="width: 90px;">SOLES</th>
                                    <th class="text-right" style="width: 90px;">DOLARES</th>
                                    <th class="text-center" style="width: 90px;">ESTADO</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                                <tr class="subtotal-row font-weight-bold" style="border-top: 1px solid var(--border); background: rgba(255, 255, 255, 0.01);">
                                    <td colspan="10" class="text-right text-uppercase" style="letter-spacing: 0.5px; font-size: 0.72rem; font-weight: 700;">SUB TOTAL ${grp.jt}:</td>
                                    <td class="text-right" style="font-weight: 700; color: var(--text-primary);">${fmt(subtotalSoles)}</td>
                                    <td class="text-right" style="font-weight: 700; color: var(--text-primary);">${fmt(subtotalDolares)}</td>
                                    <td></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        const body = document.getElementById('detailModalBody');
        body.innerHTML = `
            <div class="print-preview-sheet p-3" style="font-family: 'Inter', sans-serif;">
                <!-- ERP Header Style -->
                <div class="row align-items-center mb-3">
                    <div class="col-6">
                        <h5 style="font-family: 'Outfit', sans-serif; font-weight: 700; margin: 0; font-size: 1rem; color: var(--text-primary);">${caja.nomcia}</h5>
                        <span style="font-size: 0.72rem; color: var(--text-muted);">RUC: ${caja.ruccia}</span>
                    </div>
                    <div class="col-6 text-end">
                        <span style="font-size: 0.72rem; color: var(--text-muted);">${printDate}</span>
                    </div>
                </div>
                
                <div class="text-center mb-4">
                    <h3 style="font-family: 'Outfit', sans-serif; font-weight: 800; letter-spacing: 0.5px; margin: 0 0 0.5rem 0; font-size: 1.3rem; color: var(--text-primary);">CANCELACION DE DOCUMENTOS</h3>
                    <div class="mb-2">${badgeHtml}</div>
                </div>
                
                <div class="row py-2 mb-3" style="border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); font-size: 0.8rem;">
                    <div class="col-md-4">
                        <strong>N° Caja:</strong> ${caja.codcia}-${caja.coddoc}-${caja.nrodoc}
                    </div>
                    <div class="col-md-4 text-md-center">
                        <strong>Fecha de Caja:</strong> ${cajaDateStr}
                    </div>
                    <div class="col-md-4 text-md-end">
                        <strong>Pág:</strong> 1
                    </div>
                </div>
                
                <div class="mb-3 text-muted" style="font-size: 0.78rem; font-style: italic;">
                    <strong>Glosa/Comentario de Caja:</strong> ${caja.glodoc || 'Sin glosa registrada'}
                </div>
                
                <div class="mb-4" style="font-size: 0.8rem; font-weight: bold; border-left: 3px solid var(--primary); padding-left: 8px;">
                    CANCELACIONES DEL DIA: ${cajaDateStr}
                </div>
                
                <!-- Grouped Payment Tables -->
                ${tablesHtml}
                
                <!-- Grand Total Section -->
                <div class="grand-total-section p-3 mt-4" style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; page-break-inside: avoid;">
                    <div>
                        <h6 style="margin: 0; font-weight: 700; color: var(--text-primary); font-size: 0.9rem;">TOTAL GENERAL CAJA:</h6>
                        <span style="font-size: 0.72rem; color: var(--text-muted);">${detalles.length} transacciones registradas</span>
                    </div>
                    <div class="d-flex gap-4">
                        <div class="text-right">
                            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">TOTAL SOLES (PEN)</div>
                            <div style="font-size: 1.1rem; font-weight: 800; color: #10b981;">S/ ${fmt(grandTotalSoles)}</div>
                        </div>
                        <div class="text-right">
                            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">TOTAL DÓLARES (USD)</div>
                            <div style="font-size: 1.1rem; font-weight: 800; color: #3b82f6;">$ ${fmt(grandTotalDolares)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('detailModal').classList.add('active');
    } catch (err) {
        console.error(err);
        alert('Error al cargar detalles de la caja: ' + err.message);
    } finally {
        showLoader(false);
    }
};

function formatDatePE(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

window.printCajaReport = function() {
    window.print();
};

window.closeDetailModal = function() {
    document.getElementById('detailModal').classList.remove('active');
};

// ─── Exports ─────────────────────────────────────────────────────
window.exportExcel = function() {
    const dataToExport = getFilteredData();
    if (dataToExport.length === 0) {
        alert('No hay datos para exportar.');
        return;
    }

    const headers = [
        "Cia", "Fecha Cancelación", "Tipo Caja", "Nro Caja", "Item Caja", 
        "Cód. Cliente", "Nombre Cliente", "Cód. Vendedor", "Nombre Vendedor",
        "Doc. Ref", "Nro. Ref", "Moneda Doc", "Total Doc", 
        "Pago Cancelado", "Moneda Pago", "T.C. Pago", "Pago en Moneda Doc", 
        "Glosa", "Tipo Pago", "Banco", "Nro Depósito", "Fecha Depósito"
    ];

    const rows = dataToExport.map(r => [
        r.CodCia,
        r.fchcan ? r.fchcan.slice(0, 10) : '',
        r.coddoc,
        r.nrodoc,
        r.nroitm,
        r.codaux,
        r.NomAux,
        r.codven,
        r.nomven,
        r.codref,
        r.nroref,
        getCurrencyLabel(r.mon_doc),
        r.imp_doc,
        r.imp_pago,
        getCurrencyLabel(r.mon_pago),
        r.tc_pago,
        r.imp_cancel_doc,
        r.glodoc_caja || r.glodoc || '',
        r.jt,
        r.codbco || '',
        r.NroDep || '',
        r.fchDep ? r.fchDep.slice(0, 10) : ''
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial Cancelaciones");

    // Save File
    const filename = `Historial_Cancelaciones_${queryParams.codcia.replace(/,/g, '_')}_${queryParams.fechaInicio}_${queryParams.fechaFin}.xlsx`;
    XLSX.writeFile(wb, filename);
};

window.exportPDF = function() {
    const dataToExport = getFilteredData();
    if (dataToExport.length === 0) {
        alert('No hay datos para exportar.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Reporte Historial de Cancelaciones de Ventas`, 14, 15);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Filtros: Cia: ${queryParams.codcia} | Rango: ${queryParams.fechaInicio} a ${queryParams.fechaFin}`, 14, 21);

    const head = [[
        'Cia', 'Fch. Cancel', 'Caja/CJ', 'Cliente', 'Doc. Ref', 'M.Doc', 
        'Total Doc', 'Pago Cancel.', 'M.Pago', 'T.C.', 'Pago M.Doc', 'Tipo Pago'
    ]];

    const dataRows = dataToExport.map(r => [
        r.CodCia,
        r.fchcan ? r.fchcan.slice(0, 10) : '',
        `${r.coddoc.trim()} ${r.nrodoc.trim()}`,
        (r.NomAux || '').substring(0, 30),
        `${r.codref.trim()} ${r.nroref.trim()}`,
        getCurrencyLabel(r.mon_doc),
        `${getCurrencySymbol(r.mon_doc)} ${fmt(r.imp_doc)}`,
        `${getCurrencySymbol(r.mon_pago)} ${fmt(r.imp_pago)}`,
        getCurrencyLabel(r.mon_pago),
        fmt(r.tc_pago),
        `${getCurrencySymbol(r.mon_doc)} ${fmt(r.imp_cancel_doc)}`,
        r.jt
    ]);

    // Aggregate totals for the footer
    let sumPen = 0;
    let sumUsd = 0;
    dataToExport.forEach(r => {
        const mon = parseInt(r.mon_pago);
        const imp = parseFloat(r.imp_pago) || 0;
        if (mon === 1) sumPen += imp;
        else sumUsd += imp;
    });

    dataRows.push([
        '', '', '', 'TOTALES DETALLADOS', '', '', '', 
        `PEN: S/ ${fmt(sumPen)}\nUSD: $ ${fmt(sumUsd)}`, 
        '', '', '', ''
    ]);

    doc.autoTable({
        head: head,
        body: dataRows,
        startY: 26,
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.5 },
        columnStyles: {
            6: { halign: 'right' },
            7: { halign: 'right', fontStyle: 'bold' },
            9: { halign: 'right' },
            10: { halign: 'right', fontStyle: 'bold' }
        },
        willDrawCell: function(data) {
            if (data.row.section === 'body' && String(data.row.raw[3] || '') === 'TOTALES DETALLADOS') {
                doc.setFillColor(230, 230, 240);
                doc.setFont('', 'bold');
            }
        }
    });

    const filename = `Historial_Cancelaciones_${queryParams.codcia.replace(/,/g, '_')}_${queryParams.fechaInicio}_${queryParams.fechaFin}.pdf`;
    doc.save(filename);
};
