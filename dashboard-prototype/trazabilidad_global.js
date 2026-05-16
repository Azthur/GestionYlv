let globalDataTable = null;

const fmtN = (v) => v != null ? parseFloat(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '0.00';

function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) { window.location.href = 'login.html'; return null; }
    try { return JSON.parse(localStorage.getItem('yelave_user')); } 
    catch (e) { window.location.href = 'login.html'; return null; }
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial configuration
    const user = checkAuth();
    if (!user) return; // handled by checkAuth/auth-guard

    // 1.5 Enforce permissions
    enforceUserPermissions().then(() => {
        // 2. Load companies dropdown
        loadCompanies();
    });

    // 3. Bind Refresh button
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', loadGlobalTrazabilidad);
    }
});

// ─── Security Permissions (RLS) ────────────
async function enforceUserPermissions() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/permisos/me', { headers: { 'Authorization': `Bearer ${token}` }});
        if(res.ok) {
            const data = await res.json();
            
            // 1. Visibilidad Global
            const myRsContainer = document.getElementById('filterMyRecordsContainer');
            if(data.puede_ver_todo) {
                if(myRsContainer) myRsContainer.style.display = 'flex';
            } else {
                if(myRsContainer) myRsContainer.style.display = 'none';
                const chk = document.getElementById('filterMyRecords');
                if(chk) chk.checked = true; // Forzar
            }

            // 2. Tipos de OC Permitidos
            if (!data.isAdmin && data.tipos_oc_permitidos) {
                const selTipos = document.getElementById('filterTipoOc');
                if(selTipos) {
                    Array.from(selTipos.options).forEach(opt => {
                        if(opt.value && !data.tipos_oc_permitidos.includes(opt.value)) {
                            opt.style.display = 'none'; // Ocultar visualmente
                            opt.disabled = true; // Desactivar seleccionable
                        }
                    });
                    
                    // Si el usuario no tiene ninguna selección válida, seleccionar (Todos) o limpiar
                    if(selTipos.options[selTipos.selectedIndex] && selTipos.options[selTipos.selectedIndex].disabled) {
                        selTipos.value = "";
                    }
                }
            }
        }
    } catch(err) { console.error("Error cargando RLS", err); }
}

async function loadCompanies() {
    const filterCia = document.getElementById('filterCia');
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/permisos/empresas/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error cargando empresas');
        
        const data = await res.json();
        
        if (!data || data.length === 0) {
            filterCia.innerHTML = '<option value="">Sin empresas asignadas</option>';
            return;
        }
        
        const storedCia = localStorage.getItem('last_cia') || (data[0].codcia || '').trim();

        let options = '';
        data.forEach(c => {
            const codcia = (c.codcia || '').trim();
            const nomcia = (c.nomcia || '').trim();
            const selected = codcia === storedCia ? 'selected' : '';
            options += `<option value="${codcia}" ${selected}>${codcia} - ${nomcia}</option>`;
        });
        filterCia.innerHTML = options;

        // Auto-load data at start
        setTimeout(loadGlobalTrazabilidad, 100);
    } catch (e) {
        console.error(e);
        filterCia.innerHTML = '<option value="">Error cargando</option>';
        alert('No se pudieron cargar las empresas.');
    }
}

async function loadGlobalTrazabilidad() {
    const codcia = document.getElementById('filterCia').value;
    const year = document.getElementById('filterYear').value;
    const period = document.getElementById('filterPeriod').value;
    const codmat_search = document.getElementById('filterCodmat').value;
    const tipoOc = document.getElementById('filterTipoOc').value;
    
    const btnRefresh = document.getElementById('btnRefresh');

    if (!codcia || !year || (!period && !codmat_search)) {
        alert("Seleccione Empresa, Año y Periodo.");
        return;
    }

    localStorage.setItem('last_cia', codcia);
    
    // UI Loading state
    const originalBtnHtml = btnRefresh.innerHTML;
    btnRefresh.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Buscando...';
    btnRefresh.disabled = true;

    if (globalDataTable) {
        globalDataTable.clear().draw();
    }

    try {
        const token = localStorage.getItem('yelave_token');
        
        const chkMyRecords = document.getElementById('filterMyRecords');
        const onlyMyRecords = chkMyRecords ? chkMyRecords.checked : true;
        
        let url = `/api/contabilidad/trazabilidad/global?codcia=${encodeURIComponent(codcia)}&year=${encodeURIComponent(year)}&period=${encodeURIComponent(period)}&only_my_records=${onlyMyRecords}`;
        if (tipoOc) url += `&tipo_oc=${encodeURIComponent(tipoOc)}`;
        if (codmat_search) url += `&codmat_search=${encodeURIComponent(codmat_search)}`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error("Fallo la petición genérica");
        const data = await res.json();
        
        renderDataTable(data, codcia, year);

    } catch (error) {
        console.error("Error cargando Trazabilidad Global:", error);
        alert("Ocurrió un error al cargar la Trazabilidad Global: " + error.message);
    } finally {
        btnRefresh.innerHTML = originalBtnHtml;
        btnRefresh.disabled = false;
    }
}

