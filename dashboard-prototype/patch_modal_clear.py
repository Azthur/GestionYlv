#!/usr/bin/env python3
"""Patch match-details, clear-all, and modal rendering."""

def patch_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for i, (old_str, new_str) in enumerate(replacements):
        if old_str in content:
            content = content.replace(old_str, new_str, 1)
            print(f"  Patch {i+1}: OK")
        else:
            print(f"  Patch {i+1}: SKIPPED")
            print(f"    Looking for: {repr(old_str[:100])}")
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)


# =====================================================================
# FIX 1: Rewrite match-details endpoint to return ALL linked records
# =====================================================================
print("=== FIX 1: Rewrite match-details backend ===")

old_match_details = '''@router.get("/match-details")
def get_match_details(match_id: int):
    """
    Retorna los detalles de una conciliaci\u00f3n: la cobranza y el movimiento bancario.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    
    try:
        cursor = conn.cursor()
        
        # 1. Obtener el detalle de la conciliaci\u00f3n
        cursor.execute("SELECT * FROM ReconciliationDetail WHERE Id = ?", (match_id,))
        columns_rd = [column[0] for column in cursor.description]
        detail_row = cursor.fetchone()
        if not detail_row:
            raise HTTPException(status_code=404, detail="Conciliaci\u00f3n no encontrada")
        detail = dict(zip(columns_rd, detail_row))
            
        # 2. Obtener la cobranza
        cursor.execute("""
            SELECT m.*, c.nombco as CuentaNombre 
            FROM CcbMVtos m 
            LEFT JOIN CcbICaja c ON m.CodCia = c.codcia AND m.coddoc = c.coddoc AND m.nrodoc = c.nrodoc
            WHERE m.CodCia = ? AND m.coddoc = ? AND m.nrodoc = ? AND m.nroitm = ?
        """, (detail['MatchCodCia'], detail['MatchCoddoc'], detail['MatchNrodoc'], detail['MatchNroitm']))
        columns_m = [column[0] for column in cursor.description]
        cobranza_row = cursor.fetchone()
        cobranza = dict(zip(columns_m, cobranza_row)) if cobranza_row else None
        
        # 3. Obtener el movimiento bancario
        cursor.execute("SELECT * FROM BankMovements WHERE Id = ?", (detail['BankMovementId'],))
        columns_b = [column[0] for column in cursor.description]
        banco_row = cursor.fetchone()
        banco = dict(zip(columns_b, banco_row)) if banco_row else None
        
        return {
            "match": {
                "Id": detail['Id'],
                "MatchedAt": detail['MatchedAt'],
                "MatchType": detail['MatchType']
            },
            "cobranza": {
                "CodCia": (cobranza.get('CodCia') or '').strip() if cobranza else '',
                "NroDoc": (cobranza.get('nrodoc') or '').strip() if cobranza else '',
                "Fecha": cobranza.get('fchdoc') if cobranza else None,
                "Importe": float(cobranza.get('import') or 0) if cobranza else 0,
                "RazonSocial": (cobranza.get('NomAux') or '').strip() if cobranza else '',
                "Cuenta": (cobranza.get('CuentaNombre') or '').strip() if cobranza else '',
                "CodRef": (cobranza.get('codref') or '').strip() if cobranza else '',
                "NroRef": (cobranza.get('nroref') or '').strip() if cobranza else '',
                "NomVen": (cobranza.get('nomven') or '').strip() if cobranza else '',
                "Usuario": (cobranza.get('usuario') or '').strip() if cobranza else ''
            },
            "banco": {
                "Id": banco.get('Id') if banco else None,
                "Fecha": banco.get('Fecha') if banco else None,
                "Descripcion": (banco.get('DescripcionFinal') or banco.get('Descripcion') or '').strip() if banco else '',
                "Monto": float(banco.get('Monto') or 0) if banco else 0,
                "Operacion": (banco.get('OperacionNumero') or '').strip() if banco else ''
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()'''

