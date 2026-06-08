"""
Módulo de Historial de Cancelaciones de Ventas
Consulta de CcbMVtos (detalles de cobros) vinculados a CcbRGdoc (comprobantes de ventas)
y CcbICaja (cajas de cobro).
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from datetime import datetime
from database import get_db_connection

router = APIRouter(prefix="/api/historial-cancelaciones", tags=["Historial de Cancelaciones"])

def _row_to_dict(cursor, row):
    """Convert a pyodbc row to a dict, trimming strings and formatting dates."""
    columns = [col[0] for col in cursor.description]
    result = {}
    for col, val in zip(columns, row):
        if isinstance(val, datetime):
            result[col] = val.strftime("%Y-%m-%d")
        elif val is None:
            result[col] = None
        elif isinstance(val, str):
            result[col] = val.strip()
        else:
            result[col] = val
    return result

# Mapping tpopgo to JT (Payment Type Description)
tpopgo_map = {
    '1': 'FILIAL CANCELA',
    '2': 'PERSONAL',
    '3': 'AMERICAN EXPRES',
    '4': 'EPS',
    '5': 'DINERS',
    'C': 'CHEQUE',
    'D': 'DEPOSITO',
    'E': 'EFECTIVO',
    'M': 'MASTERCAR',
    'R': 'RETENCION',
    'A': 'ANTICIPO APLICACION',
    'B': 'ANTICIPO CREACION',
    'F': 'FILIAL DEPOSITO',
    'Z': 'IZIPAY'
}

# ─── Endpoints ────────────────────────────────────────────────────

@router.get("/empresas")
def get_empresas():
    """Lista las empresas registradas en AdmMcias."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Connection Error")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT codcia, nomcia, ruccia FROM AdmMcias ORDER BY codcia")
        return [_row_to_dict(cursor, r) for r in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/report")
def get_report(
    codcia: str = Query(..., description="Códigos de empresa separados por coma"),
    fecha_inicio: str = Query(..., description="Fecha inicio YYYY-MM-DD"),
    fecha_fin: str = Query(..., description="Fecha fin YYYY-MM-DD"),
):
    """
    Obtiene el reporte detallado del historial de cancelaciones.
    Soporta multiselección de empresas.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Connection Error")
    try:
        cursor = conn.cursor()
        
        # Procesar empresas
        codcias = [c.strip() for c in codcia.split(",") if c.strip()]
        if not codcias:
            raise HTTPException(status_code=400, detail="Debe especificar al menos una empresa.")
            
        placeholders = ",".join("?" for _ in codcias)
        
        query = f"""
            SELECT 
                m.CodCia, m.coddoc, m.nrodoc, m.nroitm, m.fchdoc as fchcan,
                m.codaux, RTRIM(m.NomAux) as NomAux, m.codven, RTRIM(m.nomven) as nomven,
                m.codmon as mon_pago, m.tpocmb as tc_pago,
                m.codref, m.nroref, m.import as imp_pago,
                m.glodoc, m.fmapgo, m.codbco, m.NroDep, m.fchDep, m.tpopgo,
                r.fchdoc as fchdoc_ref, r.codmon as mon_doc, r.imptot as imp_doc, r.tpocmb as tc_doc,
                h.glodoc as glodoc_caja
            FROM CcbMVtos m
            LEFT OUTER JOIN CcbICaja h
               ON m.CodCia = h.codcia
              AND m.coddoc = h.coddoc
              AND m.nrodoc = h.nrodoc
            INNER JOIN CcbRGdoc r
               ON m.CodCia = r.codcia
              AND m.codref = r.coddoc
              AND m.nroref = r.nrodoc
            WHERE m.CodCia IN ({placeholders})
              AND m.fchdoc >= CONVERT(datetime, ?, 120)
              AND m.fchdoc <= CONVERT(datetime, ?, 120)
              AND m.FlgEst <> 'E'
            ORDER BY m.fchdoc DESC, m.nrodoc DESC, m.nroitm ASC
        """
        
        # Build params list
        params = list(codcias) + [fecha_inicio, fecha_fin]
        cursor.execute(query, params)
        rows = [_row_to_dict(cursor, r) for r in cursor.fetchall()]
        
        # Enrich and compute multi-currency squaring
        enriched = []
        for r in rows:
            mon_pago = int(float(r.get("mon_pago") or 1))
            mon_doc = int(float(r.get("mon_doc") or 1))
            imp_pago = float(r.get("imp_pago") or 0)
            tc_pago = float(r.get("tc_pago") or 0)
            tc_doc = float(r.get("tc_doc") or 0)
            
            # Safe exchange rate mapping
            tc = tc_pago if tc_pago > 0 else (tc_doc if tc_doc > 0 else 1.0)
            
            # Compute cancellation amount in original document's currency
            if mon_doc == mon_pago:
                imp_cancel_doc = imp_pago
            elif mon_doc == 2 and mon_pago == 1:
                # Invoice is Dollars, payment is Soles
                imp_cancel_doc = imp_pago / tc
            else:
                # Invoice is Soles, payment is Dollars
                imp_cancel_doc = imp_pago * tc
                
            # Map payment type code to description
            tp_code = r.get("tpopgo") or ""
            r["jt"] = tpopgo_map.get(tp_code, "CANJE")
            if tp_code == '1':
                codcom = r.get("CodCom") or ""
                if codcom:
                    r["jt"] = f"FILIAL CANCELA ({codcom})"
            
            r["imp_cancel_doc"] = round(imp_cancel_doc, 2)
            r["imp_pago"] = round(imp_pago, 2)
            r["imp_doc"] = round(float(r.get("imp_doc") or 0), 2)
            r["tc_pago"] = round(tc_pago, 4)
            r["tc_doc"] = round(tc_doc, 4)
            r["mon_pago"] = mon_pago
            r["mon_doc"] = mon_doc
            
            enriched.append(r)
            
        # Get company names
        cursor.execute(f"SELECT codcia, nomcia, ruccia FROM AdmMcias WHERE codcia IN ({placeholders})", codcias)
        emp_rows = cursor.fetchall()
        emp_text = "Varias Empresas"
        if len(emp_rows) == 1:
            emp_text = (emp_rows[0][1] or "").strip()
        elif len(emp_rows) > 1:
            emp_text = f"Múltiples Empresas ({len(emp_rows)})"
            
        empresa_info = {
            "codcia": codcia,
            "nomcia": emp_text,
            "empresas": [{"codcia": (e[0] or "").strip(), "nomcia": (e[1] or "").strip(), "ruccia": (e[2] or "").strip()} for e in emp_rows]
        }
        
        return {
            "empresa": empresa_info,
            "fecha_inicio": fecha_inicio,
            "fecha_fin": fecha_fin,
            "total_registros": len(enriched),
            "data": enriched
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/summary")
def get_summary(
    codcia: str = Query(...),
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
):
    """
    KPIs y resúmenes agregados para los gráficos del historial de cancelaciones.
    """
    report = get_report(codcia, fecha_inicio, fecha_fin)
    data = report["data"]
    
    if not data:
        return {
            "total_pago_pen": 0.0,
            "total_pago_usd": 0.0,
            "total_docs": 0,
            "by_tipo_pago": [],
            "by_vendedor": [],
            "by_moneda_pago": [],
            "by_mes": []
        }
        
    total_pago_pen = 0.0
    total_pago_usd = 0.0
    
    by_tp = {}
    by_vend = {}
    by_mon = {}
    by_m = {}
    
    for r in data:
        mon_pago = r.get("mon_pago")
        imp_pago = r.get("imp_pago") or 0.0
        
        if mon_pago == 1:
            total_pago_pen += imp_pago
        else:
            total_pago_usd += imp_pago
            
        # Group by Payment Type (jt)
        jt = r.get("jt") or "OTRO"
        by_tp[jt] = by_tp.get(jt, 0.0) + imp_pago
        
        # Group by Vendor
        vend = r.get("nomven") or "(Sin Vendedor)"
        by_vend[vend] = by_vend.get(vend, 0.0) + imp_pago
        
        # Group by Currency
        mon_label = "SOLES (PEN)" if mon_pago == 1 else "DÓLARES (USD)"
        by_mon[mon_label] = by_mon.get(mon_label, 0.0) + imp_pago
        
        # Group by Month of cancellation
        fch = r.get("fchcan") or ""
        mes = fch[:7] if len(fch) >= 7 else "Sin Fecha"
        by_m[mes] = by_m.get(mes, 0.0) + imp_pago

    # Format helpers
    def dict_to_sorted_list(d):
        lst = [{"label": k, "value": round(v, 2)} for k, v in d.items()]
        return sorted(lst, key=lambda x: -x["value"])
        
    return {
        "total_pago_pen": round(total_pago_pen, 2),
        "total_pago_usd": round(total_pago_usd, 2),
        "total_docs": len(data),
        "by_tipo_pago": dict_to_sorted_list(by_tp),
        "by_vendedor": dict_to_sorted_list(by_vend),
        "by_moneda_pago": dict_to_sorted_list(by_mon),
        "by_mes": sorted([{"label": k, "value": round(v, 2)} for k, v in by_m.items()], key=lambda x: x["label"])
    }


@router.get("/caja/detail")
def get_caja_detail(
    codcia: str = Query(...),
    coddoc: str = Query(...),
    nrodoc: str = Query(...)
):
    """
    Obtiene el detalle completo de una caja/planilla de cobranza agrupado,
    con información de la cabecera (CcbICaja) y del cliente/vendedor.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Connection Error")
    try:
        cursor = conn.cursor()
        
        # 1. Get Company details
        cursor.execute("SELECT nomcia, ruccia FROM AdmMcias WHERE codcia = ?", (codcia,))
        company_row = cursor.fetchone()
        company_name = (company_row[0] or "").strip() if company_row else "YELAVE INDUSTRIAS S.A.C."
        company_ruc = (company_row[1] or "").strip() if company_row else ""
        
        # 2. Get Caja/Planilla header (CcbICaja)
        cursor.execute("""
            SELECT fchdoc, flgest, glodoc, nombco
            FROM CcbICaja
            WHERE codcia = ? AND coddoc = ? AND nrodoc = ?
        """, (codcia, coddoc, nrodoc))
        header_row = cursor.fetchone()
        
        caja_date = None
        caja_status = "P" # Default
        caja_glosa = ""
        caja_nombco = ""
        
        if header_row:
            caja_date = header_row[0].strftime("%Y-%m-%d") if header_row[0] else None
            caja_status = (header_row[1] or "P").strip()
            caja_glosa = (header_row[2] or "").strip()
            caja_nombco = (header_row[3] or "").strip()

        # 3. Get all payment details from CcbMVtos
        query = """
            SELECT 
                m.CodCia, m.coddoc, m.nrodoc, m.nroitm, m.fchdoc as fchcan,
                m.codaux, RTRIM(m.NomAux) as NomAux, m.codven, RTRIM(m.nomven) as nomven,
                m.codmon as mon_pago, m.tpocmb as tc_pago,
                m.codref, m.nroref, m.import as imp_pago,
                m.glodoc, m.fmapgo, m.codbco, m.NroDep, m.fchDep, m.tpopgo, m.usuario, m.CodDep, m.CodCom,
                r.fchdoc as fchdoc_ref, r.codmon as mon_doc, r.imptot as imp_doc, r.tpocmb as tc_doc,
                COALESCE(p.DESTARJ, t.Nombre) as GroupName
            FROM CcbMVtos m
            LEFT OUTER JOIN CcbRGdoc r
               ON m.CodCia = r.codcia
              AND m.codref = r.coddoc
              AND m.nroref = r.nrodoc
            OUTER APPLY (
                SELECT TOP 1 t2.Nombre 
                FROM CcbTabla t2 
                WHERE RTRIM(m.CodDep) = RTRIM(t2.Codigo) 
                AND t2.Tabla = '0001'
                AND t2.CodCia = CASE WHEN m.tpopgo = '1' THEN m.CodCom ELSE m.CodCia END
            ) t
            LEFT JOIN POSTARJE p ON RTRIM(m.CodDep) = RTRIM(p.codtarj) AND p.CODcia = CASE WHEN m.tpopgo = '1' THEN m.CodCom ELSE m.CodCia END
            WHERE m.CodCia = ? AND m.coddoc = ? AND m.nrodoc = ? AND m.FlgEst <> 'E'
            ORDER BY m.tpopgo, COALESCE(p.DESTARJ, t.Nombre), m.nroitm
        """
        cursor.execute(query, (codcia, coddoc, nrodoc))
        rows = [_row_to_dict(cursor, r) for r in cursor.fetchall()]
        
        # Enrich detail rows
        enriched_details = []
        for r in rows:
            mon_pago = int(float(r.get("mon_pago") or 1))
            mon_doc = int(float(r.get("mon_doc") or 1))
            imp_pago = float(r.get("imp_pago") or 0)
            tc_pago = float(r.get("tc_pago") or 0)
            tc_doc = float(r.get("tc_doc") or 0)
            
            tc = tc_pago if tc_pago > 0 else (tc_doc if tc_doc > 0 else 1.0)
            
            # Compute cancellation amount in original document's currency
            if mon_doc == mon_pago:
                imp_cancel_doc = imp_pago
            elif mon_doc == 2 and mon_pago == 1:
                imp_cancel_doc = imp_pago / tc
            else:
                imp_cancel_doc = imp_pago * tc
                
            # Map payment type code to description
            tp_code = r.get("tpopgo") or ""
            r["jt"] = tpopgo_map.get(tp_code, "CANJE")
            if tp_code == '1':
                codcom = r.get("CodCom") or ""
                if codcom:
                    r["jt"] = f"FILIAL CANCELA ({codcom})"
                    
            r["imp_cancel_doc"] = round(imp_cancel_doc, 2)
            r["imp_pago"] = round(imp_pago, 2)
            r["imp_doc"] = round(float(r.get("imp_doc") or 0), 2)
            r["tc_pago"] = round(tc_pago, 4)
            r["tc_doc"] = round(tc_doc, 4)
            r["mon_pago"] = mon_pago
            r["mon_doc"] = mon_doc
            
            # Clean bank/POS/glosa strings
            group_name = r.get("GroupName") or ""
            if group_name:
                group_name = group_name.replace("DLARES", "DÓLARES").replace("CRDITO", "CRÉDITO").replace("N ", "N° ")
                r["GroupName"] = group_name.strip()
            else:
                r["GroupName"] = "VARIOS"
                
            # If no fchdoc_ref is found, default to payment fchcan
            if not r.get("fchdoc_ref"):
                r["fchdoc_ref"] = r.get("fchcan")
                
            # Reconciled status check (check if linked in ReconciliationDetail)
            cursor.execute("""
                SELECT TOP 1 1 
                FROM ReconciliationDetail 
                WHERE MatchCodCia = ? AND MatchCoddoc = ? AND MatchNrodoc = ? AND MatchNroitm = ?
            """, (codcia, r.get("coddoc"), r.get("nrodoc"), r.get("nroitm")))
            reconciled = cursor.fetchone() is not None
            r["estado_conciliado"] = "Conc." if reconciled else "Pend."
            
            enriched_details.append(r)
            
        # If there's no header row in CcbICaja, try to set a fallback date from the first detail row
        if not caja_date and enriched_details:
            caja_date = enriched_details[0].get("fchcan")
            caja_glosa = enriched_details[0].get("glodoc")
            
        return {
            "caja": {
                "codcia": codcia,
                "nomcia": company_name,
                "ruccia": company_ruc,
                "coddoc": coddoc,
                "nrodoc": nrodoc,
                "fchdoc": caja_date,
                "flgest": caja_status,
                "glodoc": (caja_glosa or "").replace("N ", "N° "),
                "nombco": caja_nombco
            },
            "detalles": enriched_details
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

