// ─── Auth Guard ────────────
function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) { window.location.href = 'login.html'; return null; }
    try { 
        const user = JSON.parse(localStorage.getItem('yelave_user')); 
        if (!user) throw new Error();
        return user;
    }
    catch (e) { window.location.href = 'login.html'; return null; }
}

function renderUserInfo(user) {
    if (!user) return;
    document.getElementById('userNameDisplay').textContent = user.nombre || user.login;
    let roleLabel = user.rol || 'Consultor';
    if (user.login === '71941916JL' || user.rol === 'ADMIN') roleLabel = 'Administrador';
    document.getElementById('userRoleDisplay').textContent = roleLabel;
    document.getElementById('userAvatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre || user.login)}&background=2b3954&color=fff`;
}

function logout() { localStorage.removeItem('yelave_token'); localStorage.removeItem('yelave_user'); window.location.href = 'login.html'; }
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebarOverlay');
    sb.classList.toggle('open');
    ov.classList.toggle('active', sb.classList.contains('open'));
}

function switchTab(tabId, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('tab-' + tabId).classList.add('active');
}

let dtPendientes = null;
let dtHojas = null;

// ─── Initialization ────────────
document.addEventListener('DOMContentLoaded', () => {
    const user = checkAuth();
    if (!user) return;
    renderUserInfo(user);
    
    // Set default date to today for Hoja Ruta and Manual Request
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('selFechaRuta').value = today;
    document.getElementById('manFecha').value = today;

    loadCompanies();
});

async function loadCompanies() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/logistics/companies', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const companies = await res.json();
        const sel = document.getElementById('filterCia');
        sel.innerHTML = '<option value="" disabled selected>Selecciona Empresa...</option>';
        companies.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.codcia; opt.textContent = `${c.codcia} - ${c.nomcia}`;
            sel.appendChild(opt);
        });
    } catch (e) {
        document.getElementById('filterCia').innerHTML = '<option value="" disabled>Error cargando</option>';
    }
}

async function loadRepartoData() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) return;

    Swal.fire({ title: 'Cargando información...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    await Promise.all([
        loadRecursos(codcia),
        loadSolicitudesPendientes(codcia),
        loadHojasRuta(codcia)
    ]);
    
    Swal.close();
}

// ─── Data Loading ────────────

