/**
 * YELAVE ERP – Cuentas por Cobrar (Saldos por Cobrar)
 * Frontend logic: filters, data table, sorting, pagination,
 * dynamic grouping, Chart.js charts, Excel/PDF export.
 */

// ─── State ───────────────────────────────────────────────────────
let reportData = [];       // Full dataset from API
let filteredData = [];     // After search filter
let summaryData = {};      // Summary from API
let currentPage = 1;
let pageSize = 100;
let sortCol = -1;
let sortAsc = true;
let chartInstances = {};   // Canvas chart instances

const API_BASE = '/api/cuentas-cobrar';
const fmt = (n) => new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

// ─── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadEmpresas();
    setDefaultDates();

    document.getElementById('reportForm').addEventListener('submit', (e) => {
        e.preventDefault();
        generateReport();
    });

    document.getElementById('searchInput').addEventListener('input', debounce(applySearch, 300));
    document.getElementById('selGroupBy').addEventListener('change', renderTable);
    document.getElementById('selPageSize').addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value) || 0;
        currentPage = 1;
        renderTable();
    });
});

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── Load Empresas ───────────────────────────────────────────────
async function loadEmpresas() {
    try {
        const res = await fetch(`${API_BASE}/empresas`);
        const empresas = await res.json();
        const sel = document.getElementById('selEmpresa');
        sel.innerHTML = '<option value="">— Seleccionar —</option>';
        empresas.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.codcia;
            opt.textContent = `${e.codcia} - ${e.nomcia}`;
            sel.appendChild(opt);
        });
    } catch (err) {
        console.error('Error cargando empresas:', err);
    }
}

function setDefaultDates() {
    const now = new Date();
    document.getElementById('fechaFin').value = now.toISOString().slice(0, 10);
    const start = new Date(2015, 0, 1);
    document.getElementById('fechaInicio').value = start.toISOString().slice(0, 10);
}

