import re

with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

old_sig = """<div class="report-signatures">
                <div class="sig-block">
                    <div style="height:60px;"></div>
                    <div class="sig-line">ENTREGADO POR<br><span style="font-weight:400; color:#64748b;">${h.AreaOrigen}<br>${h.UsuarioOrigen || '_______________'}</span><br><small style="font-weight:normal; font-size:0.65rem; color:#94a3b8;">${h.FechaCargo || ''}</small></div>
                </div>
                <div class="sig-block">
                    <div style="height:60px;"></div>
                    <div class="sig-line">RECIBIDO POR<br><span style="font-weight:400; color:#64748b;">${h.AreaDestino}<br>${h.UsuarioDestino || '_______________'}</span><br><small style="font-weight:normal; font-size:0.65rem; color:#94a3b8;">${h.FechaRecepcion || ''}</small></div>
                </div>
            </div>"""

def create_digital_signature(title, area, user, date, is_signed, suffix):
    if is_signed:
        return f"""<div style="flex:1; max-width:320px; border:1.5px dashed #22c55e; border-radius:12px; padding:1.25rem; text-align:left; background:rgba(34, 197, 94, 0.05); position:relative; box-shadow:0 4px 6px -1px rgba(34,197,94,0.1);">
            <div style="position:absolute; top:-12px; right:15px; background:#fff; padding:0 8px; color:#22c55e;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
            </div>
            <h4 style="margin:0 0 0.75rem 0; font-size:0.8rem; color:#166534; font-weight:700; display:flex; align-items:center; gap:0.4rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                FIRMADO ELECTRÓNICAMENTE
            </h4>
            <div style="font-family:monospace; font-size:0.75rem; color:#475569; margin-bottom:0.5rem;">
                <strong>Rol:</strong> {title}<br>
                <strong>Área:</strong> {area}<br>
                <strong>Usuario:</strong> {user}
            </div>
            <div style="font-family:monospace; font-size:0.65rem; color:#94a3b8; border-top:1px solid #bbf7d0; padding-top:0.5rem; margin-top:0.5rem; word-break:break-all;">
                <strong>Sello Timestamp:</strong> {date}<br>
                <strong>Hash de Conformidad:</strong> SHA256-${suffix}
            </div>
        </div>"""
    else:
        return f"""<div style="flex:1; max-width:320px; border:1.5px dashed #cbd5e1; border-radius:12px; padding:1.25rem; text-align:center; background:#f8fafc; display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:160px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" width="32" height="32" style="margin-bottom:0.75rem;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <h4 style="margin:0 0 0.5rem 0; font-size:0.8rem; color:#64748b; font-weight:700;">{title}</h4>
            <span style="font-size:0.75rem; color:#94a3b8;">Pendiente de Firma<br>({area})</span>
        </div>"""

new_sig = """
            <div style="display:flex; justify-content:center; gap:2rem; margin-top:1.5rem; flex-wrap:wrap;">
                ${(() => {
                    const isSignedOrigin = !!h.FechaCargo;
                    const suffixOrigin = 'ORG-' + btoa(h.UsuarioOrigen || 'N/A').substring(0,8);
                    """ + create_digital_signature('EMISOR (ORIGEN)', '${h.AreaOrigen}', "${h.UsuarioOrigen || 'Desconocido'}", '${h.FechaCargo}', 'isSignedOrigin', "${suffixOrigin}") + """
                })()}

                ${(() => {
                    const isSignedDest = !!h.FechaRecepcion;
                    const suffixDest = 'DST-' + btoa(h.UsuarioDestino || 'N/A').substring(0,8);
                    """ + create_digital_signature('RECEPTOR (DESTINO)', '${h.AreaDestino}', "${h.UsuarioDestino || 'Desconocido'}", '${h.FechaRecepcion}', 'isSignedDest', "${suffixDest}") + """
                })()}
            </div>"""

if old_sig in js_content:
    js_content = js_content.replace(old_sig, new_sig)
    with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'w', encoding='utf-8') as f:
        f.write(js_content)
    print("Signatures updated.")
else:
    print("Could not find old signatures block.")
