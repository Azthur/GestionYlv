function switchTab(tabId, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('tab-' + tabId).classList.add('active');
}

function formatTime12h(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return timeStr || 'S/H';
    try {
        const parts = timeStr.split(':');
        let h = parseInt(parts[0], 10);
        let m = parts[1].substring(0, 2);
        let ampm = h >= 12 ? 'PM' : 'AM';
        let h12 = h % 12 || 12;
        return `${h12}:${m} ${ampm}`;
    } catch (e) { return timeStr; }
}

let dtPendientes = null;
let dtHojas = null;
let dtHistorial = null;

// ─── Initialization ────────────
function initApp() {
    const today = new Date().toISOString().split('T')[0];
    const selFechaRuta = document.getElementById('selFechaRuta');
    const manFecha = document.getElementById('manFecha');
    
    if (selFechaRuta) selFechaRuta.value = today;
    if (manFecha) manFecha.value = today;

    loadCompanies();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

async function loadCompanies() {
    console.log("loadCompanies starting...");
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/permisos/empresas/me', { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (res.status === 401) {
            console.error("Token expired or invalid, redirecting to login.");
            localStorage.removeItem('yelave_token');
            localStorage.removeItem('yelave_user');
            window.location.href = 'login.html';
            return;
        }
        if (!res.ok) {
            console.error("API empresas/me failed:", res.status);
            throw new Error();
        }
        const companies = await res.json();
        console.log("Companies fetched:", companies);
        
        const sel = document.getElementById('filterCia');
        if (!sel) {
            console.error("Element filterCia not found!");
            return;
        }
        sel.innerHTML = '<option value="" disabled selected>Selecciona Empresa...</option>';
        
        // Opción para ver TODAS (Cross-Company)
        const optAll = document.createElement('option');
        optAll.value = 'ALL'; optAll.textContent = '000 - TODAS LAS EMPRESAS (Cross-Company)';
        optAll.style.fontWeight = 'bold';
        optAll.style.color = 'var(--primary)';
        sel.appendChild(optAll);

        if (Array.isArray(companies)) {
            companies.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.codcia; opt.textContent = `${c.codcia} - ${c.nomcia}`;
                sel.appendChild(opt);
            });
        }

        // Default selection from user session or first available
        const cuStr = localStorage.getItem('yelave_user');
        if (cuStr) {
            try {
                const cu = JSON.parse(cuStr);
                if (cu.codcia && Array.from(sel.options).some(o => o.value === cu.codcia)) {
                    sel.value = cu.codcia;
                    loadRepartoData();
                }
            } catch(je) { console.error("Error parsing user session"); }
        }
    } catch (e) {
        console.error('Error loadCompanies catch:', e);
        if (document.getElementById('filterCia'))
            document.getElementById('filterCia').innerHTML = '<option value="" disabled>Error al cargar empresas</option>';
    }
}

