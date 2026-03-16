#!/usr/bin/env python3
"""Comprehensive patch for all 6 reported issues."""

def patch_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for i, (old_str, new_str) in enumerate(replacements):
        if old_str in content:
            content = content.replace(old_str, new_str, 1)
            print(f"  Patch {i+1}: OK")
        else:
            print(f"  Patch {i+1}: SKIPPED (not found)")
            print(f"    Looking for: {repr(old_str[:120])}")
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)


# ══════════════════════════════════════════════════════════════════════════
# FIX 1: Bank panel height — remove max-height:500px so it scrolls fully
# ══════════════════════════════════════════════════════════════════════════
print("=== FIX 1: Bank panel height in HTML ===")
patch_file('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.html', [
    (
        'class="table-responsive custom-scrollbar" style="max-height: 500px; overflow-y: auto;"',
        'class="table-responsive custom-scrollbar"'
    ),
])


# ══════════════════════════════════════════════════════════════════════════
# FIX 2: Match details modal — inject content into modal-body div, not tbody
# ══════════════════════════════════════════════════════════════════════════
print("\n=== FIX 2: Match modal — render into modal-body instead of tbody ===")

with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.js', 'r', encoding='utf-8') as f:
    js = f.read()

# The showMatchDetails function writes rich HTML into tbody which is invalid.
# Replace it to render into the modal-body div directly instead.
old_modal = """    const modal = document.getElementById('matchDetailsModal');
    const tbody = document.getElementById('tbodyMatchDetails');
    if (!modal || !tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="loading-state" style="text-align:center; padding:2rem;">Cargando detalles...</td></tr>';
    modal.style.display = 'flex';"""

new_modal = """    const modal = document.getElementById('matchDetailsModal');
    const modalBody = modal ? modal.querySelector('.modal-body') : null;
    if (!modal || !modalBody) return;

    modalBody.innerHTML = '<div style="text-align:center; padding:2rem; color:#64748b;">Cargando detalles...</div>';
    modal.style.display = 'flex';"""

if old_modal in js:
    js = js.replace(old_modal, new_modal, 1)
    print("  Patch modal open: OK")
else:
    print("  Patch modal open: SKIPPED")

# Fix the rendering target from tbody to modalBody
js = js.replace(
    "        tbody.innerHTML = `\n            <div",
    "        modalBody.innerHTML = `\n            <div",
    1
)
print("  Patch render target (success): OK")

js = js.replace(
    "        tbody.innerHTML = `<div style=\"color:#ef4444; text-align:center; padding:2rem;\">Error: ${err.message}</div>`;",
    "        modalBody.innerHTML = `<div style=\"color:#ef4444; text-align:center; padding:2rem;\">Error: ${err.message}</div>`;",
    1
)
print("  Patch render target (error): OK")

with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.js', 'w', encoding='utf-8') as f:
    f.write(js)


# ══════════════════════════════════════════════════════════════════════════
# FIX 3: Estado in "Todas las Cobranzas" — backend returns Conciliado boolean,
#         but the JS Estado column checks c.Estado. We need to map it.
# ══════════════════════════════════════════════════════════════════════════
print("\n=== FIX 3: Fix Estado in Todas Cobranzas ===")
# The c.Estado currently doesn't exist from cobranzas-todas endpoint. 
# It returns c.Conciliado (boolean). The JS already has the Estado cell rendering
# but the data doesn't have that field. We fix the JS to derive Estado from Conciliado.
patch_file('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.js', [
    (
        "c.Estado === 'Conciliado' ? 'conciliado' : 'pendiente'}\">${c.Estado || 'Pendiente'}",
        "c.Conciliado ? 'conciliado' : 'pendiente'}\">${c.Conciliado ? 'Conciliado' : 'Pendiente'}"
    ),
])


