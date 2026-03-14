// ─── Conciliación Bancaria - Module Logic ────────────────────────────

// Auth Guard y Manejo de Sesión
function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    
    try {
        const user = JSON.parse(localStorage.getItem('yelave_user'));
        return user;
    } catch (e) {
        window.location.href = 'login.html';
        return null;
    }
}

function renderUserInfo(user) {
    if (!user) return;
    const nameEl = document.querySelector('.user-name');
    const roleEl = document.querySelector('.user-role');
    const avatarImg = document.querySelector('.avatar img');
    
    if (nameEl) nameEl.textContent = user.nombre || user.login;
    if (roleEl) roleEl.textContent = user.rol === 'ADMIN' ? 'Administrador' : 'Usuario';
    if (avatarImg) avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre || user.login)}&background=2b3954&color=fff`;
}

function logout() {
    localStorage.removeItem('yelave_token');
    localStorage.removeItem('yelave_user');
    window.location.href = 'login.html';
}

// State
let bankMovements = [];
let cobranzas = [];
let selectedBankIds = new Set();
let selectedCobKeys = new Set();
let dtCobranzas = null;
let dtMovimientosBanco = null;

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
    const user = checkAuth();
    if (user) {
        renderUserInfo(user);
    }

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
            <td>
                <span class="status ${statusClass}">${mov.Estado}</span>
                ${isMatched ? `<button class="btn-view-match" onclick="showMatchDetails(${mov.Id}, 'bank')" title="Ver detalles del match">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>` : ''}
            </td>
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
            <td style="display: flex; gap: 0.5rem; align-items: center;">
                <span class="amount positive">S/ ${Math.abs(importe).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                <button class="btn-view-match" onclick="showMatchDetails('${cobKey}', 'cob')" title="Ver detalles del match">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>
            </td>
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

// ─── TABS ────────────────────────────────────────────────────────────
function switchTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tabId).classList.add('active');
    document.getElementById(`btn-${tabId}`).classList.add('active');
    
    // Load data if switching to specific tabs
    if (tabId === 'tab-todas') {
        loadAllCobranzas();
    } else if (tabId === 'tab-banco') {
        loadMovimientosBanco();
    } else if (tabId === 'tab-reglas') {
        loadRules();
    }
}

// ─── MODALS ──────────────────────────────────────────────────────────
function openMatchModal() { document.getElementById('matchModal').classList.add('active'); }
function closeMatchModal() { document.getElementById('matchModal').classList.remove('active'); }
function openRuleModal() { document.getElementById('ruleModal').classList.add('active'); }
function closeRuleModal() { document.getElementById('ruleModal').classList.remove('active'); }

// ─── REPORTE COBRANZAS (TAB 2) ───────────────────────────────────────
async function loadAllCobranzas() {
    const tbody = document.getElementById('tbodyTodasCobranzas');
    
    if (dtCobranzas) {
        dtCobranzas.destroy();
    }
    
    tbody.innerHTML = '<tr><td colspan="21" class="loading-state empty-state">Cargando datos del servidor...</td></tr>';
    
    try {
        const year = document.getElementById('selectYear').value;
        const month = document.getElementById('selectMonth').value;
        const codcia = document.getElementById('selectEmpresa').value;
        let url = `/api/conciliacion/cobranzas-todas`;
        const params = new URLSearchParams();
        if (year) params.set('year', year);
        if (month) params.set('month', month);
        if (codcia) params.set('codcia', codcia);
        
        if (params.toString()) url += '?' + params.toString();

        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al cargar reporte de cobranzas');
        const data = await res.json();
        
        // Almacenar globalmente para el reporte
        cobranzasTodas = data;
        
        tbody.innerHTML = '';

        data.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="sticky-col">
                    <button class="btn-icon" onclick='viewItemDetails(${JSON.stringify(c)})' title="Ver Reporte de Caja">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                    </button>
                </td>
                <td>
                    ${c.Conciliado && c.MatchId ? 
                        `<button class="btn-icon" onclick='viewItemDetails(${JSON.stringify({...c, _showMatch: true})})' title="Ver match bancario" style="color: var(--success); border-color: var(--success);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
                                <path d="M18 12a2 2 0 0 0 0 4h4v-4z"></path>
                            </svg>
                        </button>` : 
                        `<span style="color:var(--text-muted); font-size:0.7rem;">—</span>`
                    }
                </td>
                <td>${c.id || ''}</td>
                <td>${c.NumCompte || ''}</td>
                <td>${c.FechaEfe ? new Date(c.FechaEfe).toLocaleDateString('es-PE') : ''}</td>
                <td>${c.Suc || ''}</td>
                <td>${c.Serie || ''}</td>
                <td>${c.TipoDoc || ''}</td>
                <td>${c.SerieDoc || ''}</td>
                <td>${c.NroDoc || ''}</td>
                <td>${c.CodBco || ''}</td>
                <td>${c.Correlat || ''}</td>
                <td class="amount">${parseFloat(c.Monto || 0).toFixed(2)}</td>
                <td>${c.NroDep || ''}</td>
                <td>${c.F_D ? new Date(c.F_D).toLocaleDateString('es-PE') : ''}</td>
                <td class="amount">${parseFloat(c.MntDoc || 0).toFixed(2)}</td>
                <td class="amount ${parseFloat(c.Importe || 0) < 0 ? 'negative' : 'positive'}">${parseFloat(c.Importe || 0).toFixed(2)}</td>
                <td class="amount">${parseFloat(c.TotalDoc || 0).toFixed(2)}</td>
                <td>${c.OC || ''}</td>
                <td class="amount">${parseFloat(c.MontoOC || 0).toFixed(2)}</td>
                <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.Glosa || ''}">${c.Glosa || ''}</td>
                <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.Concepto || ''}">${c.Concepto || ''}</td>
                <td>${c.codaux || ''}</td>
                <td>${c.NomAux || ''}</td>
                <td>${c.codven || ''}</td>
                <td>${c.nomven || ''}</td>
                <td>${c.codref || ''}</td>
                <td>${c.nroref || ''}</td>
                <td>${c.usuario || ''}</td>
                <td>${c.FlgEst || ''}</td>
                <td>${c.CodDep || ''}</td>
                <td>${c.tpopgo || ''}</td>
                <td>${c.Dcmpgo || ''}</td>
                <td>${c.CodCom || ''}</td>
                <td><span class="status ${c.Conciliado ? 'conciliado' : 'pendiente'}">${c.Conciliado ? 'CONCILIADO' : 'PENDIENTE'}</span></td>
            `;
            tbody.appendChild(tr);
        });

        if(data.length > 0) {
            dtCobranzas = $('#tableTodasCobranzas').DataTable({
                language: {
                    url: 'https://cdn.datatables.net/plug-ins/1.13.8/i18n/es-ES.json'
                },
                dom: '<"dt-top"lfB>rtip',
                scrollX: true,
                buttons: [
                    {
                        extend: 'excelHtml5',
                        text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Exportar a Excel',
                        className: 'dt-button'
                    }
                ],
                pageLength: 25,
                lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, 'Todos']],
                destroy: true
            });
        }
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="35" class="loading-state empty-state" style="color:var(--danger)">Error al cargar datos. Verifique la conexión al servidor.</td></tr>';
    }
}