new_match_details = '''@router.get("/match-details")
def get_match_details(match_id: int):
    """
    Retorna los detalles de una conciliacion: TODAS las cobranzas y TODOS los bancos vinculados al mismo grupo.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    
    try:
        cursor = conn.cursor()
        
        # 1. Get the ReconciliationId (group) from this detail
        cursor.execute("SELECT ReconciliationId, MatchType, MatchedAt FROM ReconciliationDetail WHERE Id = ?", (match_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Conciliacion no encontrada")
        group_id = row[0]
        match_type = row[1]
        matched_at = row[2]
        
        # 2. Get ALL details in this group
        cursor.execute("""
            SELECT DISTINCT MatchCodCia, MatchCoddoc, MatchNrodoc, MatchNroitm
            FROM ReconciliationDetail WHERE ReconciliationId = ?
        """, (group_id,))
        cob_keys = cursor.fetchall()
        
        cursor.execute("""
            SELECT DISTINCT BankMovementId
            FROM ReconciliationDetail WHERE ReconciliationId = ?
        """, (group_id,))
        bank_ids = [r[0] for r in cursor.fetchall()]
        
        # 3. Fetch ALL cobranzas
        cobranzas_list = []
        for ck in cob_keys:
            cursor.execute("""
                SELECT m.CodCia, m.coddoc, m.nrodoc, m.nroitm, m.fchdoc, m.import, m.NomAux, 
                       m.codref, m.nroref, m.nomven, m.usuario, m.NroDep,
                       c.nombco as CuentaNombre
                FROM CcbMVtos m
                LEFT JOIN CcbICaja c ON m.CodCia = c.codcia AND m.coddoc = c.coddoc AND m.nrodoc = c.nrodoc
                WHERE m.CodCia = ? AND m.coddoc = ? AND m.nrodoc = ? AND m.nroitm = ?
            """, (ck[0], ck[1], ck[2], ck[3]))
            cols = [c[0] for c in cursor.description]
            r = cursor.fetchone()
            if r:
                d = dict(zip(cols, r))
                cobranzas_list.append({
                    "CodCia": (d.get('CodCia') or '').strip(),
                    "CodDoc": (d.get('coddoc') or '').strip(),
                    "NroDoc": (d.get('nrodoc') or '').strip(),
                    "NroItm": (d.get('nroitm') or '').strip(),
                    "Fecha": d.get('fchdoc'),
                    "Importe": float(d.get('import') or 0),
                    "RazonSocial": (d.get('NomAux') or '').strip(),
                    "Cuenta": (d.get('CuentaNombre') or '').strip(),
                    "CodRef": (d.get('codref') or '').strip(),
                    "NroRef": (d.get('nroref') or '').strip(),
                    "NomVen": (d.get('nomven') or '').strip(),
                    "Usuario": (d.get('usuario') or '').strip(),
                    "NroDep": (d.get('NroDep') or '').strip()
                })
        
        # 4. Fetch ALL bank movements
        bancos_list = []
        if bank_ids:
            ph = ','.join(['?'] * len(bank_ids))
            cursor.execute(f"SELECT * FROM BankMovements WHERE Id IN ({ph})", bank_ids)
            cols_b = [c[0] for c in cursor.description]
            for br in cursor.fetchall():
                bd = dict(zip(cols_b, br))
                op_num = (bd.get('OpCancelacion') or bd.get('OperacionNumero') or '').strip()
                bancos_list.append({
                    "Id": bd.get('Id'),
                    "Fecha": bd.get('Fecha'),
                    "Descripcion": (bd.get('DescripcionFinal') or bd.get('Descripcion') or '').strip(),
                    "Monto": float(bd.get('Monto') or 0),
                    "Operacion": op_num
                })
        
        return {
            "match": {
                "Id": match_id,
                "ReconciliationId": group_id,
                "MatchedAt": matched_at,
                "MatchType": match_type
            },
            "cobranzas": cobranzas_list,
            "bancos": bancos_list
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()'''

with open('c:/SistemaGestionyelave/backend/conciliacion.py', 'r', encoding='utf-8') as f:
    py = f.read()

if old_match_details in py:
    py = py.replace(old_match_details, new_match_details, 1)
    print("  match-details rewritten: OK")
else:
    print("  match-details: SKIPPED (not found)")

