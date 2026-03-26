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
let homologacionMap = {};  // Vendedor alias mapping

const API_BASE = '/api/cuentas-cobrar';
const fmt = (n) => new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

// ─── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadEmpresas();
    setDefaultDates();
    loadHomologacion();

    $('#filterCia').select2({
        placeholder: "Seleccione empresa(s)",
        allowClear: true,
        width: '100%'
    });

    document.getElementById('reportForm').addEventListener('submit', (e) => {
        e.preventDefault();
        generateReport();
    });

    document.getElementById('searchInput').addEventListener('input', debounce(applySearch, 300));
    document.getElementById('selAgrupacion').addEventListener('change', renderTable);
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
        const sel = document.getElementById('filterCia');
        sel.innerHTML = ''; // Start clean without default option for Select2 multi
        empresas.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.codcia;
            opt.textContent = `${e.codcia} - ${e.nomcia}`;
            sel.appendChild(opt);
        });
        $('#filterCia').trigger('change');
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
    const codciaArr = $('#filterCia').val();
    const codcia = codciaArr ? codciaArr.join(',') : '';
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;

    if (!codcia) { alert('Seleccione al menos una empresa.'); return; }

    showLoader(true);

    try {
        const url = `${API_BASE}/report?codcia=${codcia}&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        reportData = result.data || [];
        applyHomologacionToData(); // Applies aliases and updates filteredData
        
        // Store empresa info for print/export
        window._empresa = result.empresa;
        window._fechas = { inicio: fechaInicio, fin: fechaFin };

        // KPIs
        updateKPIs(result);

        // Load summary for charts
        const sumUrl = `${API_BASE}/summary?codcia=${codcia}&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`;
        const sumRes = await fetch(sumUrl);
        summaryData = await sumRes.json();
        
        // Re-calculate vendors summary locally using aliases
        recalcSummaryVendedor();

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
    const groupBy = document.getElementById('selAgrupacion').value;

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
            <td colspan="7" style="text-align:right; font-weight:700;">TOTALES (${filteredData.length} docs)</td>
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
        <td class="text-center" style="font-weight:600; color:var(--text-light);">${r.codcia || ''}</td>
        <td>${r.fchdoc || ''}</td>
        <td class="text-center">${docBadge}</td>
        <td>${r.serie || ''}</td>
        <td>${r.nrodoc || ''}</td>
        <td>${r.codaux || ''}</td>
        <td title="${r.nomaux || ''}">${(r.nomaux || '').substring(0, 40)}</td>
        <td class="text-right">${fmt(r.imptot)}</td>
        <td class="text-right">${fmt(r.acta)}</td>
        <td class="text-right" style="color:#f87171; font-weight:600;">${fmt(r.saldo)}</td>
        <td>${r.vendedor_homologado || r.nomven || ''}</td>
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
            <td colspan="7" style="font-weight:700; color:#818cf8; padding:0.6rem 0.75rem;">
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
        const icon = th.querySelector('.sort-icon i');
        if (icon) icon.className = sortAsc ? 'fas fa-sort-up' : 'fas fa-sort-down';
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

// ─── Export Helpers ─────────────────────────────────────────────
function buildExportRows(format) {
    const groupBy = document.getElementById('selAgrupacion').value;
    const bodyRows = [];
    
    // Helper to format currency
    const fVal = (val) => format === 'pdf' ? fmt(val) : val;
    // Helper to format string length
    const fStr = (str, len) => format === 'pdf' && str ? str.substring(0, len) : (str || '');

    if (!groupBy) {
        filteredData.forEach(r => {
            bodyRows.push([
                r.codcia, r.fchdoc, r.coddoc, r.serie, r.nrodoc, r.codaux,
                fStr(r.nomaux, 30), fVal(r.imptot), fVal(r.acta), fVal(r.saldo),
                fStr(r.vendedor_homologado || r.nomven, 18), fStr(r.nompgo, 15), fStr(r.nomsol, 15)
            ]);
        });
    } else {
        const groups = {};
        filteredData.forEach(r => {
            const key = r[groupBy] || '(Sin dato)';
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });

        const labelMap = {
            'nomven': 'Vendedor', 'vendedor_homologado': 'Vendedor',
            'nomaux': 'Cliente', 'nompgo': 'Forma Pago', 'tienda': 'Tienda',
            'nomgru': 'Grupo', 'coddoc': 'Tipo Doc', 'nomsol': 'Tienda Rendición'
        };
        const labelName = labelMap[groupBy] || 'Grupo';

        Object.keys(groups).sort().forEach(key => {
            const items = groups[key];
            const gImporte = items.reduce((s, r) => s + (r.imptot || 0), 0);
            const gActa = items.reduce((s, r) => s + (r.acta || 0), 0);
            const gSaldo = items.reduce((s, r) => s + (r.saldo || 0), 0);
            
            bodyRows.push([`── [ ${labelName}: ${key} ] ──`, '', '', '', '', `(${items.length} docs)`, '', fVal(gImporte), fVal(gActa), fVal(gSaldo), '', '', '']);
            
            items.forEach(r => {
                bodyRows.push([
                    r.codcia, r.fchdoc, r.coddoc, r.serie, r.nrodoc, r.codaux,
                    fStr(r.nomaux, 30), fVal(r.imptot), fVal(r.acta), fVal(r.saldo),
                    fStr(r.vendedor_homologado || r.nomven, 18), fStr(r.nompgo, 15), fStr(r.nomsol, 15)
                ]);
            });
            bodyRows.push([]); // spacer row for separation
        });
    }
    return bodyRows;
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
        ['EMPRESA', 'FECHA', 'T.D.', 'SERIE', 'N° DOCUM.', 'CÓDIGO', 'NOMBRE DEL CLIENTE', 'IMPORTE', 'A CTA', 'SALDO', 'VENDEDOR', 'FORMA PAGO', 'TIENDA RENDICIÓN'],
    ];

    const dataRows = buildExportRows('excel');

    // Totals
    const totalImporte = filteredData.reduce((s, r) => s + (r.imptot || 0), 0);
    const totalActa = filteredData.reduce((s, r) => s + (r.acta || 0), 0);
    const totalSaldo = filteredData.reduce((s, r) => s + (r.saldo || 0), 0);
    dataRows.push(['', '', '', '', '', 'TOTAL GENERAL', '', totalImporte, totalActa, totalSaldo, '', '', '']);

    const allRows = [...headerRows, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // Column widths
    ws['!cols'] = [
        { wch: 8 }, { wch: 12 }, { wch: 6 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 35 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 25 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Saldos_por_Cobrar');
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
    doc.text(empresa.nomcia || 'YELAVE (MULTI-EMPRESA)', 14, 15);
    doc.setFontSize(14);
    doc.text('SALDOS POR COBRAR', 148, 15, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Desde: ${fechas.inicio || ''}    Hasta: ${fechas.fin || ''}`, 148, 21, { align: 'center' });
    doc.text(new Date().toLocaleDateString('es-PE'), 270, 15, { align: 'right' });

    // Table
    const head = [['Empresa', 'Fecha', 'T.D.', 'Serie', 'N° Doc.', 'Código', 'Nombre Cliente', 'Importe', 'A Cta', 'Saldo', 'Vendedor', 'F. Pago', 'Tienda']];
    const body = buildExportRows('pdf');

    // Totals
    const totalImporte = filteredData.reduce((s, r) => s + (r.imptot || 0), 0);
    const totalActa = filteredData.reduce((s, r) => s + (r.acta || 0), 0);
    const totalSaldo = filteredData.reduce((s, r) => s + (r.saldo || 0), 0);
    body.push(['', '', '', '', '', '', 'TOTAL GENERAL', fmt(totalImporte), fmt(totalActa), fmt(totalSaldo), '', '', '']);

    doc.autoTable({
        head,
        body,
        startY: 25,
        theme: 'striped',
        styles: { fontSize: 6, cellPadding: 1 },
        columnStyles: {
            7: { halign: 'right' },
            8: { halign: 'right' },
            9: { halign: 'right', textColor: [220, 38, 38], fontStyle: 'bold' } // bold red for Saldo
        },
        willDrawCell: function(data) {
            if (data.row.section === 'body') {
                const firstCell = String(data.row.raw[0] || '');
                if (firstCell.startsWith('── [')) {
                    doc.setFillColor(230, 230, 245);
                    doc.setTextColor(50, 50, 150);
                    doc.setFont('', 'bold');
                } else if (firstCell === '') {
                    // Check if it's the TOTAL GENERAL cell
                    if (String(data.row.raw[6] || '') === 'TOTAL GENERAL') {
                        doc.setFillColor(200, 200, 220);
                        doc.setTextColor(0, 0, 0);
                        doc.setFont('', 'bold');
                    }
                }
            }
        },
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

// ─── Homologacion Vendedores (Persistencia Local) ─────────────────

function loadHomologacion() {
    try {
        homologacionMap = JSON.parse(localStorage.getItem('ccb_homologacion_ven') || '{}');
    } catch(e) {
        homologacionMap = {};
    }
}

function applyHomologacionToData() {
    reportData.forEach(r => {
        const orig = (r.nomven || '').trim();
        r.vendedor_homologado = homologacionMap[orig] || orig || '(Sin Vendedor)';
    });
    filteredData = [...reportData];
}

function recalcSummaryVendedor() {
    if (!summaryData) return;
    
    // Almacena origin_by_vendedor si aun no lo tenemos
    if (!summaryData.raw_by_vendedor) {
        summaryData.raw_by_vendedor = [...(summaryData.by_vendedor || [])];
    }
    
    const grouped = {};
    summaryData.raw_by_vendedor.forEach(item => {
        const orig = (item.label || '').trim();
        const alias = homologacionMap[orig] || orig || '(Sin Vendedor)';
        
        if (!grouped[alias]) {
            grouped[alias] = { label: alias, saldo: 0, importe: 0, count: 0 };
        }
        grouped[alias].saldo += item.saldo || 0;
        grouped[alias].importe += item.importe || 0;
        grouped[alias].count += item.count || 0;
    });
    
    // Sort combined alias descending
    summaryData.by_vendedor = Object.values(grouped).sort((a,b) => b.saldo - a.saldo);
}

function openHomologacionModal() {
    // Unicos desde TODOS los registros crudos cargados, no solo summary, para asegurar 100% de cruce
    const unicos = [...new Set(reportData.map(r => (r.nomven || '').trim()))].filter(v => v);
    unicos.sort();
    
    const tbody = document.getElementById('homologacionTbody');
    if (unicos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">No hay vendedores en los registros actuales. Debes generar un reporte primero.</td></tr>';
    } else {
        tbody.innerHTML = unicos.map(v => `
            <tr>
                <td style="font-size:0.85rem; color: #cbd5e1; font-weight:500;">
                    ${v}
                </td>
                <td style="padding: 0.5rem;">
                    <input type="text" class="form-control form-control-sm inp-homologacion" style="background: rgba(15,23,42,0.4); border-color:var(--border-dark); color:white;"
                           data-orig="${v}" value="${homologacionMap[v] || ''}" 
                           placeholder="Alias Unificado (Para unir)">
                </td>
            </tr>
        `).join('');
    }

    document.getElementById('homologacionModal').classList.add('active');
}

function closeHomologacionModal() {
    document.getElementById('homologacionModal').classList.remove('active');
}

function saveHomologacion() {
    const inputs = document.querySelectorAll('.inp-homologacion');
    if(inputs.length === 0) {
        closeHomologacionModal();
        return;
    }

    // Preserve old mappings
    let newMap = { ...homologacionMap };
    
    inputs.forEach(inp => {
        const orig = inp.dataset.orig;
        const alias = inp.value.trim();
        if (alias) {
            newMap[orig] = alias;
        } else {
            delete newMap[orig];
        }
    });
    
    homologacionMap = newMap;
    localStorage.setItem('ccb_homologacion_ven', JSON.stringify(homologacionMap));
    
    Swal.fire({
        background: '#1e293b',
        color: '#fff',
        icon: 'success',
        title: '¡Guardado!',
        text: 'La homologación se ha aplicado.',
        timer: 1500,
        showConfirmButton: false
    });
    
    closeHomologacionModal();
    
    // Re-render
    if (reportData.length > 0) {
        applyHomologacionToData();
        applySearch(); // triggers renderTable()
        
        recalcSummaryVendedor();
        renderCharts();
        
        // Refresh summary pane if active
        const btnActivo = document.querySelector('#pane-resumen .btn-glass.active');
        if (btnActivo && btnActivo.textContent.includes('Vendedor')) {
            showSummary('vendedor', btnActivo);
        }
    }
}