// Filter cobranzas by conciliation status
function filterCobranzas(filter, btn) {
    // Toggle active button
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    if (!dtCobranzas) return;
    
    if (filter === 'todos') {
        dtCobranzas.search('').draw();
    } else if (filter === 'pendiente') {
        dtCobranzas.search('PENDIENTE').draw();
    } else if (filter === 'conciliado') {
        dtCobranzas.search('CONCILIADO').draw();
    }
}

// ─── REPORTE VISUALIZACIÓN (CAJA_TDA) ────────────────────────────────
let cobranzasTodas = [];

async function openReport(cajaId = null) {
    let data = cobranzasTodas;
    if (!data || data.length === 0) {
        await loadAllCobranzas();
        data = cobranzasTodas;
    }
    
    if (cajaId) {
        data = data.filter(c => c.NroCaja === cajaId);
    }

    if (!data || data.length === 0) {
        showToast('No hay datos para el reporte', 'warning');
        return;
    }

    const reportContent = document.getElementById('reportContent');
    const modal = document.getElementById('reportModal');
    const empresaNombre = document.getElementById('selectEmpresa').options[document.getElementById('selectEmpresa').selectedIndex]?.text.split(' - ')[1] || 'YELAVE INDUSTRIAS S.A.C.';
    const now = new Date().toLocaleDateString();

    // Grouping: Caja -> JT -> GroupName
    const boxes = {};
    data.forEach(item => {
        const boxKey = item.NroCaja || 'SIN CAJA';
        if (!boxes[boxKey]) boxes[boxKey] = { items: [], fecha: item.FechaEfe };
        boxes[boxKey].items.push(item);
    });

    let html = '';

    Object.keys(boxes).forEach(boxKey => {
        const box = boxes[boxKey];
        const fechaCaja = box.fecha ? new Date(box.fecha).toLocaleDateString() : '---';
        
        const allMatched = box.items.length > 0 && box.items.every(i => i.Conciliado);
        const matchStatusBadge = allMatched ? 
            `<span style="background:#10b981; color:white; padding: 4px 12px; border-radius:12px; font-size: 0.8rem; font-weight:bold;">✓ CAJA CONCILIADA TOTALMENTE</span>` : 
            `<span style="background:#f59e0b; color:white; padding: 4px 12px; border-radius:12px; font-size: 0.8rem; font-weight:bold;">⏳ CAJA PENDIENTE</span>`;

        html += `
            <div class="report-header" style="page-break-before: always; color: black; background: white; padding: 20px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <div style="font-size: 1rem; font-weight: 600;">${empresaNombre}</div>
                    <div style="font-size: 0.85rem;">${now}</div>
                </div>
                <div class="title" style="text-align:center; font-size:1.4rem; font-weight:bold; margin-bottom:1.5rem; text-transform: uppercase;">
                    Cancelacion de Documentos
                    <div style="margin-top:10px;">${matchStatusBadge}</div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size: 0.9rem; border-bottom:1px solid #000; padding-bottom:10px; margin-bottom:15px;">
                    <div>N° Caja: <b style="margin-left:5px;">${boxKey}</b></div>
                    <div>Fecha de Caja: <b style="margin-left:5px;">${fechaCaja}</b></div>
                    <div>Page: 1</div>
                </div>
                <div style="font-size:0.85rem; margin-bottom:10px;">CANCELACIONES DEL DIA : ${fechaCaja}</div>
            </div>
            
            <table class="report-table" style="width:100%; border-collapse:collapse; font-size:0.75rem; color: black; background: white; font-family: 'Arial', sans-serif;">
                <thead>
                    <tr style="border-top: 1px solid #000; border-bottom: 1px solid #000;">
                        <th style="text-align:left; padding:4px 2px;">T/D</th>
                        <th style="text-align:left; padding:4px 2px;">N° DOCUM.</th>
                        <th style="text-align:left; padding:4px 2px;">FCH. DOC.</th>
                        <th style="text-align:left; padding:4px 2px;">CODIGO</th>
                        <th style="text-align:left; padding:4px 2px;">RAZON SOCIAL</th>
                        <th style="text-align:left; padding:4px 2px;">N°OPER.</th>
                        <th style="text-align:left; padding:4px 2px;">FECHA</th>
                        <th style="text-align:center; padding:4px 2px;">MON.</th>
                        <th style="text-align:right; padding:4px 2px;">SOLES</th>
                        <th style="text-align:right; padding:4px 2px;">DOLARES</th>
                        <th style="text-align:center; padding:4px 2px;">ESTADO</th>
                    </tr>
                </thead>
                <tbody>
        `;

        // Group by JT and GroupName with fallbacks
        const groupsJT = {};
        box.items.forEach(item => {
            const jtKey = item.JT || 'VARIOS';
            const groupKey = item.GroupName || item.CuentaNombre || 'SIN CUENTA';
            if (!groupsJT[jtKey]) groupsJT[jtKey] = {};
            if (!groupsJT[jtKey][groupKey]) groupsJT[jtKey][groupKey] = [];
            groupsJT[jtKey][groupKey].push(item);
        });

        let boxTotalSoles = 0;
        let boxTotalDolares = 0;

        Object.keys(groupsJT).sort().forEach(jt => {
            Object.keys(groupsJT[jt]).sort().forEach(groupName => {
                const items = groupsJT[jt][groupName];
                let subTotalSoles = 0;
                let subTotalDolares = 0;

                html += `
                    <tr>
                        <td colspan="4" style="padding-top:15px; font-weight:bold; font-size:0.8rem; letter-spacing:0.5px; text-transform:uppercase;">${jt}</td>
                        <td colspan="7" style="padding-top:15px; font-weight:bold; font-size:0.8rem;">Cuenta: ${groupName}</td>
                    </tr>
                `;

                items.forEach(item => {
                    const fchDoc = item.OriginalFechaDoc ? new Date(item.OriginalFechaDoc).toLocaleDateString('es-PE', {day:'2-digit', month:'2-digit', year:'numeric'}) : (item.FechaEfe ? new Date(item.FechaEfe).toLocaleDateString('es-PE', {day:'2-digit', month:'2-digit', year:'numeric'}) : '');
                    const fchEfe = item.FechaEfe ? new Date(item.FechaEfe).toLocaleDateString('es-PE', {year:'numeric', month:'2-digit', day:'2-digit'}) : '';
                    const soles = item.Soles || 0;
                    const dolares = item.Dolares || 0;
                    subTotalSoles += soles;
                    subTotalDolares += dolares;

                    html += `
                        <tr style="${item.Conciliado ? 'background: #f0fdf4;' : ''}">
                            <td style="padding:2px 2px;">${item.TipoDocCancelado || ''}</td>
                            <td style="padding:2px 2px;">${item.NroDocCancelado || ''}</td>
                            <td style="padding:2px 2px;">${fchDoc}</td>
                            <td style="padding:2px 2px;">${item.Codigo || ''}</td>
                            <td style="padding:2px 2px; max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.RazonSocial || ''}</td>
                            <td style="padding:2px 2px;">${item.NroDep || ''}</td>
                            <td style="padding:2px 2px;">${fchEfe}</td>
                            <td style="padding:2px 2px; text-align:center;">${soles > 0 ? 'S/.' : (dolares > 0 ? '$' : 'S/.')}</td>
                            <td style="text-align:right; padding:2px 2px;">${soles > 0 ? soles.toLocaleString('en-US', {minimumFractionDigits:2}) : '0.00'}</td>
                            <td style="text-align:right; padding:2px 2px;">${dolares > 0 ? dolares.toLocaleString('en-US', {minimumFractionDigits:2}) : '0.00'}</td>
                            <td style="text-align:center; padding:2px 2px;">
                                ${item.Conciliado ? 
                                    `<span style="color:#10b981; font-weight:bold; font-size:0.75rem; vertical-align:middle;">✓</span>
                                     <button onclick="showMatchDetails('${item.Suc}|${item.SerieDoc}|${item.NroDoc}|${item.Correlat}', 'cob')" style="background:none; border:none; color:#2563eb; cursor:pointer; font-size:0.75rem; margin-left:4px; vertical-align:middle;" title="Ver Conciliación">👁</button>` : 
                                    `<span style="color:#f59e0b; font-size:0.7rem; vertical-align:middle;">⏳ Pend.</span>`
                                }
                            </td>
                        </tr>
                    `;
                });

                boxTotalSoles += subTotalSoles;
                boxTotalDolares += subTotalDolares;

                html += `
                    <tr style="font-weight:bold;">
                        <td colspan="8" style="text-align:right; padding:4px 8px;">SUB TOTAL:</td>
                        <td style="text-align:right; padding:4px 2px; border-top: 1px solid #000;">${subTotalSoles.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td style="text-align:right; padding:4px 2px; border-top: 1px solid #000;">${subTotalDolares.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td></td>
                    </tr>
                `;
            });
        });

        html += `
                <tr style="border-top:2px solid #000; font-weight:bold; font-size:0.85rem;">
                    <td colspan="8" style="text-align:right; padding:8px;">TOTAL GRAL.:</td>
                    <td style="text-align:right; padding:8px;">${boxTotalSoles.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                    <td style="text-align:right; padding:8px;">${boxTotalDolares.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                    <td></td>
                </tr>
            </tbody>
        </table>
        <div style="height: 40px;"></div>
        `;
    });

    reportContent.innerHTML = html;
    modal.style.display = 'flex';
}