function renderDataTable(items, codcia, year) {
    if (globalDataTable) {
        globalDataTable.destroy();
    }
    
    const tbody = document.querySelector('#trazabilidadGlobalTable tbody');
    let rowsHtml = '';

    items.forEach(it => {
        const almClass = it.tipooc !== 'M' ? 'bg-gray-400' : (it.pct_almacen >= 100 ? 'bg-green-500' : (it.pct_almacen > 0 ? 'bg-orange-400' : 'bg-gray-400'));
        const almTextClass = it.tipooc !== 'M' ? 'text-pending-alm' : (it.pct_almacen >= 100 ? 'text-complete-alm' : (it.pct_almacen > 0 ? 'text-partial-alm' : 'text-pending-alm'));
        
        const facClass = it.pct_facturado >= 100 ? 'bg-purple-500' : (it.pct_facturado > 0 ? 'bg-orange-400' : 'bg-gray-400');
        const facTextClass = it.pct_facturado >= 100 ? 'text-complete-fac' : (it.pct_facturado > 0 ? 'text-partial-fac' : 'text-pending-fac');

        // Validations format
        
        let statusHtml = '';
        if (it.warnings && it.warnings.length > 0) {
            statusHtml = `<div style="display:flex; flex-direction:column; gap:0.2rem; align-items:center;">
                <span style="padding:0.2rem 0.5rem; background:#fffbeb; color:#b45309; border:1px solid #fde68a; border-radius:4px; font-size:0.7rem; font-weight:600;">⚠️ Discrepancia</span>
                <span style="font-size:0.6rem; color:#ef4444; text-align:center; max-width: 120px; text-wrap: wrap;">${it.warnings.join('<br>')}</span>
            </div>`;
        } else {
            statusHtml = `<span style="padding:0.2rem 0.5rem; background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; border-radius:4px; font-size:0.7rem; font-weight:600;">✓ Conciliado</span>`;
        }


        const almacenBlock = it.tipooc === 'M' 
            ? `<div class="traza-bar-td"><div class="traza-bar-number ${almTextClass}">${fmtN(it.cant_almacen)} <span style="font-size:0.6rem; font-weight:400">(${it.pct_almacen}%)</span></div>
               <div class="traza-bar-wrapper"><div class="traza-bar-fill ${almClass}" style="width:${Math.min(it.pct_almacen, 100)}%"></div></div></div>`
            : `<div class="traza-bar-td" style="color:#94a3b8; font-size:0.7rem;">N/A (Servicio/Contable)</div>`;

        // Combinar observaciones
        const obsArray = [it.obs1, it.obs2, it.obs3, it.obs4].filter(o => o);
        const obsDisplay = obsArray.length > 0 ? obsArray.slice(0, 2).join('; ') + (obsArray.length > 2 ? '...' : '') : '-';
        const hasObs = obsArray.length > 0;

        rowsHtml += `
        <tr>
            <td style="font-weight:600; color:#2563eb;"><a href="javascript:void(0)" onclick="openGlobalTrazaModal('${it.nrodoc}', '${codcia}', '${it.tipooc}', '${year}')" style="text-decoration:none; color:var(--primary);">${it.nrodoc}</a></td>
            <td style="color:#64748b;">${it.fchdoc}</td>
            <td style="font-weight:600; text-align:center;">${it.tipooc}</td>
            <td>${it.proveedor.substring(0,25)}</td>
            <td style="font-family:monospace; color:#475569;">${it.codmat}</td>
            <td style="font-weight:500;">${it.desmat ? it.desmat.substring(0, 35) : '-'}</td>
            <td style="text-align:right; font-weight:700;">${fmtN(it.candes)}</td>
            <td style="text-align:right; font-weight:600; color:#475569;">${fmtN(it.preuni)} <span style="font-size:0.65rem;">${it.oc_moneda}</span></td>
            <td>${almacenBlock}</td>
            <td>
               <div class="traza-bar-td"><div class="traza-bar-number ${facTextClass}">${fmtN(it.cant_facturada)} <span style="font-size:0.6rem; font-weight:400">(${it.pct_facturado}%)</span></div>
               <div class="traza-bar-wrapper"><div class="traza-bar-fill ${facClass}" style="width:${Math.min(it.pct_facturado, 100)}%"></div></div></div>
            </td>
            <td style="font-size:0.7rem; color:#64748b;">${it.inci || '-'}</td>
            <td style="font-size:0.7rem; color:#64748b;">${it.fabricante ? it.fabricante.substring(0, 20) : '-'}</td>
            <td style="font-size:0.7rem; color:#64748b;">${it.fecha_vencimiento || '-'}</td>
            <td style="font-size:0.7rem; color:#64748b;">${obsDisplay}</td>
            <td style="text-align:center;">${statusHtml}</td>
            <td style="font-size:0.75rem; color:#475569; text-align:center;">${it.usuario}</td>
            <td style="text-align:center;">
                <div style="display:flex; justify-content:center; gap:0.25rem;">
                    <button onclick="openItemExtraModal('${it.nrodoc}', '${codcia}', '${it.tipooc}', '${year}', '${it.codmat}', '${it.inci||''}', '${it.fabricante||''}', '${it.fecha_vencimiento||''}', '${it.obs1||''}', '${it.obs2||''}', '${it.obs3||''}', '${it.obs4||''}', '${it.factura_cab_id||''}', '${it.item_index||''}')" style="padding:0.25rem 0.5rem; font-size:0.65rem; background:#f59e0b; color:white; border:none; border-radius:4px; cursor:pointer;" title="Ver Datos Adicionales">Ver Datos</button>
                    <button onclick="openGlobalTrazaModal('${it.nrodoc}', '${codcia}', '${it.tipooc}', '${year}')" style="padding:0.25rem 0.5rem; font-size:0.65rem; background:#2563eb; color:white; border:none; border-radius:4px; cursor:pointer;">Ver Trazabilidad</button>
                </div>
            </td>
        </tr>`;
    });

    tbody.innerHTML = rowsHtml;

    // Initialize DataTable
    globalDataTable = $('#trazabilidadGlobalTable').DataTable({
        pageLength: 50,
        language: {
            url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json',
        },
        order: [[0, 'desc']], // sort by NroOC desc initially
        dom: 'Bfrtip',
        buttons: [
            {
                extend: 'excelHtml5',
                text: 'Exportar a Excel',
                className: 'btn-export-excel',
                exportOptions: {
                    columns: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
                }
            }
        ]
    });
}