// ─── Generate Report ─────────────────────────────────────────────
async function generateReport() {
    const codcia = document.getElementById('selEmpresa').value;
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;

    if (!codcia) { alert('Seleccione una empresa.'); return; }

    showLoader(true);

    try {
        const url = `${API_BASE}/report?codcia=${codcia}&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        reportData = result.data || [];
        filteredData = [...reportData];

        // Store empresa info for print/export
        window._empresa = result.empresa;
        window._fechas = { inicio: fechaInicio, fin: fechaFin };

        // KPIs
        updateKPIs(result);

        // Load summary for charts
        const sumUrl = `${API_BASE}/summary?codcia=${codcia}&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`;
        const sumRes = await fetch(sumUrl);
        summaryData = await sumRes.json();

        // Show results
        document.getElementById('resultsContainer').style.display = 'block';
        document.getElementById('emptyState').style.display = 'none';

        currentPage = 1;
        sortCol = -1;
        renderTable();
        renderCharts();
        showSummary('vendedor', document.querySelector('#pane-resumen .btn-glass'));

    } catch (err) {
        console.error(err);
        alert('Error al generar reporte: ' + err.message);
    } finally {
        showLoader(false);
    }
}

function showLoader(show) {
    document.getElementById('loaderOverlay').classList.toggle('active', show);
}

// ─── KPIs ────────────────────────────────────────────────────────
function updateKPIs(result) {
    const data = result.data || [];
    const totalSaldo = data.reduce((s, r) => s + (r.saldo || 0), 0);
    const totalImporte = data.reduce((s, r) => s + (r.imptot || 0), 0);
    const totalActa = data.reduce((s, r) => s + (r.acta || 0), 0);

    document.getElementById('kpiSaldo').textContent = `S/ ${fmt(totalSaldo)}`;
    document.getElementById('kpiSaldoSub').textContent = `${data.length} documentos pendientes`;
    document.getElementById('kpiImporte').textContent = `S/ ${fmt(totalImporte)}`;
    document.getElementById('kpiImporteSub').textContent = `Total facturado`;
    document.getElementById('kpiActa').textContent = `S/ ${fmt(totalActa)}`;
    document.getElementById('kpiActaSub').textContent = `${((totalActa / (totalImporte || 1)) * 100).toFixed(1)}% cobrado`;
    document.getElementById('kpiDocs').textContent = data.length.toLocaleString();
    const facts = data.filter(r => (r.coddoc || '').includes('FACT')).length;
    const boles = data.filter(r => (r.coddoc || '').includes('BOLE')).length;
    document.getElementById('kpiDocsSub').textContent = `${facts} FACT + ${boles} BOLE`;
}

// ─── Search ──────────────────────────────────────────────────────
function applySearch() {
    const query = (document.getElementById('searchInput').value || '').toLowerCase().trim();
    if (!query) {
        filteredData = [...reportData];
    } else {
        filteredData = reportData.filter(r =>
            Object.values(r).some(v => v !== null && String(v).toLowerCase().includes(query))
        );
    }
    currentPage = 1;
    renderTable();
}

// ─── Table Rendering ─────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('tableBody');
    const tfoot = document.getElementById('tableFoot');
    const groupBy = document.getElementById('selGroupBy').value;

    let data = [...filteredData];

    // Sorting
    if (sortCol >= 0) {
        const fields = ['fchdoc', 'coddoc', 'serie', 'nrodoc', 'codaux', 'nomaux', 'imptot', 'acta', 'saldo', 'nomven', 'nompgo', 'nomsol'];
        const field = fields[sortCol];
        const numericFields = ['imptot', 'acta', 'saldo'];
        const isNum = numericFields.includes(field);
        data.sort((a, b) => {
            let va = a[field], vb = b[field];
            if (isNum) { va = va || 0; vb = vb || 0; return sortAsc ? va - vb : vb - va; }
            va = (va || '').toString().toLowerCase();
            vb = (vb || '').toString().toLowerCase();
            return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        });
    }

    // Pagination
    let totalItems = data.length;
    let pageData = data;
    if (pageSize > 0) {
        const startIdx = (currentPage - 1) * pageSize;
        pageData = data.slice(startIdx, startIdx + pageSize);
    }

    // Render rows
    if (groupBy) {
        tbody.innerHTML = renderGroupedRows(data, pageData, groupBy);
    } else {
        tbody.innerHTML = pageData.map(r => renderRow(r)).join('');
    }

    // Totals footer
    const totalImporte = filteredData.reduce((s, r) => s + (r.imptot || 0), 0);
    const totalActa = filteredData.reduce((s, r) => s + (r.acta || 0), 0);
    const totalSaldo = filteredData.reduce((s, r) => s + (r.saldo || 0), 0);
    tfoot.innerHTML = `
        <tr class="total-row">
            <td colspan="6" style="text-align:right; font-weight:700;">TOTALES (${filteredData.length} docs)</td>
            <td class="text-right">${fmt(totalImporte)}</td>
            <td class="text-right">${fmt(totalActa)}</td>
            <td class="text-right" style="color:#ef4444;">${fmt(totalSaldo)}</td>
            <td colspan="3"></td>
        </tr>
    `;

    // Pagination controls
    renderPagination(totalItems);
}

function renderRow(r) {
    const docBadge = (r.coddoc || '').includes('FACT')
        ? '<span class="badge-doc badge-fact">FACT</span>'
        : '<span class="badge-doc badge-bole">BOLE</span>';
    return `<tr>
        <td>${r.fchdoc || ''}</td>
        <td class="text-center">${docBadge}</td>
        <td>${r.serie || ''}</td>
        <td>${r.nrodoc || ''}</td>
        <td>${r.codaux || ''}</td>
        <td title="${r.nomaux || ''}">${(r.nomaux || '').substring(0, 40)}</td>
        <td class="text-right">${fmt(r.imptot)}</td>
        <td class="text-right">${fmt(r.acta)}</td>
        <td class="text-right" style="color:#f87171; font-weight:600;">${fmt(r.saldo)}</td>
        <td>${r.nomven || ''}</td>
        <td>${r.nompgo || ''}</td>
        <td>${r.nomsol || ''}</td>
    </tr>`;
}

function renderGroupedRows(allData, pageData, groupBy) {
    // Group all filtered data
    const groups = {};
    filteredData.forEach(r => {
        const key = (r[groupBy] || '').trim() || '(Sin datos)';
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });

    // Sort groups by total saldo descending
    const sortedKeys = Object.keys(groups).sort((a, b) => {
        const sa = groups[a].reduce((s, r) => s + (r.saldo || 0), 0);
        const sb = groups[b].reduce((s, r) => s + (r.saldo || 0), 0);
        return sb - sa;
    });

    let html = '';
    sortedKeys.forEach(key => {
        const items = groups[key];
        const gImporte = items.reduce((s, r) => s + (r.imptot || 0), 0);
        const gActa = items.reduce((s, r) => s + (r.acta || 0), 0);
        const gSaldo = items.reduce((s, r) => s + (r.saldo || 0), 0);

        html += `<tr style="background:rgba(99,102,241,0.08);">
            <td colspan="6" style="font-weight:700; color:#818cf8; padding:0.6rem 0.75rem;">
                <i class="fas fa-layer-group me-1" style="opacity:0.5;"></i> ${key}
                <span style="font-weight:400; color:rgba(255,255,255,0.35); margin-left:8px;">(${items.length} docs)</span>
            </td>
            <td class="text-right" style="font-weight:700; color:#818cf8;">${fmt(gImporte)}</td>
            <td class="text-right" style="font-weight:700; color:#818cf8;">${fmt(gActa)}</td>
            <td class="text-right" style="font-weight:700; color:#f87171;">${fmt(gSaldo)}</td>
            <td colspan="3"></td>
        </tr>`;

        items.forEach(r => { html += renderRow(r); });
    });

    return html;
}

// ─── Sorting ─────────────────────────────────────────────────────
function sortTable(col) {
    if (sortCol === col) { sortAsc = !sortAsc; } else { sortCol = col; sortAsc = true; }

    // Update header icons
    document.querySelectorAll('#mainTable th').forEach(th => th.classList.remove('sorted'));
    const th = document.querySelector(`#mainTable th[data-col="${col}"]`);
    if (th) {
        th.classList.add('sorted');
        th.querySelector('.sort-icon i').className = sortAsc ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }

    renderTable();
}

// ─── Pagination ──────────────────────────────────────────────────
function renderPagination(totalItems) {
    const info = document.getElementById('paginationInfo');
    const btns = document.getElementById('paginationButtons');

    if (pageSize === 0 || totalItems <= pageSize) {
        info.textContent = `Mostrando ${totalItems} de ${totalItems}`;
        btns.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(totalItems / pageSize);
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalItems);
    info.textContent = `Mostrando ${start}–${end} de ${totalItems}`;

    let html = '';
    html += `<button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;

    const maxBtns = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxBtns / 2));
    let endPage = Math.min(totalPages, startPage + maxBtns - 1);
    if (endPage - startPage < maxBtns - 1) startPage = Math.max(1, endPage - maxBtns + 1);

    if (startPage > 1) html += `<button class="page-btn" onclick="goPage(1)">1</button><span style="color:rgba(255,255,255,0.2);padding:0 4px;">…</span>`;
    for (let p = startPage; p <= endPage; p++) {
        html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
    }
    if (endPage < totalPages) html += `<span style="color:rgba(255,255,255,0.2);padding:0 4px;">…</span><button class="page-btn" onclick="goPage(${totalPages})">${totalPages}</button>`;

    html += `<button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
    btns.innerHTML = html;
}

function goPage(p) {
    const totalPages = pageSize > 0 ? Math.ceil(filteredData.length / pageSize) : 1;
    if (p < 1 || p > totalPages) return;
    currentPage = p;
    renderTable();
    document.getElementById('tableWrapper').scrollTop = 0;
}

// ─── Charts ──────────────────────────────────────────────────────
function renderCharts() {
    const colors = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];

    // Destroy existing
    Object.values(chartInstances).forEach(c => c.destroy());
    chartInstances = {};

    // 1. Saldo por Vendedor (Doughnut)
    const vendData = (summaryData.by_vendedor || []).slice(0, 10);
    chartInstances.vendedor = new Chart(document.getElementById('chartVendedor'), {
        type: 'doughnut',
        data: {
            labels: vendData.map(v => v.label),
            datasets: [{
                data: vendData.map(v => v.saldo),
                backgroundColor: colors,
                borderColor: 'rgba(10,10,15,0.8)',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 }, padding: 10 } },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: S/ ${fmt(ctx.raw)}` } }
            }
        }
    });

    // 2. Top Clientes Morosos (Horizontal Bar)
    const cliData = (summaryData.top_clientes || []).slice(0, 10);
    chartInstances.clientes = new Chart(document.getElementById('chartClientes'), {
        type: 'bar',
        data: {
            labels: cliData.map(c => (c.nomaux || '').substring(0, 25)),
            datasets: [{
                label: 'Saldo',
                data: cliData.map(c => c.saldo),
                backgroundColor: colors.map(c => c + '60'),
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `S/ ${fmt(ctx.raw)}` } }
            },
            scales: {
                x: { ticks: { color: 'rgba(255,255,255,0.4)', callback: v => `S/ ${(v/1000).toFixed(0)}K` }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } }, grid: { display: false } }
            }
        }
    });

    // 3. Saldo por Forma de Pago (Pie)
    const fpData = (summaryData.by_forma_pago || []).slice(0, 8);
    chartInstances.formaPago = new Chart(document.getElementById('chartFormaPago'), {
        type: 'pie',
        data: {
            labels: fpData.map(f => f.label),
            datasets: [{
                data: fpData.map(f => f.saldo),
                backgroundColor: colors.slice(0, fpData.length),
                borderColor: 'rgba(10,10,15,0.8)',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 }, padding: 10 } },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: S/ ${fmt(ctx.raw)}` } }
            }
        }
    });

    // 4. Evolución Mensual (Line)
    const mesData = (summaryData.by_mes || []).slice(-24); // Last 24 months
    chartInstances.mensual = new Chart(document.getElementById('chartMensual'), {
        type: 'line',
        data: {
            labels: mesData.map(m => m.mes),
            datasets: [{
                label: 'Saldo',
                data: mesData.map(m => m.saldo),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#10b981',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `S/ ${fmt(ctx.raw)}` } }
            },
            scales: {
                x: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { color: 'rgba(255,255,255,0.4)', callback: v => `S/${(v/1000).toFixed(0)}K` }, grid: { color: 'rgba(255,255,255,0.04)' } }
            }
        }
    });
}

