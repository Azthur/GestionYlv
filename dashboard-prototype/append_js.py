import sys

traza_js = """
// ════════════════════════════════════════════════════════════
//  TRAZABILIDAD OC → ALMACÉN → FACTURA
// ════════════════════════════════════════════════════════════

function closeTrazaModal() {
    document.getElementById('trazaModal').classList.remove('active');
}

async function openTrazaModal(codcia, nrodoc, tipooc, anos) {
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

        const isService = tipooc === 'S' || tipooc === 'T';
        
        let html = `
        <div class="traza-summary">
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${r.total_items_oc}</div><div class="tlabel">Items OC</div></div>
            ${!isService 
                ? `<div class="traza-summary-item" style="flex:1;"><div class="tval">${fmtN(r.total_oc)}</div><div class="tlabel">Cant. Pedida</div></div>`
                : `<div class="traza-summary-item" style="flex:1;"><div class="tval">${fmtN(r.monto_oc)}</div><div class="tlabel">Monto Pedido</div></div>`
            }
            ${tipooc === 'M' ? `<div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#22c55e;">${fmtN(r.total_almacen)}</div><div class="tlabel">Cant. Almacén</div></div>` : ''}
            ${!isService
                ? `<div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#8b5cf6;">${fmtN(r.total_facturado)}</div><div class="tlabel">Cant. Facturada</div></div>`
                : `<div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#8b5cf6;">${fmtN(r.monto_facturado)}</div><div class="tlabel">Monto Facturado</div></div>`
            }
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
                    <th style="padding:0.6rem 0.5rem; text-align:right; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">${!isService ? 'Cant. OC' : 'Monto OC'}</th>
                    ${tipooc === 'M' ? `<th style="padding:0.6rem 0.5rem; text-align:center; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#22c55e; border-bottom:2px solid #cbd5e1;">Almacén</th>` : ''}
                    <th style="padding:0.6rem 0.5rem; text-align:center; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#8b5cf6; border-bottom:2px solid #cbd5e1;">${!isService ? 'Cant. Facturada' : 'Monto Facturado'}</th>
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
                    <td style="padding:0.5rem; text-align:right; font-weight:600;">${!isService ? fmtN(it.candes) : fmtN(it.monto_oc)}</td>
                    ${tipooc === 'M' ? `<td style="padding:0.5rem; text-align:center;">
                        <div style="font-weight:600; ${almClass === 'complete' ? 'color:#22c55e;' : almClass === 'partial' ? 'color:#f59e0b;' : 'color:#94a3b8;'}">${fmtN(it.cant_almacen)} <span style="font-size:0.65rem; font-weight:400;">(${it.pct_almacen}%)</span></div>
                        <div class="traza-bar"><div class="traza-bar-fill ${almClass}" style="width:${Math.min(it.pct_almacen, 100)}%;"></div></div>
                    </td>` : ''}
                    <td style="padding:0.5rem; text-align:center;">
                        <div style="font-weight:600; ${facClass === 'complete' ? 'color:#8b5cf6;' : facClass === 'partial' ? 'color:#f59e0b;' : 'color:#94a3b8;'}">${!isService ? fmtN(it.cant_facturada) : fmtN(it.monto_facturado)} <span style="font-size:0.65rem; font-weight:400;">(${it.pct_facturado}%)</span></div>
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
                const facturaUrl = f.Uuid ? `/factura_visor.html?uid=${f.Uuid}` : '#';
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
"""

with open('c:\\SistemaGestionyelave\\dashboard-prototype\\pagos_tesoreria.js', 'a', encoding='utf-8') as f:
    f.write(traza_js)

print("Appended successfully")
