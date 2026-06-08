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
        if (!user) throw new Error('No user data');
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
    
    // Role display
    let roleLabel = 'Consultor';
    if (user.login === '71941916JL' || user.rol === 'ADMIN') {
        roleLabel = 'Administrador';
    } else if (user.rol) {
        roleLabel = user.rol;
    }
    if (roleEl) roleEl.textContent = roleLabel;
    
    if (avatarImg) avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre || user.login)}&background=2b3954&color=fff`;

    // Access Control
    const currentLogin = String(user.login || '').trim().toUpperCase();
    const isSuperuser = currentLogin === '71941916JL' || currentLogin.includes('71941916JL');
    const isAdmin = String(user.rol || '').trim().toUpperCase() === 'ADMIN';
    const userRol = String(user.rol || '').trim().toUpperCase();

    if (isSuperuser || isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
    }

    // Role-based navigation visibility
    document.querySelectorAll('.nav-item, .nav-group').forEach(el => {
        const href = (el.getAttribute('href') || '').toLowerCase();
        
        // Dashboard and Profile are always visible
        if (href.includes('index.html') || href.includes('profile.html')) {
            el.style.display = 'flex';
            return;
        }

        let isVisible = false;

        if (isSuperuser || isAdmin) {
            isVisible = true;
        } else if (userRol === 'LOGISTICA') {
            if (href.includes('orders.html')) isVisible = true;
        } else if (userRol === 'CONTROL_INTERNO') {
            if (href.includes('conciliacion.html')) isVisible = true;
        } else if (userRol === 'CONTABILIDAD') {
            if (href.includes('orders.html') || href.includes('conciliacion.html')) isVisible = true;
        }

        if (!isVisible) {
            el.style.display = 'none';
        }
    });

    // Handle nav groups
    document.querySelectorAll('.nav-group').forEach(group => {
        const visibleItems = Array.from(group.querySelectorAll('.nav-item')).filter(item => item.style.display !== 'none');
        if (visibleItems.length === 0) {
            group.style.display = 'none';
        } else {
            group.style.display = 'block';
        }
    });

    // COMERCIAL TAB RESTRICTIONS
    if (userRol === 'COMERCIAL') {
        const hideTabs = ['btn-tab-cruce', 'btn-tab-banco', 'btn-tab-reglas', 'btn-tab-ajustes'];
        hideTabs.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'none';
        });
        // Set default tab to 'Todas las Cobranzas' for Comercial users
        setTimeout(() => switchTab('tab-todas'), 100);
    }
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
let currentCurrencySymbol = 'S/';

function getCurrencySymbol(codMon) {
    if (String(codMon).trim() === '2') return 'US$';
    return 'S/';
}

function formatUTCLocalDate(dateStr) {
    if (!dateStr) return '';
    if (typeof dateStr === 'string' && dateStr.includes('/')) {
        return dateStr.split(' ')[0];
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('es-PE', { timeZone: 'UTC' });
    }
    return dateStr;
}

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
        const token = localStorage.getItem('yelave_token');
        let empresas = [];
        
        // Primero intentar obtener empresas filtradas por permisos del usuario
        if (token) {
            try {
                const res = await fetch('/api/permisos/empresas/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    empresas = await res.json();
                }
            } catch(e) {
                console.warn('Error cargando empresas por permisos, usando fallback', e);
            }
        }
        
        // Fallback: si no hay empresas del endpoint de permisos, usar el general
        if (!empresas || empresas.length === 0) {
            const res = await fetch('/api/conciliacion/empresas');
            if (!res.ok) throw new Error('Error loading empresas');
            empresas = await res.json();
        }

        const select = document.getElementById('selectEmpresa');
        select.innerHTML = '<option value="">Seleccione empresa</option>';
        empresas.forEach(e => {
            const opt = document.createElement('option');
            opt.value = (e.codcia || '').trim();
            opt.textContent = `${(e.codcia || '').trim()} - ${(e.nomcia || '').trim()}`;
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
        
        const btnDelete = document.getElementById('btnDeleteAllBank');
        if (btnDelete) btnDelete.disabled = true;
        
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
            opt.dataset.codmon = b.CodMon || '1';
            const monLabel = String(b.CodMon).trim() === '2' ? 'US$' : 'S/';
            opt.textContent = `${b.Codigo} - ${b.Nombre} (${monLabel})`;
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
    const selectBanco = document.getElementById('selectBanco');
    const bankCode = selectBanco.value;
    const btnAuto = document.getElementById('btnAutoMatch');

    // Actualizar símbolo de moneda según el banco seleccionado
    const selectedOption = selectBanco.options[selectBanco.selectedIndex];
    if (selectedOption && selectedOption.dataset.codmon) {
        currentCurrencySymbol = getCurrencySymbol(selectedOption.dataset.codmon);
    } else {
        currentCurrencySymbol = 'S/';
    }

    const btnDelete = document.getElementById('btnDeleteAllBank');

    if (codcia && bankCode) {
        btnAuto.disabled = false;
        if (btnDelete) btnDelete.disabled = false;
    } else {
        btnAuto.disabled = true;
        if (btnDelete) btnDelete.disabled = true;
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

    // Load data for Cruce and Report tabs
    await Promise.allSettled([
        loadBankMovements(codcia, bankCode, year, month),
        loadCobranzas(codcia, year, month),
        loadResumen(codcia, bankCode, year, month),
        loadConciliados(),
        loadAllCobranzas()
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
        const bankCode = document.getElementById('selectBanco').value;
        const params = new URLSearchParams({ year, month, solo_pendientes: 'true' });
        params.set('codcia', codcia);
        if (bankCode) params.set('bank_code', bankCode);
        if (crossCompany) params.set('cross_company', 'true');
        
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
        document.getElementById('statTotalMonto').textContent = `${currentCurrencySymbol} ${data.total_monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        document.getElementById('statMatched').textContent = data.conciliados.toLocaleString();
        document.getElementById('statMatchedMonto').textContent = `${currentCurrencySymbol} ${data.conciliados_monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        document.getElementById('statPending').textContent = data.pendientes.toLocaleString();
        document.getElementById('statPendingMonto').textContent = `${currentCurrencySymbol} ${data.pendientes_monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        document.getElementById('statPercent').textContent = `${data.porcentaje_conciliado}%`;
    } catch (err) {
        console.error(err);
    }
}

// ─── Render Bank Movements Table ─────────────────────────────────────
let dtCruceBank = null;

function renderBankTable() {
    const filter = document.getElementById('filterEstadoBanco').value;
    
    let filtered = bankMovements;
    if (filter) {
        filtered = bankMovements.filter(m => m.Estado === filter);
    }
    
    if (dtCruceBank) {
        dtCruceBank.clear().rows.add(filtered).draw();
        return;
    }

    // Initialize DataTable using Javascript array to prevent DOM freezing
    dtCruceBank = $('#tableBankMov').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json' },
        pageLength: 50,
        deferRender: true,
        data: filtered,
        dom: '<"table-top"fB>rt<"table-bottom"ip>',
        buttons: [
            { extend: 'excel', text: 'Exportar Excel', className: 'btn btn-primary btn-sm' }
        ],
        order: [[1, 'desc']],
        columns: [
            {
                data: null,
                orderable: false,
                render: function(data, type, row) {
                    const isMatched = row.Estado === 'Conciliado';
                    const isSelected = selectedBankIds.has(row.Id) ? 'checked' : '';
                    const dis = isMatched ? 'disabled' : '';
                    return `<input type="checkbox" ${dis} ${isSelected} onchange="toggleBankSelection(${row.Id}, this.checked, this)" data-bank-id="${row.Id}">`;
                }
            },
            { data: 'Fecha', render: data => formatUTCLocalDate(data) },
            { data: 'Descripcion', render: data => {
                    let d = data || '';
                    return `<span title="${d}">${truncate(d, 30)}</span>`;
                }
            },
            { data: 'Monto', render: data => {
                    const monto = parseFloat(data || 0);
                    return `<span class="amount ${monto >= 0 ? 'positive' : 'negative'}">${currentCurrencySymbol} ${Math.abs(monto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>`;
                }
            },
            { data: null, orderable: false, render: function(data, type, row) {
                    const dis = row.Estado === 'Conciliado' ? 'disabled' : '';
                    const val = (row.OpManual || '').replace(/"/g, '&quot;');
                    return `<input type="text" class="op-manual-input" value="${val}" onchange="updateOpManualCruce(${row.Id}, this.value, this)" placeholder="—" ${dis}>`;
                }
            },
            { data: 'OpCancelacion', className: 'op-cancel-cell-cruce', render: data => data ? `<span class="nro-dep-match">${data}</span>` : '<span style="color:var(--text-muted)">—</span>' },
            { data: null, render: function(data, type, row) {
                    const isMatched = row.Estado === 'Conciliado';
                    const statusClass = isMatched ? 'conciliado' : 'pendiente';
                    let html = `<span class="status ${statusClass}">${row.Estado}</span>`;
                    if (isMatched) {
                        html += ` <button class="btn-view-match" onclick="showMatchDetails(${row.Id}, 'bank')" title="Ver detalles del match"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>`;
                    }
                    return html;
                }
            },
            { data: null, render: function(data, type, row) {
                    if (row.Estado === 'Conciliado') {
                        return `<button class="btn-unmatch" onclick="unmatchBank(${row.ReconciliationDetailId})">Deshacer</button>`;
                    }
                    return '';
                }
            }
        ],
        createdRow: function(row, data, dataIndex) {
            if (data.Estado === 'Conciliado') {
                $(row).addClass('row-matched');
            } else if (selectedBankIds.has(data.Id)) {
                $(row).addClass('row-selected');
            }
        }
    });
}