function closeReport() {
    document.getElementById('reportModal').style.display = 'none';
}

function printReport() {
    window.print();
}

async function viewItemDetails(c) {
    if (c.Conciliado && c.MatchId) {
        // Mostrar detalles de conciliación
        try {
            const res = await fetch(`/api/conciliacion/match-details?match_id=${c.MatchId}`);
            if (!res.ok) throw new Error('Error al obtener detalles de conciliación');
            const data = await res.json();
            
            const tbody = document.getElementById('tbodyMatchDetails');
            tbody.innerHTML = `
                <tr>
                    <td style="padding:0.75rem; border-bottom: 1px solid #e2e8f0;">
                        <div style="font-weight:600; color:#2563eb;">DOCUMENTO (Sistema)</div>
                        <div style="font-size:0.8rem; color:#64748b;">${data.cobranza.CodCia} - ${data.cobranza.NroDoc}</div>
                    </td>
                    <td style="padding:0.75rem; border-bottom: 1px solid #e2e8f0; color:#334155;">
                        <div>${data.cobranza.RazonSocial}</div>
                        <div style="font-size:0.8rem; color:#94a3b8;">${data.cobranza.Cuenta}</div>
                    </td>
                    <td style="padding:0.75rem; border-bottom: 1px solid #e2e8f0; color:#334155;">
                        ${data.cobranza.Fecha ? new Date(data.cobranza.Fecha).toLocaleDateString() : '---'}
                    </td>
                    <td style="padding:0.75rem; border-bottom: 1px solid #e2e8f0; text-align:right; font-weight:600; color:#1e293b;">
                        ${data.cobranza.Importe.toLocaleString('es-PE', {minimumFractionDigits:2})}
                    </td>
                    <td style="padding:0.75rem; border-bottom: 1px solid #e2e8f0; text-align:center;">
                        <span style="font-size:0.7rem; padding:2px 6px; border-radius:4px; background:#eff6ff; color:#2563eb;">COBRANZA</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding:0.75rem;">
                        <div style="font-weight:600; color:#10b981;">OPERACIÓN (Banco)</div>
                        <div style="font-size:0.8rem; color:#64748b;">${data.banco.Operacion}</div>
                    </td>
                    <td style="padding:0.75rem; color:#334155;">
                        <div>${data.banco.Descripcion}</div>
                    </td>
                    <td style="padding:0.75rem; color:#334155;">
                        ${data.banco.Fecha ? new Date(data.banco.Fecha).toLocaleDateString() : '---'}
                    </td>
                    <td style="padding:0.75rem; text-align:right; font-weight:600; color:#1e293b;">
                        ${data.banco.Monto.toLocaleString('es-PE', {minimumFractionDigits:2})}
                    </td>
                    <td style="padding:0.75rem; text-align:center;">
                        <span style="font-size:0.7rem; padding:2px 6px; border-radius:4px; background:#ecfdf5; color:#10b981;">BANCO</span>
                    </td>
                </tr>
            `;
            
            document.getElementById('matchDetailsModal').style.display = 'flex';
        } catch (err) {
            console.error(err);
            showToast('No se pudo cargar el detalle de la conciliación', 'error');
        }
    } else {
        // Mostrar el reporte agrupado para la Caja completa del item
        openReport(c.NroCaja);
    }
}