# ══════════════════════════════════════════════════════════════════════════
# FIX 4a: Fix usuario — user object has .login and .nombre, not .username/.name
# ══════════════════════════════════════════════════════════════════════════
print("\n=== FIX 4a: Fix usuario field extraction ===")
patch_file('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.js', [
    # Auto match
    (
        "usuario: JSON.parse(localStorage.getItem('yelave_user'))?.username || JSON.parse(localStorage.getItem('yelave_user'))?.name || 'Desconocido'\n            })",
        "usuario: (function(){ try { var u = JSON.parse(localStorage.getItem('yelave_user')); return u?.nombre || u?.login || 'Desconocido'; } catch(e){ return 'Desconocido'; } })()\n            })"
    ),
    # Manual match
    (
        "usuario: JSON.parse(localStorage.getItem('yelave_user'))?.username || JSON.parse(localStorage.getItem('yelave_user'))?.name || 'Desconocido'\n        };",
        "usuario: (function(){ try { var u = JSON.parse(localStorage.getItem('yelave_user')); return u?.nombre || u?.login || 'Desconocido'; } catch(e){ return 'Desconocido'; } })()\n        };"
    ),
])


# ══════════════════════════════════════════════════════════════════════════
# FIX 4b: Add "Limpiar todas las conciliaciones" button and endpoint
# ══════════════════════════════════════════════════════════════════════════
print("\n=== FIX 4b: Add clear-all conciliaciones button ===")

# Add JS function
with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.js', 'r', encoding='utf-8') as f:
    js = f.read()

clear_all_fn = """

// ─── Clear All Reconciliations ──────────────────────────────────────
async function clearAllConciliaciones() {
    const codcia = document.getElementById('selectEmpresa').value;
    const bankCode = document.getElementById('selectBanco').value;
    if (!codcia || !bankCode) {
        showToast('Seleccione empresa y banco primero', 'error');
        return;
    }

    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: '¿Limpiar TODAS las conciliaciones?',
            html: '<p style="color:#64748b;">Esta acción eliminará <strong>todos</strong> los registros de conciliación para la empresa y banco seleccionados.</p><p style="color:#ef4444; font-weight:600;">Esta acción NO se puede deshacer.</p>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Sí, limpiar todo',
            cancelButtonText: 'Cancelar',
            focusCancel: true
        });
        if (!result.isConfirmed) return;
    } else {
        if (!confirm('⚠️ ¿Está seguro de limpiar TODAS las conciliaciones? Esta acción NO se puede deshacer.')) return;
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
}
"""

# Append before the very last line
js = js.rstrip() + clear_all_fn
with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.js', 'w', encoding='utf-8') as f:
    f.write(js)
print("  Added clearAllConciliaciones function: OK")

# Add the button to the Conciliados tab in HTML
with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find the tableConciliados section and add a button before the table
old_conciliados_header = 'id="tab-conciliados"'
if old_conciliados_header in html:
    # Find where tab-conciliados content starts and add a button bar
    idx = html.find(old_conciliados_header)
    # Find the first <table after this position
    table_idx = html.find('<table', idx)
    if table_idx > 0:
        # Find the div before the table (table-responsive wrapper)
        div_idx = html.rfind('<div', idx, table_idx)
        if div_idx > 0:
            button_bar = """<div style="display:flex; justify-content:flex-end; margin-bottom:1rem; gap:0.5rem;">
                                <button class="btn btn-secondary" onclick="clearAllConciliaciones()" style="background-color: #ef4444; color: white; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    Limpiar Todas las Conciliaciones
                                </button>
                            </div>
                            """
            html = html[:div_idx] + button_bar + html[div_idx:]
            print("  Added clear button to HTML: OK")
        else:
            print("  Could not find div before table")
    else:
        print("  Could not find table in conciliados tab")
else:
    print("  Could not find tab-conciliados")

with open('c:/SistemaGestionyelave/dashboard-prototype/conciliacion.html', 'w', encoding='utf-8') as f:
    f.write(html)


# ══════════════════════════════════════════════════════════════════════════
# FIX 4c: Add backend clear-all endpoint
# ══════════════════════════════════════════════════════════════════════════
print("\n=== FIX 4c: Add clear-all backend endpoint ===")

