const API_BASE_URL = '/api';
const BASE_URL = '/api';

let dtRequerimientos, dtCotizaciones, dtAprobaciones, dtKardex, dtQC;

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initDataTables();
    loadCompanies();
    loadFormulasToSelect();
});

async function loadCompanies() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/permisos/empresas/me', { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (!res.ok) throw new Error();
        const companies = await res.json();
        const sel = document.getElementById('filterCia');
        sel.innerHTML = '<option value="" disabled selected>Selecciona Empresa...</option>';
        companies.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.codcia; opt.textContent = `${c.codcia} - ${c.nomcia}`;
            sel.appendChild(opt);
        });

        const cu = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        if (cu.codcia && Array.from(sel.options).some(o => o.value === cu.codcia)) {
            sel.value = cu.codcia;
        } else if (companies.length > 0) {
            sel.value = companies[0].codcia;
        }
        
        if (sel.value) loadLogisticsData();
    } catch (e) {
        console.error('Error loadCompanies:', e);
        document.getElementById('filterCia').innerHTML = '<option value="" disabled>Sin acceso a empresas</option>';
    }
}

function loadLogisticsData() {
    loadKPIs();
    loadRequerimientos();
}

function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const target = document.getElementById(tab.getAttribute('data-target'));
            target.classList.add('active');

            // Load specific data based on tab
            const targetId = tab.getAttribute('data-target');
            if (targetId === 'tab-cotizaciones' && (!dtCotizaciones || dtCotizaciones.data().count() === 0)) loadCotizaciones();
            if (targetId === 'tab-aprobaciones' && (!dtAprobaciones || dtAprobaciones.data().count() === 0)) loadAprobaciones();
            if (targetId === 'tab-calidad' && (!dtQC || dtQC.data().count() === 0)) loadQC();
        });
    });
}

function initDataTables() {
    const dtConfig = {
        language: { url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json' },
        pageLength: 10,
        responsive: true,
        scrollX: true
    };
    
    dtRequerimientos = $('#tableRequerimientos').DataTable(dtConfig);
    dtCotizaciones = $('#tableCotizaciones').DataTable(dtConfig);
    dtAprobaciones = $('#tableAprobaciones').DataTable(dtConfig);
    dtKardex = $('#tableKardex').DataTable(dtConfig);
    dtQC = $('#tableQC').DataTable(dtConfig);
}

// ─── 10. KPIS ─────────────────────────────────────────────────────────────
async function loadKPIs() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) return;
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`${BASE_URL}/logistics/dashboard/kpis?codcia=${codcia}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error al cargar KPIs');
        const data = await res.json();
        
        document.getElementById('kpiReq').textContent = data.requerimientos_pendientes;
        document.getElementById('kpiOc').textContent = data.ordenes_pendientes;
        document.getElementById('kpiCrit').textContent = data.stock_critico;
        document.getElementById('kpiForm').textContent = data.total_formulas;
    } catch (e) {
        console.error(e);
    }
}

// ─── 1. REQUERIMIENTOS ────────────────────────────────────────────────────
async function loadRequerimientos() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) return;
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`${BASE_URL}/logistics/requirements?codcia=${codcia}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error de red');
        const data = await res.json();
        
        dtRequerimientos.clear();
        data.forEach(r => {
            const btn = `<button class="btn-action" onclick="viewReq('${r.nrodoc}')">Ver Detalle</button>`;
            const estadoHtml = r.estado === '0' ? '<span class="badge pending">PENDIENTE</span>' : '<span class="badge approved">CERRADO</span>';
            dtRequerimientos.row.add([
                r.nrodoc, r.fchdoc ? r.fchdoc.split('T')[0] : '', r.glodoc, r.nomped, r.usuario, estadoHtml, btn
            ]);
        });
        dtRequerimientos.draw();
    } catch (e) {
        console.error("Error cargando requerimientos", e);
    }
}

