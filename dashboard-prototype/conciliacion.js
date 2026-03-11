// ─── Conciliación Bancaria - Module Logic ────────────────────────────

// State
let bankMovements = [];
let cobranzas = [];
let selectedBankIds = new Set();
let selectedCobKeys = new Set();

// ─── Sidebar Toggle (shared) ──────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    if (sidebar.classList.contains('open')) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

// ─── Toast Notifications ──────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ─── Init ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadEmpresas();
    setupDragDrop();

    // Set current year/month
    const now = new Date();
    document.getElementById('selectYear').value = now.getFullYear().toString();
    document.getElementById('selectMonth').value = String(now.getMonth() + 1).padStart(2, '0');
});

// ─── Load Empresas ─────────────────────────────────────────────────────
async function loadEmpresas() {
    try {
        const res = await fetch('/api/conciliacion/empresas');
        if (!res.ok) throw new Error('Error loading empresas');
        const empresas = await res.json();

        const select = document.getElementById('selectEmpresa');
        select.innerHTML = '<option value="">Seleccione empresa</option>';
        empresas.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.codcia;
            opt.textContent = `${e.codcia} - ${e.nomcia}`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error(err);
        showToast('Error al cargar empresas', 'error');
    }
}

// ─── On Empresa Change ─────────────────────────────────────────────────
async function onEmpresaChange() {
    const codcia = document.getElementById('selectEmpresa').value;
    const selectBanco = document.getElementById('selectBanco');

    if (!codcia) {
        selectBanco.innerHTML = '<option value="">Seleccione empresa primero</option>';
        selectBanco.disabled = true;
        return;
    }

    try {
        const res = await fetch(`/api/conciliacion/bancos/${codcia}`);
        if (!res.ok) throw new Error('Error loading bancos');
        const bancos = await res.json();

        selectBanco.innerHTML = '<option value="">Seleccione banco</option>';
        bancos.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.Codigo;
            opt.textContent = `${b.Codigo} - ${b.Nombre}`;
            selectBanco.appendChild(opt);
        });
        selectBanco.disabled = false;
    } catch (err) {
        console.error(err);
        showToast('Error al cargar bancos', 'error');
    }
}

function onBancoChange() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    const btnAuto = document.getElementById('btnAutoMatch');

    if (codcia && bankCode) {
        btnAuto.disabled = false;
    } else {
        btnAuto.disabled = true;
    }
}

// ─── Load Data ────────────────────────────────────────────────────────
async function loadData() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    const year = document.getElementById('selectYear').value;
    const month = document.getElementById('selectMonth').value;

    if (!codcia || !bankCode) {
        showToast('Seleccione empresa y banco', 'info');
        return;
    }

    // Load bank movements, cobranzas, and summary in parallel
    await Promise.all([
        loadBankMovements(codcia, bankCode, year, month),
        loadCobranzas(codcia, year, month),
        loadResumen(codcia, bankCode, year, month)
    ]);
}

// ─── Load Bank Movements ─────────────────────────────────────────────
async function loadBankMovements(codcia, bankCode, year, month) {
    try {
        const params = new URLSearchParams({ codcia, bank_code: bankCode, year, month });
        const res = await fetch(`/api/conciliacion/movimientos-banco?${params}`);
        if (!res.ok) throw new Error('Error loading bank movements');
        bankMovements = await res.json();
        renderBankTable();
    } catch (err) {
        console.error(err);
        showToast('Error al cargar movimientos bancarios', 'error');
    }
}

// ─── Load Cobranzas ──────────────────────────────────────────────────
async function loadCobranzas(codcia, year, month) {
    try {
        const crossCompany = document.getElementById('checkCrossCompany').checked;
        const params = new URLSearchParams({ year, month, solo_pendientes: 'true' });
        if (!crossCompany) {
            params.set('codcia', codcia);
        }
        const res = await fetch(`/api/conciliacion/cobranzas?${params}`);
        if (!res.ok) throw new Error('Error loading cobranzas');
        cobranzas = await res.json();
        renderCobTable();
    } catch (err) {
        console.error(err);
        showToast('Error al cargar cobranzas', 'error');
    }
}