// ─── Summary Tab ─────────────────────────────────────────────────
function showSummary(type, btn) {
    // Toggle active button
    document.querySelectorAll('#pane-resumen .btn-glass').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const head = document.getElementById('summaryHead');
    const body = document.getElementById('summaryBody');

    let items = [];
    let headers = '';

    switch (type) {
        case 'vendedor':
            items = summaryData.by_vendedor || [];
            headers = '<tr><th>Vendedor</th><th class="text-right">Saldo</th><th class="text-right">Importe</th><th>Docs</th><th class="bar-cell">Proporción</th></tr>';
            break;
        case 'forma_pago':
            items = summaryData.by_forma_pago || [];
            headers = '<tr><th>Forma de Pago</th><th class="text-right">Saldo</th><th class="text-right">Importe</th><th>Docs</th><th class="bar-cell">Proporción</th></tr>';
            break;
        case 'tienda':
            items = summaryData.by_tienda || [];
            headers = '<tr><th>Tienda</th><th class="text-right">Saldo</th><th class="text-right">Importe</th><th>Docs</th><th class="bar-cell">Proporción</th></tr>';
            break;
        case 'tipo_doc':
            items = summaryData.by_tipo_doc || [];
            headers = '<tr><th>Tipo Doc</th><th class="text-right">Saldo</th><th class="text-right">Importe</th><th>Docs</th><th class="bar-cell">Proporción</th></tr>';
            break;
        case 'clientes':
            items = summaryData.top_clientes || [];
            headers = '<tr><th>Código</th><th>Cliente</th><th class="text-right">Saldo</th><th>Docs</th><th class="bar-cell">Proporción</th></tr>';
            break;
    }

    head.innerHTML = headers;

    const maxSaldo = items.length > 0 ? Math.max(...items.map(i => i.saldo || 0)) : 1;

    if (type === 'clientes') {
        body.innerHTML = items.map(i => `
            <tr>
                <td>${i.codaux || ''}</td>
                <td>${(i.nomaux || '').substring(0, 40)}</td>
                <td class="text-right" style="font-weight:600; color:#f87171;">S/ ${fmt(i.saldo)}</td>
                <td class="text-center">${i.count}</td>
                <td class="bar-cell"><div class="summary-bar"><div class="summary-bar-fill" style="width:${((i.saldo / maxSaldo) * 100).toFixed(1)}%"></div></div></td>
            </tr>
        `).join('');
    } else {
        body.innerHTML = items.map(i => `
            <tr>
                <td style="font-weight:500;">${i.label}</td>
                <td class="text-right" style="font-weight:600; color:#f87171;">S/ ${fmt(i.saldo)}</td>
                <td class="text-right">S/ ${fmt(i.importe)}</td>
                <td class="text-center">${i.count}</td>
                <td class="bar-cell"><div class="summary-bar"><div class="summary-bar-fill" style="width:${((i.saldo / maxSaldo) * 100).toFixed(1)}%"></div></div></td>
            </tr>
        `).join('');
    }
}

