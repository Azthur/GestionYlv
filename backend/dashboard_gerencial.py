"""
Dashboard Gerencial - API Backend v2
Ventas, Guías y Pedidos consolidados para toma de decisiones.
"""
from fastapi import APIRouter, HTTPException, Query
from database import get_db_connection
from datetime import datetime, date

router = APIRouter(prefix="/api/dashboard-gerencial", tags=["Dashboard Gerencial"])

def _safe_float(v):
    try: return float(v or 0)
    except: return 0.0

def _parse_date(s):
    try: return datetime.strptime(s.strip(), "%Y-%m-%d")
    except: return datetime.now()

def _get_cursor(conn):
    if not conn: raise HTTPException(status_code=500, detail="Error de conexión a DB")
    return conn.cursor()


# ═══════════════════════════════════════════════════════════
#  1. RESUMEN GENERAL (KPIs) — discriminado por moneda
# ═══════════════════════════════════════════════════════════
@router.get("/resumen")
def get_resumen(codcia: str = Query(...), fecha_ini: str = Query(...), fecha_fin: str = Query(...)):
    conn = get_db_connection()
    cursor = _get_cursor(conn)
    fi, ff = _parse_date(fecha_ini), _parse_date(fecha_fin)
    try:
        cursor.execute("""
            SELECT
                COUNT(*) as TotalDocs,
                SUM(CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END) as VentaTotal,
                SUM(CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(impigv) ELSE impigv END) as IGVTotal,
                SUM(CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(impnet) ELSE impnet END) as SubTotal,
                SUM(CASE WHEN codmon=1 THEN (CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END) ELSE 0 END) as VentaPEN,
                SUM(CASE WHEN codmon=2 THEN (CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END) ELSE 0 END) as VentaUSD
            FROM CCBRGDOC
            WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ? AND RTRIM(flgest)!='E'
        """, (codcia.strip(), fi, ff))
        row = cursor.fetchone()
        ventas = {
            "TotalDocs": row[0] or 0, "VentaTotal": _safe_float(row[1]),
            "IGVTotal": _safe_float(row[2]), "SubTotal": _safe_float(row[3]),
            "VentaPEN": _safe_float(row[4]), "VentaUSD": _safe_float(row[5]),
            "TicketPromedio": round(_safe_float(row[1]) / max(row[0] or 1, 1), 2)
        }

        cursor.execute("""
            SELECT COUNT(*), SUM(impnet)
            FROM VTAVPEDI WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ? AND RTRIM(flgest)!='E'
        """, (codcia.strip(), fi, ff))
        row = cursor.fetchone()
        pedidos = {"TotalPedidos": row[0] or 0, "MontoPedidos": _safe_float(row[1])}

        cursor.execute("""
            SELECT COUNT(*) FROM VTAVGUIA WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ? AND RTRIM(flgest)!='E'
        """, (codcia.strip(), fi, ff))
        guias = {"TotalGuias": cursor.fetchone()[0] or 0}

        cursor.execute("""
            SELECT RTRIM(coddoc), COUNT(*),
                   SUM(CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END)
            FROM CCBRGDOC WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ? AND RTRIM(flgest)!='E'
            GROUP BY RTRIM(coddoc) ORDER BY 3 DESC
        """, (codcia.strip(), fi, ff))
        tipo_docs = [{"TipoDoc":r[0],"Cantidad":r[1],"Monto":_safe_float(r[2])} for r in cursor.fetchall()]

        return {"Ventas": ventas, "Pedidos": pedidos, "Guias": guias, "TipoDocumentos": tipo_docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#  2. VENTAS DIARIAS
# ═══════════════════════════════════════════════════════════
@router.get("/ventas-diarias")
def get_ventas_diarias(codcia: str = Query(...), fecha_ini: str = Query(...), fecha_fin: str = Query(...)):
    conn = get_db_connection()
    cursor = _get_cursor(conn)
    fi, ff = _parse_date(fecha_ini), _parse_date(fecha_fin)
    try:
        cursor.execute("""
            SELECT CONVERT(VARCHAR(10),fchdoc,120) as Fecha, COUNT(*) as CantDocs,
                SUM(CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END) as VentaTotal,
                SUM(CASE WHEN codmon=1 THEN (CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END) ELSE 0 END) as VentaPEN,
                SUM(CASE WHEN codmon=2 THEN (CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END) ELSE 0 END) as VentaUSD
            FROM CCBRGDOC WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ? AND RTRIM(flgest)!='E'
            GROUP BY CONVERT(VARCHAR(10),fchdoc,120) ORDER BY Fecha
        """, (codcia.strip(), fi, ff))
        cols = [c[0] for c in cursor.description]
        return [{**dict(zip(cols,r)), "VentaTotal":_safe_float(r[2]),"VentaPEN":_safe_float(r[3]),"VentaUSD":_safe_float(r[4])} for r in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#  3. VENTAS MENSUALES (comparativo anual)
# ═══════════════════════════════════════════════════════════
@router.get("/ventas-mensuales")
def get_ventas_mensuales(codcia: str = Query(...), ano_actual: str = Query(...), ano_anterior: str = Query(...)):
    conn = get_db_connection()
    cursor = _get_cursor(conn)
    try:
        cursor.execute("""
            SELECT RTRIM(mes), RTRIM(anos),
                SUM(CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END), COUNT(*)
            FROM CCBRGDOC WHERE RTRIM(codcia)=? AND RTRIM(anos) IN (?,?) AND RTRIM(flgest)!='E'
            GROUP BY RTRIM(mes),RTRIM(anos) ORDER BY 2,1
        """, (codcia.strip(), ano_actual, ano_anterior))
        return [{"Mes":r[0],"Ano":r[1],"VentaTotal":_safe_float(r[2]),"CantDocs":r[3]} for r in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#  4. TOP PRODUCTOS (por importe Y por cantidad)
# ═══════════════════════════════════════════════════════════
@router.get("/top-productos")
def get_top_productos(codcia: str = Query(...), fecha_ini: str = Query(...), fecha_fin: str = Query(...), limit: int = Query(15)):
    conn = get_db_connection()
    cursor = _get_cursor(conn)
    fi, ff = _parse_date(fecha_ini), _parse_date(fecha_fin)
    try:
        # Top por importe
        cursor.execute("""
            SELECT TOP(?) RTRIM(i.codmat), RTRIM(i.desmat), SUM(i.candes),
                SUM(CASE WHEN RTRIM(d.coddoc)='N/A' THEN -ABS(i.implin) ELSE i.implin END)
            FROM VTARITEM i INNER JOIN CCBRGDOC d
                ON RTRIM(i.CodCia)=RTRIM(d.codcia) AND RTRIM(i.coddoc)=RTRIM(d.coddoc)
                AND RTRIM(i.nrodoc)=RTRIM(d.nrodoc) AND RTRIM(i.anos)=RTRIM(d.anos)
            WHERE RTRIM(i.CodCia)=? AND i.fchdoc BETWEEN ? AND ? AND RTRIM(d.flgest)!='E'
            GROUP BY RTRIM(i.codmat),RTRIM(i.desmat) ORDER BY 4 DESC
        """, (limit, codcia.strip(), fi, ff))
        top_importe = [{"CodProducto":r[0],"Producto":r[1],"CantVendida":_safe_float(r[2]),"ImporteTotal":_safe_float(r[3])} for r in cursor.fetchall()]

        # Top por cantidad
        cursor.execute("""
            SELECT TOP(?) RTRIM(i.codmat), RTRIM(i.desmat), SUM(i.candes),
                SUM(CASE WHEN RTRIM(d.coddoc)='N/A' THEN -ABS(i.implin) ELSE i.implin END)
            FROM VTARITEM i INNER JOIN CCBRGDOC d
                ON RTRIM(i.CodCia)=RTRIM(d.codcia) AND RTRIM(i.coddoc)=RTRIM(d.coddoc)
                AND RTRIM(i.nrodoc)=RTRIM(d.nrodoc) AND RTRIM(i.anos)=RTRIM(d.anos)
            WHERE RTRIM(i.CodCia)=? AND i.fchdoc BETWEEN ? AND ? AND RTRIM(d.flgest)!='E'
            GROUP BY RTRIM(i.codmat),RTRIM(i.desmat) ORDER BY 3 DESC
        """, (limit, codcia.strip(), fi, ff))
        top_cantidad = [{"CodProducto":r[0],"Producto":r[1],"CantVendida":_safe_float(r[2]),"ImporteTotal":_safe_float(r[3])} for r in cursor.fetchall()]

        return {"TopImporte": top_importe, "TopCantidad": top_cantidad}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#  5. RANKING VENDEDORES
# ═══════════════════════════════════════════════════════════
@router.get("/ranking-vendedores")
def get_ranking_vendedores(codcia: str = Query(...), fecha_ini: str = Query(...), fecha_fin: str = Query(...), limit: int = Query(10)):
    conn = get_db_connection()
    cursor = _get_cursor(conn)
    fi, ff = _parse_date(fecha_ini), _parse_date(fecha_fin)
    try:
        cursor.execute("""
            SELECT TOP(?) RTRIM(codven), RTRIM(nomven), COUNT(*),
                SUM(CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END)
            FROM CCBRGDOC WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ? AND RTRIM(flgest)!='E'
            GROUP BY RTRIM(codven),RTRIM(nomven) ORDER BY 4 DESC
        """, (limit, codcia.strip(), fi, ff))
        return [{"CodVendedor":r[0],"Vendedor":r[1],"CantDocs":r[2],"VentaTotal":_safe_float(r[3])} for r in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#  6. PRECIOS Y DESCUENTOS
# ═══════════════════════════════════════════════════════════
@router.get("/precios-descuentos")
def get_precios_descuentos(codcia: str = Query(...), fecha_ini: str = Query(...), fecha_fin: str = Query(...)):
    conn = get_db_connection()
    cursor = _get_cursor(conn)
    fi, ff = _parse_date(fecha_ini), _parse_date(fecha_fin)
    try:
        cursor.execute("""
            SELECT COUNT(*), AVG(i.preuni),
                SUM(i.candes * i.preuni), SUM(i.implin),
                SUM(i.candes * i.preuni) - SUM(i.implin),
                CASE WHEN SUM(i.candes*i.preuni)>0
                     THEN ROUND((SUM(i.candes*i.preuni)-SUM(i.implin))/SUM(i.candes*i.preuni)*100,2)
                     ELSE 0 END
            FROM VTARITEM i INNER JOIN CCBRGDOC d
                ON RTRIM(i.CodCia)=RTRIM(d.codcia) AND RTRIM(i.coddoc)=RTRIM(d.coddoc)
                AND RTRIM(i.nrodoc)=RTRIM(d.nrodoc) AND RTRIM(i.anos)=RTRIM(d.anos)
            WHERE RTRIM(i.CodCia)=? AND i.fchdoc BETWEEN ? AND ? AND RTRIM(d.flgest)!='E' AND RTRIM(d.coddoc)!='N/A'
        """, (codcia.strip(), fi, ff))
        r = cursor.fetchone()
        return {"TotalItems":r[0] or 0,"PrecioPromedio":round(_safe_float(r[1]),2),"VentaBruta":round(_safe_float(r[2]),2),
                "VentaNeta":round(_safe_float(r[3]),2),"TotalDescuento":round(_safe_float(r[4]),2),"PorcDescuento":round(_safe_float(r[5]),2)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#  6b. EVOLUCIÓN DE DESCUENTOS (d1, d2, d3 de VTARITEM)
# ═══════════════════════════════════════════════════════════
@router.get("/descuentos-evolucion")
def get_descuentos_evolucion(codcia: str = Query(...), fecha_ini: str = Query(...), fecha_fin: str = Query(...)):
    conn = get_db_connection()
    cursor = _get_cursor(conn)
    fi, ff = _parse_date(fecha_ini), _parse_date(fecha_fin)
    try:
        # Evolución diaria del % descuento promedio
        cursor.execute("""
            SELECT CONVERT(VARCHAR(10), i.fchdoc, 120) as Fecha,
                AVG(ISNULL(i.d1, 0)) as DescProm,
                MAX(ISNULL(i.d1, 0)) as DescMax,
                MIN(CASE WHEN i.d1 > 0 THEN i.d1 ELSE NULL END) as DescMin,
                COUNT(*) as Items
            FROM VTARITEM i INNER JOIN CCBRGDOC d
                ON RTRIM(i.CodCia)=RTRIM(d.codcia) AND RTRIM(i.coddoc)=RTRIM(d.coddoc)
                AND RTRIM(i.nrodoc)=RTRIM(d.nrodoc) AND RTRIM(i.anos)=RTRIM(d.anos)
            WHERE RTRIM(i.CodCia)=? AND i.fchdoc BETWEEN ? AND ?
                AND RTRIM(d.flgest)!='E' AND RTRIM(d.coddoc)!='N/A'
            GROUP BY CONVERT(VARCHAR(10), i.fchdoc, 120)
            ORDER BY Fecha
        """, (codcia.strip(), fi, ff))
        evolucion = [{"Fecha":r[0],"DescProm":round(_safe_float(r[1]),2),"DescMax":round(_safe_float(r[2]),2),
                      "DescMin":round(_safe_float(r[3]),2),"Items":r[4]} for r in cursor.fetchall()]

        # Distribución por rangos de descuento
        cursor.execute("""
            SELECT
                CASE
                    WHEN ISNULL(i.d1,0) = 0 THEN 'Sin Desc.'
                    WHEN i.d1 <= 5 THEN '1-5%%'
                    WHEN i.d1 <= 10 THEN '6-10%%'
                    WHEN i.d1 <= 20 THEN '11-20%%'
                    WHEN i.d1 <= 33.33 THEN '21-33%%'
                    ELSE '34%%+'
                END as Rango,
                COUNT(*) as Cantidad,
                SUM(i.implin) as Importe
            FROM VTARITEM i INNER JOIN CCBRGDOC d
                ON RTRIM(i.CodCia)=RTRIM(d.codcia) AND RTRIM(i.coddoc)=RTRIM(d.coddoc)
                AND RTRIM(i.nrodoc)=RTRIM(d.nrodoc) AND RTRIM(i.anos)=RTRIM(d.anos)
            WHERE RTRIM(i.CodCia)=? AND i.fchdoc BETWEEN ? AND ?
                AND RTRIM(d.flgest)!='E' AND RTRIM(d.coddoc)!='N/A'
            GROUP BY CASE
                    WHEN ISNULL(i.d1,0) = 0 THEN 'Sin Desc.'
                    WHEN i.d1 <= 5 THEN '1-5%%'
                    WHEN i.d1 <= 10 THEN '6-10%%'
                    WHEN i.d1 <= 20 THEN '11-20%%'
                    WHEN i.d1 <= 33.33 THEN '21-33%%'
                    ELSE '34%%+'
                END
            ORDER BY 2 DESC
        """, (codcia.strip(), fi, ff))
        rangos = [{"Rango":r[0],"Cantidad":r[1],"Importe":round(_safe_float(r[2]),2)} for r in cursor.fetchall()]

        return {"Evolucion": evolucion, "Rangos": rangos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ═══════════════════════════════════════════════════════════
#  7. DISTRIBUCIÓN GEOGRÁFICA — con VtaUbige
# ═══════════════════════════════════════════════════════════
@router.get("/distribucion-geografica")
def get_distribucion_geografica(codcia: str = Query(...), fecha_ini: str = Query(...), fecha_fin: str = Query(...), limit: int = Query(20)):
    conn = get_db_connection()
    cursor = _get_cursor(conn)
    fi, ff = _parse_date(fecha_ini), _parse_date(fecha_fin)
    try:
        cursor.execute("""
            SELECT TOP(?)
                RTRIM(v.coddep) as CodDep, RTRIM(v.codpro) as CodProv, RTRIM(v.coddis) as CodDist,
                ISNULL(RTRIM(u.nombre), RTRIM(v.ptolle)) as Distrito,
                COUNT(*) as CantDocs,
                SUM(CASE WHEN RTRIM(v.coddoc)='N/A' THEN -ABS(v.imptot) ELSE v.imptot END) as VentaTotal
            FROM CCBRGDOC v
            LEFT JOIN VtaUbige u
                ON RTRIM(u.codcia)=RTRIM(v.codcia) AND RTRIM(u.tabla)='DIST'
                AND RTRIM(u.codigo)=RTRIM(v.coddep) AND RTRIM(u.codig0)=RTRIM(v.codpro)
                AND RTRIM(u.codig1)=RTRIM(v.coddis)
            WHERE RTRIM(v.codcia)=? AND v.fchdoc BETWEEN ? AND ? AND RTRIM(v.flgest)!='E'
            GROUP BY RTRIM(v.coddep),RTRIM(v.codpro),RTRIM(v.coddis),ISNULL(RTRIM(u.nombre),RTRIM(v.ptolle))
            HAVING SUM(CASE WHEN RTRIM(v.coddoc)='N/A' THEN -ABS(v.imptot) ELSE v.imptot END) > 0
            ORDER BY VentaTotal DESC
        """, (limit, codcia.strip(), fi, ff))
        cols = [c[0] for c in cursor.description]
        rows = [{**dict(zip(cols,r)), "VentaTotal":_safe_float(r[5])} for r in cursor.fetchall()]

        cursor.execute("""
            SELECT RTRIM(mes), COUNT(*) FROM VTAVGUIA
            WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ? AND RTRIM(flgest)!='E'
            GROUP BY RTRIM(mes) ORDER BY 1
        """, (codcia.strip(), fi, ff))
        guias_mes = [{"Mes":r[0],"CantGuias":r[1]} for r in cursor.fetchall()]

        return {"TopZonas": rows, "GuiasPorMes": guias_mes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#  8. ANÁLISIS DE PEDIDOS
# ═══════════════════════════════════════════════════════════
@router.get("/analisis-pedidos")
def get_analisis_pedidos(codcia: str = Query(...), fecha_ini: str = Query(...), fecha_fin: str = Query(...)):
    conn = get_db_connection()
    cursor = _get_cursor(conn)
    fi, ff = _parse_date(fecha_ini), _parse_date(fecha_fin)
    try:
        cursor.execute("""
            SELECT CONVERT(VARCHAR(10),fchdoc,120), COUNT(*), SUM(impnet)
            FROM VTAVPEDI WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ? AND RTRIM(flgest)!='E'
            GROUP BY CONVERT(VARCHAR(10),fchdoc,120) ORDER BY 1
        """, (codcia.strip(), fi, ff))
        pedidos_diarios = [{"Fecha":r[0],"CantPedidos":r[1],"MontoPedidos":_safe_float(r[2])} for r in cursor.fetchall()]

        cursor.execute("""
            SELECT CASE RTRIM(flgest) WHEN 'P' THEN 'Pendiente' WHEN 'C' THEN 'Cerrado'
                   WHEN 'A' THEN 'Aprobado' WHEN 'E' THEN 'Eliminado' ELSE RTRIM(flgest) END,
                   COUNT(*), SUM(impnet)
            FROM VTAVPEDI WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ?
            GROUP BY RTRIM(flgest)
        """, (codcia.strip(), fi, ff))
        por_estado = [{"Estado":r[0],"Cantidad":r[1],"Monto":_safe_float(r[2])} for r in cursor.fetchall()]

        cursor.execute("""
            SELECT COUNT(*),
                SUM(CASE WHEN RTRIM(flgest)='C' THEN 1 ELSE 0 END),
                SUM(CASE WHEN RTRIM(flgest)='P' THEN 1 ELSE 0 END)
            FROM VTAVPEDI WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ? AND RTRIM(flgest)!='E'
        """, (codcia.strip(), fi, ff))
        r = cursor.fetchone()
        total = r[0] or 0; cerrados = r[1] or 0
        efectividad = {"TotalPedidos":total,"PedidosCerrados":cerrados,"PedidosPendientes":r[2] or 0,
                       "PorcEfectividad":round(cerrados/max(total,1)*100,1)}

        return {"PedidosDiarios": pedidos_diarios, "PorEstado": por_estado, "Efectividad": efectividad}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#  9. COMPARATIVO PERIODOS
# ═══════════════════════════════════════════════════════════
@router.get("/comparativo")
def get_comparativo(codcia: str = Query(...), fecha_ini_actual: str = Query(...), fecha_fin_actual: str = Query(...),
                    fecha_ini_anterior: str = Query(...), fecha_fin_anterior: str = Query(...)):
    conn = get_db_connection()
    cursor = _get_cursor(conn)
    try:
        def gv(fi, ff):
            cursor.execute("""
                SELECT COUNT(*),
                    SUM(CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END),
                    SUM(CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(impigv) ELSE impigv END)
                FROM CCBRGDOC WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ? AND RTRIM(flgest)!='E'
            """, (codcia.strip(), _parse_date(fi), _parse_date(ff)))
            r = cursor.fetchone()
            return {"TotalDocs":r[0] or 0,"VentaTotal":_safe_float(r[1]),"IGVTotal":_safe_float(r[2])}

        actual = gv(fecha_ini_actual, fecha_fin_actual)
        anterior = gv(fecha_ini_anterior, fecha_fin_anterior)
        variacion = round((actual["VentaTotal"]-anterior["VentaTotal"])/max(anterior["VentaTotal"],1)*100,2) if anterior["VentaTotal"]>0 else 0
        return {"Actual": actual, "Anterior": anterior, "Variacion": variacion}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#  10. TOP CLIENTES (por venta total)
# ═══════════════════════════════════════════════════════════
@router.get("/top-clientes")
def get_top_clientes(codcia: str = Query(...), fecha_ini: str = Query(...), fecha_fin: str = Query(...), limit: int = Query(10)):
    conn = get_db_connection()
    cursor = _get_cursor(conn)
    fi, ff = _parse_date(fecha_ini), _parse_date(fecha_fin)
    try:
        cursor.execute("""
            SELECT TOP(?) RTRIM(codaux) as CodCliente, RTRIM(nomaux) as Cliente, COUNT(*) as CantDocs,
                SUM(CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END) as VentaTotal
            FROM CCBRGDOC WHERE RTRIM(codcia)=? AND fchdoc BETWEEN ? AND ? AND RTRIM(flgest)!='E'
            GROUP BY RTRIM(codaux), RTRIM(nomaux)
            HAVING SUM(CASE WHEN RTRIM(coddoc)='N/A' THEN -ABS(imptot) ELSE imptot END) > 0
            ORDER BY VentaTotal DESC
        """, (limit, codcia.strip(), fi, ff))
        return [{"CodCliente":r[0],"Cliente":r[1],"CantDocs":r[2],"VentaTotal":_safe_float(r[3])} for r in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
