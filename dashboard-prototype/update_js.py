import re

with open('c:\\SistemaGestionyelave\\dashboard-prototype\\pagos_tesoreria.js', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r'// Badge\s+let tipoClass =.*?// 13 columnas', re.DOTALL)

new_content = """// Tipo OC Label
            let tipoOcBadge = '';
            const tOc = (c.TipoOc || '').trim();
            if (tOc === 'M') tipoOcBadge = `<span style=\"font-size:0.65rem; background:#eff6ff; color:#2563eb; padding:1px 6px; border-radius:12px; font-weight:600; border:1px solid #bfdbfe; margin-left:4px;\">📦 Mercadería</span>`;
            else if (tOc === 'S') tipoOcBadge = `<span style=\"font-size:0.65rem; background:#f0fdf4; color:#16a34a; padding:1px 6px; border-radius:12px; font-weight:600; border:1px solid #bbf7d0; margin-left:4px;\">⚙️ Servicios</span>`;
            else if (tOc === 'T') tipoOcBadge = `<span style=\"font-size:0.65rem; background:#faf5ff; color:#9333ea; padding:1px 6px; border-radius:12px; font-weight:600; border:1px solid #e9d5ff; margin-left:4px;\">🗂️ Contable</span>`;

            // Badge
            let tipoClass = 'badge pending';
            if (tipoDoc === 'Factura' || tipoDoc === 'Boleta') tipoClass = 'badge success';
            if (tipoDoc === 'Rendición') tipoClass = 'badge success';
            if (isNC || tipoDoc === 'Nota Crédito' || tipoDoc === 'NC Especial') tipoClass = 'badge nc';
            const tipoLabel = isNC ? (tipoDocMap[c.TipoComprobante] || tipoDoc) : tipoDoc;

            let badgeHtml = `<span class=\"${tipoClass}\">${tipoLabel}</span>${tipoOcBadge ? '<br>'+tipoOcBadge : ''}`;

            // Documento principal con enlace
            let docHtml = `<strong>${c.NroDocPrincipal || '-'}</strong>`;
            const linkColor = isNC ? '#ef4444' : '#2563eb';
            if (c.FacturaUuid && tipoDoc !== 'OC' && tipoDoc !== 'Rendición') {
                docHtml = `<a href=\"javascript:void(0)\" onclick=\"openVisor('/factura_visor.html?uid=${c.FacturaUuid}', '${tipoLabel} ${c.NroDocPrincipal}')\" style=\"color:${linkColor}; text-decoration:underline; font-weight:700;\">📄 ${c.NroDocPrincipal}</a>`;
            } else if (tipoDoc === 'Rendición' && c.RendicionUuid) {
                docHtml = `<a href=\"javascript:void(0)\" onclick=\"openVisor('/visor_rendicion.html?uuid=${c.RendicionUuid}', 'Rendición ${c.NroDocPrincipal}')\" style=\"color:#059669; text-decoration:underline; font-weight:700;\">📋 ${c.NroDocPrincipal || c.NroRendicion}</a>`;
            } else if (tipoDoc === 'OC' && c.NroOrdenCompra) {
                const ocUrl = '/oc_visor.html?nrodoc=' + encodeURIComponent(c.NroOrdenCompra) + '&codcia=' + encodeURIComponent(codcia) + '&tipooc=' + encodeURIComponent(tOc || 'O');
                docHtml = `<a href=\"javascript:void(0)\" onclick=\"openVisor('${ocUrl}', 'OC ${c.NroOrdenCompra}')\" style=\"color:#8b5cf6; text-decoration:underline; font-weight:700;\">📦 ${c.NroDocPrincipal}</a>`;
                if (c.FacturaUuid && c.NroFactura) {
                    docHtml += `<br><a href=\"javascript:void(0)\" onclick=\"openVisor('/factura_visor.html?uid=${c.FacturaUuid}', 'Factura ${c.NroFactura}')\" style=\"color:#2563eb; font-size:0.72rem; text-decoration:underline;\">📄 ${c.NroFactura}</a>`;
                }
            }

            // Proveedor
            const provHtml = `${c.Proveedor || '-'}<br><small style=\"color:#64748b;\">${c.RucProveedor || '-'}</small>`;

            // Trazabilidad
            let trazaHtml = '<span style=\"color:#cbd5e1;\">—</span>';
            const nro_oc = (c.NroOrdenCompra || '').trim();
            const nro_fac = (c.NroFactura || '').trim();
            const esRendicionOC = nro_oc.startsWith('RG-') || nro_oc.startsWith('RE-') || tipoDoc === 'Rendición';
            
            if (esRendicionOC) {
                if (c.RendicionUuid) {
                    trazaHtml = `<a href=\"javascript:void(0)\" onclick=\"openVisor('/visor_rendicion.html?uuid=${c.RendicionUuid}', 'Rendición ${nro_oc}')\" style=\"font-size:0.75rem; color:#059669; text-decoration:underline;\">📋 Rendición: ${nro_oc}</a>`;
                } else {
                    trazaHtml = `<span style=\"font-size:0.75rem; color:#059669;\">📋 Rendición: ${nro_oc}</span>`;
                }
            } else if (nro_oc && nro_oc !== '-') {
                // Para OCs y Facturas provenientes de OC (doble botón)
                const ocUrl2 = '/oc_visor.html?nrodoc=' + encodeURIComponent(nro_oc) + '&codcia=' + encodeURIComponent(codcia) + '&tipooc=' + encodeURIComponent(tOc || 'O');
                const anosOc = c.AnosOc || '';
                trazaHtml = `
                <div style=\"display:flex; flex-direction:column; gap:4px; max-width:140px;\">
                    <a href=\"javascript:void(0)\" onclick=\"openVisor('${ocUrl2}', 'OC ${nro_oc}')\" style=\"font-size:0.7rem; color:#8b5cf6; text-decoration:none; background:#f5f3ff; border:1px solid #ddd6fe; padding:2px 6px; border-radius:4px; font-weight:600; display:flex; justify-content:space-between; align-items:center;\">
                        <span>📦 OC: ${nro_oc}</span><span style=\"font-size:0.6rem;\">📄</span>
                    </a>
                    <a href=\"javascript:void(0)\" onclick=\"openTrazaModal('${codcia}', '${nro_oc}', '${tOc}', '${anosOc}')\" style=\"font-size:0.7rem; color:#0f172a; text-decoration:none; background:#f8fafc; border:1px solid #cbd5e1; padding:2px 6px; border-radius:4px; font-weight:600; display:flex; justify-content:space-between; align-items:center;\">
                        <span>Trazabilidad</span><span style=\"font-size:0.6rem;\">👁‍🗨</span>
                    </a>
                </div>`;
            } else if (tipoDoc === 'OC' && nro_fac && nro_fac !== '-') {
                if (c.FacturaUuid) {
                    trazaHtml = `<a href=\"javascript:void(0)\" onclick=\"openVisor('/factura_visor.html?uid=${c.FacturaUuid}', 'Factura ${nro_fac}')\" style=\"font-size:0.75rem; color:#2563eb; text-decoration:underline;\">📄 Fact: ${nro_fac}</a>`;
                } else {
                    trazaHtml = `<span style=\"font-size:0.75rem; color:#64748b;\">📄 Fact: <b>${nro_fac}</b></span>`;
                }
            }

            // Formato importes
            const fmtMonto = (v) => `<span style=\"${v < 0 ? 'color:#ef4444; font-weight:700;' : ''}\">${simbolo} ${v.toLocaleString('es-PE', {minimumFractionDigits: 2})}</span>`;

            // Botones — escapar comillas simples del proveedor
            const provEsc = (c.Proveedor || '').replace(/'/g, "\\\\'");
            let btnHtml = '';
            if (isNC) {
                btnHtml = `<button class=\"btn-action\" style=\"padding:0.25rem 0.5rem; font-size:0.7rem; background:#ef4444; color:white;\" onclick=\"abrirModalAplicarNC('${c.DetalleId}', '${provEsc}', '${c.NroFactura||''}', ${importePagar}, '${moneda}', '${codcia}')\">✅ Aplicar NC</button>`;
            } else {
                btnHtml = `<button class=\"btn-action primary\" style=\"padding:0.25rem 0.5rem; font-size:0.7rem;\" onclick=\"openModalPagoFlexible('${c.DetalleId}', '${c.TipoDocumento||'OC'}', '${codcia}', '${c.NroOrdenCompra||''}', '${tOc||''}', '${provEsc}', '${c.NroFactura||''}', ${importePagar}, '${moneda}')\">💸 Pagar</button>`;
                btnHtml += `<br><button class=\"btn-action\" style=\"padding:0.2rem 0.4rem; font-size:0.65rem; background:#10b981; color:white; margin-top:2px;\" onclick=\"openModalPagoFlexible('${c.DetalleId}', '${c.TipoDocumento||'OC'}', '${codcia}', '${c.NroOrdenCompra||''}', '${tOc||''}', '${provEsc}', '${c.NroFactura||''}', 0, '${moneda}', true)\">✅ Aplicar</button>`;
            }

            // 13 columnas"""

content = pattern.sub(new_content, content)

# Need to update the rendering array slightly
content = content.replace("`<span class=\"${tipoClass}\">${tipoLabel}</span>`,", "badgeHtml,")

with open('c:\\SistemaGestionyelave\\dashboard-prototype\\pagos_tesoreria.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
