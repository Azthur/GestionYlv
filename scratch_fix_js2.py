import re

with open('dashboard-prototype/reparto.js', 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update loadHojasRuta buttons
old_buttons = '<button class="btn btn-outline" onclick="viewHojaRuta(${h.id})" style="padding:0.25rem 0.5rem; font-size:0.75rem;">Ver / Evidencias</button>'
new_buttons = '<button class="btn btn-outline" onclick="viewHojaRuta(${h.id})" style="padding:0.25rem 0.5rem; font-size:0.75rem;">Adjuntar Evidencia</button>\\n                        <button class="btn btn-outline" onclick="downloadHojaRutaPDF(${h.id})" style="padding:0.25rem 0.5rem; font-size:0.75rem;">Descargar PDF</button>'
js = js.replace(old_buttons, new_buttons)

# 2. Update printHojaRuta to use html2pdf (just in case they click the button in the modal)
js = js.replace('function printHojaRuta() { window.print(); }', '''function printHojaRuta() { 
    const element = document.getElementById('hrContent');
    const hrIdRaw = document.getElementById('hrViewId').textContent;
    const hrId = parseInt(hrIdRaw.replace('HR-', ''));
    const opt = {
      margin:       10,
      filename:     `Hoja-Ruta-HR-${hrId}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}''')

# 3. Add downloadHojaRutaPDF
pdf_func = '''
async function downloadHojaRutaPDF(hrId) {
    try {
        Swal.fire({ title: 'Generando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await fetch(`/api/reparto/hojas-ruta/${hrId}`);
        const data = await res.json();
        
        let html = `
            <div style="font-family:sans-serif; padding:20px;">
            <div style="text-align:center; padding:10px; background:#1e293b; color:white; margin-bottom:15px; border-radius:8px;">
                <h3 style="margin:0;">YELAVE LOGÍSTICA - REPORTE CHOFER</h3>
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
'''
if 'async function downloadHojaRutaPDF' not in js:
    js += pdf_func

with open('dashboard-prototype/reparto.js', 'w', encoding='utf-8') as f:
    f.write(js)