with open('c:/SistemaGestionyelave/backend/conciliacion.py', 'w', encoding='utf-8') as f:
    f.write(py)


# =====================================================================
# FIX 2: Rewrite modal JS to render many-to-many
# =====================================================================
print("\n=== FIX 2: Rewrite modal JS ===")

with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Find and replace the entire modal rendering block
old_modal_render_start = "        const res = await fetch(`/api/conciliacion/match-details?match_id=${matchId}`);"
old_modal_render_end = "    } catch (err) {\n        console.error(err);\n        modalBody.innerHTML = `<div style=\"color:#ef4444; text-align:center; padding:2rem;\">Error: ${err.message}</div>`;\n    }\n}"

idx_start = js.find(old_modal_render_start)
idx_end = js.find(old_modal_render_end)

if idx_start > 0 and idx_end > 0:
    end_pos = idx_end + len(old_modal_render_end)
    
    new_modal_render = '''        const res = await fetch(`/api/conciliacion/match-details?match_id=${matchId}`);
        if (!res.ok) throw new Error('Error al obtener detalles');
        const data = await res.json();

        // Build cobranzas cards
        let cobHtml = '';
        const totalCob = (data.cobranzas || []).reduce((s, c) => s + Math.abs(c.Importe), 0);
        (data.cobranzas || []).forEach((c, i) => {
            cobHtml += `
                <div style="background:#f8fafc; border-radius:10px; padding:1rem 1.25rem; border:1px solid #e2e8f0; margin-bottom:0.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="font-weight:600; color:#1e293b; font-size:0.9rem;">${c.CodDoc} - ${c.NroDoc}</span>
                            <span style="color:#64748b; font-size:0.8rem; margin-left:0.5rem;">${c.CodCia}</span>
                        </div>
                        <span style="font-weight:700; color:#1e293b; font-size:1rem;">${currentCurrencySymbol} ${Math.abs(c.Importe).toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
                    </div>
                    <div style="color:#475569; font-size:0.8rem; margin-top:0.4rem;">${c.RazonSocial || ''}</div>
                    <div style="display:flex; gap:1.5rem; margin-top:0.5rem; font-size:0.75rem; color:#94a3b8;">
                        <span>Ref: ${c.CodRef || ''} ${c.NroRef || ''}</span>
                        <span>Dep: ${c.NroDep || ''}</span>
                        <span>Fecha: ${c.Fecha ? new Date(c.Fecha).toLocaleDateString('es-PE') : ''}</span>
                        <span>Vendedor: ${c.NomVen || ''}</span>
                    </div>
                </div>`;
        });

        // Build bank cards
        let bankHtml = '';
        const totalBank = (data.bancos || []).reduce((s, b) => s + Math.abs(b.Monto), 0);
        (data.bancos || []).forEach((b, i) => {
            bankHtml += `
                <div style="background:#f0fdf4; border-radius:10px; padding:1rem 1.25rem; border:1px solid #bbf7d0; margin-bottom:0.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="font-weight:600; color:#166534; font-size:0.9rem;">Op. ${b.Operacion || 'N/A'}</span>
                            <span style="color:#64748b; font-size:0.8rem; margin-left:0.5rem;">#${b.Id}</span>
                        </div>
                        <span style="font-weight:700; color:#166534; font-size:1rem;">${currentCurrencySymbol} ${Math.abs(b.Monto).toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
                    </div>
                    <div style="color:#475569; font-size:0.8rem; margin-top:0.4rem;">${b.Descripcion || ''}</div>
                    <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.3rem;">Fecha: ${b.Fecha ? new Date(b.Fecha).toLocaleDateString('es-PE') : ''}</div>
                </div>`;
        });

        modalBody.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.25rem;">
                <!-- COBRANZAS SECTION -->
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                        <div style="display:inline-flex; align-items:center; gap:0.5rem; background:#eff6ff; color:#2563eb; padding:0.35rem 0.75rem; border-radius:9999px; font-size:0.75rem; font-weight:600;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                            Documentos del Sistema (${data.cobranzas?.length || 0} cobranzas)
                        </div>
                        <span style="font-weight:700; color:#1e293b;">Total: ${currentCurrencySymbol} ${totalCob.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
                    </div>
                    ${cobHtml}
                </div>

                <!-- LINK -->
                <div style="display:flex; justify-content:center; color:#cbd5e1;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                </div>

                <!-- BANCOS SECTION -->
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                        <div style="display:inline-flex; align-items:center; gap:0.5rem; background:#ecfdf5; color:#10b981; padding:0.35rem 0.75rem; border-radius:9999px; font-size:0.75rem; font-weight:600;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                            Movimientos Bancarios (${data.bancos?.length || 0})
                        </div>
                        <span style="font-weight:700; color:#1e293b;">Total: ${currentCurrencySymbol} ${totalBank.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
                    </div>
                    ${bankHtml}
                </div>

                <!-- FOOTER -->
                <div style="text-align:center; font-size:0.75rem; color:#94a3b8; border-top:1px solid #f1f5f9; padding-top:0.75rem;">
                    <p style="margin:0;">Conciliacion realizada el: ${data.match.MatchedAt ? new Date(data.match.MatchedAt).toLocaleString('es-PE') : 'N/D'} via <strong>${data.match.MatchType}</strong></p>
                    <p style="margin:0.25rem 0 0;">Grupo #${data.match.ReconciliationId} | Match ID #${data.match.Id}</p>
                </div>
            </div>
        `;

    } catch (err) {
        console.error(err);
        modalBody.innerHTML = `<div style="color:#ef4444; text-align:center; padding:2rem;">Error: ${err.message}</div>`;
    }
}'''
    
    js = js[:idx_start] + new_modal_render + js[end_pos:]
    print("  Modal JS rewritten: OK")