// ─── REPORTE MOVIMIENTOS BANCARIOS (TAB 4) ───────────────────────────────────────
async function loadMovimientosBanco() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    const year = document.getElementById('selectYear').value;
    const month = document.getElementById('selectMonth').value;

    const tbody = document.getElementById('tbodyMovimientosBanco');
    if (dtMovimientosBanco) {
        dtMovimientosBanco.destroy();
    }

    if (!codcia || !bankCode) {
        tbody.innerHTML = '<tr><td colspan="12" class="empty-state">Seleccione empresa y banco en los filtros superiores para ver los movimientos</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="12" class="loading-state empty-state">Cargando datos del servidor...</td></tr>';
    
    try {
        let url = `/api/conciliacion/movimientos-banco?codcia=${codcia}&bank_code=${bankCode}`;
        if(year) url += `&year=${year}`;
        if(month) url += `&month=${month}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al cargar movimientos de banco');
        const data = await res.json();
        
        tbody.innerHTML = '';

        data.forEach(c => {
            const isMatched = c.Estado === 'Conciliado';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${c.Id || ''}</td>
                <td>${c.Fecha || ''}</td>
                <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.Descripcion || ''}">${c.Descripcion || ''}</td>
                <td class="amount ${parseFloat(c.Monto || 0) < 0 ? 'negative' : 'positive'}">${parseFloat(c.Monto || 0).toFixed(2)}</td>
                <td class="amount">${parseFloat(c.Saldo || 0).toFixed(2)}</td>
                <td>${c.Sucursal || ''}</td>
                <td>${c.OperacionNumero || ''}</td>
                <td>${c.OperacionHora || ''}</td>
                <td>${c.Referencia || ''}</td>
                <td>${c.OpManual || ''}</td>
                <td>${c.OpCancelacion || ''}</td>
                <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.DescripcionFinal || ''}">${c.DescripcionFinal || ''}</td>
                <td>
                    <span class="status ${isMatched ? 'conciliado' : 'pendiente'}">${c.Estado || 'Pendiente'}</span>
                    ${isMatched ? `<button class="btn-view-match" onclick="showMatchDetails(${c.Id}, 'bank')" style="background:none; border:none; color:var(--accent-color); cursor:pointer; padding: 2px;">👁</button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });

        if(data.length > 0) {
            dtMovimientosBanco = $('#tableMovimientosBanco').DataTable({
                language: {
                    url: 'https://cdn.datatables.net/plug-ins/1.13.8/i18n/es-ES.json'
                },
                dom: '<"dt-top"lfB>rtip',
                scrollX: true,
                buttons: [
                    {
                        extend: 'excelHtml5',
                        text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Exportar a Excel',
                        className: 'dt-button'
                    }
                ],
                pageLength: 25,
                lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, 'Todos']],
                destroy: true
            });
        }
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="12" class="loading-state empty-state" style="color:var(--danger)">Error al cargar datos. Verifique la conexión al servidor.</td></tr>';
    }
}

