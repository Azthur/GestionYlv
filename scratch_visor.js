
        const params = new URLSearchParams(window.location.search);
        const uid = params.get('uid');

        if (!uid) {
            document.getElementById('content').innerHTML = '<div class="error"><h2>URL inválida</h2><p>No se proporcionó un identificador de factura.</p></div>';
        } else {
            fetch(`/api/contabilidad/facturas/public/${uid}`)
                .then(r => { if(!r.ok) throw new Error('Factura no encontrada'); return r.json(); })
                .then(data => renderVisor(data))
                .catch(err => {
                    document.getElementById('content').innerHTML = `<div class="error"><h2>Error</h2><p>${err.message}</p></div>`;
                });
        }

        function fmtNum(n) { return (n||0).toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}); }

        function renderVisor(d) {
            const estadoBadge = d.Estado === 'Anulada' 
                ? '<span class="badge badge-anulado">ANULADO</span>' 
                : '<span class="badge badge-ok">REGISTRADO</span>';

            const tipoMap = {'01':'Factura','02':'Recibo por Honorarios','03':'Boleta de Venta','04':'Liquidación de Compra','07':'Nota de Crédito','08':'Nota de Débito','14':'Recibo Serv. Públicos','50':'DUA'};
            const tipoNombre = tipoMap[d.CodTipoDoc] || d.CodTipoDoc;

            let itemsHTML = '';
            (d.items || []).forEach((it, i) => {
                itemsHTML += `<tr>
                    <td>${i+1}</td>
                    <td>${it.CodMaterial || '-'}</td>
                    <td>${it.Descripcion || '-'}</td>
                    <td>${it.UnidadMedida || '-'}</td>
                    <td style="text-align:right;">${fmtNum(it.Cantidad)}</td>
                    <td style="text-align:right;">${fmtNum(it.PrecioUnitario)}</td>
                    <td style="text-align:right;">${fmtNum(it.SubTotal)}</td>
                    <td style="text-align:right;">${fmtNum(it.IGV)}</td>
                    <td style="text-align:right; font-weight:600;">${fmtNum(it.Total)}</td>
                </tr>`;
            });

            let archivosHTML = '';
            if (d.archivos && d.archivos.length > 0) {
                d.archivos.forEach(a => {
                    const ext = a.NombreArchivo.split('.').pop().toUpperCase();
                    const color = ext === 'PDF' ? '#ef4444' : ext === 'XML' ? '#10b981' : '#6366f1';
                    archivosHTML += `<div class="v-file-item">
                        <span class="v-file-badge" style="background:${color};">${ext}</span>
                        <span>${a.NombreArchivo}</span>
                        <span style="color:var(--muted); font-size:0.8rem; margin-left:auto;">${a.TipoDocumento}</span>
                    </div>`;
                });
            } else {
                archivosHTML = '<div style="color:var(--muted); font-size:0.85rem; padding:1rem 0;">Sin documentos adjuntos.</div>';
            }

            document.getElementById('content').innerHTML = `
                <div class="visor-header">
                    <div>
                        <h1>${tipoNombre} ${d.Serie}-${d.Numero}</h1>
                        <div style="color:var(--muted); font-size:0.85rem; margin-top:0.25rem;">
                            Código: <strong>${(d.Uuid||'').substring(0,8).toUpperCase()}</strong> &bull; Registrado: ${d.CreatedAt || '-'}
                        </div>
                    </div>
                    ${estadoBadge}
                </div>

                <div class="visor-container">
                    <div style="background:#ffffff; max-width:900px; margin: 0 auto; padding: 3rem; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.08); border:1px solid #e2e8f0; position:relative; overflow:hidden;">
                        <!-- HEADER DOCUMENTO -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 2rem;">
                            <div>
                                <h1 style="margin: 0; font-size: 1.5rem; color: #0f172a; text-transform:uppercase; letter-spacing: 1px;">SISTEMA DIGITAL ERP</h1>
                                <p style="color:var(--muted); font-size:0.9rem; margin-top:0.35rem;">Visor Público de Comprobantes de Recepción</p>
                            </div>
                            <div style="text-align: right;">
                                <h2 style="margin: 0; font-size: 1.6rem; color: var(--primary);">${d.CodTipoDoc || '01'} ${d.Serie||''}-${d.Numero||''}</h2>
                                <p style="font-weight: 600; color: #334155; margin-top: 0.35rem;">Emisión: ${d.FecEmision || '-'} &nbsp;|&nbsp; Vence: ${d.FecVencimiento || '-'}</p>
                                <p style="color:var(--muted); font-size:0.85rem;">Moneda: ${d.CodMoneda || 'PEN'} (T/C: ${d.TipoCambio || 1})</p>
                            </div>
                        </div>

                        <!-- SECCIÓN INFO Y PROVEEDOR (Dos Columnas) -->
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2.5rem;">
                            <!-- Panel Proveedor -->
                            <div style="background:#f8fafc; padding: 1.5rem; border-radius: 8px; border:1px solid #f1f5f9;">
                                <h3 style="font-size: 0.8rem; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin: 0 0 1rem 0;">1. Datos del Proveedor</h3>
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.9rem;">
                                    <strong>Razón Social:</strong> <span style="text-align:right;">${d.NomProveedor || '-'}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.9rem;">
                                    <strong>RUC:</strong> <span>${d.NumRucProveedor || '-'}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.9rem;">
                                    <strong>Nombre Comercial:</strong> <span style="text-align:right;">${d.NomComercialEmisor || '-'}</span>
                                </div>
                                <div style="display:flex; flex-direction:column; font-size:0.9rem;">
                                    <strong style="margin-bottom:0.25rem;">Dirección Fiscal:</strong>
                                    <span style="color:#475569;">${d.DirEmisor || '-'}</span>
                                </div>
                            </div>

                            <!-- Panel Operativo -->
                            <div style="background:#f8fafc; padding: 1.5rem; border-radius: 8px; border:1px solid #f1f5f9;">
                                <h3 style="font-size: 0.8rem; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin: 0 0 1rem 0;">2. Referencias Operativas</h3>
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.9rem;">
                                    <strong>Orden de Compra:</strong> <span>${d.NroOrdenCompra ? (d.TipoOc||'') + d.NroOrdenCompra : 'Ninguna'}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.9rem;">
                                    <strong>Doc. que Modifica:</strong> <span>${d.DocModificaSerie ? d.DocModificaSerie+'-'+d.DocModificaNumero : '-'}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.9rem;">
                                    <strong>Estado Procesamiento:</strong> <span style="color:#10b981; font-weight:700;">${d.Estado || 'Completado'}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.9rem;">
                                    <strong>Modo Registro:</strong> <span>${d.ModoRegistro || '-'}</span>
                                </div>
                            </div>
                        </div>

                        <!-- TABLA PRINCIPAL DE ÍTEMS -->
                        <div style="margin-bottom: 2.5rem;">
                            <h3 style="font-size: 0.8rem; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin: 0 0 1rem 0;">3. Detalle de Operaciones</h3>
                            <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                                    <thead style="background:#f1f5f9; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">
                                        <tr>
                                            <th style="padding:1rem; text-align:left; color:#475569; width:40px;">#</th>
                                            <th style="padding:1rem; text-align:left; color:#475569;">Código</th>
                                            <th style="padding:1rem; text-align:left; color:#475569;">Descripción</th>
                                            <th style="padding:1rem; text-align:right; color:#475569;">Cant.</th>
                                            <th style="padding:1rem; text-align:right; color:#475569;">P.Unit</th>
                                            <th style="padding:1rem; text-align:right; color:#475569;">S/Total</th>
                                            <th style="padding:1rem; text-align:right; color:#475569;">IGV</th>
                                            <th style="padding:1rem; text-align:right; color:#475569;">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${itemsHTML.replace(/<tr/g, '<tr style="border-bottom:1px solid #e2e8f0; transition:background 0.2s;" onmouseover="this.style.background=\\'#f8fafc\\'" onmouseout="this.style.background=\\'transparent\\'"').replace(/<td/g, '<td style="padding:1rem; color:#1e293b;"')}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- OBSERVACIONES EXTRA SI HAY -->
                        ${d.Observaciones ? `
                        <div style="margin-bottom: 2.5rem; background:#eff6ff; border-left:4px solid #3b82f6; padding:1.25rem; border-radius:0 8px 8px 0;">
                            <h3 style="font-size: 0.75rem; text-transform:uppercase; letter-spacing:1px; color:#2563eb; margin: 0 0 0.5rem 0;">Observaciones Registradas</h3>
                            <p style="margin:0; font-size:0.9rem; color:#1e40af; line-height:1.5;">${d.Observaciones}</p>
                        </div>
                        ` : ''}

                        <!-- ZONA INFERIOR: METADATA URL Y TOTALES FINALES -->
                        <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                            
                            <!-- Tracking Metadato -->
                            <div style="width:50%; background:#f8fafc; border: 1px dashed #cbd5e1; border-radius:8px; padding:1.25rem;">
                                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
                                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="#10b981" fill="none" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                    <span style="font-weight:700; color:#334155; font-size:0.9rem;">Documento Verificado Electrónicamente</span>
                                </div>
                                <div style="font-size:0.8rem; color:#64748b; margin-bottom:0.25rem;"><strong>ID Blockchain / UUID:</strong><br><code style="background:#e2e8f0; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${d.Uuid || 'En proceso'}</code></div>
                                <div style="font-size:0.8rem; color:#64748b; word-break:break-all; margin-top:0.75rem;">
                                    <strong>Enlace Público Permanente:</strong><br>
                                    <a href="${window.location.href}" style="color:#2563eb;">${window.location.href}</a>
                                </div>
                            </div>

                            <!-- Tabla de Totales Exactos -->
                            <div style="width: 350px; background:#f8fafc; padding:1.5rem; border-radius:12px; border:1px solid #e2e8f0;">
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.9rem;">
                                    <span style="color:#64748b;">Op. Gravada:</span>
                                    <strong>${fmtNum(d.MtoGravado || d.SubTotal)}</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.9rem;">
                                    <span style="color:#64748b;">Op. Inafecta:</span>
                                    <strong>${fmtNum(d.MtoInafecto || 0)}</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.9rem;">
                                    <span style="color:#64748b;">Op. Exonerada:</span>
                                    <strong>${fmtNum(d.MtoExonerado || 0)}</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.9rem;">
                                    <span style="color:#64748b;">I.G.V. (18%):</span>
                                    <strong>${fmtNum(d.IGV || (d.Total - d.SubTotal))}</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.9rem;">
                                    <span style="color:#64748b;">Otros Tributos/Cargos:</span>
                                    <strong>${fmtNum((d.OtrosTributos||0) + (d.MtoICBPER||0) + (d.MtoOtrosCargos||0))}</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; margin-top:1rem; padding-top:1rem; border-top:2px solid #cbd5e1;">
                                    <span style="color:#0f172a; font-weight:700; font-size:1.1rem;">TOTAL GENERAL:</span>
                                    <strong style="font-size:1.25rem; color:#2563eb;">${d.CodMoneda||'PEN'} ${fmtNum(d.Total)}</strong>
                                </div>
                            </div>
                        </div>

                        <!-- ARCHIVOS (Extra) -->
                        ${archivosHTML ? `
                        <div style="margin-top: 3rem; padding-top:2rem; border-top: 1px dashed #cbd5e1;">
                            <h3 style="font-size: 0.8rem; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin: 0 0 1rem 0;">Documentos Respaldos Adjuntos</h3>
                            ${archivosHTML}
                        </div>
                        ` : ''}

                        <div style="text-align:center; color:#94a3b8; font-size:0.75rem; margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #f1f5f9;">
                            Emitido a través del nodo Contable Yelave ERP &bull; ${new Date().toLocaleString('es-PE')} &bull; Registrado por: ${d.CreatedBy || 'SISTEMA'}
                        </div>
                    </div>
                </div>
            `;
        }
    