else:
    print(f"  Modal JS: SKIPPED (start={idx_start}, end={idx_end})")

with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.js', 'w', encoding='utf-8') as f:
    f.write(js)


# =====================================================================
# FIX 3: Update clear-all to filter by year+month, and fix JS call
# =====================================================================
print("\n=== FIX 3: Fix clear-all scope (year+month) ===")

# Backend
with open('c:/SistemaGestionyelave/backend/conciliacion.py', 'r', encoding='utf-8') as f:
    py = f.read()

old_clear_model = '''class ClearAllRequest(BaseModel):
    codcia: str
    bank_code: str'''
new_clear_model = '''class ClearAllRequest(BaseModel):
    codcia: str
    bank_code: str
    year: Optional[str] = None
    month: Optional[str] = None'''
py = py.replace(old_clear_model, new_clear_model, 1)
print("  Clear model updated: OK")

old_clear_query = '''        # 1. Get all BankMovement IDs for this company/bank
        cursor.execute(\"\"\"
            SELECT Id FROM BankMovements 
            WHERE CodCia = ? AND BankCode = ? AND Estado = 'Conciliado'
        \"\"\", (request.codcia, request.bank_code))'''
new_clear_query = '''        # 1. Get all BankMovement IDs for this company/bank/year/month
        clear_q = "SELECT Id FROM BankMovements WHERE CodCia = ? AND BankCode = ? AND Estado = 'Conciliado'"
        clear_params = [request.codcia, request.bank_code]
        if request.year:
            clear_q += " AND YEAR(Fecha) = ?"
            clear_params.append(int(request.year))
        if request.month:
            clear_q += " AND MONTH(Fecha) = ?"
            clear_params.append(int(request.month))
        cursor.execute(clear_q, clear_params)'''
py = py.replace(old_clear_query, new_clear_query, 1)
print("  Clear query updated: OK")

with open('c:/SistemaGestionyelave/backend/conciliacion.py', 'w', encoding='utf-8') as f:
    f.write(py)

# Frontend JS
with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.js', 'r', encoding='utf-8') as f:
    js = f.read()