// ─── REGLAS DE LIMPIEZA (TAB 3) ──────────────────────────────────────
async function loadRules() {
    const tbody = document.getElementById('tbodyReglas');
    tbody.innerHTML = '<tr><td colspan="4" class="loading-state empty-state">Cargando reglas...</td></tr>';
    
    try {
        const res = await fetch('/api/conciliacion/reglas');
        if (!res.ok) throw new Error('Error al cargar reglas');
        const data = await res.json();
        
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay reglas configuradas</td></tr>';
            return;
        }

        data.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family: monospace;">LIKE '%${r.condicion}%'</td>
                <td style="font-family: monospace;">'${r.resultado}'</td>
                <td><span class="status conciliado">Activo</span></td>
                <td>
                    <button class="btn btn-secondary" onclick="deleteRule(${r.id})" style="background-color: var(--danger-color); color: white; border: none; padding: 0.2rem 0.5rem; font-size: 0.75rem;">Eliminar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="4" class="loading-state empty-state" style="color:var(--danger)">Error al cargar reglas.</td></tr>';
    }
}

async function saveRule() {
    const condicion = document.getElementById('ruleCondition').value.trim();
    const resultado = document.getElementById('ruleResult').value.trim();
    
    if (!condicion || !resultado) {
        showToast('Debe ingresar la condición y el resultado', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/conciliacion/reglas', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ condicion, resultado })
        });
        
        if (!res.ok) throw new Error('Error al guardar regla');
        
        showToast('Regla guardada correctamente', 'success');
        closeRuleModal();
        document.getElementById('ruleCondition').value = '';
        document.getElementById('ruleResult').value = '';
        loadRules();
    } catch (err) {
        console.error(err);
        showToast('Error al guardar la regla', 'error');
    }
}