async function openItemExtraModal(nrodoc, codcia, tipooc, year, codmat, inci, fabricante, fecha_vencimiento, obs1, obs2, obs3, obs4, factura_cab_id, item_index) {
    document.getElementById('itemExtraModal').classList.add('active');
    const content = document.getElementById('itemExtraContent');
    const viewer = document.getElementById('itemExtraViewer');

    // Renderizar los datos adicionales directamente desde los parámetros
    let html = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
                <label style="font-size:0.75rem; font-weight:600; color:#64748b;">INCI</label>
                <div style="padding:0.5rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; margin-top:0.25rem;">${inci || '-'}</div>
            </div>
            <div>
                <label style="font-size:0.75rem; font-weight:600; color:#64748b;">Fabricante</label>
                <div style="padding:0.5rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; margin-top:0.25rem;">${fabricante || '-'}</div>
            </div>
        </div>
        <div>
            <label style="font-size:0.75rem; font-weight:600; color:#64748b;">Fecha de Vencimiento</label>
            <div style="padding:0.5rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; margin-top:0.25rem;">${fecha_vencimiento || '-'}</div>
        </div>
        <div style="border-top:1px solid #e2e8f0; padding-top:1rem;">
            <label style="font-size:0.75rem; font-weight:600; color:#64748b; margin-bottom:0.5rem; display:block;">Observaciones</label>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                <div style="padding:0.4rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">
                    <span style="font-size:0.7rem; color:#94a3b8;">Obs 1:</span> ${obs1 || '-'}
                </div>
                <div style="padding:0.4rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">
                    <span style="font-size:0.7rem; color:#94a3b8;">Obs 2:</span> ${obs2 || '-'}
                </div>
                <div style="padding:0.4rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">
                    <span style="font-size:0.7rem; color:#94a3b8;">Obs 3:</span> ${obs3 || '-'}
                </div>
                <div style="padding:0.4rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">
                    <span style="font-size:0.7rem; color:#94a3b8;">Obs 4:</span> ${obs4 || '-'}
                </div>
            </div>
        </div>
        <div style="border-top:1px solid #e2e8f0; padding-top:1rem;">
            <label style="font-size:0.75rem; font-weight:600; color:#64748b; margin-bottom:0.5rem; display:block;">Archivos Adjuntos</label>
            <div id="itemArchivosList" style="padding:0.5rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; color:#94a3b8; font-size:0.8rem;">
                Cargando archivos...
            </div>
        </div>
    `;

    content.innerHTML = html;
    viewer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);"><div style="font-size:3rem; margin-bottom:1rem;">📎</div><div>Haz clic en un archivo para visualizarlo</div></div>';

    // Cargar archivos adjuntos si hay factura_cab_id y item_index
    console.log('DEBUG openItemExtraModal - factura_cab_id:', factura_cab_id, 'item_index:', item_index);
    if (factura_cab_id && item_index) {
        try {
            const token = localStorage.getItem('yelave_token');
            console.log('DEBUG openItemExtraModal - Cargando archivos desde:', `/api/contabilidad/facturas/${factura_cab_id}/items/${item_index}/archivos`);
            const res = await fetch(`/api/contabilidad/facturas/${factura_cab_id}/items/${item_index}/archivos`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            console.log('DEBUG openItemExtraModal - Response status:', res.status);
            if (res.ok) {
                const archivos = await res.json();
                console.log('DEBUG openItemExtraModal - Archivos cargados:', archivos);
                renderArchivosList(archivos, viewer);
            } else {
                console.error('DEBUG openItemExtraModal - Error response:', await res.text());
                document.getElementById('itemArchivosList').innerHTML = 'No hay archivos adjuntos';
            }
        } catch (error) {
            console.error('DEBUG openItemExtraModal - Error cargando archivos:', error);
            document.getElementById('itemArchivosList').innerHTML = 'Error al cargar archivos';
        }
    } else {
        console.log('DEBUG openItemExtraModal - No hay factura_cab_id o item_index');
        document.getElementById('itemArchivosList').innerHTML = 'No hay información de factura para cargar archivos';
    }
}

function renderArchivosList(archivos, viewer) {
    const listContainer = document.getElementById('itemArchivosList');
    if (!archivos || archivos.length === 0) {
        listContainer.innerHTML = 'No hay archivos adjuntos';
        return;
    }

    // Agrupar archivos por ObsField
    const grouped = {};
    archivos.forEach(arc => {
        const obsField = arc.ObsField || 'sin_categoria';
        if (!grouped[obsField]) grouped[obsField] = [];
        grouped[obsField].push(arc);
    });

    // Definir orden de observaciones
    const obsOrder = ['obs1', 'obs2', 'obs3', 'obs4', 'sin_categoria'];
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
        const idxA = obsOrder.indexOf(a);
        const idxB = obsOrder.indexOf(b);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });

    let html = '';
    sortedKeys.forEach(obsField => {
        const obsLabel = obsField === 'sin_categoria' ? 'Sin categoría' : obsField.toUpperCase();
        html += `<div style="margin-bottom:0.75rem;"><strong style="font-size:0.75rem; color:#0f172a;">${obsLabel}</strong><ul style="margin:0.25rem 0 0 0.5rem; padding:0; list-style:none;">`;
        grouped[obsField].forEach(arc => {
            html += `<li style="margin-bottom:0.25rem;">
                <a href="javascript:void(0)" onclick="viewArchivo(${arc.Id}, '${arc.NombreArchivo}')" style="color:#2563eb; text-decoration:none; font-size:0.8rem; display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-size:1rem;">📄</span>
                    ${arc.NombreArchivo}
                </a>
            </li>`;
        });
        html += '</ul></div>';
    });

    listContainer.innerHTML = html;
}

async function viewArchivo(archivoId, nombreArchivo) {
    const viewer = document.getElementById('itemExtraViewer');
    viewer.style.display = 'block';
    viewer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando archivo...</div>';

    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/contabilidad/facturas/items/archivos/${archivoId}/descargar`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const ext = nombreArchivo.split('.').pop().toLowerCase();

            if (ext === 'pdf') {
                viewer.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`;
            } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                viewer.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:100%;"><img src="${url}" style="max-width:100%; max-height:100%; object-contain;" alt="${nombreArchivo}"></div>`;
            } else {
                viewer.innerHTML = `<div style="text-align:center; padding:2rem;">
                    <div style="font-size:3rem; margin-bottom:1rem;">📄</div>
                    <div>Archivo: ${nombreArchivo}</div>
                    <a href="${url}" download="${nombreArchivo}" style="display:inline-block; margin-top:1rem; padding:0.5rem 1rem; background:#2563eb; color:white; text-decoration:none; border-radius:4px;">Descargar</a>
                </div>`;
            }
        } else {
            viewer.innerHTML = '<div style="text-align:center; padding:2rem; color:#ef4444;">Error al cargar archivo</div>';
        }
    } catch (error) {
        console.error('Error cargando archivo:', error);
        viewer.innerHTML = '<div style="text-align:center; padding:2rem; color:#ef4444;">Error al cargar archivo</div>';
    }
}