function filterBankTable() {
    renderBankTable();
}

async function updateOpManualCruce(id, newValue, inputEl) {
    try {
        const res = await fetch(`/api/conciliacion/movimientos-banco/${id}/op-manual`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ op_manual: newValue })
        });
        if (!res.ok) throw new Error('Error');
        
        const td = inputEl.closest('td');
        const nextTd = td.nextElementSibling;
        if(nextTd && nextTd.classList.contains('op-cancel-cell-cruce')) {
            nextTd.innerHTML = newValue ? `<span class="nro-dep-match">${newValue}</span>` : '<span style="color:var(--text-muted)">—</span>';
        }
        
        // Update local array to keep table in sync
        const mov = bankMovements.find(m => m.Id === id);
        if(mov) {
            mov.OpManual = newValue;
            mov.OpCancelacion = newValue;
        }
        showToast('Guardado correctamtente', 'success');
    } catch(err) {
        showToast('Error al modificar', 'error');
    }
}

// ─── Render Cobranzas Table ──────────────────────────────────────────
let dtCruceCobranzas = null;

function renderCobTable() {
    if (dtCruceCobranzas) {
        dtCruceCobranzas.clear().rows.add(cobranzas).draw();
        return;
    }

    dtCruceCobranzas = $('#tableCobranzas').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json' },
        pageLength: 50,
        deferRender: true,
        data: cobranzas,
        dom: '<"table-top"fB>rt<"table-bottom"ip>',
        buttons: [
            { extend: 'excel', text: 'Exportar Excel', className: 'btn btn-primary btn-sm' }
        ],
        order: [[7, 'desc']],
        columns: [
            { 
              data: null, 
              orderable: false,
              render: function(data, type, row) {
                 const key = `${row.CodCia}|${row.coddoc}|${row.nrodoc}|${row.nroitm}`;
                 const isChecked = selectedCobKeys.has(key) ? 'checked' : '';
                 return `<input type="checkbox" ${isChecked} onchange="toggleCobSelection('${key}', this.checked, this)" data-cob-key="${key}">`;
              }
            },
            { data: 'CodCia', render: data => (data || '').trim() },
            { data: 'coddoc', render: data => `<span class="badge lot">${(data || '').trim()}</span>` },
            { data: 'nrodoc', render: data => (data || '').trim() },
            { data: 'NomAux', render: data => {
                 let t = (data || '').trim();
                 return `<span title="${t}">${truncate(t, 25)}</span>`;
              }
            },
            { data: 'import', render: data => {
                 let val = Math.abs(parseFloat(data || 0));
                 return `<span class="amount positive">${currentCurrencySymbol} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>`;
              }
            },
            { data: 'NroDep', render: data => data ? `<span class="nro-dep-match">${(data || '').trim()}</span>` : '<span style="color:var(--text-muted)">—</span>' },
            { data: null, render: function(data, type, row) { return formatUTCLocalDate(row.fchDep || row.fchdoc); } },
            { data: 'codref', render: data => (data || '').trim() },
            { data: 'nroref', render: data => (data || '').trim() },
            { data: 'tpopgo', render: data => (data || '').trim() },
            { data: 'CodDep', render: data => (data || '').trim() },
            { data: 'CodCom', render: data => (data || '').trim() }
        ],
        createdRow: function(row, data, dataIndex) {
            const key = `${data.CodCia}|${data.coddoc}|${data.nrodoc}|${data.nroitm}`;
            if (selectedCobKeys.has(key)) {
                $(row).addClass('row-selected');
            }
        }
    });
}

// ─── Selection Logic ─────────────────────────────────────────────────
function toggleBankSelection(id, checked, checkboxEl) {
    if (checked) {
        selectedBankIds.add(id);
    } else {
        selectedBankIds.delete(id);
    }
    
    // Update UI without full re-render
    if (checkboxEl) {
        const tr = checkboxEl.closest('tr');
        if (tr) {
            if (checked) tr.classList.add('row-selected');
            else tr.classList.remove('row-selected');
        }
    }
    updateMatchButton();
}

function toggleCobSelection(key, checked, checkboxEl) {
    if (checked) {
        selectedCobKeys.add(key);
    } else {
        selectedCobKeys.delete(key);
    }
    
    // Update UI without full re-render
    if (checkboxEl) {
        const tr = checkboxEl.closest('tr');
        if (tr) {
            if (checked) tr.classList.add('row-selected');
            else tr.classList.remove('row-selected');
        }
    }
    updateMatchButton();
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
    
    if (selectedBankIds.size === 0 || selectedCobKeys.size === 0) {
        btn.disabled = true;
        btn.title = "Seleccione al menos 1 movimiento bancario y 1 cobranza";
        return;
    }

    let sumBancos = 0;
    selectedBankIds.forEach(id => {
        const mov = bankMovements.find(m => String(m.Id) === String(id));
        if (mov) sumBancos += parseFloat(mov.Monto || 0);
    });

    let sumCobranzas = 0;
    selectedCobKeys.forEach(key => {
        const cob = cobranzas.find(c => `${c.CodCia}|${c.coddoc}|${c.nrodoc}|${c.nroitm}` === key);
        if (cob) sumCobranzas += parseFloat(cob.import || 0);
    });

    const maxDiffInput = document.getElementById('inputDiferenciaAceptada');
    const maxDiff = maxDiffInput ? parseFloat(maxDiffInput.value) : 0.50;

    const diff = Math.abs(Math.abs(sumBancos) - Math.abs(sumCobranzas));
    if (diff <= maxDiff) {
        btn.disabled = false;
        btn.title = "Importes cuadran dentro del margen. Clic para conciliar.";
    } else {
        btn.disabled = true;
        btn.title = `Diferencia de importes: ${currentCurrencySymbol} ${diff.toFixed(2)}`;
    }
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

    const modal = document.getElementById('turtleProgressModal');
    const bar = document.getElementById('turtleProgressBar');
    const text = document.getElementById('turtleProgressText');
    const turtle = document.getElementById('turtleIcon');
    const timeText = document.getElementById('turtleTimeText');
    
    if (modal) modal.style.display = 'flex';
    let progress = 0;
    let secondsElapsed = 0;
    if (bar) bar.style.width = '0%';
    if (text) text.textContent = '0%';
    if (turtle) turtle.style.left = '0%';
    if (timeText) timeText.textContent = 'Tiempo transcurrido: 0s';
    
    // Simulate progress up to 90% while the request is running
    const progressInterval = setInterval(() => {
        if (progress < 90) {
            progress += Math.floor(Math.random() * 5) + 2;
            if (progress > 90) progress = 90;
            if (bar) bar.style.width = progress + '%';
            if (text) text.textContent = progress + '%';
            if (turtle) turtle.style.left = `calc(${progress}% - 25px)`;
        }
    }, 400);

    const timerInterval = setInterval(() => {
        secondsElapsed++;
        if (timeText) {
            if (progress === 90) {
                timeText.textContent = `Procesando gran volumen de datos... Tiempo transcurrido: ${secondsElapsed}s`;
            } else {
                timeText.textContent = `Tiempo transcurrido: ${secondsElapsed}s`;
            }
        }
    }, 1000);

    const btn = document.getElementById('btnAutoMatch');
    btn.disabled = true;

    try {
        const res = await fetch('/api/conciliacion/auto-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                codcia,
                bank_code: bankCode,
                period_year: year,
                period_month: month,
                cross_company: document.getElementById('checkCrossCompany').checked,
                usuario: (function(){ try { var u = JSON.parse(localStorage.getItem('yelave_user')); return u?.nombre || u?.login || 'Desconocido'; } catch(e){ return 'Desconocido'; } })()
            })
        });

        clearInterval(progressInterval);
        clearInterval(timerInterval);
        progress = 100;
        if (bar) bar.style.width = '100%';
        if (text) text.textContent = '100%';
        if (timeText) timeText.textContent = `¡Completado en ${secondsElapsed}s!`;
        if (turtle) turtle.style.left = `calc(100% - 25px)`;

        // Delay to let the user see the turtle reach 100%
        await new Promise(r => setTimeout(r, 600));
        
        if (modal) modal.style.display = 'none';

        if (!res.ok) throw new Error('Error en auto-match');
        const data = await res.json();

        showToast(`${data.matched_count || data.matches_count || 0} movimientos conciliados automáticamente`, 'success');

        // Reload data
        await loadData();
    } catch (err) {
        clearInterval(progressInterval);
        if (typeof timerInterval !== 'undefined') clearInterval(timerInterval);
        if (modal) modal.style.display = 'none';
        console.error(err);
        showToast('Error en conciliación automática', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> Conciliación Automática`;
    }
}

// ─── Manual Match ────────────────────────────────────────────────────
function runManualMatch() {
    if (selectedBankIds.size === 0 || selectedCobKeys.size === 0) {
        showToast('Seleccione al menos 1 movimiento bancario y 1 cobranza', 'info');
        return;
    }

    let bcoTotal = 0;
    const bcoList = document.getElementById('matchBcoList');
    bcoList.innerHTML = '';
    
    selectedBankIds.forEach(id => {
        const mov = bankMovements.find(b => b.Id == id);
        if (mov) {
            bcoTotal += parseFloat(mov.Monto) || 0;
            bcoList.innerHTML += `<li style="margin-bottom: 5px; font-size: 0.9rem;">${mov.Fecha || ''} - ${mov.Descripcion || ''} <strong style="float: right;">S/ ${parseFloat(mov.Monto).toFixed(2)}</strong></li>`;
        }
    });

    let cobTotal = 0;
    const cobList = document.getElementById('matchCobList');
    cobList.innerHTML = '';
    
    selectedCobKeys.forEach(key => {
        const c = cobranzas.find(cb => `${cb.CodCia}|${cb.coddoc}|${cb.nrodoc}|${cb.nroitm}` === key);
        if (c) {
            cobTotal += parseFloat(c.import) || 0;
            cobList.innerHTML += `<li style="margin-bottom: 5px; font-size: 0.9rem;">${c.CodCia || ''} - ${c.coddoc || ''} ${c.nrodoc || ''} <strong style="float: right;">S/ ${parseFloat(c.import).toFixed(2)}</strong></li>`;
        }
    });

    document.getElementById('matchBcoTotal').textContent = `S/ ${bcoTotal.toFixed(2)}`;
    document.getElementById('matchCobTotal').textContent = `S/ ${cobTotal.toFixed(2)}`;

    const diffAlert = document.getElementById('matchDiffAlert');
    const diff = Math.abs(bcoTotal - cobTotal);
    
    if (diff > 0.01) {
        diffAlert.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
        diffAlert.style.color = '#ef4444';
        diffAlert.innerHTML = `⚠️ Diferencia detectada: S/ ${diff.toFixed(2)}`;
    } else {
        diffAlert.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
        diffAlert.style.color = '#22c55e';
        diffAlert.innerHTML = `✅ Cuadre perfecto`;
    }

    document.getElementById('matchSummary').innerHTML = `Se van a conciliar <strong>${selectedBankIds.size}</strong> movimiento(s) con <strong>${selectedCobKeys.size}</strong> cobranza(s).`;
    
    document.getElementById('matchModal').classList.add('active');
}

function closeMatchModal() {
    document.getElementById('matchModal').classList.remove('active');
}

function confirmManualMatch() {
    closeMatchModal();
    matchSelected();
}

async function matchSelected() {
    if (selectedBankIds.size === 0 || selectedCobKeys.size === 0) {
        showToast('Seleccione al menos 1 movimiento bancario y 1 cobranza', 'info');
        return;
    }

    try {
        const maxDiffInput = document.getElementById('inputDiferenciaAceptada');
        const maxDiff = maxDiffInput ? parseFloat(maxDiffInput.value) : 0.50;

        const requestBody = {
            bank_movement_ids: Array.from(selectedBankIds),
            cobranza_keys: Array.from(selectedCobKeys),
            usuario: (function(){ try { var u = JSON.parse(localStorage.getItem('yelave_user')); return u?.nombre || u?.login || 'Desconocido'; } catch(e){ return 'Desconocido'; } })(),
            max_diff: maxDiff
        };

        const res = await fetch('/api/conciliacion/manual-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
            const err = await res.json();
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'Error de Conciliación',
                    text: err.detail || 'No se pudo realizar el cruce.',
                    confirmButtonColor: '#2b3954'
                });
            } else {
                alert(err.detail || 'Error en match manual');
            }
            throw new Error(err.detail || 'Error en match manual');
        }

        showToast('Conciliación manual realizada exitosamente', 'success');

        selectedBankIds.clear();
        selectedCobKeys.clear();
        await loadData();
    } catch (err) {
        console.error(err);
        // Error already handled above
    }
}

// ─── Unmatch ─────────────────────────────────────────────────────────
async function unmatchBankSwal(detailId) {
    if (!detailId) return;

    const result = await Swal.fire({
        title: '¿Deshacer Conciliación?',
        text: "La operación de banco y la cobranza volverán a estar pendientes.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, deshacer',
        cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`/api/conciliacion/unmatch/${detailId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al deshacer match');

        Swal.fire('¡Deshecho!', 'La conciliación ha sido deshecha.', 'success');
        await loadData();
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo deshacer la conciliación.', 'error');
    }
}

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
            showImportConfirmation(e.dataTransfer.files[0]);
        }
    });
}