async function deleteRule(id) {
    if (!confirm('¿Desea eliminar esta regla de limpieza?')) return;
    
    try {
        const res = await fetch(`/api/conciliacion/reglas/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar regla');
        
        showToast('Regla eliminada', 'success');
        loadRules();
    } catch (err) {
        console.error(err);
        showToast('Error al eliminar la regla', 'error');
    }
}

async function runCleaningRules() {
    try {
        const res = await fetch('/api/conciliacion/limpiar-banco', { method: 'POST' });
        if (!res.ok) throw new Error('Error al ejecutar limpieza');
        const data = await res.json();
        
        showToast(`Se actualizaron ${data.registros_actualizados} movimientos bancarios`, 'success');
        if (document.getElementById('tab-cruce').classList.contains('active')) {
            loadData();
        }
    } catch (err) {
        console.error(err);
        showToast('Error al ejecutar las reglas de limpieza', 'error');
    }
}

async function showMatchDetails(id, type) {
    const modal = document.getElementById('matchDetailsModal');
    const tbody = document.getElementById('tbodyMatchDetails');
    if (!modal || !tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="loading-state">Cargando detalles...</td></tr>';
    modal.style.display = 'flex';

    try {
        let url = '';
        if (type === 'bank') {
            url = `/api/conciliacion/movimiento-banco/${id}/match-details`;
        } else {
            // Unpack the key used in renderCobTable (codcia|coddoc|nrodoc|nroitm)
            const parts = id.split('|'); 
            const [codcia, coddoc, nrodoc, nroitm] = parts;
            url = `/api/conciliacion/cobranza/match-details?codcia=${codcia}&coddoc=${coddoc}&nrodoc=${nrodoc}&nroitm=${nroitm}`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al obtener detalles');
        const data = await res.json();

        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No se encontraron detalles de vinculación.</td></tr>';
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            if (type === 'bank') {
                tr.innerHTML = `
                    <td>${item.coddoc} - ${item.nrodoc}</td>
                    <td>${item.NomAux || ''}</td>
                    <td>${item.fchdoc ? new Date(item.fchdoc).toLocaleDateString('es-PE') : ''}</td>
                    <td class="amount positive">S/ ${parseFloat(item.import || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td><span class="status-chip match-type" style="background:var(--accent-soft); color:var(--accent-color); padding:2px 8px; border-radius:12px; font-size:10px;">SISTEMA</span></td>
                `;
            } else {
                tr.innerHTML = `
                    <td>${item.OperacionNumero || 'N/A'}</td>
                    <td>${item.Descripcion || ''}</td>
                    <td>${item.Fecha ? new Date(item.Fecha).toLocaleDateString('es-PE') : ''}</td>
                    <td class="amount positive">S/ ${parseFloat(item.Monto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td><span class="status-chip match-type" style="background:var(--success-soft); color:var(--success-color); padding:2px 8px; border-radius:12px; font-size:10px;">BANCO</span></td>
                `;
            }
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger); text-align:center; padding:2rem;">Error: ${err.message}</td></tr>`;
    }
}

function closeMatchDetailsModal() {
    const modal = document.getElementById('matchDetailsModal');
    if (modal) modal.style.display = 'none';
}