function closeItemExtraModal() {
    document.getElementById('itemExtraModal').classList.remove('active');
}

async function openGlobalTrazaModal(nrodoc, codcia, tipooc, anos) {
    document.getElementById('trazaModal').classList.add('active');
    document.getElementById('trazaOcNro').textContent = nrodoc;
    const content = document.getElementById('trazaContent');
    content.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-muted);">Cargando trazabilidad...</div>';

    try {
        let url = `/api/contabilidad/trazabilidad/${encodeURIComponent(nrodoc)}?codcia=${encodeURIComponent(codcia)}`;
        if (tipooc) url += `&tipo_oc=${encodeURIComponent(tipooc)}`;
        if (anos) url += `&year=${encodeURIComponent(anos)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Error cargando trazabilidad');
        const data = await res.json();

        const r = data.resumen;
        const fmtN = (v) => v != null ? parseFloat(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '0.00';

        let html = `
        <div class="traza-summary">
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${r.total_items_oc}</div><div class="tlabel">Items OC</div></div>
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${fmtN(r.total_oc)}</div><div class="tlabel">Cant. Pedida</div></div>
            ${tipooc === 'M' ? `<div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#22c55e;">${fmtN(r.total_almacen)}</div><div class="tlabel">Cant. Almacén</div></div>` : ''}
            <div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#8b5cf6;">${fmtN(r.total_facturado)}</div><div class="tlabel">Cant. Facturada</div></div>
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${r.total_facturas}</div><div class="tlabel">Facturas</div></div>
        </div>`;

        // ─── Validaciones / Alertas ───
        if (data.validaciones && data.validaciones.length > 0) {
            html += `<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:1rem; margin-bottom:1.5rem;">
                <h5 style="margin:0 0 0.5rem 0; color:#b45309; font-size:0.85rem; font-weight:700;">⚠️ Advertencias y Discrepancias</h5>
                <ul style="margin:0; padding-left:1.5rem; color:#92400e; font-size:0.75rem; font-weight:500;">`;
            data.validaciones.forEach(val => {
                html += `<li style="margin-bottom:0.25rem;">${val}</li>`;
            });
            html += `</ul></div>`;
        }

        // ─── Timeline Information Prep ───
        const dateOC = data.fch_oc ? new Date(data.fch_oc) : null;
        const diffDays = (dStr) => {
            if (!dateOC || !dStr) return null;
            const d = new Date(dStr);
            const diffTime = d.getTime() - dateOC.getTime();
            return Math.floor(diffTime / (1000 * 60 * 60 * 24));
        };

        let events = [];
        if (data.fch_oc) {
            events.push({ type: 'oc', fchdoc: data.fch_oc, label: 'Orden Emitida', desc: '', icon: '📝', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' });
        }
        if (data.movimientos_almacen) {
            data.movimientos_almacen.forEach(m => {
                if (m.fchdoc) events.push({ type: 'alm', fchdoc: m.fchdoc, label: `Ingreso a Almacén`, desc: `Inv: ${m.nrodoc}`, icon: '📦', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' });
            });
        }
        if (data.facturas) {
            data.facturas.forEach(f => {
                if (f.FecEmision) events.push({ type: 'fac', fchdoc: f.FecEmision, label: `Facturación`, desc: `Serie/Núm: ${f.Serie}-${f.Numero}`, icon: '🧾', color: '#9333ea', bg: '#faf5ff', border: '#e9d5ff' });
            });
        }
        events.sort((a,b) => new Date(a.fchdoc) - new Date(b.fchdoc));

        // Items Table
        html += `<div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:1rem;">
        <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
            <thead>
                <tr style="background:#f1f5f9;">
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">#</th>
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">Código</th>
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">Descripción</th>
                    <th style="padding:0.6rem 0.5rem; text-align:right; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">Cant. OC</th>
                    ${tipooc === 'M' ? `<th style="padding:0.6rem 0.5rem; text-align:center; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#22c55e; border-bottom:2px solid #cbd5e1;">Almacén</th>` : ''}
                    <th style="padding:0.6rem 0.5rem; text-align:center; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#8b5cf6; border-bottom:2px solid #cbd5e1;">Facturado</th>
                </tr>
            </thead><tbody>`;

        if (data.items.length === 0) {
            html += `<tr><td colspan="${tipooc === 'M' ? '6' : '5'}" style="text-align:center; padding:2rem; color:#94a3b8;">Sin ítems encontrados en la OC</td></tr>`;
        } else {
            data.items.forEach((it, idx) => {
                const almClass = it.pct_almacen >= 100 ? 'complete' : (it.pct_almacen > 0 ? 'partial' : 'pending');
                const facClass = it.pct_facturado >= 100 ? 'complete' : (it.pct_facturado > 0 ? 'partial' : 'pending');

                let trWarning = '';
                if (it.warnings && it.warnings.length > 0) {
                    const warnsInfo = it.warnings.map(w => `<span style="display:inline-block; margin-right:12px;">⚠️ ${w}</span>`).join('');
                    trWarning = `<tr style="background:#fffbeb; border-bottom:1px solid #f1f5f9;">
                         <td colspan="${tipooc === 'M' ? '6' : '5'}" style="padding:0.35rem 0.6rem; font-size:0.68rem; font-weight:500; color:#b45309;">
                             ${warnsInfo}
                         </td>
                    </tr>`;
                }

                html += `<tr style="border-bottom:${it.warnings && it.warnings.length ? 'none' : '1px solid #f1f5f9'};">
                    <td style="padding:0.5rem; text-align:center; color:#64748b;">${it.nroitm}</td>
                    <td style="padding:0.5rem; font-family:monospace; font-size:0.725rem;">${it.codmat}</td>
                    <td style="padding:0.5rem;">${(it.desmat || '').substring(0, 50)}</td>
                    <td style="padding:0.5rem; text-align:right; font-weight:600;">${fmtN(it.candes)}</td>
                    ${tipooc === 'M' ? `<td style="padding:0.5rem; text-align:center;">
                        <div style="font-weight:600; ${almClass === 'complete' ? 'color:#22c55e;' : almClass === 'partial' ? 'color:#f59e0b;' : 'color:#94a3b8;'}">${fmtN(it.cant_almacen)} <span style="font-size:0.65rem; font-weight:400;">(${it.pct_almacen}%)</span></div>
                        <div class="traza-bar"><div class="traza-bar-fill ${almClass}" style="width:${Math.min(it.pct_almacen, 100)}%;"></div></div>
                    </td>` : ''}
                    <td style="padding:0.5rem; text-align:center;">
                        <div style="font-weight:600; ${facClass === 'complete' ? 'color:#8b5cf6;' : facClass === 'partial' ? 'color:#f59e0b;' : 'color:#94a3b8;'}">${fmtN(it.cant_facturada)} <span style="font-size:0.65rem; font-weight:400;">(${it.pct_facturado}%)</span></div>
                        <div class="traza-bar"><div class="traza-bar-fill ${facClass}" style="width:${Math.min(it.pct_facturado, 100)}%;"></div></div>
                    </td>
                </tr>${trWarning}`;
            });
        }
        html += '</tbody></table></div>';

        // Section: Documentos Agrupados (Vertically stacked for full width)
        html += `<div style="display:flex; flex-direction:column; gap:1.5rem; margin-bottom:1.5rem;">`;

        if (tipooc === 'M') {
            html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:1.25rem;">
                <h5 style="font-size:0.85rem; font-weight:700; margin-top:0; margin-bottom:1rem; color:#1e293b; border-bottom:2px solid #22c55e; padding-bottom:0.5rem;"><span style="color:#22c55e;">📦</span> Detalle de Movimientos Almacén</h5>
                <div style="overflow-x:auto;">`;

            if (data.movimientos_almacen && data.movimientos_almacen.length > 0) {
                html += `<table style="width:100%; border-collapse:collapse; font-size:0.75rem; background:#fff; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
                    <thead>
                        <tr style="color:#334155; background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Almacén</th>
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Doc. Referencia</th>
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Fecha</th>
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Material</th>
                            <th style="padding:0.5rem; text-align:right; font-weight:600;">Cantidad</th>
                            <th style="padding:0.5rem; text-align:right; font-weight:600;">Precio</th>
                        </tr>
                    </thead>
                    <tbody>`;
                data.movimientos_almacen.forEach((m, idx) => {
                    const isLast = idx === data.movimientos_almacen.length - 1;
                    html += `
                        <tr style="${!isLast ? 'border-bottom:1px solid #e2e8f0;' : ''}">
                            <td style="padding:0.5rem; color:#64748b;">${m.almcen}</td>
                            <td style="padding:0.5rem; color:#1d4ed8; font-weight:600;">${m.tipmov}-${m.codmov}-${m.nrodoc}</td>
                            <td style="padding:0.5rem; color:#475569;">${m.fchdoc}</td>
                            <td style="padding:0.5rem; font-family:monospace; font-weight:600; color:#475569;">${m.codmat}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600; color:#16a34a;">${fmtN(m.candes)}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600;">${fmtN(m.preuni)} <span style="font-size:0.65rem; color:#64748b; font-weight:400;">${m.codmon_desc || ''}</span></td>
                        </tr>`;
                });
                html += '</tbody></table></div>';
            } else {
                html += '<div style="text-align:center; padding:1.5rem; color:#94a3b8; font-size:0.8rem; background:#f8fafc; border:1px dashed #e2e8f0; border-radius:8px;">No hay movimientos.</div></div>';
            }
            html += `</div>`; // End top card (Movimientos)
        }

        html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:1.25rem;">
                 <h5 style="font-size:0.85rem; font-weight:700; margin-top:0; margin-bottom:1rem; color:#1e293b; border-bottom:2px solid #8b5cf6; padding-bottom:0.5rem;"><span style="color:#8b5cf6;">🧾</span> Facturas Vinculadas</h5>
                 <div class="traza-factura-list">`;
        
        // Linked invoices
        if (data.facturas && data.facturas.length > 0) {
            data.facturas.forEach(f => {
                const facturaUrl = f.Uuid ? `factura_visor.html?uid=${f.Uuid}` : '#';
                html += `
                <div style="margin-bottom:1rem; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.85rem 1rem; background:#f8fafc; border-bottom:${f.detalles && f.detalles.length ? '1px solid #cbd5e1' : 'none'};">
                        <div style="display:flex; align-items:center; gap:0.85rem;">
                            <div style="background:#f0f7ff; color:#2563eb; width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            </div>
                            <div>
                                <div style="font-weight:700; color:#1e293b;">${f.Serie || ''}-${f.Numero || ''}</div>
                                <div style="font-size:0.7rem; color:#64748b;">${f.NomProveedor || '-'}</div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:700; color:#1e293b;">${fmtN(f.Total)} ${f.codmon_desc || f.CodMoneda}</div>
                            <div style="display:flex; align-items:center; justify-content:flex-end; gap:0.5rem; margin-top:0.25rem;">
                                <span style="font-size:0.7rem; color:#64748b;">${f.FecEmision || '-'}</span>
                                ${f.Uuid ? `<a href="${facturaUrl}" target="_blank" class="btn btn-primary" style="padding:0.25rem 0.5rem; font-size:0.65rem; height:auto; text-decoration:none;">Ver PDF</a>` : ''}
                            </div>
                        </div>
                    </div>`;

                if (f.detalles && f.detalles.length > 0) {
                    html += `<div style="padding:0 0.75rem 0.75rem 0.75rem;"><table style="width:100%; font-size:0.72rem; border-collapse:collapse; margin-top:0.5rem; background:#fff; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
                        <thead>
                           <tr style="color:#334155; background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
                             <th style="padding:0.5rem; text-align:left; font-weight:600;">Cod. Material</th>
                             <th style="padding:0.5rem; text-align:left; font-weight:600;">Descripción</th>
                             <th style="padding:0.5rem; text-align:right; font-weight:600;">Cantidad</th>
                             <th style="padding:0.5rem; text-align:right; font-weight:600;">Precio Unitario</th>
                           </tr>
                        </thead><tbody>`;
                    f.detalles.forEach((d, idx) => {
                        const isLast = idx === f.detalles.length - 1;
                        html += `<tr style="${!isLast ? 'border-bottom:1px solid #e2e8f0;' : ''}">
                            <td style="padding:0.5rem; font-family:monospace; font-weight:600; color:#475569;">${d.codmat}</td>
                            <td style="padding:0.5rem; font-weight:500;">${(d.desmat || '')}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600; color:#8b5cf6;">${fmtN(d.cant)}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600;">${fmtN(d.preuni)} <span style="font-size:0.65rem; color:#64748b; font-weight:400;">${f.codmon_desc || ''}</span></td>
                        </tr>`;
                    });
                    html += `</tbody></table></div>`;
                }
                html += `</div>`;
            });
            html += '</div>';
        } else {
            html += '<div style="text-align:center; padding:1.5rem; color:#94a3b8; font-size:0.8rem; background:#f8fafc; border:1px dashed #e2e8f0; border-radius:8px;">No hay facturas vinculadas aún.</div></div>';
        }
        
        html += `</div>`; // End right card
        html += `</div>`; // End grouped flex

        // ─── Vertical Timeline Render ───
        html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:1.25rem;">
            <h5 style="font-size:0.85rem; font-weight:700; color:#1e293b; margin-top:0; margin-bottom:1.2rem; border-bottom:2px solid #e2e8f0; padding-bottom:0.5rem;"><span style="color:#f59e0b; margin-right:6px;">⏱️</span> Línea de Tiempo (Cronograma)</h5>`;
        
        html += `<div style="border-left:2px solid #cbd5e1; margin-left:1rem; padding-left:1.5rem; position:relative; display:flex; flex-direction:column; gap:1.2rem;">`;

        events.forEach(ev => {
             const dd = diffDays(ev.fchdoc);
             const daysText = dd === 0 ? "Mismo Día" : (dd > 0 ? `+${dd} Días` : `${dd} Días`);
             html += `
             <div style="position:relative;">
                 <div style="position:absolute; left:-1.9rem; top:0.25rem; width:14px; height:14px; background:#fff; border:3px solid ${ev.color}; border-radius:50%;"></div>
                 <div style="background:${ev.bg}; border:1px solid ${ev.border}; padding:0.6rem 1rem; border-radius:8px;">
                     <div style="display:flex; justify-content:space-between; align-items:center;">
                         <div style="font-weight:700; color:${ev.color}; font-size:0.75rem;"><span style="font-size:0.85rem; margin-right:4px;">${ev.icon}</span> ${ev.label}</div>
                         <div style="font-size:0.7rem; color:#475569; font-weight:600; padding:2px 8px; background:#fff; border-radius:12px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">${daysText}</div>
                     </div>
                     <div style="color:#64748b; font-size:0.72rem; margin-top:0.4rem;">Fecha doc: <strong style="color:#334155;">${ev.fchdoc}</strong> ${ev.desc ? `<span style="margin-left:0.5rem; padding-left:0.5rem; border-left:1px solid #cbd5e1; color:#64748b;">${ev.desc}</span>` : ''}</div>
                 </div>
             </div>
             `;
        });
        
        if (events.length === 0) {
             html += `<div style="color:#64748b; font-size:0.8rem; font-style:italic;">Sin eventos registrados</div>`;
        }
        html += `</div></div>`;

        content.innerHTML = html;
    } catch(err) {
        content.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444; font-weight:500;">❌ Error: ${err.message}</div>`;
    }
}