function handleFileSelect(event) {
    if (event.target.files.length > 0) {
        showImportConfirmation(event.target.files[0]);
    }
}

let _pendingImportFile = null;

function showImportConfirmation(file) {
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

    _pendingImportFile = file;

    // Obtener nombres de empresa y banco para el mensaje
    const selEmpresa = document.getElementById('selectEmpresa');
    const selBanco = document.getElementById('selectBanco');
    const empresaNombre = selEmpresa.options[selEmpresa.selectedIndex].textContent;
    const bancoNombre = selBanco.options[selBanco.selectedIndex].textContent;

    const modal = document.getElementById('importConfirmModal');
    const inner = document.getElementById('importModalInner');
    if (inner && window._importModalOriginalHTML) {
        inner.innerHTML = window._importModalOriginalHTML;
    }
    document.getElementById('importConfirmEmpresa').textContent = empresaNombre;
    document.getElementById('importConfirmBanco').textContent = bancoNombre;
    document.getElementById('importConfirmMoneda').textContent = currentCurrencySymbol === 'US$' ? 'Dólares (US$)' : 'Soles (S/)';
    document.getElementById('importConfirmArchivo').textContent = file.name;
    if (modal) modal.style.display = 'flex';
}

function closeImportConfirmModal() {
    const modal = document.getElementById('importConfirmModal');
    if (modal) modal.style.display = 'none';
    _pendingImportFile = null;
}

function confirmImport() {
    const modal = document.getElementById('importConfirmModal');
    if (modal) modal.style.display = 'none';
    if (_pendingImportFile) {
        uploadFile(_pendingImportFile);
        _pendingImportFile = null;
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

        let msg = `${data.rows_imported} importados exitosamente.`;
        if (data.rows_updated !== undefined) {
            msg = `Importación completada: ${data.rows_imported} nuevos, ${data.rows_updated} actualizados.`;
        }

        uploadStatus.textContent = `✓ ${msg}`;
        showToast(msg, 'success');

        setTimeout(() => {
            uploadArea.style.display = 'flex';
            progressDiv.style.display = 'none';
            progressFill.style.width = '0%';
        }, 3500);

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

// Filter bank movements
window.filterMovimientosBanco = function(filter, btn) {
    document.querySelectorAll('.btn-filter-banco').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    if (!dtMovimientosBanco) return;
    
    if (filter === '') {
        dtMovimientosBanco.search('').draw();
    } else {
        dtMovimientosBanco.search(filter).draw();
    }
};

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
    
    // Recalculate datatables sizing
    setTimeout(() => {
        if (dtCobranzas && tabId === 'tab-todas') {
            dtCobranzas.columns.adjust().draw();
        }
        if (dtMovimientosBanco && tabId === 'tab-banco') {
            dtMovimientosBanco.columns.adjust().draw();
        }
    }, 200);
}

// ─── MODALS ──────────────────────────────────────────────────────────
function openMatchModal() { document.getElementById('matchModal').classList.add('active'); }
function closeMatchModal() { document.getElementById('matchModal').classList.remove('active'); }
function openRuleModal() { document.getElementById('ruleModal').classList.add('active'); }
function closeRuleModal() { document.getElementById('ruleModal').classList.remove('active'); }

let dtDuplicatesBank = null;

function openDuplicatesModal() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;

    if (!codcia || !bankCode) {
        showToast('Seleccione empresa y banco antes de buscar duplicados', 'info');
        return;
    }

    document.getElementById('duplicatesModal').classList.add('active');
    loadDuplicates(codcia, bankCode);
}

function closeDuplicatesModal() {
    document.getElementById('duplicatesModal').classList.remove('active');
}

async function loadDuplicates(codcia, bankCode) {
    const tbody = document.getElementById('tbodyDuplicatesBank');
    if (dtDuplicatesBank) {
        dtDuplicatesBank.destroy();
        dtDuplicatesBank = null;
    }

    tbody.innerHTML = '<tr><td colspan="8" class="loading-state empty-state" style="text-align: center; padding: 20px;">Buscando movimientos duplicados...</td></tr>';

    try {
        const res = await fetch(`/api/conciliacion/movimientos-banco/duplicates?codcia=${codcia}&bank_code=${bankCode}`);
        if (!res.ok) throw new Error('Error al consultar duplicados');
        const data = await res.json();

        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state" style="text-align: center; padding: 20px; color: #64748b;">No se encontraron movimientos bancarios duplicados.</td></tr>';
            return;
        }

        data.forEach(row => {
            const isMatched = row.Estado === 'Conciliado';
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #e2e8f0';
            
            let actionHtml = '';
            if (isMatched) {
                actionHtml = `<span style="color: #94a3b8; font-size: 0.8rem;" title="No se pueden eliminar movimientos conciliados">Bloqueado</span>`;
            } else {
                actionHtml = `
                    <button class="btn-icon" onclick="deleteDuplicateBankMovement(${row.Id})" title="Eliminar Duplicado" style="color: #ef4444; border: 1px solid #fee2e2; background: #fef2f2; padding: 5px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; margin: auto;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                `;
            }

            const monto = parseFloat(row.Monto || 0);
            const montoStr = `${currentCurrencySymbol} ${Math.abs(monto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

            tr.innerHTML = `
                <td style="padding: 10px; text-align: center;">${actionHtml}</td>
                <td style="padding: 10px; font-weight: 500;">${row.Id || ''}</td>
                <td style="padding: 10px;">${formatUTCLocalDate(row.Fecha)}</td>
                <td style="padding: 10px; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${row.Descripcion || ''}">${row.Descripcion || ''}</td>
                <td style="padding: 10px;" class="amount ${monto < 0 ? 'negative' : 'positive'}">${montoStr}</td>
                <td style="padding: 10px; font-weight: 600;">${row.OperacionNumero || ''}</td>
                <td style="padding: 10px;">${row.Referencia || ''}</td>
                <td style="padding: 10px;">
                    <span class="status ${isMatched ? 'conciliado' : 'pendiente'}">${row.Estado || 'Pendiente'}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });

        dtDuplicatesBank = $('#tableDuplicatesBank').DataTable({
            language: { url: 'https://cdn.datatables.net/plug-ins/1.13.8/i18n/es-ES.json' },
            dom: '<"dt-top"lf>rtip',
            scrollX: true,
            autoWidth: false,
            destroy: true,
            pageLength: 10,
            order: [[5, 'asc']]
        });

    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="8" class="loading-state empty-state" style="color: var(--danger); text-align: center; padding: 20px;">Error al cargar duplicados.</td></tr>';
    }
}