async function loadRepartoData() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) return;

    Swal.fire({ title: 'Cargando información...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    console.log("Loading Reparto Data for:", codcia);
    await Promise.all([
        loadRecursos(codcia),
        loadSolicitudesPendientes(codcia),
        loadHojasRuta(codcia),
        loadHistorialDetallado(codcia)
    ]);
    
    Swal.close();
}

// ─── Data Loading ────────────

async function loadRecursos(codcia) {
    try {
        const res = await fetch(`/api/reparto/recursos?codcia=${codcia}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        console.log("Resources loaded:", data);
        
        const selC = document.getElementById('selChofer');
        selC.innerHTML = '<option value="">Seleccione Chofer</option>';
        data.choferes.forEach(c => {
            selC.innerHTML += `<option value="${c.codigo}" data-codcia="${c.codcia_origen}">${c.nombre} (Lic/DNI: ${c.licencia})</option>`;
        });
        
        const selM = document.getElementById('selMovilidad');
        selM.innerHTML = '<option value="">Seleccione Movilidad</option>';
        data.movilidades.forEach(m => {
            selM.innerHTML += `<option value="${m.codigo}" data-codcia="${m.codcia_origen}">${m.placa} - ${m.descripcion}</option>`;
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
        console.log("Pending solicitudes loaded:", data);
        
        if (dtPendientes) { dtPendientes.destroy(); }
        window.solData = {};
        window.solData = {}; // Store for detailed viewing
        
        const tbody = document.querySelector('#pendientesTable tbody');
        let html = '';
        data.forEach(s => {
            window.solData[s.id] = s;
            const itemsResumen = s.items.map(i => `${i.cantidad} ${i.unidad||'UND'} ${i.descripcion}`).join('<br>');
            const urlMaps = s.url_maps ? `<a href="${s.url_maps}" target="_blank" style="color:#0ea5e9; margin-left:5px;" title="Ver en Maps">📍 Mapa</a>` : '';
            
            const obsDisplay = s.observaciones 
                ? `<div style="background:#fee2e2; border-left:4px solid #ef4444; padding:5px 8px; font-weight:600; color:#991b1b; font-size:0.75rem; border-radius:3px; margin-top:5px;">OBS: ${s.observaciones}</div>`
                : '';
                
            let horarioStr = s.hora_recojo ? s.hora_recojo : 'Por Confirmar';
            if (s.hora_recojo) {
                const parts = s.hora_recojo.split(':');
                if(parts.length >= 2) {
                    let h = parseInt(parts[0], 10);
                    let m = parts[1];
                    let ampm = h >= 12 ? 'PM' : 'AM';
                    let h12 = h % 12 || 12;
                    horarioStr = `${h12}:${m} ${ampm}`;
                }
            }
            let displayHorario = 'S/D';
            if (s.fecha_recojo) {
                try {
                    let dateObj = new Date(s.fecha_recojo + "T00:00:00");
                    let dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                    let dayName = dayNames[dateObj.getDay()] || '';
                    let dateParts = s.fecha_recojo.split('-');
                    let formattedDate = `${dayName} ${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                    displayHorario = `${formattedDate}<br><span style="font-size:0.75rem; color:#64748b;">${horarioStr}</span>`;
                } catch (de) { displayHorario = s.fecha_recojo; }
            }


            html += `<tr>
                <td style="text-align:center;"><input type="checkbox" class="chk-sol" value="${s.id}"></td>
                <td><span style="font-weight:600;">${s.tipo}</span><br><span style="font-size:0.75rem;color:#64748b;">${s.nro_oc||'S/N'}</span></td>
                <td>
                    <span class="badge" style="background:#e0e7ff; color:#3730a3; margin-bottom:4px;">${s.codcia_nombre || s.codcia}</span><br>
                    <div style="font-weight:600; color:#1e293b;">${s.proveedor_nombre||s.contacto||'S/D'}</div>
                    <div style="font-size:0.75rem; color:#64748b; white-space:normal;">${s.celular_contacto ? '📱 ' + s.celular_contacto : ''}</div>
                </td>
                <td style="white-space:normal !important; min-width: 150px;">
                    <div><span style="font-weight:500; font-size:0.7rem;">📍 ORIGEN:</span> ${s.origen}</div>
                    <div style="margin-top:3px;"><span style="font-weight:500; font-size:0.7rem;">🎯 DEST:</span> ${s.destino}</div>
                    ${urlMaps}
                </td>
                <td style="white-space:normal !important; min-width: 200px;">
                    <div style="font-size:0.8rem; margin-bottom:5px;">${itemsResumen}</div>
                    ${obsDisplay}
                </td>
                <td style="font-weight:500; color:#0f172a;">${displayHorario}</td>
                <td>
                    <button class="btn btn-outline" style="padding: 2px 5px; font-size: 0.7rem;" onclick="viewSolicitudDetalle(${s.id})">Ver Detalles</button>
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
            const isTerminado = h.estado === 'Terminado';
            html += `<tr>
                <td>
                    <div style="display:flex; gap:0.3rem; flex-wrap:wrap;">
                        <button class="btn btn-primary" onclick="viewHojaRuta(${h.id})" style="padding:0.25rem 0.5rem; font-size:0.75rem; background:var(--primary); border-color:var(--primary); display:flex; align-items:center;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="margin-right:3px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>Ver / Gestionar Hoja
                        </button>
                        <button class="btn btn-outline" onclick="downloadHojaRutaPDF(${h.id})" style="padding:0.25rem 0.5rem; font-size:0.75rem;">Descargar PDF</button>

                        ${!isTerminado ? `<button class="btn btn-primary" onclick="finalizarHR(${h.id})" style="padding:0.25rem 0.5rem; font-size:0.75rem; background:#10b981; border-color:#10b981;">Terminar</button>` : ''}
                        <button class="btn btn-outline" onclick="subirFirmada(${h.id})" style="padding:0.25rem 0.5rem; font-size:0.75rem;" title="Subir HR Firmada"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg></button>
                        ${h.archivo_firmado ? `<a href="/api/reparto/evidencia-archivo/${h.archivo_firmado}" target="_blank" class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; background:#fee2e2; border-color:#ef4444; color:#991b1b; text-decoration:none;" title="Ver Documento Firmado">📄 Firmada</a>` : ''}
                    </div>
                </td>
                <td><strong>HR-${h.id.toString().padStart(4, '0')}</strong></td>
                <td><div style="font-size:0.75rem;"><strong>${h.codcia}</strong><br>${h.codcia_nombre || ''}</div></td>
                <td>${h.fecha_ruta}</td>
                <td>${h.chofer_nombre || h.cod_chofer || 'No asignado'}</td>
                <td>${h.movilidad_placa || h.cod_movilidad || 'No asignado'}</td>
                <td style="text-align:center;"><span class="badge" style="background:#e2e8f0; color:#334155;">${h.total_solicitudes} Solicitudes</span></td>
                <td><span class="badge ${isTerminado?'approved':'pending'}">${h.estado}</span></td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        dtHojas = $('#hojasRutaTable').DataTable({
            order: [[1, 'desc']], // Ordenar por ID Hoja
            language: { url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json' }
        });
    } catch (e) {
        console.error('Error fetching hojas de ruta');
    }
}

function viewSolicitudDetalle(id) {
    const s = window.solData[id];
    if (!s) return;
    
    let itemsHtml = s.items.map(i => `<tr>
        <td style="padding:4px 8px; border:1px solid #cbd5e1;">${i.codmat ? '['+i.codmat+'] ' : ''}${i.descripcion}</td>
        <td style="padding:4px 8px; border:1px solid #cbd5e1; text-align:right;">${i.cantidad} ${i.unidad||'UND'}</td>
    </tr>`).join('');

    let html = `
        <div style="text-align:left; font-size:0.85rem;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <div><strong>Tipo:</strong> ${s.tipo}</div>
                <div><strong>OC:</strong> ${s.nro_oc || 'N/A'}</div>
                <div><strong>Empresa:</strong> ${s.codcia_nombre || s.codcia}</div>
            </div>
            <div style="margin-bottom:10px;">
                <strong>Proveedor/Contacto:</strong> ${s.proveedor_ruc ? '['+s.proveedor_ruc+'] ' : ''}${s.proveedor_nombre||s.contacto||'S/D'} ${s.celular_contacto ? '- 📱 ' + s.celular_contacto : ''}
            </div>
            <div style="margin-bottom:10px;">
                <strong>Origen:</strong> ${s.origen}<br>
                <strong>Destino:</strong> ${s.destino} ${s.url_maps ? `<a href="${s.url_maps}" target="_blank" style="color:#0ea5e9;">(Ver Mapa)</a>` : ''}
            </div>
            ${s.observaciones ? `<div style="background:#fee2e2; border-left:4px solid #ef4444; padding:5px 8px; margin-bottom:10px; color:#991b1b;"><strong>OBSERVACIONES:</strong> ${s.observaciones}</div>` : ''}
            <table style="width:100%; border-collapse:collapse; margin-top:10px;">
                <thead>
                    <tr style="background:#f1f5f9;"><th style="padding:4px 8px; border:1px solid #cbd5e1;">Producto</th><th style="padding:4px 8px; border:1px solid #cbd5e1; text-align:right;">Cant.</th></tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
        </div>
    `;
    
    Swal.fire({
        title: `Detalles de Recojo`,
        html: html,
        width: '600px',
        confirmButtonText: 'Cerrar'
    });
}

async function downloadHojaRutaPDF(hrId) {
    try {
        Swal.fire({ title: 'Generando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await fetch(`/api/reparto/hojas-ruta/${hrId}`);
        const data = await res.json();
        
        let html = `
            <div style="font-family:sans-serif; padding:20px;">
            <div style="text-align:center; padding:15px; background:#1e293b; color:#ffffff !important; margin-bottom:15px; border-radius:8px;">
                <h2 style="margin:0; font-size:1.6rem; letter-spacing:2px; font-weight:bold; color:#ffffff !important;">YELAVE LOGÍSTICA - REPORTE CHOFER</h2>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:1.5rem; border-bottom:2px solid #e2e8f0; padding-bottom:1rem;">
                <div>
                    <h4 style="margin:0 0 0.5rem 0; font-size:1.25rem; color:#0f172a;">HOJA DE RUTA HR-${hrId.toString().padStart(4, '0')}</h4>
                    <p style="margin:0 0 0.25rem 0; font-size:0.875rem;"><strong>Empresa Emisora:</strong> ${data.codcia}</p>
                    <p style="margin:0 0 0.25rem 0; font-size:0.875rem;"><strong>Fecha Ruta:</strong> ${data.fecha_ruta}</p>
                </div>
                <div style="text-align:right;">
                    <p style="margin:0 0 0.25rem 0; font-size:0.875rem;"><strong>Chofer:</strong> ${data.chofer_nombre || 'N/A'}</p>
                    <p style="margin:0 0 0.25rem 0; font-size:0.875rem;"><strong>Lic/DNI:</strong> ${data.chofer_licencia || 'N/A'}</p>
                    <p style="margin:0 0 0.25rem 0; font-size:0.875rem;"><strong>Unidad:</strong> ${data.movilidad_desc || 'N/A'} [${data.movilidad_placa || 'N/A'}]</p>
                </div>
            </div>`;
            
        data.solicitudes.forEach((sol, index) => {
            const mapLink = sol.url_maps ? `<a href="${sol.url_maps}" target="_blank" style="color:#0ea5e9; text-decoration:none;">Ver en Maps</a>` : 'N/A';
            html += `
                <div style="margin-bottom:1.5rem; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
                    <div style="background:#334155; color:white; padding:10px 12px; font-weight:700; font-size:1rem; border-bottom:1px solid #cbd5e1; display:flex; justify-content:space-between; align-items:center;">
                        <span>Parada ${index + 1} - ${sol.tipo}</span>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <span style="background:#10b981; color:white; padding:2px 8px; border-radius:4px; font-size:0.8rem;">🕒 ${formatTime12h(sol.hora_recojo)}</span>
                            <span style="background:#3730a3; color:white; padding:2px 8px; border-radius:4px; font-size:0.8rem;">${sol.codcia_nombre || sol.codcia}</span>
                        </div>
                    </div>
                    <div style="padding:12px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; font-size:0.8rem;">
                        <div>
                            <p style="margin:0 0 0.35rem 0;"><strong>Origen:</strong> ${sol.origen}</p>
                            <p style="margin:0 0 0.35rem 0;"><strong>Destino:</strong> ${sol.destino}</p>
                            <p style="margin:0;"><strong>OC:</strong> ${sol.nro_oc || 'N/A'}</p>
                        </div>
                        <div>
                            <p style="margin:0 0 0.35rem 0;"><strong>Proveedor / Contacto:</strong> ${sol.proveedor_nombre || ''} - ${sol.contacto || ''} - <strong>Cel:</strong> ${sol.celular_contacto || 'N/A'}</p>
                            <p style="margin:0 0 0.35rem 0;"><strong>Mapa:</strong> ${mapLink}</p>
                            <p style="margin:0;"><strong style="background:#fee2e2; color:#ef4444; padding:2px 4px; border-radius:3px;">Obs. Pedido:</strong> ${sol.observaciones || '-'}</p>
                        </div>
                    </div>
                    <table style="width:100%; border-collapse:collapse; margin-top:0.5rem;">
                        <thead>
                            <tr style="background:#334155; color:white;"><th style="padding:4px 8px; border:1px solid #cbd5e1;text-align:left;">Producto</th><th style="padding:4px 8px; border:1px solid #cbd5e1; width:80px; text-align:right;">Cantidad</th></tr>
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
            
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        const opt = {
          margin:       10,
          filename:     `Hoja-Ruta-HR-${hrId}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2 },
          jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(tempDiv).save().then(() => { Swal.close(); });
        
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo generar PDF', 'error');
    }
}


async function viewHojaRuta(id) {
    try {
        Swal.fire({ title: 'Cargando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await fetch(`/api/reparto/hojas-ruta/${id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        document.getElementById('hrViewId').textContent = `HR-${id.toString().padStart(4, '0')}`;
        const container = document.getElementById('hrContent');
        
        let html = `
            <div style="font-family:sans-serif;">
            <div style="display:flex; justify-content:space-between; margin-bottom:1.5rem; border-bottom:2px solid #e2e8f0; padding-bottom:1rem;">
                <div>
                    <h4 style="margin:0 0 0.5rem 0; font-size:1.25rem; color:#0f172a;">HOJA DE RUTA HR-${id.toString().padStart(4, '0')}</h4>
                    <p style="margin:0 0 0.25rem 0; font-size:0.875rem;"><strong>Empresa Emisora:</strong> ${data.codcia}</p>
                    <p style="margin:0 0 0.25rem 0; font-size:0.875rem;"><strong>Fecha Ruta:</strong> ${data.fecha_ruta}</p>
                </div>
                <div style="text-align:right;">
                    <p style="margin:0 0 0.25rem 0; font-size:0.875rem;"><strong>Chofer:</strong> ${data.chofer_nombre || 'N/A'}</p>
                    <p style="margin:0 0 0.25rem 0; font-size:0.875rem;"><strong>Lic/DNI:</strong> ${data.chofer_licencia || 'N/A'}</p>
                    <p style="margin:0 0 0.25rem 0; font-size:0.875rem;"><strong>Unidad:</strong> ${data.movilidad_desc || 'N/A'} [${data.movilidad_placa || 'N/A'}]</p>
                </div>
            </div>`;
            
        data.solicitudes.forEach((sol, index) => {
            const mapLink = sol.url_maps ? `<a href="${sol.url_maps}" target="_blank" style="color:#0ea5e9; text-decoration:none;">Ver en Maps</a>` : 'N/A';
            html += `
                <div style="margin-bottom:1.5rem; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
                    <div style="background:#334155; color:white; padding:10px 12px; font-weight:700; font-size:1rem; border-bottom:1px solid #cbd5e1; display:flex; justify-content:space-between; align-items:center;">
                        <span>Parada ${index + 1} - ${sol.tipo}</span>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <span style="background:#10b981; color:white; padding:2px 8px; border-radius:4px; font-size:0.8rem;">🕒 ${formatTime12h(sol.hora_recojo)}</span>
                            <span style="background:#3730a3; color:white; padding:2px 8px; border-radius:4px; font-size:0.8rem;">${sol.codcia_nombre || sol.codcia}</span>
                        </div>
                    </div>
                    <div style="padding:12px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; font-size:0.8rem;">
                        <div>
                            <p style="margin:0 0 0.35rem 0;"><strong>Origen:</strong> ${sol.origen}</p>
                            <p style="margin:0 0 0.35rem 0;"><strong>Destino:</strong> ${sol.destino}</p>
                            <p style="margin:0;"><strong>OC:</strong> ${sol.nro_oc || 'N/A'}</p>
                        </div>
                        <div>
                            <p style="margin:0 0 0.35rem 0;"><strong>Proveedor / Contacto:</strong> ${sol.proveedor_nombre || ''} - ${sol.contacto || ''} - <strong>Cel:</strong> ${sol.celular_contacto || 'N/A'}</p>
                            <p style="margin:0 0 0.35rem 0;"><strong>Mapa:</strong> ${mapLink}</p>
                            <p style="margin:0;"><strong style="background:#fee2e2; color:#ef4444; padding:2px 4px; border-radius:3px;">Obs. Pedido:</strong> ${sol.observaciones || '-'}</p>
                        </div>
                    </div>
                    
                    <div class="no-print" style="margin: 10px 0; padding: 10px; background: #fdf2f2; border-radius: 4px; border: 1px solid #fee2e2;">
                        <h5 style="margin:0 0 5px 0; color:#991b1b; font-size:0.75rem;">CONTROL DE EVIDENCIAS (CHOFER)</h5>
                        <div style="display:flex; gap:10px; flex-direction:column;">
                            <div style="display:flex; gap:10px;">
                                <textarea placeholder="Observaciones del conductor (ej: no se recibió, incompleto...)" 
                                          id="obs_hr_${sol.hr_det_id}" 
                                          style="flex:1; font-size:0.75rem; padding:5px; border-radius:4px; border:1px solid #fecaca;">${sol.obs_chofer || ''}</textarea>
                                <div style="width:180px;">
                                    <input type="file" id="file_hr_${sol.hr_det_id}" multiple style="font-size:0.7rem; width:100%;">
                                    <button class="btn btn-primary" onclick="guardarEvidencia(${sol.hr_det_id})" style="width:100%; margin-top:5px; font-size:0.7rem; padding:4px;">Guardar Evidencia</button>
                                </div>
                            </div>
                            <div id="evidencias_list_${sol.hr_det_id}" style="font-size:0.7rem; color:#64748b; display:flex; gap:10px; flex-wrap:wrap; margin-top:5px;">
                                ${sol.evidencias ? sol.evidencias.split(',').map(f => `<a href="/api/reparto/evidencia-archivo/${f}" target="_blank" style="color:#0ea5e9; text-decoration:none;">📄 ${f.split('_').pop()}</a>`).join('') : 'Sin archivos'}
                            </div>
                        </div>
                    </div>

                    <table style="width:100%; border-collapse:collapse; margin-top:0.5rem;">
                        <thead>
                            <tr style="background:#334155; color:white;"><th style="padding:4px 8px; border:1px solid #cbd5e1;text-align:left;">Producto</th><th style="padding:4px 8px; border:1px solid #cbd5e1; width:80px; text-align:right;">Cantidad</th></tr>
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
        
        container.innerHTML = html;
        document.getElementById('hojaRutaModal').classList.add('active');
        Swal.close();
        
    } catch (e) {
        Swal.fire('Error', 'No se pudo cargar el detalle', 'error');
    }
}

function closeHojaRutaModal() { document.getElementById('hojaRutaModal').classList.remove('active'); }

async function finalizarHR(id) {
    const { isConfirmed } = await Swal.fire({
        title: '¿Terminar Hoja de Ruta?',
        text: "Se marcará como completada.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, terminar',
        cancelButtonText: 'Cancelar'
    });
    if (!isConfirmed) return;
    try {
        const res = await fetch(`/api/reparto/hojas-ruta/${id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'Terminado' })
        });
        if (!res.ok) throw new Error();
        Swal.fire('Éxito', 'Hoja de Ruta terminada', 'success');
        loadRepartoData();
    } catch (e) { Swal.fire('Error', 'No se pudo terminar', 'error'); }
}

async function guardarEvidencia(detId) {
    const obs = document.getElementById(`obs_hr_${detId}`).value;
    const fileInput = document.getElementById(`file_hr_${detId}`);
    
    try {
        Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        if (fileInput.files.length > 0) {
            const formData = new FormData();
            for (let i = 0; i < fileInput.files.length; i++) {
                formData.append('archivos', fileInput.files[i]);
            }
            const resFile = await fetch(`/api/reparto/hojas-ruta/detalle/${detId}/upload-evidencia`, {
                method: 'POST',
                body: formData
            });
            if (!resFile.ok) throw new Error("Error al subir archivos");
        }
        
        const resObs = await fetch(`/api/reparto/hojas-ruta/detalle/${detId}/obs`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ obs_chofer: obs })
        });
        
        if (!resObs.ok) throw new Error("Error al guardar observaciones");

        Swal.fire({ title: 'Evidencia guardada', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        
        const hrId = document.getElementById('hrViewId').textContent.replace('HR-', '');
        viewHojaRuta(parseInt(hrId));
        
    } catch (e) {
        console.error(e);
        Swal.fire('Error', e.message || 'No se pudo guardar la evidencia', 'error');
    }
}

async function exportHojaRutaHTML() {
    const hrIdRaw = document.getElementById('hrViewId').textContent;
    const hrId = parseInt(hrIdRaw.replace('HR-', ''));
    if (!hrId) return;

    try {
        const res = await fetch(`/api/reparto/hojas-ruta/${hrId}`);
        const data = await res.json();
        
        let htmlStr = `*HOJA DE RUTA ${hrIdRaw}*\\n`;
        htmlStr += `*Chofer:* ${data.chofer_nombre || 'N/A'} - *Unidad:* ${data.movilidad_placa || 'N/A'}\\n`;
        htmlStr += `*Fecha:* ${data.fecha_ruta}\\n\\n`;
        
        data.solicitudes.forEach((sol, index) => {
            htmlStr += `*--- PARADA ${index + 1} ---*\\n`;
            htmlStr += `*Empresa:* ${sol.codcia} | *OC:* ${sol.nro_oc || 'N/A'}\\n`;
            htmlStr += `*Origen:* ${sol.origen}\\n`;
            htmlStr += `*Destino:* ${sol.destino}\\n`;
            htmlStr += `*Contacto:* ${sol.contacto || 'S/D'} - *Cel:* ${sol.celular_contacto || 'S/D'}\\n`;
            if (sol.url_maps) htmlStr += `*Mapa:* ${sol.url_maps}\\n`;
            if (sol.observaciones) htmlStr += `*Obs. Pedido:* ${sol.observaciones}\\n`;
            htmlStr += `*Items:*\\n`;
            sol.items.forEach(it => {
                htmlStr += `- ${it.cantidad} ${it.unidad||'UND'} ${it.descripcion}\\n`;
            });
            htmlStr += `\\n`;
        });
        
        const blob = new Blob([htmlStr], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `HR-${hrId}-WhatsApp.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        Swal.fire({ title: 'Exportado para WhatsApp', text: 'El archivo de texto ha sido descargado.', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        
    } catch (e) {
        Swal.fire('Error', 'No se pudo generar exportación HTML/Texto', 'error');
    }
}

async function subirFirmada(id) {
    const { value: file } = await Swal.fire({
        title: 'Subir Hoja de Ruta Firmada',
        input: 'file',
        inputAttributes: {
            'accept': 'application/pdf, image/*',
            'aria-label': 'Selecciona el documento firmado'
        },
        showCancelButton: true,
        confirmButtonText: 'Subir',
        cancelButtonText: 'Cancelar'
    });

    if (!file) return;

    try {
        Swal.fire({ title: 'Subiendo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await fetch(`/api/reparto/hojas-ruta/${id}/firmada`, {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) throw new Error();
        Swal.fire('Éxito', 'Documento subido correctamente', 'success');
        loadRepartoData();
    } catch (e) {
        Swal.fire('Error', 'No se pudo subir el documento', 'error');
    }
}


async function loadHistorialDetallado(codcia) {
    try {
        const res = await fetch(`/api/reparto/historial-detallado?codcia=${codcia}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        if (dtHistorial) { dtHistorial.destroy(); }
        
        const tbody = document.querySelector('#historialDetalladoTable tbody');
        let html = '';
        data.forEach(h => {
            let hrIdStr = (h.hr_id || 0).toString().padStart(4, '0');
            
            // Botones de acción
            let btnFirmada = h.archivo_firmado 
                ? `<a href="/api/reparto/evidencia-archivo/${h.archivo_firmado}" target="_blank" class="btn btn-outline" style="padding:2px 5px; font-size:0.65rem; background:#fee2e2; color:#991b1b; text-decoration:none;" title="Ver HR Firmada">📄 Firmada</a>` 
                : '<span style="color:#94a3b8; font-size:0.65rem;">Pend. Firma</span>';
            
            let btnDetalle = `<button class="btn btn-primary" onclick="viewHojaRuta(${h.hr_id})" style="padding:2px 5px; font-size:0.65rem; background:var(--primary); border-color:var(--primary);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> Ver Detalle
            </button>`;

            let fechaOC = h.sr_created_at ? h.sr_created_at.split('T')[0] : 'S/D';
            if (fechaOC.includes('-')) {
                const parts = fechaOC.split('-');
                fechaOC = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }

            html += `<tr>
                <td><strong>HR-${hrIdStr}</strong></td>
                <td><div style="display:flex; gap:3px; flex-wrap:wrap;">${btnDetalle}${btnFirmada}</div></td>
                <td>${h.fecha_ruta || 'S/D'}</td>
                <td><span style="font-size:0.75rem;"><strong>${h.codcia}</strong><br>${h.codcia_nombre || ''}</span></td>
                <td>
                    <strong>${h.nro_oc || 'MANUAL'}</strong><br>
                    <small>${h.oc_tipo || ''}</small><br>
                    <span style="font-size:0.65rem; color:#64748b;">📅 ${fechaOC}</span>
                </td>
                <td><div style="font-size:0.75rem;">${h.fecha_recojo || ''}</div></td>
                <td><div style="font-size:0.75rem;">${h.contacto || 'S/D'}</div></td>
                <td><div style="font-size:0.75rem;">👤 ${h.chofer_nombre || 'N/A'}<br>🚛 ${h.movilidad_placa || 'N/A'}</div></td>
                <td style="text-align:center;">Parada ${h.parada_orden}</td>
                <td style="white-space:normal !important; min-width:150px;"><div style="font-size:0.75rem;"><strong>${h.proveedor_ruc || ''}</strong><br>${h.proveedor_nombre || ''}</div></td>
                <td style="white-space:normal !important;"><div style="font-size:0.75rem;">${h.codmat ? '['+h.codmat+'] ' : ''}${h.item_desc}</div></td>
                <td style="text-align:right;">${h.cantidad} ${h.unidad || 'UND'}</td>
                <td style="white-space:normal !important; min-width:150px;"><div style="font-size:0.7rem; color:#475569;">${h.obs_chofer || '-'}</div></td>
                <td><span class="badge ${h.hr_estado === 'Terminado' ? 'approved' : 'pending'}">${h.hr_estado}</span></td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        dtHistorial = $('#historialDetalladoTable').DataTable({
            order: [[0, 'desc'], [8, 'asc']], // Sort by HR and then by Stop Order
            language: { url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json' },
            pageLength: 50
        });
    } catch (e) {
        console.error('Error fetching historial detallado', e);
    }
}