// ─── Dropdown Toggle & Close ──────────
let _activeDropdownMenu = null;
let _activeDropdownBtn = null;


function closeTrazaModal() {
    const m = document.getElementById('trazaModal');
    if(m) m.classList.remove('active');
}


// ─── Modal Buscador de Productos ───
function openProductModal() {
    document.getElementById('productSearchModal').classList.add('active');
    setTimeout(() => document.getElementById('productSearchInput').focus(), 100);
}

function closeProductModal() {
    document.getElementById('productSearchModal').classList.remove('active');
}

function clearProductSelection() {
    document.getElementById('filterCodmat').value = '';
    closeProductModal();
    loadGlobalTrazabilidad();
}

document.getElementById('productSearchInput')?.addEventListener('keyup', (e) => {
    if(e.key === 'Enter') triggerProductSearch();
});

async function triggerProductSearch() {
    const q = document.getElementById('productSearchInput').value.trim();
    if (q.length < 2) return;
    const codcia = document.getElementById('filterCia').value;
    const tbody = document.getElementById('productSearchTbody');
    
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:2rem; color:#64748b;">Buscando...</td></tr>';
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/contabilidad/items/autocomplete?codcia=${encodeURIComponent(codcia)}&q=${encodeURIComponent(q)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error buscando');
        const json = await res.json();
        
        let html = '';
        if (json && json.length > 0) {
            json.forEach(m => {
                html += `<tr style="cursor:pointer; border-bottom:1px solid #e2e8f0;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''" onclick="selectProduct('${m.codigo}', '${m.descripcion}')">
                    <td style="padding:0.6rem; font-family:monospace; color:#2563eb; font-weight:600;">${m.codigo}</td>
                    <td style="padding:0.6rem;">${m.descripcion}</td>
                    <td style="padding:0.6rem; text-align:center;"><span style="font-size:0.7rem; background:#eff6ff; color:#1d4ed8; padding:0.15rem 0.4rem; border-radius:4px;">${m.tipo}</span></td>
                </tr>`;
            });
        } else {
            html = '<tr><td colspan="3" style="text-align:center; padding:2rem; color:#64748b;">No se encontraron coincidencias.</td></tr>';
        }
        tbody.innerHTML = html;
        
    } catch(err) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:2rem; color:#ef4444;">Error de red</td></tr>';
    }
}

function selectProduct(cod, desc) {
    document.getElementById('filterCodmat').value = cod;
    closeProductModal();
    loadGlobalTrazabilidad();
}