async function deleteDuplicateBankMovement(id) {
    if (!id) return;

    const result = await Swal.fire({
        title: '¿Eliminar Movimiento Duplicado?',
        text: "Esta acción eliminará de forma permanente este registro bancario del sistema.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`/api/conciliacion/movimientos-banco/${id}`, {
            method: 'DELETE'
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Error al eliminar el movimiento');
        }

        showToast('Movimiento duplicado eliminado exitosamente', 'success');
        
        const codcia = document.getElementById('selectEmpresa').value;
        const bankCode = document.getElementById('selectBanco').value;
        await loadDuplicates(codcia, bankCode);
        
        await loadMovimientosBanco();
        await loadResumen(codcia, bankCode, document.getElementById('selectYear').value, document.getElementById('selectMonth').value);

    } catch (err) {
        console.error(err);
        Swal.fire('Error', err.message, 'error');
    }
}

// ─── REPORTE COBRANZAS (TAB 2) ───────────────────────────────────────
async function loadAllCobranzas() {
    try {
        const year = document.getElementById('selectYear').value;
        const month = document.getElementById('selectMonth').value;
        const codcia = document.getElementById('selectEmpresa').value;
        const bankCode = document.getElementById('selectBanco').value;
        const crossCompany = document.getElementById('chkCrossCompanyTodas')?.checked;
        
        let url = `/api/conciliacion/cobranzas-todas`;
        const params = new URLSearchParams();
        if (year) params.set('year', year);
        if (month) params.set('month', month);
        if (codcia && !crossCompany) {
            params.set('codcia', codcia);
            if (bankCode) params.set('bank_code', bankCode);
        }
        
        if (params.toString()) url += '?' + params.toString();

        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al cargar reporte de cobranzas');
        const data = await res.json();
        
        // Almacenar globalmente para el reporte
        cobranzasTodas = data;
        
        if (dtCobranzas) {
            dtCobranzas.clear().rows.add(data).draw();
            return;
        }

        dtCobranzas = $('#tableTodasCobranzas').DataTable({
            language: { url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json' },
            pageLength: 25,
            lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, 'Todos']],
            deferRender: true,
            data: data,
            dom: '<"dt-top"lfB>rtip',
            scrollX: true,
            autoWidth: false,
            buttons: [
                {
                    extend: 'excelHtml5',
                    text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Exportar a Excel',
                    className: 'dt-button'
                }
            ],
            columns: [
                {
                    data: null,
                    orderable: false,
                    className: 'sticky-col',
                    render: function(data, type, row) {
                        let html = `<button class="btn-icon" onclick='viewItemDetails(${JSON.stringify(row)})' title="Ver Reporte de Caja" style="margin-right: 4px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                        </button>`;
                        if (row.Conciliado && row.MatchId) {
                            const matchObj = Object.assign({}, row, { _showMatch: true });
                            html += `<button class="btn-icon" onclick='viewItemDetails(${JSON.stringify(matchObj)})' title="Ver match bancario" style="color: var(--success); border-color: var(--success); margin-right: 4px;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                                    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
                                    <path d="M18 12a2 2 0 0 0 0 4h4v-4z"></path>
                                </svg>
                            </button>`;
                        }
                        if (row.CajaFlgEst === 'C') {
                            html += `<button class="btn-icon btn-revert-caja-tbl" onclick="confirmRevertirCaja('${row.NroCaja}')" title="Revertir Caja a EMITIDO" style="color: #ef4444; border-color: #ef4444;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                    <polyline points="3 3 3 8 8 8"></polyline>
                                </svg>
                            </button>`;
                        }
                        return `<div style="white-space:nowrap;text-align:center;">${html}</div>`;
                    }
                },
                { data: 'Conciliado', className: 'sticky-col', render: data => `<span class="status ${data ? 'conciliado' : 'pendiente'}">${data ? 'Conciliado' : 'Pendiente'}</span>` },
                { data: 'id', render: data => data || '' },
                { data: 'CodCia', render: data => data || '' },
                { data: 'anos', render: data => data || '' },
                { data: 'mes', render: data => data || '' },
                { data: 'coddoc', render: data => data || '' },
                { data: 'nrodoc', render: data => data || '' },
                { data: 'tpodoc', render: data => data || '' },
                { data: 'fchdoc', render: (data, type) => {
                    if (!data) return '';
                    if (type === 'sort') return data;
                    return new Date(data).toLocaleDateString('es-PE', {timeZone: 'UTC'});
                }},
                { data: 'codaux', render: data => data || '' },
                { data: 'NomAux', render: data => {
                    let text = data || '';
                    return `<span style="max-width:150px; display:inline-block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${text}">${text}</span>`;
                }},
                { data: 'codven', render: data => data || '' },
                { data: 'nomven', render: data => {
                    let text = data || '';
                    return `<span style="max-width:100px; display:inline-block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${text}">${text}</span>`;
                }},
                { data: 'codref', render: data => data || '' },
                { data: 'nroref', render: data => data || '' },
                { data: 'import', render: data => `<span class="amount">${parseFloat(data || 0).toFixed(2)}</span>` },
                { data: 'glodoc', render: data => {
                    let text = data || '';
                    return `<span style="max-width:150px; display:inline-block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${text}">${text}</span>`;
                }},
                { data: 'fmapgo', render: data => data || '' },
                { data: 'CodDep', render: data => data || '' },
                { data: 'NroDep', render: data => data || '' },
                { data: 'fchDep', render: (data, type) => {
                    if (!data) return '';
                    if (type === 'sort') return data;
                    return new Date(data).toLocaleDateString('es-PE', {timeZone: 'UTC'});
                }},
                { data: 'tpopgo', render: data => data || '' },
                { data: 'Dcmpgo', render: data => data || '' },
                { data: 'CodCom', render: data => data || '' },
                { data: 'usuario', render: data => data || '' },
                { data: 'FlgEst', render: data => data || '' }
            ]
        });

    } catch (err) {
        console.error(err);
        showToast('Error al cargar datos. Verifique la conexión al servidor.', 'error');
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
            <div class="report-header" style="page-break-before: always; color: black; background: white; padding: 15px 20px 5px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <div style="font-size: 1rem; font-weight: 600;">${empresaNombre}</div>
                    <div style="font-size: 0.85rem;">${now}</div>
                </div>
                <div class="title" style="text-align:center; font-size:1.4rem; font-weight:bold; margin-bottom:0.75rem; text-transform: uppercase;">
                    Cancelacion de Documentos
                    <div style="margin-top:6px;">${matchStatusBadge}</div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size: 0.9rem; border-bottom:1px solid #000; padding-bottom:6px; margin-bottom:4px;">
                    <div>N° Caja: <b style="margin-left:5px;">${boxKey}</b></div>
                    <div>Fecha de Caja: <b style="margin-left:5px;">${fechaCaja}</b></div>
                    <div>Page: 1</div>
                </div>
                <div style="font-size:0.85rem; margin-bottom:2px;">CANCELACIONES DEL DIA : ${fechaCaja}</div>
            </div>
            
            <table class="report-table" style="width:100%; border-collapse:collapse; font-size:0.75rem; color: black; background: white; font-family: 'Arial', sans-serif;">
            <thead>
                <tr style="border-top: 1px solid #000; border-bottom: 1px solid #000;">
                    <th style="text-align:left; padding:4px 2px;">T/D</th>
                    <th style="text-align:left; padding:4px 2px;">N° DOCUM.</th>
                    <th style="text-align:left; padding:4px 2px;">FCH. DOC.</th>
                    <th style="text-align:left; padding:4px 2px;">CODIGO</th>
                    <th style="text-align:left; padding:4px 2px;">RAZON SOCIAL</th>
                    <th style="text-align:left; padding:4px 2px;">NOMVEN</th>
                    <th style="text-align:left; padding:4px 2px;">USUARIO</th>
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
                        <td colspan="3" style="padding-top:12px; font-weight:bold; font-size:0.8rem; letter-spacing:0.5px; text-transform:uppercase;">${jt}</td>
                        <td colspan="10" style="padding-top:12px; font-weight:bold; font-size:0.8rem;">Cuenta: ${groupName}</td>
                    </tr>
                `;

                items.forEach(item => {
                    const fchDoc = item.OriginalFechaDoc ? new Date(item.OriginalFechaDoc).toLocaleDateString('es-PE', {day:'2-digit', month:'2-digit', year:'numeric'}) : (item.FechaEfe ? new Date(item.FechaEfe).toLocaleDateString('es-PE', {day:'2-digit', month:'2-digit', year:'numeric'}) : '');
                    const fchDepFormat = item.fchDep ? new Date(item.fchDep).toLocaleDateString('es-PE', {day:'2-digit', month:'2-digit', year:'numeric', timeZone: 'UTC'}) : '';
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
                            <td style="padding:2px 2px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.RazonSocial || ''}</td>
                            <td style="padding:2px 2px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.nomven || ''}</td>
                            <td style="padding:2px 2px;">${item.usuario || ''}</td>
                            <td style="padding:2px 2px;">${item.NroDep || ''}</td>
                            <td style="padding:2px 2px;">${fchDepFormat}</td>
                            <td style="padding:2px 2px; text-align:center;">${soles > 0 ? 'S/.' : (dolares > 0 ? '$' : 'S/.')}</td>
                            <td style="text-align:right; padding:2px 2px;">${soles > 0 ? soles.toLocaleString('en-US', {minimumFractionDigits:2}) : '0.00'}</td>
                            <td style="text-align:right; padding:2px 2px;">${dolares > 0 ? dolares.toLocaleString('en-US', {minimumFractionDigits:2}) : '0.00'}</td>
                            <td style="text-align:center; padding:2px 2px; white-space:nowrap;">
                                ${item.Conciliado ? 
                                    `<button onclick="showMatchDetails('${item.Suc}|${item.SerieDoc}|${item.NroDoc}|${item.Correlat}', 'cob')" style="background:none; border:none; color:#2563eb; cursor:pointer; font-size:0.85rem; vertical-align:middle; padding:0 2px;" title="Ver Conciliación"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button> <span style="color:#10b981; font-weight:bold; font-size:0.75rem;">✓</span>` : 
                                    `<span style="color:#f59e0b; font-size:0.7rem;">⏳ Pend.</span>`
                                }
                            </td>
                        </tr>
                    `;
                });

                boxTotalSoles += subTotalSoles;
                boxTotalDolares += subTotalDolares;

                html += `
                    <tr style="font-weight:bold;">
                        <td colspan="10" style="text-align:right; padding:4px 8px;">SUB TOTAL:</td>
                        <td style="text-align:right; padding:4px 2px; border-top: 1px solid #000;">${subTotalSoles.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td style="text-align:right; padding:4px 2px; border-top: 1px solid #000;">${subTotalDolares.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td></td>
                    </tr>
                `;
            });
        });

        html += `
                <tr style="border-top:2px solid #000; font-weight:bold; font-size:0.85rem;">
                    <td colspan="10" style="text-align:right; padding:8px;">TOTAL GRAL.:</td>
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
    if ((c._showMatch || false) && c.Conciliado && c.MatchId) {
        // Delegate to the centralized showMatchDetails function
        showMatchDetails(c.MatchId, 'bank');
    } else {
        // Mostrar el reporte agrupado para la Caja completa del item (FoxPro Style)
        openReport(c.NroCaja);
    }
}

// Función para filtrar la tabla de cobranzas por estado
function filterCobranzas(filter, btn) {
    // Actualizar botones de filtro
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

// ─── FILTRO "Documentos Aplicados y redondeo" ─────────────────────────
// Custom DataTables search filter: when checked, hide rows where coddoc = "R/C." or "N/A " or tpopgo = "R"
$.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
    // Only apply to the "tableTodasCobranzas" DataTable
    if (settings.nTable.id !== 'tableTodasCobranzas') return true;
    
    var chk = document.getElementById('chkDocAplicados');
    if (!chk || !chk.checked) return true; // not checked => show everything
    
    // coddoc is column index 6
    // tpopgo is column index 22
    var coddoc = (data[6] || '').trim();
    var tpopgo = (data[22] || '').trim();
    if (coddoc === 'R/C.' || coddoc === 'N/A' || tpopgo === 'R') return false; // hide these
    return true;
});

function applyDocAplicadosFilter() {
    if (dtCobranzas) {
        dtCobranzas.draw();
    }
}

// Filtro para la tabla de Cruce y Conciliación
$.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
    if (settings.nTable.id !== 'tableCobranzas') return true;
    
    var chk = document.getElementById('chkDocAplicadosCruce');
    if (!chk || !chk.checked) return true;
    
    // En tableCobranzas, coddoc es la columna 2, tpopgo es la columna 10
    var coddoc = (data[2] || '').trim();
    var tpopgo = (data[10] || '').trim();
    if (coddoc.includes('R/C.') || coddoc.includes('N/A') || tpopgo === 'R') return false;
    return true;
});

function applyDocAplicadosCruceFilter() {
    if (dtCruceCobranzas) {
        dtCruceCobranzas.draw();
    }
}


async function loadMovimientosBanco() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    const year = document.getElementById('selectYear').value;
    const month = document.getElementById('selectMonth').value;

    const tbody = document.getElementById('tbodyMovimientosBanco');
    if (dtMovimientosBanco) {
        dtMovimientosBanco.destroy();
    }

    const deleteBtn = document.getElementById('btnDeleteAllBank');

    if (!codcia || !bankCode) {
        tbody.innerHTML = '<tr><td colspan="12" class="empty-state">Seleccione empresa y banco en los filtros superiores para ver los movimientos</td></tr>';
        if(deleteBtn) deleteBtn.disabled = true;
        return;
    }
    
    if(deleteBtn) deleteBtn.disabled = false;

    tbody.innerHTML = '<tr><td colspan="12" class="loading-state empty-state">Cargando datos del servidor...</td></tr>';
    
    try {
        let url = `/api/conciliacion/movimientos-banco?codcia=${codcia}&bank_code=${bankCode}`;
        if(year) url += `&year=${year}`;
        if(month) url += `&month=${month}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al cargar movimientos de banco');
        const data = await res.json();
        
        // Cache data globally so showMatchDetails can find the correct ReconciliationDetailId
        bankMovements = data; 
        
        tbody.innerHTML = '';

        data.forEach(c => {
            const isMatched = c.Estado === 'Conciliado';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="sticky-col-ver">
                    ${isMatched ? `<button class="btn-icon" onclick="showMatchDetails(${c.Id}, 'bank')" title="Ver Conciliación" style="padding:4px; margin: auto;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>` : `<button class="btn-icon" onclick="deleteBankMovement(${c.Id})" title="Eliminar Movimiento" style="padding:4px; margin: auto; color: #ef4444;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>`}
                </td>
                <td>${c.Id || ''}</td>
                <td>${c.Fecha || ''}</td>
                <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.Descripcion || ''}">${c.Descripcion || ''}</td>
                <td class="amount ${parseFloat(c.Monto || 0) < 0 ? 'negative' : 'positive'}">${currentCurrencySymbol} ${parseFloat(c.Monto || 0).toLocaleString('es-PE', {minimumFractionDigits:2})}</td>
                <td class="amount">${currentCurrencySymbol} ${parseFloat(c.Saldo || 0).toLocaleString('es-PE', {minimumFractionDigits:2})}</td>
                <td>${c.Sucursal || ''}</td>
                <td>${c.OperacionNumero || ''}</td>
                <td>${c.OperacionHora || ''}</td>
                <td>${c.Referencia || ''}</td>
                <td>
                    <input type="text" class="op-manual-input" 
                           value="${(c.OpManual || '').replace(/"/g, '&quot;')}" 
                           onchange="updateOpManual(${c.Id}, this.value, this)" 
                           placeholder="—" 
                           ${isMatched ? 'disabled' : ''}>
                </td>
                <td class="op-cancel-cell">${c.OpCancelacion || ''}</td>
                <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.DescripcionFinal || ''}">${c.DescripcionFinal || ''}</td>
                <td>
                    <span class="status ${isMatched ? 'conciliado' : 'pendiente'}">${c.Estado || 'Pendiente'}</span>
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
                autoWidth: false,
                buttons: [
                    {
                        extend: 'excelHtml5',
                        text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Exportar a Excel',
                        className: 'dt-button'
                    },
                    {
                        text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Reporte PDF Detallado',
                        className: 'dt-button btn-pdf-report',
                        action: function (e, dt, node, config) {
                            generateDetailedPDFReport();
                        }
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

async function generateDetailedPDFReport() {
    if (!bankMovements || bankMovements.length === 0) {
        showToast('No hay datos disponibles en la tabla para exportar', 'info');
        return;
    }

    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    const year = document.getElementById('selectYear').value;
    const month = document.getElementById('selectMonth').value;
    const selectEmpresaEl = document.getElementById('selectEmpresa');
    const selectBancoEl = document.getElementById('selectBanco');
    const empresaText = selectEmpresaEl ? selectEmpresaEl.options[selectEmpresaEl.selectedIndex].text : codcia;
    const bancoText = selectBancoEl ? selectBancoEl.options[selectBancoEl.selectedIndex].text : bankCode;

    Swal.fire({
        title: 'Generando Reporte PDF...',
        html: 'Cargando detalles de los movimientos conciliados. Por favor espere...',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const conciliados = bankMovements.filter(m => m.Estado === 'Conciliado');
        const pendientes = bankMovements.filter(m => m.Estado !== 'Conciliado');

        // Cargar detalles de conciliación en paralelo
        const detailedConciliados = await Promise.all(conciliados.map(async (m) => {
            const matchId = m.ReconciliationDetailId || m.Id;
            try {
                const res = await fetch(`/api/conciliacion/match-details?match_id=${matchId}`);
                if (!res.ok) throw new Error('Error');
                const details = await res.json();
                return { ...m, details };
            } catch (e) {
                console.error(`Error al obtener detalles del match para movimiento ID ${m.Id}:`, e);
                return { ...m, details: { cobranzas: [], bancos: [] } };
            }
        }));

        Swal.fire({
            title: 'Generando Reporte PDF...',
            html: 'Estructurando documento y diseño...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Totales
        const totalConciliadoMonto = detailedConciliados.reduce((acc, m) => acc + parseFloat(m.Monto || 0), 0);
        const totalPendienteMonto = pendientes.reduce((acc, m) => acc + parseFloat(m.Monto || 0), 0);
        const totalMontoGeneral = totalConciliadoMonto + totalPendienteMonto;

        const periodStr = (year && month) ? `${month}/${year}` : (year ? year : 'Todos');

        // Construir tabla de Conciliados
        const conciliadosBody = [
            [
                { text: 'Fecha', style: 'tableHeader' },
                { text: 'N° Operación', style: 'tableHeader' },
                { text: 'Referencia', style: 'tableHeader' },
                { text: 'Descripción Banco', style: 'tableHeader' },
                { text: 'Monto', style: 'tableHeader', alignment: 'right' }
            ]
        ];

        if (detailedConciliados.length === 0) {
            conciliadosBody.push([
                { text: 'No hay movimientos conciliados en este período.', colSpan: 5, alignment: 'center', style: 'emptyCell' },
                {}, {}, {}, {}
            ]);
        } else {
            detailedConciliados.forEach(m => {
                const montoVal = parseFloat(m.Monto || 0);
                conciliadosBody.push([
                    { text: m.Fecha || '', fontSize: 8 },
                    { text: m.OperacionNumero || '', fontSize: 8 },
                    { text: m.Referencia || '', fontSize: 8 },
                    { text: m.Descripcion || '', fontSize: 8 },
                    { text: `${currentCurrencySymbol} ${montoVal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, fontSize: 8, alignment: 'right', bold: true, color: montoVal < 0 ? '#b91c1c' : '#15803d' }
                ]);

                if (m.details && m.details.cobranzas && m.details.cobranzas.length > 0) {
                    const cobRows = [
                        [
                            { text: 'Cia', style: 'subTableHeader' },
                            { text: 'Documento', style: 'subTableHeader' },
                            { text: 'Cliente (Razón Social)', style: 'subTableHeader' },
                            { text: 'F. Cobro', style: 'subTableHeader' },
                            { text: 'Vendedor', style: 'subTableHeader' },
                            { text: 'N° Depósito', style: 'subTableHeader' },
                            { text: 'Importe', style: 'subTableHeader', alignment: 'right' }
                        ]
                    ];

                    m.details.cobranzas.forEach(cob => {
                        const cobFch = cob.Fecha ? new Date(cob.Fecha).toLocaleDateString('es-PE') : '';
                        const cobMonto = Math.abs(parseFloat(cob.Importe || 0));
                        cobRows.push([
                            { text: cob.CodCia || '', fontSize: 7 },
                            { text: `${cob.CodDoc || ''} - ${cob.NroDoc || ''}`, fontSize: 7 },
                            { text: cob.RazonSocial || '', fontSize: 7 },
                            { text: cobFch, fontSize: 7 },
                            { text: cob.NomVen || '', fontSize: 7 },
                            { text: cob.NroDep || '', fontSize: 7 },
                            { text: `${currentCurrencySymbol} ${cobMonto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, fontSize: 7, alignment: 'right' }
                        ]);
                    });

                    conciliadosBody.push([
                        {
                            colSpan: 5,
                            margin: [15, 2, 15, 6],
                            fillColor: '#f8fafc',
                            stack: [
                                { text: '▼ Cobranzas vinculadas en la conciliación:', fontSize: 7, bold: true, color: '#1e3a8a', margin: [0, 2, 0, 4] },
                                {
                                    table: {
                                        headerRows: 1,
                                        widths: ['5%', '13%', '40%', '11%', '15%', '10%', '6%'],
                                        body: cobRows
                                    },
                                    layout: 'lightHorizontalLines'
                                }
                            ]
                        },
                        {}, {}, {}, {}
                    ]);
                }
            });
        }

        // Construir tabla de Pendientes
        const pendientesBody = [
            [
                { text: 'Fecha', style: 'tableHeader' },
                { text: 'N° Operación', style: 'tableHeader' },
                { text: 'Sucursal', style: 'tableHeader' },
                { text: 'Referencia', style: 'tableHeader' },
                { text: 'Descripción Banco', style: 'tableHeader' },
                { text: 'Op. Manual', style: 'tableHeader' },
                { text: 'Monto', style: 'tableHeader', alignment: 'right' }
            ]
        ];

        if (pendientes.length === 0) {
            pendientesBody.push([
                { text: 'No hay movimientos pendientes en este período.', colSpan: 7, alignment: 'center', style: 'emptyCell' },
                {}, {}, {}, {}, {}, {}
            ]);
        } else {
            pendientes.forEach(m => {
                const montoVal = parseFloat(m.Monto || 0);
                pendientesBody.push([
                    { text: m.Fecha || '', fontSize: 8 },
                    { text: m.OperacionNumero || '', fontSize: 8 },
                    { text: m.Sucursal || '', fontSize: 8 },
                    { text: m.Referencia || '', fontSize: 8 },
                    { text: m.Descripcion || '', fontSize: 8 },
                    { text: m.OpManual || '', fontSize: 8 },
                    { text: `${currentCurrencySymbol} ${montoVal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, fontSize: 8, alignment: 'right', bold: true, color: montoVal < 0 ? '#b91c1c' : '#15803d' }
                ]);
            });
        }

        const docDefinition = {
            pageOrientation: 'landscape',
            pageSize: 'A4',
            pageMargins: [30, 40, 30, 40],
            header: function(currentPage, pageCount, pageSize) {
                return {
                    text: 'SISTEMA DE GESTIÓN YELAVE ERP',
                    alignment: 'right',
                    fontSize: 7,
                    color: '#94a3b8',
                    margin: [0, 15, 30, 0]
                };
            },
            footer: function(currentPage, pageCount) {
                return {
                    columns: [
                        { text: `Generado el: ${new Date().toLocaleString('es-PE')}`, fontSize: 7, color: '#94a3b8', margin: [30, 0, 0, 0] },
                        { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right', fontSize: 8, color: '#64748b', margin: [0, 0, 30, 0] }
                    ]
                };
            },
            content: [
                {
                    columns: [
                        {
                            text: 'REPORTE DETALLADO DE CONCILIACIÓN BANCARIA',
                            fontSize: 14,
                            bold: true,
                            color: '#1e3a8a'
                        },
                        {
                            text: `Período: ${periodStr}`,
                            alignment: 'right',
                            fontSize: 10,
                            bold: true,
                            color: '#475569',
                            margin: [0, 4, 0, 0]
                        }
                    ]
                },
                {
                    canvas: [{ type: 'line', x1: 0, y1: 5, x2: 782, y2: 5, lineWidth: 1.5, lineColor: '#1e3a8a' }]
                },
                {
                    margin: [0, 10, 0, 15],
                    columns: [
                        {
                            stack: [
                                { text: 'DATOS GENERALES', style: 'sectionHeader' },
                                { text: `Empresa: ${empresaText}`, fontSize: 9, margin: [0, 2, 0, 2] },
                                { text: `Banco / Cuenta: ${bancoText}`, fontSize: 9, margin: [0, 2, 0, 2] }
                            ]
                        },
                        {
                            width: '40%',
                            table: {
                                widths: ['60%', '40%'],
                                body: [
                                    [{ text: 'RESUMEN DEL PERÍODO', colSpan: 2, bold: true, fontSize: 8, fillColor: '#f1f5f9', alignment: 'center' }, {}],
                                    [
                                        { text: 'Conciliado:', fontSize: 8, color: '#15803d', bold: true },
                                        { text: `${currentCurrencySymbol} ${totalConciliadoMonto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, fontSize: 8, alignment: 'right', bold: true, color: '#15803d' }
                                    ],
                                    [
                                        { text: 'Pendiente:', fontSize: 8, color: '#b91c1c', bold: true },
                                        { text: `${currentCurrencySymbol} ${totalPendienteMonto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, fontSize: 8, alignment: 'right', bold: true, color: '#b91c1c' }
                                    ],
                                    [
                                        { text: 'Total Bancos:', fontSize: 8, bold: true },
                                        { text: `${currentCurrencySymbol} ${totalMontoGeneral.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, fontSize: 8, alignment: 'right', bold: true }
                                    ]
                                ]
                            },
                            layout: {
                                hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 1 : 0.5; },
                                vLineWidth: function (i, node) { return (i === 0 || i === node.table.widths.length) ? 1 : 0.5; },
                                hLineColor: function () { return '#cbd5e1'; },
                                vLineColor: function () { return '#cbd5e1'; }
                            }
                        }
                    ]
                },
                
                // SECCIÓN: CONCILIADOS
                { text: `MOVIMIENTOS CONCILIADOS (${detailedConciliados.length})`, style: 'tableTitle', color: '#15803d' },
                {
                    table: {
                        headerRows: 1,
                        widths: ['10%', '13%', '15%', '47%', '15%'],
                        body: conciliadosBody
                    },
                    layout: 'lightHorizontalLines'
                },

                // SECCIÓN: PENDIENTES
                { text: `MOVIMIENTOS PENDIENTES (${pendientes.length})`, style: 'tableTitle', color: '#b91c1c', pageBreak: 'before' },
                {
                    table: {
                        headerRows: 1,
                        widths: ['10%', '12%', '10%', '15%', '33%', '10%', '10%'],
                        body: pendientesBody
                    },
                    layout: 'lightHorizontalLines'
                }
            ],
            styles: {
                sectionHeader: {
                    fontSize: 9,
                    bold: true,
                    color: '#1e3a8a',
                    margin: [0, 0, 0, 5],
                    letterSpacing: 0.5
                },
                tableTitle: {
                    fontSize: 10,
                    bold: true,
                    margin: [0, 15, 0, 8],
                    letterSpacing: 0.5
                },
                tableHeader: {
                    bold: true,
                    fontSize: 8,
                    color: '#ffffff',
                    fillColor: '#1e3a8a',
                    margin: [0, 2, 0, 2]
                },
                subTableHeader: {
                    bold: true,
                    fontSize: 7,
                    color: '#0f172a',
                    fillColor: '#cbd5e1',
                    margin: [0, 1, 0, 1]
                },
                emptyCell: {
                    fontSize: 8,
                    color: '#94a3b8',
                    italic: true,
                    margin: [0, 10, 0, 10]
                }
            }
        };

        pdfMake.createPdf(docDefinition).download(`Reporte_Conciliacion_${periodStr.replace('/', '-')}.pdf`);
        Swal.close();
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo generar el reporte PDF: ' + e.message, 'error');
    }
}

// ─── Update Op Manual in DB ──────────────────────────────────────────
async function updateOpManual(id, newValue, inputEl) {
    try {
        const res = await fetch(`/api/conciliacion/movimientos-banco/${id}/op-manual`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ op_manual: newValue })
        });
        
        if (!res.ok) throw new Error('Error al actualizar Op Manual');
        
        // Find the cell right after the input's TD to update Op Cancelacion visually
        const td = inputEl.closest('td');
        const nextTd = td.nextElementSibling;
        if(nextTd && nextTd.classList.contains('op-cancel-cell')) {
            nextTd.textContent = newValue;
        }
        
        showToast('Variación registrada correctamente', 'success');
        
        // If we want to reload the data quietly to keep states in sync:
        // loadMovimientosBanco();
    } catch (err) {
        console.error(err);
        showToast('Error al actualizar Op Manual', 'error');
        // Reset visually if failed
    }
}