// ─── Load Resumen ────────────────────────────────────────────────────
async function loadResumen(codcia, bankCode, year, month) {
    try {
        const params = new URLSearchParams({ codcia, bank_code: bankCode, year, month });
        const res = await fetch(`/api/conciliacion/resumen?${params}`);
        if (!res.ok) throw new Error('Error loading resumen');
        const data = await res.json();

        document.getElementById('statTotalMov').textContent = data.total_movimientos.toLocaleString();
        document.getElementById('statTotalMonto').textContent = `S/ ${data.total_monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        document.getElementById('statMatched').textContent = data.conciliados.toLocaleString();
        document.getElementById('statMatchedMonto').textContent = `S/ ${data.conciliados_monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        document.getElementById('statPending').textContent = data.pendientes.toLocaleString();
        document.getElementById('statPendingMonto').textContent = `S/ ${data.pendientes_monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        document.getElementById('statPercent').textContent = `${data.porcentaje_conciliado}%`;
    } catch (err) {
        console.error(err);
    }
}

// ─── Render Bank Movements Table ─────────────────────────────────────
function renderBankTable() {
    const tbody = document.getElementById('tbodyBank');
    const filter = document.getElementById('filterEstadoBanco').value;

    let filtered = bankMovements;
    if (filter) {
        filtered = bankMovements.filter(m => m.Estado === filter);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-state empty-state">No hay movimientos bancarios</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach((mov, idx) => {
        const isMatched = mov.Estado === 'Conciliado';
        const isSelected = selectedBankIds.has(mov.Id);
        const tr = document.createElement('tr');
        tr.className = isMatched ? 'row-matched' : (isSelected ? 'row-selected' : '');
        tr.style.animation = `fadeIn 0.3s ease-out ${idx * 0.02}s forwards`;
        tr.style.opacity = '0';

        const fecha = mov.Fecha ? new Date(mov.Fecha).toLocaleDateString('es-PE') : '';
        const monto = parseFloat(mov.Monto || 0);
        const statusClass = isMatched ? 'conciliado' : 'pendiente';

        tr.innerHTML = `
            <td><input type="checkbox" ${isMatched ? 'disabled' : ''} ${isSelected ? 'checked' : ''} 
                onchange="toggleBankSelection(${mov.Id}, this.checked)" data-bank-id="${mov.Id}"></td>
            <td>${fecha}</td>
            <td title="${mov.Descripcion || ''}">${truncate(mov.Descripcion || '', 30)}</td>
            <td><span class="amount ${monto >= 0 ? 'positive' : 'negative'}">S/ ${Math.abs(monto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span></td>
            <td>${mov.OpCancelacion ? `<span class="nro-dep-match">${mov.OpCancelacion}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td><span class="status ${statusClass}">${mov.Estado}</span></td>
            <td>${isMatched ? `<button class="btn-unmatch" onclick="unmatchBank(${mov.ReconciliationDetailId})">Deshacer</button>` : ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

function filterBankTable() {
    renderBankTable();
}

// ─── Render Cobranzas Table ──────────────────────────────────────────
function renderCobTable() {
    const tbody = document.getElementById('tbodyCob');

    if (cobranzas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-state empty-state">No hay cobranzas pendientes</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    cobranzas.forEach((cob, idx) => {
        const cobKey = `${cob.CodCia}|${cob.coddoc}|${cob.nrodoc}|${cob.nroitm}`;
        const isSelected = selectedCobKeys.has(cobKey);
        const tr = document.createElement('tr');
        tr.className = isSelected ? 'row-selected' : '';
        tr.style.animation = `fadeIn 0.3s ease-out ${idx * 0.02}s forwards`;
        tr.style.opacity = '0';

        const importe = parseFloat(cob.import || 0);
        const fchDep = cob.fchDep ? new Date(cob.fchDep).toLocaleDateString('es-PE') : '—';

        tr.innerHTML = `
            <td><input type="checkbox" ${isSelected ? 'checked' : ''} 
                onchange="toggleCobSelection('${cobKey}', this.checked)" data-cob-key="${cobKey}"></td>
            <td>${(cob.CodCia || '').trim()}</td>
            <td><span class="badge lot">${(cob.coddoc || '').trim()}</span></td>
            <td>${(cob.nrodoc || '').trim()}</td>
            <td title="${(cob.NomAux || '').trim()}">${truncate((cob.NomAux || '').trim(), 25)}</td>
            <td><span class="amount positive">S/ ${Math.abs(importe).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span></td>
            <td>${cob.NroDep ? `<span class="nro-dep-match">${(cob.NroDep || '').trim()}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${fchDep}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ─── Selection Logic ─────────────────────────────────────────────────
function toggleBankSelection(id, checked) {
    if (checked) {
        selectedBankIds.add(id);
    } else {
        selectedBankIds.delete(id);
    }
    updateMatchButton();
    renderBankTable();
}

function toggleCobSelection(key, checked) {
    if (checked) {
        selectedCobKeys.add(key);
    } else {
        selectedCobKeys.delete(key);
    }
    updateMatchButton();
    renderCobTable();
}

function toggleAllBank() {
    const checkAll = document.getElementById('checkAllBank').checked;
    const filter = document.getElementById('filterEstadoBanco').value;
    let filtered = bankMovements;
    if (filter) filtered = bankMovements.filter(m => m.Estado === filter);

    selectedBankIds.clear();
    if (checkAll) {
        filtered.forEach(m => {
            if (m.Estado !== 'Conciliado') selectedBankIds.add(m.Id);
        });
    }
    updateMatchButton();
    renderBankTable();
}

function toggleAllCob() {
    const checkAll = document.getElementById('checkAllCob').checked;
    selectedCobKeys.clear();
    if (checkAll) {
        cobranzas.forEach(c => {
            selectedCobKeys.add(`${c.CodCia}|${c.coddoc}|${c.nrodoc}|${c.nroitm}`);
        });
    }
    updateMatchButton();
    renderCobTable();
}

function updateMatchButton() {
    const btn = document.getElementById('btnManualMatch');
    btn.disabled = !(selectedBankIds.size === 1 && selectedCobKeys.size === 1);
}

// ─── Auto Match ──────────────────────────────────────────────────────
async function runAutoMatch() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    const year = document.getElementById('selectYear').value;
    const month = document.getElementById('selectMonth').value;

    if (!codcia || !bankCode) {
        showToast('Seleccione empresa y banco', 'info');
        return;
    }

    const btn = document.getElementById('btnAutoMatch');
    btn.disabled = true;
    btn.textContent = 'Procesando...';

    try {
        const res = await fetch('/api/conciliacion/auto-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                codcia,
                bank_code: bankCode,
                period_year: year,
                period_month: month
            })
        });

        if (!res.ok) throw new Error('Error en auto-match');
        const data = await res.json();

        showToast(`${data.matched_count} de ${data.total_processed} movimientos conciliados automáticamente`, 'success');

        // Reload data
        await loadData();
    } catch (err) {
        console.error(err);
        showToast('Error en conciliación automática', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> Conciliación Automática`;
    }
}

// ─── Manual Match ────────────────────────────────────────────────────
async function matchSelected() {
    if (selectedBankIds.size !== 1 || selectedCobKeys.size !== 1) {
        showToast('Seleccione exactamente 1 movimiento bancario y 1 cobranza', 'info');
        return;
    }

    const bankId = [...selectedBankIds][0];
    const cobKey = [...selectedCobKeys][0];
    const [codcia, coddoc, nrodoc, nroitm] = cobKey.split('|');

    try {
        const res = await fetch('/api/conciliacion/manual-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bank_movement_id: bankId,
                match_codcia: codcia,
                match_coddoc: coddoc,
                match_nrodoc: nrodoc,
                match_nroitm: nroitm
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Error en match manual');
        }

        showToast('Conciliación manual realizada exitosamente', 'success');

        selectedBankIds.clear();
        selectedCobKeys.clear();
        await loadData();
    } catch (err) {
        console.error(err);
        showToast(err.message, 'error');
    }
}

// ─── Unmatch ─────────────────────────────────────────────────────────
async function unmatchBank(detailId) {
    if (!detailId) return;
    if (!confirm('¿Desea deshacer esta conciliación?')) return;

    try {
        const res = await fetch(`/api/conciliacion/unmatch/${detailId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al deshacer match');

        showToast('Conciliación deshecha exitosamente', 'success');
        await loadData();
    } catch (err) {
        console.error(err);
        showToast('Error al deshacer la conciliación', 'error');
    }
}

// ─── File Upload ─────────────────────────────────────────────────────
function setupDragDrop() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            uploadFile(e.dataTransfer.files[0]);
        }
    });
}

function handleFileSelect(event) {
    if (event.target.files.length > 0) {
        uploadFile(event.target.files[0]);
    }
}

async function uploadFile(file) {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;

    if (!codcia || !bankCode) {
        showToast('Seleccione empresa y banco antes de importar', 'info');
        return;
    }

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
        showToast('Solo se aceptan archivos Excel (.xlsx, .xls)', 'error');
        return;
    }

    const uploadArea = document.getElementById('dropZone');
    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const uploadStatus = document.getElementById('uploadStatus');

    uploadArea.style.display = 'none';
    progressDiv.style.display = 'block';
    progressFill.style.width = '30%';
    uploadStatus.textContent = `Importando ${file.name}...`;

    try {
        const formData = new FormData();
        formData.append('file', file);

        progressFill.style.width = '60%';

        const res = await fetch(`/api/conciliacion/upload-excel?codcia=${codcia}&bank_code=${bankCode}`, {
            method: 'POST',
            body: formData
        });

        progressFill.style.width = '90%';

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Error al importar');
        }

        const data = await res.json();
        progressFill.style.width = '100%';
        uploadStatus.textContent = `✓ ${data.rows_imported} movimientos importados exitosamente`;

        showToast(`${data.rows_imported} movimientos importados`, 'success');

        setTimeout(() => {
            uploadArea.style.display = 'flex';
            progressDiv.style.display = 'none';
            progressFill.style.width = '0%';
        }, 2500);

        // Refresh data
        await loadData();
    } catch (err) {
        console.error(err);
        showToast(`Error al importar: ${err.message}`, 'error');
        uploadArea.style.display = 'flex';
        progressDiv.style.display = 'none';
        progressFill.style.width = '0%';
    }
}

// ─── Utilities ───────────────────────────────────────────────────────
function truncate(str, max) {
    return str.length > max ? str.substring(0, max) + '...' : str;
}
