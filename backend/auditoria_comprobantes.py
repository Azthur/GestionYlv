"""
Módulo de Auditoría de Comprobantes (Ventas y Guías de Remisión)
Visualización y trazabilidad de comprobantes emitidos frente a Sunat.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from datetime import datetime
from database import get_db_connection
from decimal import Decimal

router = APIRouter(prefix="/api/auditoria-comprobantes", tags=["Auditoría de Comprobantes"])

def _row_to_dict(cursor, row):
    """Convert a pyodbc row to a dict, trimming strings, decimals and formatting dates."""
    columns = [col[0] for col in cursor.description]
    result = {}
    for col, val in zip(columns, row):
        if isinstance(val, datetime):
            result[col] = val.strftime("%Y-%m-%d %H:%M:%S") if val.hour > 0 or val.minute > 0 else val.strftime("%Y-%m-%d")
        elif val is None:
            result[col] = None
        elif isinstance(val, str):
            result[col] = val.strip()
        elif isinstance(val, Decimal):
            result[col] = float(val)
        else:
            result[col] = val
    return result

@router.get("/ventas")
def get_ventas(
    codcia: str = Query(..., description="Código de empresa"),
    year: str = Query(..., description="Año de consulta"),
    month: str = Query(..., description="Mes de consulta (dos dígitos, ej: 05)"),
):
    """
    Obtiene el reporte detallado de Ventas (Boletas, Facturas, Notas de Crédito).
    Se vincula con fac_electronica2 para detracción y datos de SUNAT.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")
    try:
        cursor = conn.cursor()
        query = """
            SELECT 
                c.codcia, c.coddoc, RTRIM(c.nrodoc) as nrodoc, c.fchdoc, 
                RTRIM(c.codaux) as codaux, RTRIM(c.nomaux) as nomaux, RTRIM(c.rucaux) as rucaux,
                c.codmon, c.tpocmb, 
                CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -c.impbto ELSE c.impbto END as impbto,
                CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -c.impnet ELSE c.impnet END as impnet,
                CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -c.impigv ELSE c.impigv END as impigv,
                CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -c.imptot ELSE c.imptot END as imptot,
                c.sdodoc,
                c.flgest, RTRIM(c.nroped) as nroped, RTRIM(c.nroref) as nroref,
                fe.detrac, fe.URL as URL, fe.UUID as UUID, fe.RESPUESTA as RESPUESTA
            FROM CcbRGdoc c
            LEFT OUTER JOIN fac_electronica2 fe 
                ON c.codcia = fe.codcia 
               AND c.coddoc = fe.coddoc 
               AND c.nrodoc = fe.nrodoc
            WHERE c.codcia = ? 
              AND c.anos = ? 
              AND c.mes = ? 
              AND RTRIM(c.coddoc) IN ('FACT', 'BOLE', 'N/A', 'N/C', 'N/CR')
              AND c.flgest IS NOT NULL
            ORDER BY c.fchdoc DESC, c.nrodoc DESC
        """
        cursor.execute(query, (codcia, year, month))
        rows = [_row_to_dict(cursor, r) for r in cursor.fetchall()]
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/guias")
def get_guias(
    codcia: str = Query(..., description="Código de empresa"),
    year: str = Query(..., description="Año de consulta"),
    month: str = Query(..., description="Mes de consulta (dos dígitos, ej: 05)"),
):
    """
    Obtiene el reporte detallado de Guías de Remisión.
    Se vincula con GRE_electronica2 para respuesta de SUNAT y URL.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")
    try:
        cursor = conn.cursor()
        query = """
            SELECT 
                g.codcia, g.coddoc, RTRIM(g.nrodoc) as nrodoc, g.fchdoc,
                RTRIM(g.codaux) as codaux, RTRIM(g.nomaux) as nomaux, RTRIM(g.rucaux) as rucaux,
                RTRIM(g.ptopar) as ptopar, RTRIM(g.ptolle) as ptolle,
                RTRIM(g.codtra) as codtra, RTRIM(g.nomtra) as nomtra,
                RTRIM(g.nrovehi) as nrovehi, RTRIM(g.nomcho) as nomcho, RTRIM(g.dni) as dni,
                RTRIM(g.codfac) as codfac, RTRIM(g.nrofac) as nrofac, RTRIM(g.nroped) as nroped,
                g.flgest,
                gre.url as url, gre.RESULTADO as RESULTADO, gre.RESPUESTA as RESPUESTA
            FROM VtaVGuia g
            LEFT OUTER JOIN GRE_electronica2 gre
                ON g.codcia = gre.CODCIA
               AND g.coddoc = gre.CODdoc
               AND g.nrodoc = gre.nroGUIA
            WHERE g.codcia = ?
              AND g.anos = ?
              AND g.mes = ?
              AND g.coddoc = 'G/R '
              AND g.flgest IS NOT NULL
            ORDER BY g.fchdoc DESC, g.nrodoc DESC
        """
        cursor.execute(query, (codcia, year, month))
        rows = [_row_to_dict(cursor, r) for r in cursor.fetchall()]
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/ventas/detail")
def get_venta_detail(
    coddoc: str = Query(..., description="Código de documento"),
    nrodoc: str = Query(..., description="Número de documento"),
    codcia: str = Query(..., description="Código de empresa")
):
    """
    Obtiene el detalle completo de una venta, incluyendo cabecera con SUNAT e ítems.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")
    try:
        cursor = conn.cursor()
        # 1. Cabecera
        header_query = """
            SELECT 
                c.*, 
                fe.detrac, fe.URL as URL, fe.UUID as UUID, fe.RESPUESTA as RESPUESTA
            FROM CcbRGdoc c
            LEFT OUTER JOIN fac_electronica2 fe 
                ON c.codcia = fe.codcia 
               AND c.coddoc = fe.coddoc 
               AND c.nrodoc = fe.nrodoc
            WHERE c.codcia = ? AND c.coddoc = ? AND c.nrodoc = ?
        """
        cursor.execute(header_query, (codcia, coddoc, nrodoc))
        header_row = cursor.fetchone()
        if not header_row:
            raise HTTPException(status_code=404, detail="Comprobante de venta no encontrado")
        header = _row_to_dict(cursor, header_row)

        # 2. Detalles (Items)
        items_query = """
            SELECT * FROM VtaRItem
            WHERE CodCia = ? AND coddoc = ? AND nrodoc = ?
            ORDER BY nroitm
        """
        cursor.execute(items_query, (codcia, coddoc, nrodoc))
        items = [_row_to_dict(cursor, r) for r in cursor.fetchall()]

        return {
            "header": header,
            "items": items
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/ventas/payments")
def get_venta_payments(
    coddoc: str = Query(..., description="Código de documento de la venta (ej: FACT, BOLE, N/C)"),
    nrodoc: str = Query(..., description="Número de documento"),
    codcia: str = Query(..., description="Código de empresa")
):
    """
    Obtiene el saldo pendiente y el historial de pagos/cancelaciones de un comprobante de venta.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")
    try:
        cursor = conn.cursor()
        
        # 1. Obtener datos del documento principal (saldo pendiente, total, moneda, cliente)
        doc_query = """
            SELECT 
                c.codcia, c.coddoc, RTRIM(c.nrodoc) as nrodoc, c.fchdoc, 
                RTRIM(c.codaux) as codaux, RTRIM(c.nomaux) as nomaux,
                c.codmon as mon_doc, c.tpocmb as tc_doc,
                CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -c.imptot ELSE c.imptot END as imptot,
                CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -c.sdodoc ELSE c.sdodoc END as sdodoc,
                c.flgest
            FROM CcbRGdoc c
            WHERE c.codcia = ? AND c.coddoc = ? AND c.nrodoc = ?
        """
        cursor.execute(doc_query, (codcia, coddoc, nrodoc))
        doc_row = cursor.fetchone()
        if not doc_row:
            raise HTTPException(status_code=404, detail="Comprobante de venta no encontrado")
        doc_data = _row_to_dict(cursor, doc_row)
        
        # 2. Obtener el historial de pagos en CcbMVtos
        payments_query = """
            SELECT 
                m.coddoc, m.nrodoc, m.nroitm, m.fchdoc as fchcan,
                m.codmon as mon_pago, m.tpocmb as tc_pago,
                m.import as imp_pago, m.glodoc, m.tpopgo,
                m.codbco, m.NroDep, m.fchDep,
                h.glodoc as glodoc_caja
            FROM CcbMVtos m
            LEFT OUTER JOIN CcbICaja h
               ON m.CodCia = h.codcia
              AND m.coddoc = h.coddoc
              AND m.nrodoc = h.nrodoc
            WHERE m.CodCia = ?
              AND m.codref = ?
              AND m.nroref = ?
              AND m.FlgEst <> 'E'
            ORDER BY m.fchdoc DESC, m.nrodoc DESC, m.nroitm ASC
        """
        cursor.execute(payments_query, (codcia, coddoc, nrodoc))
        payment_rows = [_row_to_dict(cursor, r) for r in cursor.fetchall()]
        
        # Mapping tpopgo to Description
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
        
        enriched = []
        total_pagado_doc = 0.0
        
        mon_doc = int(float(doc_data.get("mon_doc") or 1))
        
        for r in payment_rows:
            mon_pago = int(float(r.get("mon_pago") or 1))
            imp_pago = float(r.get("imp_pago") or 0)
            tc_pago = float(r.get("tc_pago") or 0)
            tc_doc = float(doc_data.get("tc_doc") or 1.0)
            
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
            r["imp_cancel_doc"] = round(imp_cancel_doc, 2)
            r["imp_pago"] = round(imp_pago, 2)
            r["tc_pago"] = round(tc_pago, 4)
            r["mon_pago"] = mon_pago
            
            total_pagado_doc += imp_cancel_doc
            enriched.append(r)
            
        doc_data["total_pagado"] = round(total_pagado_doc, 2)
        
        return {
            "document": doc_data,
            "payments": enriched
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/guias/{nrodoc}/detail")
def get_guia_detail(
    nrodoc: str,
    codcia: str = Query(..., description="Código de empresa")
):
    """
    Obtiene el detalle completo de una Guía de Remisión, incluyendo cabecera con SUNAT e ítems.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")
    try:
        cursor = conn.cursor()
        # 1. Cabecera
        header_query = """
            SELECT 
                g.*, 
                gre.url as url, gre.RESULTADO as RESULTADO, gre.RESPUESTA as RESPUESTA
            FROM VtaVGuia g
            LEFT OUTER JOIN GRE_electronica2 gre
                ON g.codcia = gre.CODCIA
               AND g.coddoc = gre.CODdoc
               AND g.nrodoc = gre.nroGUIA
            WHERE g.codcia = ? AND g.nrodoc = ?
        """
        cursor.execute(header_query, (codcia, nrodoc))
        header_row = cursor.fetchone()
        if not header_row:
            raise HTTPException(status_code=404, detail="Guía de remisión no encontrada")
        header = _row_to_dict(cursor, header_row)

        # 2. Detalles (Items)
        items_query = """
            SELECT * FROM VtaRGuia
            WHERE codcia = ? AND nrodoc = ?
            ORDER BY nroitm
        """
        cursor.execute(items_query, (codcia, nrodoc))
        items = [_row_to_dict(cursor, r) for r in cursor.fetchall()]

        return {
            "header": header,
            "items": items
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