// ─── Delete Bank Movement ────────────────────────────────────────────
async function deleteBankMovement(id) {
    if (!id) return;
    
    const result = await Swal.fire({
        title: '¿Eliminar Movimiento?',
        text: "Esta acción eliminará permanentemente este movimiento bancario del sistema.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`/api/conciliacion/movimientos-banco/${id}`, {
            method: 'DELETE'
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Error al eliminar el movimiento');
        }

        showToast('Movimiento eliminado exitosamente', 'success');
        await loadMovimientosBanco(); // Refrescar la tabla
    } catch (err) {
        console.error(err);
        Swal.fire('Error', err.message, 'error');
    }
}

// ─── Download Excel Template ──────────────────────────────────────────
function downloadBankTemplate() {
    // Generate an empty excel file with correct headers
    const ws = XLSX.utils.aoa_to_sheet([
        ["ID Banco", "Fecha", "Descripción", "Monto", "Saldo", "Sucursal", "Op. Número", "Op. Hora", "Referencia", "Op Manual", "OP Cancelación", "Descripción Final", "Estado"]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos Template");
    XLSX.writeFile(wb, "Template_Estado_Cuenta.xlsx");
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
                <td style="font-family: monospace;">${r.condicion}</td>
                <td style="font-family: monospace;">${r.resultado}</td>
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
    
    if (!condicion) {
        showToast('Debe ingresar el texto o patrón a buscar', 'error');
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
    const modalBody = modal ? modal.querySelector('.modal-body') : null;
    if (!modal || !modalBody) return;

    modalBody.innerHTML = '<div style="text-align:center; padding:2rem; color:#64748b;">Cargando detalles...</div>';
    modal.style.display = 'flex';

    try {
        let matchId = null;

        if (type === 'bank') {
            // id is BankMovement Id - find ReconciliationDetailId
            // Ensure type conversion because API returns Id as string '1300' but param is int 1300
            const bankMov = bankMovements.find(m => String(m.Id) === String(id));
            if (bankMov && bankMov.ReconciliationDetailId) {
                matchId = bankMov.ReconciliationDetailId;
            } else {
                // Fallback: Assume the id is the ReconciliationDetailId directly
                matchId = id;
            }
        } else {
            // type === 'cob': id is 'Suc|SerieDoc|NroDoc|Correlat'
            const parts = id.split('|');
            if (cobranzasTodas && cobranzasTodas.length > 0) {
                const match = cobranzasTodas.find(c => 
                    (c.Suc || '').trim() === parts[0] && 
                    (c.SerieDoc || '').trim() === parts[1] && 
                    (c.NroDoc || '').trim() === parts[2] && 
                    (c.Correlat || '').trim() === parts[3]
                );
                if (match && match.MatchId) {
                    matchId = match.MatchId;
                }
            }
            if (!matchId) {
                throw new Error('No se encontró la conciliación para esta cobranza');
            }
        }

        const res = await fetch(`/api/conciliacion/match-details?match_id=${matchId}`);
        if (!res.ok) throw new Error('Error al obtener detalles');
        const data = await res.json();

        // Build cobranzas cards
        let cobHtml = '';
        const totalCob = (data.cobranzas || []).reduce((s, c) => s + Math.abs(c.Importe), 0);
        (data.cobranzas || []).forEach((c, i) => {
            cobHtml += `
                <div style="background:#f8fafc; border-radius:10px; padding:1rem 1.25rem; border:1px solid #e2e8f0; margin-bottom:0.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="font-weight:600; color:#1e293b; font-size:0.9rem;">${c.CodDoc} - ${c.NroDoc}</span>
                            <span style="color:#64748b; font-size:0.8rem; margin-left:0.5rem;">${c.CodCia}</span>
                        </div>
                        <span style="font-weight:700; color:#1e293b; font-size:1rem;">${currentCurrencySymbol} ${Math.abs(c.Importe).toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
                    </div>
                    <div style="color:#475569; font-size:0.8rem; margin-top:0.4rem;">${c.RazonSocial || ''}</div>
                    <div style="display:flex; gap:1.5rem; margin-top:0.5rem; font-size:0.75rem; color:#94a3b8;">
                        <span>Ref: ${c.CodRef || ''} ${c.NroRef || ''}</span>
                        <span>Dep: ${c.NroDep || ''}</span>
                        <span>Fecha: ${c.Fecha ? new Date(c.Fecha).toLocaleDateString('es-PE') : ''}</span>
                        <span>Vendedor: ${c.NomVen || ''}</span>
                    </div>
                </div>`;
        });

        // Build bank cards
        let bankHtml = '';
        const totalBank = (data.bancos || []).reduce((s, b) => s + Math.abs(b.Monto), 0);
        (data.bancos || []).forEach((b, i) => {
            bankHtml += `
                <div style="background:#f0fdf4; border-radius:10px; padding:1rem 1.25rem; border:1px solid #bbf7d0; margin-bottom:0.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="font-weight:600; color:#166534; font-size:0.9rem;">Op. ${b.Operacion || 'N/A'}</span>
                            <span style="color:#64748b; font-size:0.8rem; margin-left:0.5rem;">#${b.Id}</span>
                        </div>
                        <span style="font-weight:700; color:#166534; font-size:1rem;">${currentCurrencySymbol} ${Math.abs(b.Monto).toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
                    </div>
                    <div style="color:#475569; font-size:0.8rem; margin-top:0.4rem;">${b.Descripcion || ''}</div>
                    <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.3rem;">Fecha: ${b.Fecha ? new Date(b.Fecha).toLocaleDateString('es-PE') : ''}</div>
                </div>`;
        });

        modalBody.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.25rem;">
                <!-- COBRANZAS SECTION -->
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                        <div style="display:inline-flex; align-items:center; gap:0.5rem; background:#eff6ff; color:#2563eb; padding:0.35rem 0.75rem; border-radius:9999px; font-size:0.75rem; font-weight:600;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                            Documentos del Sistema (${data.cobranzas?.length || 0} cobranzas)
                        </div>
                        <span style="font-weight:700; color:#1e293b;">Total: ${currentCurrencySymbol} ${totalCob.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
                    </div>
                    ${cobHtml}
                </div>

                <!-- LINK -->
                <div style="display:flex; justify-content:center; color:#cbd5e1;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                </div>

                <!-- BANCOS SECTION -->
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                        <div style="display:inline-flex; align-items:center; gap:0.5rem; background:#ecfdf5; color:#10b981; padding:0.35rem 0.75rem; border-radius:9999px; font-size:0.75rem; font-weight:600;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                            Movimientos Bancarios (${data.bancos?.length || 0})
                        </div>
                        <span style="font-weight:700; color:#1e293b;">Total: ${currentCurrencySymbol} ${totalBank.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
                    </div>
                    ${bankHtml}
                </div>

                <!-- FOOTER -->
                <div style="text-align:center; font-size:0.75rem; color:#94a3b8; border-top:1px solid #f1f5f9; padding-top:0.75rem;">
                    <p style="margin:0;">Conciliacion realizada el: ${data.match.MatchedAt ? new Date(data.match.MatchedAt).toLocaleString('es-PE') : 'N/D'} via <strong>${data.match.MatchType}</strong></p>
                    <p style="margin:0.25rem 0 0;">Grupo #${data.match.ReconciliationId} | Match ID #${data.match.Id}</p>
                </div>
            </div>
        `;

    } catch (err) {
        console.error(err);
        modalBody.innerHTML = `<div style="color:#ef4444; text-align:center; padding:2rem;">Error: ${err.message}</div>`;
    }
}

function closeMatchDetailsModal() {
    const modal = document.getElementById('matchDetailsModal');
    if (modal) modal.style.display = 'none';
}

async function deleteAllBankMovements() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    
    if (!codcia || !bankCode) {
        showToast('Seleccione una empresa y un banco primero.', 'error');
        return;
    }

    // Restaurar el HTML original del modal antes de mostrarlo
    const inner = document.getElementById('deleteModalInner');
    if (inner && window._deleteModalOriginalHTML) {
        inner.innerHTML = window._deleteModalOriginalHTML;
        // Re-adjuntar listeners porque el innerHTML fue reemplazado
        _attachDeleteModalButtonListeners();
    }

    // Mostrar el modal
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.style.display = 'flex';
}

function closeDeleteConfirmModal() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.style.display = 'none';
}

async function executeDeleteAllBankMovements(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    
    const btn = document.getElementById('btnConfirmDeleteAll');
    if (btn) {
        btn.textContent = 'Eliminando...';
        btn.disabled = true;
    }
    
    try {
        const codcia = document.getElementById('selectEmpresa')?.value;
        const bankCode = document.getElementById('selectBanco')?.value;
        
        if (!codcia || !bankCode) {
            throw new Error('Faltan datos de Empresa o Banco.');
        }

        const res = await fetch(`/api/conciliacion/movimientos-banco/all?codcia=${codcia}&bank_code=${bankCode}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.detail || 'Error al eliminar');
        }
        
        // Mostrar éxito DENTRO del modal
        const inner = document.getElementById('deleteModalInner');
        if(inner) {
            inner.innerHTML = `
                <div style="background: #ecfdf5; padding: 3rem 1.5rem; display: flex; flex-direction: column; align-items: center; text-align: center;">
                    <div style="background: #d1fae5; width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem; box-shadow: 0 0 0 10px #ecfdf5;">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <h2 style="margin: 0 0 0.5rem; color: #065f46; font-size: 1.5rem; font-weight: 700;">¡Eliminación Exitosa!</h2>
                    <p style="margin: 0; color: #047857; font-size: 1.1rem;">${data.message}</p>
                </div>
                <div style="padding: 1.25rem; background: #ffffff; display: flex; justify-content: center;">
                    <button type="button" id="btnCloseSuccessModal" style="padding: 0.75rem 2rem; border-radius: 8px; font-weight: 600; background: #10b981; color: white; border: none; cursor: pointer; font-size: 0.95rem; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);">Continuar</button>
                </div>
            `;
            // Attach close listener to the new button
            const closeBtn = document.getElementById('btnCloseSuccessModal');
            if (closeBtn) closeBtn.addEventListener('click', function(ev) { ev.stopPropagation(); closeDeleteConfirmModal(); });
        }
        
        loadMovimientosBanco();
        
    } catch (err) {
        console.error("Error capturado durante el borrado:", err);
        const inner = document.getElementById('deleteModalInner');
        if(inner) {
            inner.innerHTML = `
                <div style="background: #fef2f2; padding: 2rem 1.5rem; text-align: center;">
                    <h2 style="color: #991b1b; margin-bottom: 1rem;">Ocurrió un Error</h2>
                    <p style="color: #b91c1c; background: #fee2e2; padding: 1rem; border-radius: 8px; border: 1px solid #fca5a5;">${err.message}</p>
                </div>
                <div style="padding: 1.25rem; background: #ffffff; display: flex; justify-content: center;">
                    <button type="button" id="btnCloseErrorModal" style="padding: 0.75rem 2rem; border-radius: 8px; font-weight: 600; background: #ef4444; color: white; border: none; cursor: pointer; font-size: 0.95rem;">Cerrar</button>
                </div>
            `;
            const closeBtn = document.getElementById('btnCloseErrorModal');
            if (closeBtn) closeBtn.addEventListener('click', function(ev) { ev.stopPropagation(); closeDeleteConfirmModal(); });
        }
    }
}

function _attachDeleteModalButtonListeners() {
    const cancelBtn = document.getElementById('btnCancelDeleteAll');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeDeleteConfirmModal();
        });
    }
    const confirmBtn = document.getElementById('btnConfirmDeleteAll');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            executeDeleteAllBankMovements(e);
        });
    }
}