async function viewReq(nrodoc) {
    const codcia = document.getElementById('filterCia').value;
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`${BASE_URL}/logistics/requirements/${nrodoc}?codcia=${codcia}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error cargando detalles');
        const data = await res.json();
        
        const tbody = document.getElementById('reqModalBody');
        tbody.innerHTML = '';
        data.forEach(d => {
            tbody.innerHTML += `
                <tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:0.75rem;">${d.nroitm}</td>
                    <td style="padding:0.75rem;">${d.codmat}</td>
                    <td style="padding:0.75rem;">${d.desmat}</td>
                    <td style="padding:0.75rem;">${d.undstk}</td>
                    <td style="padding:0.75rem;">${parseFloat(d.stock).toFixed(2)}</td>
                    <td style="padding:0.75rem; font-weight:600;">${parseFloat(d.imptot).toFixed(2)}</td>
                </tr>
            `;
        });
        document.getElementById('reqModalTitle').innerText = `Detalle Requerimiento ${nrodoc}`;
        document.getElementById('reqModal').classList.add('active');
    } catch (e) {
        Swal.fire('Error', 'No se pudieron cargar los detalles', 'error');
    }
}

function closeReqModal() { document.getElementById('reqModal').classList.remove('active'); }

// ─── 2. MOTOR DE CÁLCULO ──────────────────────────────────────────────────
async function loadFormulasToSelect() {
    try {
        const res = await fetch(`${BASE_URL}/logistics/formulas`);
        if (!res.ok) throw new Error('Error al cargar fórmulas');
        const data = await res.json();
        
        const sel = document.getElementById('calcFormulaSelect');
        sel.innerHTML = '<option value="">Seleccione fórmula...</option>';
        data.forEach(f => {
            sel.innerHTML += `<option value="${f.codlin}">${f.codlin} - ${f.nomprod || f.deslin} (Base: ${f.canprod})</option>`;
        });
    } catch (e) { console.error(e); }
}

async function runCalculationEngine() {
    const codlin = document.getElementById('calcFormulaSelect').value;
    const qty = document.getElementById('calcQty').value;
    const codcia = document.getElementById('filterCia').value;
    
    if (!codlin || !qty || !codcia) return Swal.fire('Error', 'Debe seleccionar empresa, fórmula y cantidad a producir', 'warning');

    Swal.fire({ title: 'Ejecutando Motor...', text: 'Cruzando receta contra stock por almacenes', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`${BASE_URL}/logistics/calculate-needs`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ codlin: codlin, cantidad_producir: parseFloat(qty), codcia: codcia, almcen: '01' })
        });
        
        if (!res.ok) throw new Error((await res.json()).detail || 'Error en el cálculo');
        const data = await res.json();
        
        const tbody = document.getElementById('calcResultsBody');
        tbody.innerHTML = '';
        data.needs.forEach(n => {
            const faltanteHtml = n.faltante_comprar > 0 
                ? `<span style="color:#ef4444; font-weight:700;">${n.faltante_comprar.toFixed(4)} ${n.undstk}</span>`
                : `<span style="color:#10b981; font-weight:700;">Stock Suficiente (0)</span>`;
                
            tbody.innerHTML += `
                <tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:0.75rem;">${n.codmat}</td>
                    <td style="padding:0.75rem;">${n.desmat}</td>
                    <td style="padding:0.75rem;">${n.stock_total.toFixed(4)} ${n.undstk}</td>
                    <td style="padding:0.75rem;">${n.req_qty.toFixed(4)} ${n.undstk}</td>
                    <td style="padding:0.75rem;">${faltanteHtml}</td>
                </tr>
            `;
        });
        
        document.getElementById('calcResults').style.display = 'block';
        Swal.close();
        
    } catch (e) {
        Swal.fire('Error Módulo Cálculo', e.message, 'error');
    }
}

function openCreateQuoteFromCalc() {
    Swal.fire('Módulo Compras', 'Generación Automática de requerimientos y cotizaciones estará disponible integrando la vista de compras de Majestic.', 'info');
}

// ─── 4. COTIZACIONES ──────────────────────────────────────────────────────
async function loadCotizaciones() {
    try {
        const res = await fetch(`${BASE_URL}/logistics/quotes`);
        const data = await res.json();
        dtCotizaciones.clear();
        data.forEach(c => {
            const fch = c.FchDoc ? c.FchDoc.split('T')[0] : '';
            let btn = `<button class="btn-action secondary" disabled>Pendiente</button>`;
            if (c.Estado === 'PENDIENTE') {
                btn = `<button class="btn-action" onclick="solicitarAprobacion('COTI', '${c.IdCoti}')">Solicitar Aprob.</button>`;
            } else if (c.Estado === 'APROBADO') {
                btn = `<button class="btn-action success">Aprobada</button>`;
            }
            dtCotizaciones.row.add([ c.IdCoti, c.NroReq, fch, c.Prov_RUC, c.Prov_Nom, `S/ ${c.ImpTot.toFixed(2)}`, btn ]);
        });
        dtCotizaciones.draw();
    } catch (e) { console.error(e); }
}

function openNewQuoteModal() {
    Swal.fire('Nueva Cotización', 'Integración Manual Directa: En desarrollo.', 'info');
}

// ─── 5. APROBACIONES ──────────────────────────────────────────────────────
async function solicitarAprobacion(tipo, id) {
    Swal.fire({
        title: 'Solicitar Aprobación Jefatura', 
        text: '¿Enviar a flujo de aprobación corporativa?',
        showCancelButton: true, confirmButtonText: 'Enviar'
    }).then(async (res) => {
        if (res.isConfirmed) {
            try {
                await fetch(`${BASE_URL}/logistics/approvals`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ doc_tipo: tipo, doc_id: id, nivel: 'JEFATURA', estado: 'APROBADO', comentario: 'Revisión aut.' })
                });
                Swal.fire('Enviado', 'Actualizado exitosamente', 'success');
                loadCotizaciones();
                loadAprobaciones();
            } catch (e) {}
        }
    });
}

async function loadAprobaciones() {
    try {
        const res = await fetch(`${BASE_URL}/logistics/approvals`);
        const data = await res.json();
        dtAprobaciones.clear();
        data.forEach(a => {
            const fch = a.Fecha ? a.Fecha.split('T')[0] : '';
            const estHtml = a.Estado === 'APROBADO' ? `<span style="color:#10b981;font-weight:bold;">APROBADO</span>` : `<span style="color:#ef4444;font-weight:bold;">${a.Estado}</span>`;
            dtAprobaciones.row.add([ fch, a.DocTipo, a.DocId, a.Nivel, estHtml, a.Usuario, a.Comentario ]);
        });
        dtAprobaciones.draw();
    } catch (e) { console.error(e); }
}

// ─── 8. CONTROL DE CALIDAD ────────────────────────────────────────────────
async function loadQC() {
    try {
        const res = await fetch(`${BASE_URL}/logistics/qc`);
        const data = await res.json();
        dtQC.clear();
        data.forEach(q => {
            const fch = q.FechaEval ? q.FechaEval.split('T')[0] : '';
            const estHtml = q.Estado === 'APROBADO' ? `<span style="color:#10b981;font-weight:bold;">LIBERADO</span>` : `<span style="color:#f59e0b;font-weight:bold;">${q.Estado}</span>`;
            dtQC.row.add([ q.IdCC, q.NroLote, q.CodMat, fch, estHtml, q.Usuario, q.Comentario ]);
        });
        dtQC.draw();
    } catch (e) { console.error(e); }
}

function openNewQcModal() {
    Swal.fire({
        title: 'Registrar QC Lote',
        html: `
            <input type="text" id="qcLote" class="swal2-input" placeholder="Número de Lote">
            <input type="text" id="qcMat" class="swal2-input" placeholder="Material (CodMat)">
            <select id="qcEst" class="swal2-input"><option value="APROBADO">Aprobado / Liberado</option><option value="RECHAZADO">Rechazado / Retenido</option></select>
        `,
        confirmButtonText: 'Guardar Resultado',
        preConfirm: () => {
            const l = document.getElementById('qcLote').value;
            const m = document.getElementById('qcMat').value;
            const e = document.getElementById('qcEst').value;
            if(!l || !m) Swal.showValidationMessage('Complete lote y material');
            return { l, m, e };
        }
    }).then(async (result) => {
        if(result.isConfirmed) {
            try {
                await fetch(`${BASE_URL}/logistics/qc`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nrolote: result.value.l, codmat: result.value.m, estado: result.value.e, comentario: 'Inspección API', usuario: 'calidad_user' })
                });
                Swal.fire('Guardado', 'Control de calidad registrado', 'success');
                loadQC();
            } catch (err) {}
        }
    });
}

// ─── 9. KARDEX ─────────────────────────────────────────────────────────────
async function loadKardex() {
    const cod = document.getElementById('kardexCodMat').value;
    const codcia = document.getElementById('filterCia').value;
    if(!cod || !codcia) return Swal.fire('Error', 'Ingrese código y seleccione empresa', 'warning');

    Swal.fire({ title: 'Generando Kardex...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`${BASE_URL}/logistics/kardex/${cod}?codcia=${codcia}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Material no encontrado o sin movs');
        const data = await res.json();
        
        document.getElementById('kardexStockVal').innerText = data.stock_actual.toFixed(4);
        
        dtKardex.clear();
        data.movimientos.forEach(m => {
            const htmlMov = m.tipmov === 'INGRESO' ? `<span style="color:#10b981;font-weight:600;">+ INGRESO</span>` : `<span style="color:#ef4444;font-weight:600;">- SALIDA</span>`;
            dtKardex.row.add([
                m.fchdoc || '', htmlMov, m.nrodoc, m.cantidad.toFixed(4), m.precio.toFixed(2), m.total.toFixed(2)
            ]);
        });
        dtKardex.draw();
        
        document.getElementById('kardexResults').style.display = 'block';
        Swal.close();
    } catch (e) {
        Swal.fire('Kardex', e.message, 'error');
    }
}