// ─── Export to Excel ─────────────────────────────────────────────
function exportToExcel() {
    if (!filteredData.length) return alert('No hay datos para exportar.');

    const empresa = window._empresa || {};
    const fechas = window._fechas || {};

    // Header rows
    const headerRows = [
        [empresa.nomcia || 'YELAVE'],
        ['SALDOS POR COBRAR'],
        [`Desde: ${fechas.inicio || ''}   Hasta: ${fechas.fin || ''}`],
        [],
        ['FECHA', 'T.D.', 'SERIE', 'N° DOCUM.', 'CÓDIGO', 'NOMBRE DEL CLIENTE', 'IMPORTE', 'A CTA', 'SALDO', 'VENDEDOR', 'FORMA PAGO', 'TIENDA RENDICIÓN'],
    ];

    const dataRows = filteredData.map(r => [
        r.fchdoc, r.coddoc, r.serie, r.nrodoc, r.codaux, r.nomaux,
        r.imptot, r.acta, r.saldo, r.nomven, r.nompgo, r.nomsol,
    ]);

    // Totals
    const totalImporte = filteredData.reduce((s, r) => s + (r.imptot || 0), 0);
    const totalActa = filteredData.reduce((s, r) => s + (r.acta || 0), 0);
    const totalSaldo = filteredData.reduce((s, r) => s + (r.saldo || 0), 0);
    dataRows.push([]);
    dataRows.push(['', '', '', '', '', 'TOTALES', totalImporte, totalActa, totalSaldo, '', '', '']);

    const allRows = [...headerRows, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // Column widths
    ws['!cols'] = [
        { wch: 12 }, { wch: 6 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 35 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 25 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Saldos por Cobrar');
    XLSX.writeFile(wb, `Saldos_Cobrar_${(empresa.codcia || 'ALL')}_${fechas.fin || 'report'}.xlsx`);
}

// ─── Export to PDF ───────────────────────────────────────────────
function exportToPDF() {
    if (!filteredData.length) return alert('No hay datos para exportar.');

    const empresa = window._empresa || {};
    const fechas = window._fechas || {};
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Header
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(empresa.nomcia || 'YELAVE', 14, 15);
    doc.setFontSize(14);
    doc.text('SALDOS POR COBRAR', 148, 15, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Desde: ${fechas.inicio || ''}    Hasta: ${fechas.fin || ''}`, 148, 21, { align: 'center' });
    doc.text(new Date().toLocaleDateString('es-PE'), 270, 15, { align: 'right' });

    // Table
    const head = [['Fecha', 'T.D.', 'Serie', 'N° Doc.', 'Código', 'Nombre Cliente', 'Importe', 'A Cta', 'Saldo', 'Vendedor', 'F. Pago', 'Tienda']];
    const body = filteredData.map(r => [
        r.fchdoc, r.coddoc, r.serie, r.nrodoc, r.codaux,
        (r.nomaux || '').substring(0, 30), fmt(r.imptot), fmt(r.acta), fmt(r.saldo),
        r.nomven, (r.nompgo || '').substring(0, 18), (r.nomsol || '').substring(0, 18),
    ]);

    // Totals
    const totalImporte = filteredData.reduce((s, r) => s + (r.imptot || 0), 0);
    const totalActa = filteredData.reduce((s, r) => s + (r.acta || 0), 0);
    const totalSaldo = filteredData.reduce((s, r) => s + (r.saldo || 0), 0);
    body.push(['', '', '', '', '', 'TOTALES', fmt(totalImporte), fmt(totalActa), fmt(totalSaldo), '', '', '']);

    doc.autoTable({
        head,
        body,
        startY: 25,
        styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'ellipsize' },
        headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255], fontSize: 6, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 255] },
        columnStyles: {
            6: { halign: 'right' },
            7: { halign: 'right' },
            8: { halign: 'right', textColor: [220, 38, 38] },
        },
        didParseCell: (data) => {
            if (data.row.index === body.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 230, 255];
            }
        },
        margin: { left: 8, right: 8 },
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 270, 200, { align: 'right' });
    }

    doc.save(`Saldos_Cobrar_${(empresa.codcia || 'ALL')}_${fechas.fin || 'report'}.pdf`);
}