// Inicialización inmediata (el DOM ya está listo porque este script está al final del body)
(function() {
    // Delete modal init
    var inner = document.getElementById('deleteModalInner');
    if (inner) {
        window._deleteModalOriginalHTML = inner.innerHTML;
        inner.addEventListener('click', function(e) { e.stopPropagation(); });
    }
    _attachDeleteModalButtonListeners();
    var overlay = document.getElementById('deleteConfirmModal');
    if (overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeDeleteConfirmModal();
        });
    }

    // Import modal init
    var importInner = document.getElementById('importModalInner');
    if (importInner) {
        window._importModalOriginalHTML = importInner.innerHTML;
        importInner.addEventListener('click', function(e) { e.stopPropagation(); });
    }
    var importOverlay = document.getElementById('importConfirmModal');
    if (importOverlay) {
        importOverlay.addEventListener('click', function(e) {
            if (e.target === importOverlay) closeImportConfirmModal();
        });
    }
})();

let dtConciliados = null;
async function loadConciliados() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    const year = document.getElementById('selectYear').value;
    const month = document.getElementById('selectMonth').value;

    if (!codcia || !bankCode) return;

    try {
        const params = new URLSearchParams({ codcia, bank_code: bankCode });
        if (year) params.append('year', year);
        if (month) params.append('month', month.padStart(2, '0'));

        const res = await fetch(`/api/conciliacion/conciliados?${params}`);
        if (!res.ok) throw new Error('Error loading conciliados');
        const data = await res.json();
        
        renderConciliadosTable(data);
    } catch (err) {
        console.error(err);
        showToast('Error al cargar la lista de conciliados', 'error');
    }
}

