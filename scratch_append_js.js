
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
                    <div style="background:#f1f5f9; padding:8px 12px; font-weight:600; font-size:0.9rem; border-bottom:1px solid #cbd5e1; display:flex; justify-content:space-between;">
                        <span>Parada ${index + 1} - ${sol.tipo}</span>
                        <span style="background:#3730a3; color:white; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${sol.codcia_nombre || sol.codcia}</span>
                    </div>
                    <div style="padding:12px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; font-size:0.8rem;">
                        <div>
                            <p style="margin:0 0 0.35rem 0;"><strong>Origen:</strong> ${sol.origen}</p>
                            <p style="margin:0 0 0.35rem 0;"><strong>Destino:</strong> ${sol.destino}</p>
                            <p style="margin:0;"><strong>OC:</strong> ${sol.nro_oc || 'N/A'}</p>
                        </div>
                        <div>
                            <p style="margin:0 0 0.35rem 0;"><strong>Contacto:</strong> ${sol.contacto || 'N/A'} - <strong>Cel:</strong> ${sol.celular_contacto || 'N/A'}</p>
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