old_clear_js = '''async function clearAllConciliaciones() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    if (!codcia || !bankCode) {
        showToast('Seleccione empresa y banco primero', 'error');
        return;
    }

    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: '\u00bfLimpiar TODAS las conciliaciones?',
            html: '<p style="color:#64748b;">Esta acci\u00f3n eliminar\u00e1 <strong>todos</strong> los registros de conciliaci\u00f3n para la empresa y banco seleccionados.</p><p style="color:#ef4444; font-weight:600;">Esta acci\u00f3n NO se puede deshacer.</p>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'S\u00ed, limpiar todo',
            cancelButtonText: 'Cancelar',
            focusCancel: true
        });
        if (!result.isConfirmed) return;
    } else {
        if (!confirm('\u26a0\ufe0f \u00bfEst\u00e1 seguro de limpiar TODAS las conciliaciones? Esta acci\u00f3n NO se puede deshacer.')) return;
    }

    try {
        const res = await fetch('/api/conciliacion/clear-all', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codcia, bank_code: bankCode })
        });
        if (!res.ok) throw new Error('Error al limpiar');
        const data = await res.json();
        showToast(data.message || 'Conciliaciones eliminadas', 'success');
        await loadData();
    } catch (err) {
        console.error(err);
        showToast('Error al limpiar las conciliaciones', 'error');
    }
}'''

new_clear_js = '''async function clearAllConciliaciones() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    const year = document.getElementById('selectYear').value;
    const month = document.getElementById('selectMonth').value;
    const empresaName = document.getElementById('selectEmpresa').options[document.getElementById('selectEmpresa').selectedIndex]?.text || codcia;
    const bancoName = document.getElementById('selectBanco').options[document.getElementById('selectBanco').selectedIndex]?.text || bankCode;
    const monthNames = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const periodoText = year ? (month ? monthNames[parseInt(month)] + ' ' + year : year) : 'todos los periodos';

    if (!codcia || !bankCode) {
        showToast('Seleccione empresa y banco primero', 'error');
        return;
    }

    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: 'Confirmar Limpieza de Conciliaciones',
            html: `
                <div style="text-align:left; padding:0.5rem 0;">
                    <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:1rem; margin-bottom:1rem;">
                        <p style="margin:0 0 0.5rem; font-weight:600; color:#991b1b;">Se eliminar\\u00e1n todas las conciliaciones de:</p>
                        <ul style="margin:0; padding-left:1.5rem; color:#7f1d1d; font-size:0.9rem;">
                            <li><strong>Empresa:</strong> ${empresaName}</li>
                            <li><strong>Banco:</strong> ${bancoName}</li>
                            <li><strong>Periodo:</strong> ${periodoText}</li>
                        </ul>
                    </div>
                    <p style="color:#64748b; font-size:0.85rem; margin:0;">Los movimientos bancarios volver\\u00e1n al estado <strong>Pendiente</strong> y podr\\u00e1 volver a conciliarlos.</p>
                </div>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Confirmar limpieza',
            cancelButtonText: 'Cancelar',
            focusCancel: true,
            customClass: { popup: 'swal-wide' }
        });
        if (!result.isConfirmed) return;
    } else {
        if (!confirm('Esta seguro de limpiar las conciliaciones seleccionadas?')) return;
    }

    try {
        const body = { codcia, bank_code: bankCode };
        if (year) body.year = year;
        if (month) body.month = month;

        const res = await fetch('/api/conciliacion/clear-all', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Error al limpiar');
        const data = await res.json();
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Limpieza completada',
                text: data.message,
                icon: 'success',
                confirmButtonColor: '#2b3954'
            });
        } else {
            showToast(data.message || 'Conciliaciones eliminadas', 'success');
        }
        await loadData();
    } catch (err) {
        console.error(err);
        if (typeof Swal !== 'undefined') {
            Swal.fire({ title: 'Error', text: 'No se pudieron limpiar las conciliaciones', icon: 'error', confirmButtonColor: '#2b3954' });
        } else {
            showToast('Error al limpiar las conciliaciones', 'error');
        }
    }
}'''

if old_clear_js in js:
    js = js.replace(old_clear_js, new_clear_js, 1)
    print("  Clear JS updated: OK")
else:
    print("  Clear JS: SKIPPED")

with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.js', 'w', encoding='utf-8') as f:
    f.write(js)


print("\n=== ALL PATCHES COMPLETE ===")