function renderConciliadosTable(data) {
    if (dtConciliados) {
        dtConciliados.clear().rows.add(data).draw();
        return;
    }

    dtConciliados = $('#tableConciliados').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json' },
        pageLength: 50,
        deferRender: true,
        data: data,
        dom: '<"table-top"fB>rt<"table-bottom"ip>',
        buttons: [{ extend: 'excel', text: 'Exportar Excel', className: 'btn btn-primary btn-sm' }],
        order: [[0, 'desc']],
        columns: [
            { data: 'Id' },
            { data: 'empresa' },
            { data: 'codigo_banco' },
            { data: 'Fecha_banco', render: data => data ? formatUTCLocalDate(data) : '—' },
            { data: 'IdBanco' },
            { data: 'IdCobranza_CodCia' },
            { data: 'IdCobranza_coddoc', render: data => `<span class="badge lot">${data}</span>` },
            { data: 'IdCobranza_nrodoc' },
            { data: 'IdCobranza_nroitm' },
            { data: 'codref', render: data => data || '—' },
            { data: 'nroref', render: data => data || '—' },
            { data: 'importe', render: data => `<span class="amount positive">${currentCurrencySymbol} ${Math.abs(parseFloat(data)).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>` },
            { data: 'codaux', render: data => data || '—' },
            { data: 'nro_operacion', render: data => data || '—' },
            { data: 'usuario', render: data => data || '—' },
            { data: 'CreatedAt', render: data => data ? new Date(data).toLocaleString() : '—' },
            { 
                data: null, 
                orderable: false, 
                searchable: false,
                render: function(data, type, row) {
                    return `<button class="btn btn-outline" style="color:var(--danger); border-color:var(--danger); padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="unmatchBankSwal('${row.ReconciliationDetailId}')" title="Deshacer Match">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>`;
                }
            }
        ]
    });
}

