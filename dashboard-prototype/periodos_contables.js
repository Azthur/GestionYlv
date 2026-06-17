'use strict';

let currentCodCia = '';
let currentYear = 2026;

// Month Names in Spanish
const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    try {
        const user = JSON.parse(localStorage.getItem('yelave_user'));
        if (!user) throw new Error();
        return user;
    } catch(e) {
        window.location.href = 'login.html';
        return null;
    }
}

async function loadCompanies() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/permisos/empresas/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();
        const companies = await res.json();
        
        const sel = document.getElementById('cntEmpresa');
        if (sel) {
            sel.innerHTML = '<option value="" disabled selected>Seleccione Empresa...</option>';
            companies.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.codcia;
                opt.textContent = `${c.codcia} - ${c.nomcia}`;
                sel.appendChild(opt);
            });
        }

        // Restore saved selection
        const savedCia = localStorage.getItem('cnt_saved_cia');
        const cu = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        const defaultCia = savedCia || cu.codcia || (companies.length > 0 ? companies[0].codcia : '');

        if (defaultCia && sel) {
            if (Array.from(sel.options).some(o => o.value === defaultCia)) {
                sel.value = defaultCia;
                currentCodCia = defaultCia;
                loadPeriodos();
            }
        }
    } catch(e) {
        console.error('Error loadCompanies:', e);
        document.getElementById('cntEmpresa').innerHTML = '<option value="" disabled>Sin acceso a empresas</option>';
    }
}

function changeYear(delta) {
    currentYear += delta;
    document.getElementById('yearVal').textContent = currentYear;
    loadPeriodos();
}

async function loadPeriodos() {
    const sel = document.getElementById('cntEmpresa');
    if (!sel || !sel.value) return;
    currentCodCia = sel.value;
    localStorage.setItem('cnt_saved_cia', currentCodCia);

    const container = document.getElementById('monthsContainer');
    container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:3rem; color:var(--text-muted);">Cargando periodos...</div>';

    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/contabilidad/periodos?codcia=${currentCodCia}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error al consultar periodos');
        const data = await res.json();

        // Create a map of month states for the current year
        const monthMap = {};
        data.forEach(p => {
            if (p.Ano === currentYear) {
                monthMap[p.Mes] = p.Estado.trim().toUpperCase();
            }
        });

        container.innerHTML = '';
        MONTH_NAMES.forEach((name, idx) => {
            const mesNum = idx + 1;
            const estado = monthMap[mesNum] || 'ABIERTO'; // default is ABIERTO
            const isOpen = (estado === 'ABIERTO');

            const card = document.createElement('div');
            card.className = 'month-card';
            card.innerHTML = `
                <div>
                    <h3 class="month-name">${name}</h3>
                    <span class="month-status-badge ${isOpen ? 'status-abierto' : 'status-cerrado'}" id="badge-${mesNum}">
                        ${isOpen ? 'Abierto' : 'Cerrado'}
                    </span>
                </div>
                <div class="switch-container">
                    <label class="switch">
                        <input type="checkbox" id="toggle-${mesNum}" ${isOpen ? 'checked' : ''} onchange="togglePeriodo(${mesNum}, this)">
                        <span class="slider"></span>
                    </label>
                    <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-muted);" id="lbl-${mesNum}">
                        ${isOpen ? 'Habilitado' : 'Bloqueado'}
                    </span>
                </div>
            `;
            container.appendChild(card);
        });

    } catch(e) {
        console.error(e);
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:3rem; color:var(--danger);">${e.message}</div>`;
    }
}

async function togglePeriodo(mes, checkbox) {
    const nextState = checkbox.checked ? 'ABIERTO' : 'CERRADO';
    const monthName = MONTH_NAMES[mes - 1];
    
    // Optimistic UI updates
    const badge = document.getElementById(`badge-${mes}`);
    const label = document.getElementById(`lbl-${mes}`);
    if (badge) {
        badge.textContent = checkbox.checked ? 'Abierto' : 'Cerrado';
        badge.className = `month-status-badge ${checkbox.checked ? 'status-abierto' : 'status-cerrado'}`;
    }
    if (label) {
        label.textContent = checkbox.checked ? 'Habilitado' : 'Bloqueado';
    }

    try {
        const token = localStorage.getItem('yelave_token');
        const payload = {
            codcia: currentCodCia,
            ano: currentYear,
            mes: mes,
            estado: nextState
        };

        const res = await fetch('/api/contabilidad/periodos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'No se pudo actualizar el estado del periodo');

        Swal.fire({
            icon: 'success',
            title: `¡Periodo ${nextState === 'ABIERTO' ? 'Abierto' : 'Cerrado'}!`,
            text: `${monthName} del ${currentYear} fue actualizado con éxito.`,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true
        });

    } catch(e) {
        console.error(e);
        // Revert UI if error occurs
        checkbox.checked = !checkbox.checked;
        if (badge) {
            badge.textContent = checkbox.checked ? 'Abierto' : 'Cerrado';
            badge.className = `month-status-badge ${checkbox.checked ? 'status-abierto' : 'status-cerrado'}`;
        }
        if (label) {
            label.textContent = checkbox.checked ? 'Habilitado' : 'Bloqueado';
        }

        Swal.fire({
            icon: 'error',
            title: 'Error de actualización',
            text: e.message
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user) return;

    // Set default year display
    document.getElementById('yearVal').textContent = currentYear;

    // Load companies list
    await loadCompanies();

    // Attach company change listener
    const sel = document.getElementById('cntEmpresa');
    if (sel) {
        sel.addEventListener('change', () => {
            loadPeriodos();
        });
    }
});
