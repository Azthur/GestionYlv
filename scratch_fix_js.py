import os

js_path = 'dashboard-prototype/reparto.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update loadRecursos
js = js.replace('<option value="${c.codigo}">${c.nombre} (Lic/DNI: ${c.licencia})</option>', '<option value="${c.codigo}" data-codcia="${c.codcia_origen}">${c.nombre} (Lic/DNI: ${c.licencia})</option>')
js = js.replace('<option value="${m.codigo}">${m.placa} - ${m.descripcion}</option>', '<option value="${m.codigo}" data-codcia="${m.codcia_origen}">${m.placa} - ${m.descripcion}</option>')

# 2. Add window.solData
js = js.replace('if (dtPendientes) { dtPendientes.destroy(); }', 'if (dtPendientes) { dtPendientes.destroy(); }\n        window.solData = {};')

# 3. Update loadSolicitudesPendientes formatting and 'Ver Detalles'
target_loop_start = '        data.forEach(s => {'
target_loop_end = '        });\n        \n        tbody.innerHTML = html;'

replacement_loop = '''        data.forEach(s => {
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
            let dateObj = new Date(s.fecha_recojo + "T00:00:00");
            let dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            let dayName = dayNames[dateObj.getDay()] || '';
            let displayHorario = `${dayName} ${s.fecha_recojo.split('-')[2]}/${s.fecha_recojo.split('-')[1]}<br><span style="font-size:0.75rem; color:#64748b;">${horarioStr}</span>`;

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
        
        tbody.innerHTML = html;'''

js = js.split(target_loop_start)[0] + replacement_loop + js.split(target_loop_end)[1]

# 4. AsignarRecursos updates
js = js.replace("responsable: document.getElementById('userNameDisplay').textContent\n    };", "responsable: document.getElementById('userNameDisplay').textContent,\n        codcia_chofer: document.getElementById('selChofer').options[document.getElementById('selChofer').selectedIndex].getAttribute('data-codcia'),\n        codcia_movilidad: document.getElementById('selMovilidad').options[document.getElementById('selMovilidad').selectedIndex].getAttribute('data-codcia')\n    };")

# 5. Append viewSolicitudDetalle at the end
js += '''
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
                <strong>Proveedor/Contacto:</strong> ${s.proveedor_nombre||s.contacto||'S/D'} ${s.celular_contacto ? '- 📱 ' + s.celular_contacto : ''}
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
'''

# 6. Change exportHojaRutaHTML to literally generate PDF or proper HTML for whatsapp.
js = js.replace('''function exportHojaRutaHTML() {
    const hrId = document.getElementById('hrViewId').textContent;
    const content = document.getElementById('hrContent').innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`''', '''async function exportHojaRutaHTML() {
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
        
        Swal.fire({ title: 'Exportado para WhatsApp', text: 'El archivo de texto ha sido descargado. Puedes copiar y pegar su contenido en WhatsApp.', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        
    } catch (e) {
        Swal.fire('Error', 'No se pudo generar exportación HTML/Texto', 'error');
    }
}
function dummy() {
''')

# Remove the trailing win.document.close();
js = js.replace('    `);\n    win.document.close();\n}', '}')

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)