// ─── Clear All Reconciliations ──────────────────────────────────────
async function clearAllConciliaciones() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    const year = document.getElementById('selectYear').value;
    const month = document.getElementById('selectMonth').value;
    const empresaName = document.getElementById('selectEmpresa').options[document.getElementById('selectEmpresa').selectedIndex]?.text || codcia;
    const bancoName = document.getElementById('selectBanco').options[document.getElementById('selectBanco').selectedIndex]?.text || bankCode;
    const monthNames = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const periodoText = year ? (month ? monthNames[parseInt(month)] + ' ' + year : year) : 'todos los periodos';

    if (!codcia || !bankCode) {
        showToast('Seleccione empresa y banco primero', 'error');
        return;
    }

    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: 'Confirmar Limpieza de Conciliaciones',
            html: `
                <div style="text-align:left; padding:0.5rem 0;">
                    <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:1rem; margin-bottom:1rem;">
                        <p style="margin:0 0 0.5rem; font-weight:600; color:#991b1b;">Se eliminar\u00e1n todas las conciliaciones de:</p>
                        <ul style="margin:0; padding-left:1.5rem; color:#7f1d1d; font-size:0.9rem;">
                            <li><strong>Empresa:</strong> ${empresaName}</li>
                            <li><strong>Banco:</strong> ${bancoName}</li>
                            <li><strong>Periodo:</strong> ${periodoText}</li>
                        </ul>
                    </div>
                    <p style="color:#64748b; font-size:0.85rem; margin:0;">Los movimientos bancarios volver\u00e1n al estado <strong>Pendiente</strong> y podr\u00e1 volver a conciliarlos.</p>
                </div>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Confirmar limpieza',
            cancelButtonText: 'Cancelar',
            focusCancel: true,
            customClass: { popup: 'swal-wide' }
        });
        if (!result.isConfirmed) return;
    } else {
        if (!confirm('Esta seguro de limpiar las conciliaciones seleccionadas?')) return;
    }

    try {
        const body = { codcia, bank_code: bankCode };
        if (year) body.year = year;
        if (month) body.month = month;

        const res = await fetch('/api/conciliacion/clear-all', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Error al limpiar');
        const data = await res.json();
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Limpieza completada',
                text: data.message,
                icon: 'success',
                confirmButtonColor: '#2b3954'
            });
        } else {
            showToast(data.message || 'Conciliaciones eliminadas', 'success');
        }
        await loadData();
    } catch (err) {
        console.error(err);
        if (typeof Swal !== 'undefined') {
            Swal.fire({ title: 'Error', text: 'No se pudieron limpiar las conciliaciones', icon: 'error', confirmButtonColor: '#2b3954' });
        } else {
            showToast('Error al limpiar las conciliaciones', 'error');
        }
    }
}