async function loadRecursos(codcia) {
    try {
        const res = await fetch(`/api/reparto/recursos?codcia=${codcia}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        const selC = document.getElementById('selChofer');
        selC.innerHTML = '<option value="">Seleccione Chofer</option>';
        data.choferes.forEach(c => {
            selC.innerHTML += `<option value="${c.codigo}">${c.nombre} (Lic/DNI: ${c.licencia})</option>`;
        });
        
        const selM = document.getElementById('selMovilidad');
        selM.innerHTML = '<option value="">Seleccione Movilidad</option>';
        data.movilidades.forEach(m => {
            selM.innerHTML += `<option value="${m.codigo}">${m.placa} - ${m.descripcion}</option>`;
        });
    } catch (e) {
        console.error('Error fetching recursos');
    }
}

async function loadSolicitudesPendientes(codcia) {
    try {
        const res = await fetch(`/api/reparto/solicitudes?codcia=${codcia}&estado=Pendiente`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        if (dtPendientes) { dtPendientes.destroy(); }
        
        const tbody = document.querySelector('#pendientesTable tbody');
        let html = '';
        data.forEach(s => {
            const itemsResumen = s.items.map(i => `${i.cantidad} ${i.unidad||'UND'} ${i.descripcion}`).join('<br>');
            const urlMaps = s.url_maps ? `<a href="${s.url_maps}" target="_blank" style="color:#0ea5e9; margin-left:5px;" title="Ver en Maps"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:bottom;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></a>` : '';
            html += `<tr>
                <td style="text-align:center;"><input type="checkbox" class="chk-sol" value="${s.id}"></td>
                <td><strong>SR-${s.id}</strong></td>
                <td><span class="badge ${s.tipo==='MANUAL'?'pending':'approved'}">${s.tipo}</span></td>
                <td>${s.proveedor_nombre || '-'}${urlMaps}</td>
                <td>${s.celular_contacto || '-'}</td>
                <td title="${s.origen}">${(s.origen||'').substring(0,30)}...</td>
                <td title="${s.destino}">${(s.destino||'').substring(0,30)}...</td>
                <td>${s.fecha_recojo} ${s.hora_recojo || ''}</td>
                <td title="${s.observaciones || ''}">${(s.observaciones||'-').substring(0,20)}${s.observaciones&&s.observaciones.length>20?'...':''}</td>
                <td>
                    ${s.nro_oc ? `<strong>OC-${s.nro_oc}</strong><br>` : ''}
                    <span style="font-size:0.7rem; color:#64748b; line-height:1.2; display:block; margin-top:0.25rem;">${itemsResumen}</span>
                </td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        dtPendientes = $('#pendientesTable').DataTable({
            order: [[1, 'desc']],
            language: { url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json' }
        });
    } catch (e) {
        console.error('Error fetching solicitudes');
    }
}

async function loadHojasRuta(codcia) {
    try {
        const res = await fetch(`/api/reparto/hojas-ruta?codcia=${codcia}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        if (dtHojas) { dtHojas.destroy(); }
        
        const tbody = document.querySelector('#hojasRutaTable tbody');
        let html = '';
        data.forEach(h => {
            html += `<tr>
                <td>
                    <button class="btn btn-outline" onclick="viewHojaRuta(${h.id})" style="padding:0.25rem 0.5rem; font-size:0.75rem;">Ver / Imprimir</button>
                </td>
                <td><strong>HR-${h.id.toString().padStart(4, '0')}</strong></td>
                <td>${h.fecha_ruta}</td>
                <td>${h.chofer_nombre || h.cod_chofer}</td>
                <td>${h.movilidad_placa || h.cod_movilidad}</td>
                <td style="text-align:center;"><span class="badge" style="background:#e2e8f0; color:#334155;">${h.total_solicitudes} Solicitudes</span></td>
                <td><span class="badge approved">${h.estado}</span></td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        dtHojas = $('#hojasRutaTable').DataTable({
            order: [[1, 'desc']],
            language: { url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json' }
        });
    } catch (e) {
        console.error('Error fetching hojas de ruta');
    }
}

// ─── Actions ────────────

function toggleAllSol() {
    const currentList = document.querySelectorAll('.chk-sol');
    const checked = document.getElementById('chkAllSol').checked;
    currentList.forEach(chk => chk.checked = checked);
}

async function generarHojaRuta() {
    const codcia = document.getElementById('filterCia').value;
    const codChofer = document.getElementById('selChofer').value;
    const codMovilidad = document.getElementById('selMovilidad').value;
    const fechaRuta = document.getElementById('selFechaRuta').value;
    
    if (!codcia) { Swal.fire('Error','Falta seleccionar Empresa', 'error'); return; }
    if (!codChofer || !codMovilidad || !fechaRuta) {
        Swal.fire('Atención', 'Seleccione Chofer, Movilidad y Fecha de Ruta', 'warning'); return;
    }
    
    const selectedIds = [];
    document.querySelectorAll('.chk-sol').forEach(chk => {
        if (chk.checked) selectedIds.push(parseInt(chk.value));
    });
    
    if (selectedIds.length === 0) {
        Swal.fire('Atención', 'Seleccione al menos una solicitud pendiente', 'warning'); return;
    }
    
    const payload = {
        codcia: codcia,
        cod_chofer: codChofer,
        cod_movilidad: codMovilidad,
        fecha_ruta: fechaRuta,
        solicitudes_ids: selectedIds,
        responsable: document.getElementById('userNameDisplay').textContent
    };
    
    try {
        Swal.fire({ title: 'Generando...', didOpen: () => Swal.showLoading() });
        const res = await fetch('/api/reparto/hojas-ruta', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Error');
        
        Swal.fire('¡Éxito!', 'Hoja de Ruta generada correctamente.', 'success');
        
        // Reload tabs
        loadSolicitudesPendientes(codcia);
        loadHojasRuta(codcia);
        document.getElementById('selChofer').value = '';
        document.getElementById('selMovilidad').value = '';
        
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
}

// ─── Solicitud Manual ────────────
function addManualItem() {
    const html = `<tr>
        <td><input type="text" class="man-desc" style="width:100%;" required></td>
        <td><input type="number" class="man-qty" style="width:100%;" min="0.01" step="0.01" required></td>
        <td><input type="text" class="man-und" style="width:100%;" placeholder="UND, KG..."></td>
        <td style="text-align:center;"><button type="button" class="btn" onclick="this.closest('tr').remove()" style="padding:0.2rem 0.5rem; color:red;">X</button></td>
    </tr>`;
    document.getElementById('manItemsTbody').insertAdjacentHTML('beforeend', html);
}

async function submitSolicitudManual() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) { Swal.fire('Error','Seleccione empresa arriba primero.', 'error'); return; }
    
    const form = document.getElementById('formManual');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    
    const rows = document.querySelectorAll('#manItemsTbody tr');
    if (rows.length === 0) { Swal.fire('Atención','Agregue al menos un ítem', 'warning'); return; }
    
    const items = [];
    rows.forEach(tr => {
        items.push({
            descripcion: tr.querySelector('.man-desc').value,
            cantidad: parseFloat(tr.querySelector('.man-qty').value),
            unidad: tr.querySelector('.man-und').value || 'UND'
        });
    });
    
    const payload = {
        tipo: 'MANUAL',
        codcia: codcia,
        fecha_recojo: document.getElementById('manFecha').value,
        hora_recojo: document.getElementById('manHora').value,
        origen: document.getElementById('manOrigen').value,
        destino: document.getElementById('manDestino').value,
        contacto: document.getElementById('manContacto').value,
        responsable: document.getElementById('userNameDisplay').textContent,
        items: items
    };
    
    try {
        Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
        const res = await fetch('/api/reparto/solicitudes', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error();
        
        Swal.fire('¡Éxito!', 'Solicitud registrada.', 'success');
        form.reset();
        document.getElementById('manFecha').value = new Date().toISOString().split('T')[0];
        
        // Refresh pendientes
        loadSolicitudesPendientes(codcia);
        // Switch to pendientes tab
        document.querySelector('.tab').click();
    } catch (e) {
        Swal.fire('Error', 'No se pudo guardar la solicitud', 'error');
    }
}

// ─── Document View / Print ────────────
async function viewHojaRuta(id) {
    document.getElementById('hojaRutaModal').classList.add('active');
    document.getElementById('hrViewId').textContent = `HR-${id.toString().padStart(4, '0')}`;
    const container = document.getElementById('hrContent');
    container.innerHTML = 'Cargando formato...';
    
    try {
        const res = await fetch(`/api/reparto/hojas-ruta/${id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        let html = `
        <div style="border: 2px solid #1e293b; padding:1.5rem; border-radius:8px;">
            <div style="text-align:center; margin-bottom:1.5rem; border-bottom:2px solid #cbd5e1; padding-bottom:1rem;">
                <h2 style="margin:0; color:#1e293b;">HOJA DE RUTA LOGÍSTICA N° ${id.toString().padStart(4, '0')}</h2>
                <p style="margin:0; font-size:0.875rem; color:#64748b;">Fecha de Ruta: <strong>${data.fecha_ruta}</strong></p>
            </div>
            
            <div style="display:flex; justify-content:space-between; margin-bottom:1.5rem; padding:1rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
                <div>
                    <p style="margin:0 0 0.5rem 0;"><strong>Chofer Designado:</strong> ${data.chofer_nombre}</p>
                    <p style="margin:0;"><strong>Licencia / DNI:</strong> ${data.chofer_licencia}</p>
                </div>
                <div>
                    <p style="margin:0 0 0.5rem 0;"><strong>Unidad / Placa:</strong> ${data.movilidad_placa}</p>
                    <p style="margin:0;"><strong>Descripción Unidad:</strong> ${data.movilidad_desc}</p>
                </div>
            </div>
            
            <h4 style="margin-bottom:1rem; border-bottom:1px solid #e2e8f0; padding-bottom:0.5rem;">Detalle de Puntos de Recojo</h4>
        `;
        
        data.solicitudes.forEach((sol, idx) => {
            html += `
            <div style="border:1px solid #94a3b8; border-radius:6px; margin-bottom:1rem; overflow:hidden;">
                <div style="background:#f1f5f9; padding:0.5rem 1rem; border-bottom:1px solid #94a3b8; font-weight:600; font-size:0.875rem; display:flex; justify-content:space-between;">
                    <span>Parada ${idx+1} - SR-${sol.id} ${sol.tipo === 'OC' ? '(OC: '+sol.nro_oc+')' : '(Manual)'}</span>
                    <span>Hora Prog: ${sol.hora_recojo || 'Sin definir'}</span>
                </div>
                <div style="padding:0.75rem 1rem; font-size:0.8125rem;">
                    <p style="margin:0 0 0.35rem 0;"><strong>Origen:</strong> ${sol.origen}</p>
                    <p style="margin:0 0 0.35rem 0;"><strong>Contacto:</strong> ${sol.contacto || 'N/A'}</p>
                    <p style="margin:0 0 0.75rem 0;"><strong>Destino Final:</strong> ${sol.destino}</p>
                    
                    <table style="width:100%; border-collapse:collapse; margin-top:0.5rem;">
                        <thead>
                            <tr style="background:#e2e8f0;"><th style="padding:4px 8px; border:1px solid #cbd5e1;text-align:left;">Producto</th><th style="padding:4px 8px; border:1px solid #cbd5e1; width:80px; text-align:right;">Cantidad</th></tr>
                        </thead>
                        <tbody>
            `;
            sol.items.forEach(it => {
                html += `<tr>
                    <td style="padding:4px 8px; border:1px solid #cbd5e1;">${it.codmat ? '['+it.codmat+'] ' : ''}${it.descripcion}</td>
                    <td style="padding:4px 8px; border:1px solid #cbd5e1; text-align:right; font-weight:600;">${it.cantidad} ${it.unidad||'UND'}</td>
                </tr>`;
            });
            html += `</tbody></table></div></div>`;
        });
        
        html += `
            <div style="display:flex; justify-content:space-between; margin-top:4rem;">
                <div style="text-align:center; width:250px; border-top:1px solid #64748b; padding-top:0.5rem; font-size:0.875rem;">Firma Chofer Receptor</div>
                <div style="text-align:center; width:250px; border-top:1px solid #64748b; padding-top:0.5rem; font-size:0.875rem;">Firma Jefe de Logística</div>
            </div>
            <div style="margin-top:2rem; font-size:0.7rem; color:#64748b; text-align:center;">
                Documento generado el ${new Date().toLocaleString('es-PE')} por ${data.created_by || 'Sistema'}
            </div>
        </div>`;
        
        container.innerHTML = html;
        
    } catch (e) {
        container.innerHTML = `<span style="color:red;">Error al cargar datos</span>`;
    }
}

function closeHojaRutaModal() { document.getElementById('hojaRutaModal').classList.remove('active'); }
function printHojaRuta() { window.print(); }