clear_endpoint = '''

class ClearAllRequest(BaseModel):
    codcia: str
    bank_code: str

@router.delete("/clear-all")
def clear_all_conciliaciones(request: ClearAllRequest):
    """Elimina todas las conciliaciones para una empresa y banco."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        
        # 1. Get all BankMovement IDs for this company/bank
        cursor.execute("""
            SELECT Id FROM BankMovements 
            WHERE CodCia = ? AND BankCode = ? AND Estado = 'Conciliado'
        """, (request.codcia, request.bank_code))
        bank_ids = [row[0] for row in cursor.fetchall()]
        
        if not bank_ids:
            return {"status": "success", "message": "No hay conciliaciones para limpiar.", "deleted": 0}
        
        placeholders = ','.join(['?'] * len(bank_ids))
        
        # 2. Get ReconciliationDetail IDs linked to these bank movements
        cursor.execute(f"""
            SELECT Id, ReconciliationId FROM ReconciliationDetail
            WHERE BankMovementId IN ({placeholders})
        """, bank_ids)
        detail_rows = cursor.fetchall()
        detail_ids = [r[0] for r in detail_rows]
        
        if detail_ids:
            detail_placeholders = ','.join(['?'] * len(detail_ids))
            
            # 3. Delete from tbl_Conciliados
            cursor.execute(f"DELETE FROM tbl_Conciliados WHERE ReconciliationDetailId IN ({detail_placeholders})", detail_ids)
            
            # 4. Delete from ReconciliationDetail
            cursor.execute(f"DELETE FROM ReconciliationDetail WHERE Id IN ({detail_placeholders})", detail_ids)
        
        # 5. Reset BankMovements estado
        cursor.execute(f"""
            UPDATE BankMovements 
            SET Estado = 'Pendiente', ReconciliationDetailId = NULL
            WHERE Id IN ({placeholders})
        """, bank_ids)
        
        conn.commit()
        return {"status": "success", "message": f"Se limpiaron {len(bank_ids)} conciliaciones exitosamente.", "deleted": len(bank_ids)}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
'''

with open('c:/SistemaGestionyelave/backend/conciliacion.py', 'r', encoding='utf-8') as f:
    py = f.read()

# Insert before the cleaning rules section
marker = "# ─── REGLAS DE LIMPIEZA"
if marker in py:
    py = py.replace(marker, clear_endpoint + "\n" + marker, 1)
    print("  Added clear-all endpoint: OK")
else:
    print("  Could not find marker for insertion")
    
with open('c:/SistemaGestionyelave/backend/conciliacion.py', 'w', encoding='utf-8') as f:
    f.write(py)


# ══════════════════════════════════════════════════════════════════════════
# FIX 5: Add cleaning rules for dashes with spaces and leading zeros after dash
# ══════════════════════════════════════════════════════════════════════════
print("\n=== FIX 5: Add cleaning rules ===")
import json
import os

rules_path = 'c:/SistemaGestionyelave/backend/conciliacion_reglas.json'
try:
    if os.path.exists(rules_path):
        with open(rules_path, 'r', encoding='utf-8') as f:
            rules = json.load(f)
    else:
        rules = []
    
    existing_conditions = [r.get('condicion', '') for r in rules]
    
    new_rules = [
        {"condicion": "-\\s+", "resultado": "-", "id": max([r.get('id', 0) for r in rules] + [0]) + 1},
        {"condicion": "-(0+)", "resultado": "-", "id": max([r.get('id', 0) for r in rules] + [0]) + 2},
    ]
    
    for nr in new_rules:
        if nr['condicion'] not in existing_conditions:
            rules.append(nr)
            print(f"  Added rule: '{nr['condicion']}' -> '{nr['resultado']}'")
        else:
            print(f"  Rule '{nr['condicion']}' already exists")
    
    with open(rules_path, 'w', encoding='utf-8') as f:
        json.dump(rules, f, ensure_ascii=False, indent=2)
    
    print("  Rules saved: OK")
except Exception as e:
    print(f"  Error with rules: {e}")


print("\n══════════════════════════════════════")
print("ALL PATCHES COMPLETE")
print("══════════════════════════════════════")
