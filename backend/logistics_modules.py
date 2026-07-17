from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from database import get_db_connection

router = APIRouter(prefix="/api/logistics", tags=["Logistics Extensions"])

# ─────────────────────────────────────────────────────────────
# 1. REQUERIMIENTOS (CmpVRequ / CmpDRequ)
# ─────────────────────────────────────────────────────────────
@router.get("/requirements")
def get_requirements(codcia: str = Query("01")):
    """Obtener lista de requerimientos."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT RTRIM(nrodoc) as nrodoc, fchdoc, RTRIM(Glodoc) as glodoc, 
                   RTRIM(NomPed) as nomped, RTRIM(Usuario) as usuario, RTRIM(flgest) as estado
            FROM CmpVRequ
            WHERE RTRIM(codcia) = ?
            ORDER BY fchdoc DESC, nrodoc DESC
        """, (codcia,))
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/requirements/{nrodoc}")
def get_requirement_details(nrodoc: str, codcia: str = Query("01")):
    """Obtener detalle de un requerimiento específico."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT nroitm, RTRIM(Codmat) as codmat, RTRIM(DesMat) as desmat, 
                   RTRIM(UndStk) as undstk, Stock as stock, PreUni as preuni, ImpTot as imptot
            FROM CmpDRequ WITH (NOLOCK)
            WHERE RTRIM(Codcia) = ? AND RTRIM(nrodoc) = ?
            ORDER BY nroitm
        """, (codcia, nrodoc))
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ─────────────────────────────────────────────────────────────
# 2. FÓRMULAS (formula / dformula)
# ─────────────────────────────────────────────────────────────
@router.get("/formulas")
def get_formulas():
    """Obtener maestro de fórmulas."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT RTRIM(codlin) as codlin, RTRIM(deslin) as deslin, canprod, RTRIM(NOMPROD) as nomprod FROM formula ORDER BY codlin")
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/formulas/{codlin}")
def get_formula_details(codlin: str):
    """Obtener componentes de una fórmula."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT RTRIM(codmat) as codmat, RTRIM(desmat) as desmat, 
                   RTRIM(undstk) as undstk, porpar, canpar, ITM
            FROM dformula 
            WHERE RTRIM(codlin) = ?
            ORDER BY ITM
        """, (codlin,))
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ─────────────────────────────────────────────────────────────
# 3. MOTOR DE CÁLCULO AUTOMÁTICO
# ─────────────────────────────────────────────────────────────
class CalcRequest(BaseModel):
    codlin: str
    cantidad_producir: float
    codcia: str = "01"
    almcen: str = "01"

@router.post("/calculate-needs")
def calculate_needs(req: CalcRequest):
    """
    Calcula la necesidad de insumos cruzando receta vs stock por lote.
    Retorna lista de comprasugerida.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        # 1. Obtener receta base
        cursor.execute("SELECT canprod FROM formula WHERE RTRIM(codlin)=?", (req.codlin,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Fórmula no encontrada")
        
        base_yield = float(row.canprod or 1)
        multiplier = req.cantidad_producir / base_yield

        # 2. Obtener insumos requeridos
        cursor.execute("""
            SELECT RTRIM(codmat) as codmat, RTRIM(desmat) as desmat, 
                   RTRIM(undstk) as undstk, canpar 
            FROM dformula WHERE RTRIM(codlin)=?
        """, (req.codlin,))
        
        requirements = []
        for d in cursor.fetchall():
            req_qty = float(d.canpar or 0) * multiplier
            requirements.append({
                "codmat": d.codmat,
                "desmat": d.desmat,
                "undstk": d.undstk,
                "req_qty": req_qty
            })

        # 3. Cruzar con Stock (AlmAcmLt)
        results = []
        for item in requirements:
            cursor.execute("""
                SELECT SUM(candes) as stock_total 
                FROM AlmAcmLt 
                WHERE RTRIM(codcia)=? AND RTRIM(almcen)=? AND RTRIM(codmat)=?
            """, (req.codcia, req.almcen, item["codmat"]))
            
            stk_row = cursor.fetchone()
            stock_total = float(stk_row.stock_total or 0) if stk_row else 0
            
            faltante = item["req_qty"] - stock_total
            if faltante < 0: 
                faltante = 0

            results.append({
                "codmat": item["codmat"],
                "desmat": item["desmat"],
                "undstk": item["undstk"],
                "req_qty": item["req_qty"],
                "stock_total": stock_total,
                "faltante_comprar": faltante
            })
            
        return {"codlin": req.codlin, "multiplier": multiplier, "needs": results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ─────────────────────────────────────────────────────────────
# 4. COMPRAS (COTIZACIONES)
# ─────────────────────────────────────────────────────────────
class QuoteItem(BaseModel):
    codmat: str
    desmat: str
    undstk: str
    cantidad: float
    preuni: float

class QuoteCreate(BaseModel):
    codcia: str = "01"
    nroreq: str
    prov_ruc: str
    prov_nom: str
    moneda: str = "PEN"
    condicion_pago: str
    tiempo_entrega: str
    items: List[QuoteItem]

@router.post("/quotes")
def create_quote(quote: QuoteCreate):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        # Insert header
        cursor.execute("""
            INSERT INTO Log_CmpVCoti (CodCia, NroReq, Prov_RUC, Prov_Nom, Moneda, CondicionPago, TiempoEntrega, Estado, Usuario)
            OUTPUT INSERTED.IdCoti
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', 'admin')
        """, (quote.codcia, quote.nroreq, quote.prov_ruc, quote.prov_nom, quote.moneda, quote.condicion_pago, quote.tiempo_entrega))
        
        id_coti = cursor.fetchone()[0]
        
        # Insert detail
        for i, item in enumerate(quote.items):
            impigv = (item.cantidad * item.preuni) * 0.18
            imptot = (item.cantidad * item.preuni) + impigv
            cursor.execute("""
                INSERT INTO Log_CmpRCoti (IdCoti, NroItm, CodMat, DesMat, UndStk, Cantidad, PreUni, PorIgv, ImpIgv, ImpTot)
                VALUES (?, ?, ?, ?, ?, ?, ?, 18, ?, ?)
            """, (id_coti, i+1, item.codmat, item.desmat, item.undstk, item.cantidad, item.preuni, impigv, imptot))
            
        # Update total header
        cursor.execute("""
            UPDATE Log_CmpVCoti 
            SET ImpNet = (SELECT SUM(Cantidad*PreUni) FROM Log_CmpRCoti WHERE IdCoti=?),
                ImpIgv = (SELECT SUM(ImpIgv) FROM Log_CmpRCoti WHERE IdCoti=?),
                ImpTot = (SELECT SUM(ImpTot) FROM Log_CmpRCoti WHERE IdCoti=?)
            WHERE IdCoti = ?
        """, (id_coti, id_coti, id_coti, id_coti))
        
        conn.commit()
        return {"status": "success", "id_coti": id_coti}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/quotes")
def get_quotes():
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM Log_CmpVCoti ORDER BY FchDoc DESC")
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ─────────────────────────────────────────────────────────────
# 5. APROBACIONES
# ─────────────────────────────────────────────────────────────
class ApprovalAction(BaseModel):
    doc_tipo: str # 'COTI', 'REQ', 'OC'
    doc_id: str
    nivel: str # 'JEFATURA', 'GERENCIA'
    estado: str # 'APROBADO', 'RECHAZADO'
    comentario: str = ""
    usuario: str = "admin"

@router.post("/approvals")
def process_approval(action: ApprovalAction):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO Log_Aprobaciones (DocTipo, DocId, Nivel, Estado, Usuario, Comentario)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (action.doc_tipo, action.doc_id, action.nivel, action.estado, action.usuario, action.comentario))
        
        # Simple logical update
        if action.doc_tipo == 'COTI':
            cursor.execute("UPDATE Log_CmpVCoti SET Estado = ? WHERE IdCoti = ?", (action.estado, action.doc_id))
            
        conn.commit()
        return {"status": "success", "message": f"{action.doc_tipo} {action.estado}"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/approvals")
def get_approvals():
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM Log_Aprobaciones ORDER BY Fecha DESC")
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ─────────────────────────────────────────────────────────────
# 8. CONTROL DE CALIDAD
# ─────────────────────────────────────────────────────────────
class QCRecord(BaseModel):
    nrolote: str
    codmat: str
    estado: str # 'APROBADO', 'RECHAZADO'
    comentario: str = ""
    usuario: str = "admin"

@router.post("/qc")
def register_qc(qc: QCRecord):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO Log_ControlCalidad (NroLote, CodMat, Estado, Usuario, Comentario)
            VALUES (?, ?, ?, ?, ?)
        """, (qc.nrolote, qc.codmat, qc.estado, qc.usuario, qc.comentario))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/qc")
def get_qc():
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM Log_ControlCalidad ORDER BY FechaEval DESC")
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ─────────────────────────────────────────────────────────────
# 10. DASHBOARD KPIs
# ─────────────────────────────────────────────────────────────
@router.get("/dashboard/kpis")
def get_dashboard_kpis(codcia: str = Query("01")):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        
        # 1. Total Pending Req
        cursor.execute("SELECT COUNT(*) FROM CmpVRequ WHERE RTRIM(codcia)=? AND flgest='0'", (codcia,))
        req_pendientes = cursor.fetchone()[0]
        
        # 2. Total Pending OC
        cursor.execute("SELECT COUNT(*) FROM CmpVOcom WHERE RTRIM(codcia)=? AND flgest='0'", (codcia,))
        oc_pendientes = cursor.fetchone()[0]
        
        # 3. Stock Critico (stkact <= stkmin) - reading from AlmmMatg
        cursor.execute("SELECT COUNT(*) FROM AlmmMatg WHERE RTRIM(codcia)=? AND stkact <= stkmin AND stkmin > 0", (codcia,))
        stock_critico = cursor.fetchone()[0]
        
        # 4. Total Active Formulas
        cursor.execute("SELECT COUNT(*) FROM formula")
        total_formulas = cursor.fetchone()[0]
        
        return {
            "requerimientos_pendientes": req_pendientes,
            "ordenes_pendientes": oc_pendientes,
            "stock_critico": stock_critico,
            "total_formulas": total_formulas
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ─────────────────────────────────────────────────────────────
# 9. KARDEX (MOVIMIENTOS)
# ─────────────────────────────────────────────────────────────
@router.get("/kardex/{codmat}")
def get_kardex(codmat: str, codcia: str = Query("01")):
    """Obtener historial de movimientos (Kardex) de un material y su stock actual."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        
        # Current Stock
        cursor.execute("""
            SELECT SUM(candes) as stock_actual 
            FROM AlmAcmLt 
            WHERE RTRIM(codcia)=? AND RTRIM(codmat)=?
        """, (codcia, codmat))
        stk_row = cursor.fetchone()
        stock_actual = float(stk_row.stock_actual or 0) if stk_row else 0
        
        # Movements History
        cursor.execute("""
            SELECT fchdoc, RTRIM(tipmov) as tipmov, RTRIM(nrodoc) as nrodoc, candes, preuni, imptot
            FROM AlmRMovm
            WHERE RTRIM(codcia)=? AND RTRIM(codmat)=?
            ORDER BY fchdoc DESC, nrodoc DESC
        """, (codcia, codmat))
        
        movs = []
        for row in cursor.fetchall():
            movs.append({
                "fchdoc": row.fchdoc.strftime("%Y-%m-%d") if row.fchdoc else None,
                "tipmov": "INGRESO" if row.tipmov == 'I' else "SALIDA",
                "nrodoc": row.nrodoc,
                "cantidad": float(row.candes or 0),
                "precio": float(row.preuni or 0),
                "total": float(row.imptot or 0)
            })
            
        return {"stock_actual": stock_actual, "movimientos": movs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
