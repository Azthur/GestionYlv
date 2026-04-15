from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict, Any
from database import get_db_connection
from datetime import datetime

router = APIRouter(prefix="/api/kardex", tags=["Kardex y Reportes"])

def get_base_kardex_data(
    codcia: str,
    start_date: str,
    end_date: str,
    codmat_from: Optional[str] = None,
    codmat_to: Optional[str] = None,
    codfam: Optional[str] = None
):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")
        
    try:
        cursor = conn.cursor()
        
        # 1. Fetch Company Info
        cursor.execute("SELECT TOP 1 RTRIM(nomcia), RTRIM(ruccia), RTRIM(dircia) FROM AdmMcias WHERE codcia=?", [codcia.strip()])
        emp_row = cursor.fetchone()
        empresa_data = {
            "nomcia": emp_row[0] if emp_row and emp_row[0] else "",
            "ruccia": emp_row[1] if emp_row and emp_row[1] else "",
            "dircia": emp_row[2] if emp_row and emp_row[2] else "",
            "codcia": codcia
        }
        
        # 2. Extract Movements
        query_movs = """
            SELECT 
                RTRIM(r.codmat) as codmat,
                RTRIM(m.desmat) as desmat,
                RTRIM(m.undstk) as undstk,
                RTRIM(m.codfam) as codfam,
                r.fchdoc,
                RTRIM(r.tipmov) as tipmov,
                RTRIM(r.codmov) as codmov,
                RTRIM(r.nrodoc) as nrodoc,
                r.candes,
                r.preuni,
                r.impcto,
                RTRIM(t.desmov) as desmov
            FROM AlmRMovm r
            LEFT JOIN almmmatg m ON r.codcia = m.codcia AND r.codmat = m.codmat
            LEFT JOIN almTmovm t ON r.codcia = t.codcia AND r.tipmov = t.tipmov AND r.codmov = t.codmov
            WHERE RTRIM(r.codcia) = ? 
        """
        params_movs = [codcia.strip()]
        
        query_movs += " AND r.fchdoc <= ?"
        end_date_obj = datetime.strptime(end_date, "%Y-%m-%d")
        params_movs.append(end_date_obj)
        
        if codmat_from and codmat_to:
            query_movs += " AND RTRIM(r.codmat) BETWEEN ? AND ?"
            params_movs.extend([codmat_from.strip(), codmat_to.strip()])
            
        if codfam:
            query_movs += " AND RTRIM(m.codfam) = ?"
            params_movs.append(codfam.strip())
            
        query_movs += " ORDER BY r.codmat ASC, r.fchdoc ASC, r.tipmov ASC, r.nrodoc ASC"
        
        cursor.execute(query_movs, params_movs)
        
        materials = {}
        for row in cursor.fetchall():
            mat_cod = row.codmat
            if mat_cod not in materials:
                materials[mat_cod] = {
                    "codmat": mat_cod,
                    "desmat": row.desmat,
                    "undstk": row.undstk,
                    "saldo_inicial_fisico": 0.0,
                    "saldo_inicial_valorizado": 0.0,
                    "movimientos": []
                }
            
            candes = float(row.candes) if row.candes is not None else 0.0
            impcto = float(row.impcto) if row.impcto is not None else 0.0
            preuni = float(row.preuni) if row.preuni is not None else 0.0
            
            is_ingreso = str(row.tipmov).strip().upper() == 'I'
            is_salida = str(row.tipmov).strip().upper() == 'S'
            
            fchdoc_str = row.fchdoc.strftime("%Y-%m-%d") if row.fchdoc else ""
            
            if fchdoc_str < start_date:
                if is_ingreso:
                    materials[mat_cod]["saldo_inicial_fisico"] += candes
                    materials[mat_cod]["saldo_inicial_valorizado"] += impcto
                elif is_salida:
                    materials[mat_cod]["saldo_inicial_fisico"] -= candes
                    materials[mat_cod]["saldo_inicial_valorizado"] -= impcto
            else:
                mov_dict = {
                    "fecha": fchdoc_str,
                    "tipo_doc": "Almacén",
                    "serie_doc": row.codmov,
                    "numero_doc": row.nrodoc,
                    "tipo_operacion": row.tipmov,
                    "desc_operacion": row.desmov,
                    "entradas_cant": candes if is_ingreso else 0.0,
                    "salidas_cant": candes if is_salida else 0.0,
                    "entradas_costo_uni": preuni if is_ingreso else 0.0,
                    "entradas_costo_total": impcto if is_ingreso else 0.0,
                    "salidas_costo_uni": preuni if is_salida else 0.0,
                    "salidas_costo_total": impcto if is_salida else 0.0,
                }
                materials[mat_cod]["movimientos"].append(mov_dict)
                
        resultados = []
        for mat_cod, mat_data in materials.items():
            saldo_f = mat_data["saldo_inicial_fisico"]
            saldo_v = mat_data["saldo_inicial_valorizado"]
            
            for mov in mat_data["movimientos"]:
                avg_cost = saldo_v / saldo_f if saldo_f > 0 else 0.0
                if mov["tipo_operacion"] == 'S' and mov["salidas_costo_total"] == 0.0:
                    mov["salidas_costo_uni"] = avg_cost
                    mov["salidas_costo_total"] = mov["salidas_cant"] * avg_cost

                saldo_f += mov["entradas_cant"] - mov["salidas_cant"]
                saldo_v += mov["entradas_costo_total"] - mov["salidas_costo_total"]
                
                mov["saldo_cant"] = saldo_f
                mov["saldo_costo_uni"] = saldo_v / saldo_f if saldo_f > 0 else 0.0
                mov["saldo_costo_total"] = saldo_v
                
            resultados.append(mat_data)
            
        return empresa_data, resultados
    finally:
        conn.close()


@router.get("/report")
def get_kardex_report(
    codcia: str = Query(..., description="Código de la empresa"),
    start_date: str = Query(..., description="Fecha de inicio (YYYY-MM-DD)"),
    end_date: str = Query(..., description="Fecha fin (YYYY-MM-DD)"),
    codmat_from: Optional[str] = Query(None, description="Código de material inicial"),
    codmat_to: Optional[str] = Query(None, description="Código de material final"),
    codfam: Optional[str] = Query(None, description="Familia de material"),
    formato: str = Query("12.1", description="Formato (12.1 o 13.1)"),
    moneda: str = Query("S", description="S=Soles, D=Dólares")
):
    """Obtener reporte de Kardex físico o valorizado (Formatos SUNAT 12.1 y 13.1)"""
    try:
        empresa, resultados = get_base_kardex_data(codcia, start_date, end_date, codmat_from, codmat_to, codfam)
        return {
            "empresa": empresa,
            "periodo": f"{start_date} AL {end_date}",
            "resultados": resultados
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stock")
def get_kardex_stock(
    codcia: str = Query(..., description="Código de la empresa"),
    fecha_corte: str = Query(..., description="Fecha de corte (YYYY-MM-DD)"),
    almacen: Optional[str] = Query(None, description="Almacén")
):
    """Reporte de Stock a una fecha de corte determinada"""
    try:
        # We use a very old start_date so everything falls in the report period to calculate final balances easily
        # Wait, if we use a very old start_date, the 'saldo_inicial' will be 0, and all will be processed in 'movimientos'.
        # Easier: use start_date = fecha_corte, so that ALL history becomes `saldo_inicial`!
        # Then the final stock is exactly `saldo_inicial_fisico` and `saldo_inicial_valorizado`!
        
        # We add 1 day to fecha_corte as start_date so everything before or equal to fecha_corte is initial balance
        # Wait, start_date calculation:
        # If we pass start_date = 2099-01-01 and end_date = fecha_corte, everything up to fecha_corte
        # will be accumulated in saldo_inicial!
        empresa, resultados = get_base_kardex_data(codcia, "2099-01-01", fecha_corte)
        
        stock_list = []
        for mat in resultados:
            cant = mat["saldo_inicial_fisico"]
            cost_tot = mat["saldo_inicial_valorizado"]
            unit_cost = cost_tot / cant if cant > 0 else 0.0
            
            # To avoid clutter, optionally filter out 0 stock
            if cant != 0 or cost_tot != 0:
                stock_list.append({
                    "codmat": mat["codmat"],
                    "desmat": mat["desmat"],
                    "undstk": mat["undstk"],
                    "cantidad": cant,
                    "costo_unitario": unit_cost,
                    "costo_total": cost_tot
                })
                
        return {
            "empresa": empresa,
            "fecha_corte": fecha_corte,
            "resultados": stock_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/costo-ventas")
def get_costo_ventas(
    codcia: str = Query(..., description="Código de la empresa"),
    start_date: str = Query(..., description="Fecha de inicio (YYYY-MM-DD)"),
    end_date: str = Query(..., description="Fecha fin (YYYY-MM-DD)")
):
    """Reporte de Costo de Ventas (Consolidado de Movimientos por Periodo)"""
    try:
        empresa, resultados = get_base_kardex_data(codcia, start_date, end_date)
        
        cv_list = []
        for mat in resultados:
            # Aggregate entries and exits
            inv_ini_cant = mat["saldo_inicial_fisico"]
            inv_ini_tot = mat["saldo_inicial_valorizado"]
            
            ent_cant = sum(m["entradas_cant"] for m in mat["movimientos"])
            ent_tot = sum(m["entradas_costo_total"] for m in mat["movimientos"])
            
            sal_cant = sum(m["salidas_cant"] for m in mat["movimientos"])
            sal_tot = sum(m["salidas_costo_total"] for m in mat["movimientos"])
            
            sal_final_cant = inv_ini_cant + ent_cant - sal_cant
            sal_final_tot = inv_ini_tot + ent_tot - sal_tot
            
            if inv_ini_cant != 0 or ent_cant != 0 or sal_cant != 0:
                cv_list.append({
                    "codmat": mat["codmat"],
                    "desmat": mat["desmat"],
                    "inventario_inicial_cant": inv_ini_cant,
                    "inventario_inicial_total": inv_ini_tot,
                    "entradas_cant": ent_cant,
                    "entradas_total": ent_tot,
                    "salidas_cant": sal_cant,
                    "salidas_total": sal_tot,
                    "saldo_final_cant": sal_final_cant,
                    "saldo_final_total": sal_final_tot,
                    "costo_venta_unitario": sal_tot / sal_cant if sal_cant > 0 else 0.0,
                    "costo_venta_total": sal_tot
                })
                
        return {
            "empresa": empresa,
            "periodo": f"{start_date} AL {end_date}",
            "resultados": cv_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/traceability")
def get_traceability(
    codcia: str = Query(..., description="Código de empresa"),
    nrodoc: str = Query(..., description="Número de Documento"),
    tipmov: str = Query(..., description="Tipo de Movimiento"),
    codmov: str = Query(..., description="Código de Movimiento (Serie)")
):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de DB")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT fchdoc, nroref1, nroref2, Glodoc, usuario, fchemi, ordcmp 
            FROM AlmVMovm 
            WHERE RTRIM(codcia)=? AND RTRIM(nrodoc)=? AND RTRIM(tipmov)=? AND RTRIM(codmov)=?
        """, [codcia.strip(), nrodoc.strip(), tipmov.strip(), codmov.strip()])
        
        row = cursor.fetchone()
        if not row:
            return {"status": "error", "message": "No se encontró el sustento de la operación en las cabeceras de almacén."}
            
        return {
            "status": "success",
            "data": {
                "fchdoc": row.fchdoc.strftime("%Y-%m-%d") if row.fchdoc else "",
                "nroref1": row.nroref1.strip() if row.nroref1 else "",
                "nroref2": row.nroref2.strip() if row.nroref2 else "",
                "glosa": row.Glodoc.strip() if row.Glodoc else "",
                "usuario": row.usuario.strip() if row.usuario else "",
                "fchemi": row.fchemi.strftime("%Y-%m-%d %H:%M:%S") if row.fchemi else "",
                "ordcmp": row.ordcmp.strip() if row.ordcmp else ""
            }
        }
    finally:
        conn.close()


# ═══════════════════════════════════════════════════
#  SALDOS DE INVENTARIO (para inventario.html)
# ═══════════════════════════════════════════════════

@router.get("/almacenes")
def get_almacenes(
    codcia: str = Query(..., description="Código de la empresa")
):
    """Obtener lista de almacenes disponibles"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT RTRIM(almcen) as codigo, RTRIM(desalm) as nombre 
            FROM AlmTsalm 
            WHERE RTRIM(codcia) = ?
            ORDER BY almcen
        """, (codcia.strip(),))
        return [{"codigo": row.codigo, "nombre": row.nombre} for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/familias")
def get_familias(
    codcia: str = Query(..., description="Código de la empresa")
):
    """Obtener lista de familias de productos"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT RTRIM(codigo) as codigo, RTRIM(nombre) as nombre 
            FROM AlmTabla 
            WHERE RTRIM(codcia) = ? AND RTRIM(tabla) = '0001'
            ORDER BY codigo
        """, (codcia.strip(),))
        return [{"codigo": row.codigo, "nombre": row.nombre} for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/saldos-producto")
def get_saldos_producto(
    codcia: str = Query(..., description="Código de la empresa"),
    busqueda: Optional[str] = Query(None, description="Buscar por código o nombre"),
    codfam: Optional[str] = Query(None, description="Filtrar por familia"),
    solo_stock: bool = Query(False, description="Solo items con stock > 0")
):
    """Stock general por producto (AlmmMatg) - todas las almacenes consolidado"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")
    try:
        cursor = conn.cursor()
        query = """
            SELECT 
                RTRIM(codmat) as codmat, RTRIM(desmat) as desmat, 
                RTRIM(undstk) as undstk, RTRIM(codfam) as codfam,
                RTRIM(codlin) as codlin, RTRIM(codmar) as codmar,
                stksub, stkact, vctomn, vctous, vctoeu,
                stkmin, stkmax, stkrep,
                ultcmp, ultsal
            FROM AlmmMatg 
            WHERE RTRIM(codcia) = ?
        """
        params = [codcia.strip()]
        
        if codfam:
            query += " AND RTRIM(codfam) = ?"
            params.append(codfam.strip())
        if busqueda:
            query += " AND (RTRIM(codmat) LIKE ? OR RTRIM(desmat) LIKE ?)"
            params.extend([f"%{busqueda}%", f"%{busqueda}%"])
        if solo_stock:
            query += " AND (stkact > 0 OR stkact < 0)"
            
        query += " ORDER BY codmat"
        
        cursor.execute(query, params)
        results = []
        for row in cursor.fetchall():
            results.append({
                "codmat": row.codmat or "",
                "desmat": row.desmat or "",
                "undstk": row.undstk or "",
                "codfam": row.codfam or "",
                "codlin": row.codlin or "",
                "codmar": row.codmar or "",
                "stock": float(row.stkact) if row.stkact else 0,
                "stock_sub": float(row.stksub) if row.stksub else 0,
                "valor_mn": float(row.vctomn) if row.vctomn else 0,
                "valor_us": float(row.vctous) if row.vctous else 0,
                "valor_eu": float(row.vctoeu) if row.vctoeu else 0,
                "stk_min": float(row.stkmin) if row.stkmin else 0,
                "stk_max": float(row.stkmax) if row.stkmax else 0,
                "stk_rep": float(row.stkrep) if row.stkrep else 0,
                "ult_compra": row.ultcmp.strftime("%Y-%m-%d") if row.ultcmp else "",
                "ult_salida": row.ultsal.strftime("%Y-%m-%d") if row.ultsal else "",
            })
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/saldos-almacen")
def get_saldos_almacen(
    codcia: str = Query(..., description="Código de la empresa"),
    almacen: Optional[str] = Query(None, description="Código de almacén"),
    busqueda: Optional[str] = Query(None, description="Buscar por código o nombre"),
    solo_stock: bool = Query(False, description="Solo items con stock > 0")
):
    """Stock por almacén (AlmmMate) - desglosado por almacén y producto"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")
    try:
        cursor = conn.cursor()
        query = """
            SELECT 
                RTRIM(m.almcen) as almacen, RTRIM(m.codmat) as codmat, 
                RTRIM(m.desmat) as desmat, RTRIM(m.undstk) as undstk,
                m.stksub as stock, m.vctomn, m.vctous, m.vctoeu,
                m.fching, m.fchsal,
                RTRIM(a.desalm) as des_almacen
            FROM AlmmMate m
            LEFT JOIN AlmTsalm a ON RTRIM(a.codcia) = RTRIM(m.codcia) AND RTRIM(a.almcen) = RTRIM(m.almcen)
            WHERE RTRIM(m.codcia) = ?
        """
        params = [codcia.strip()]
        
        if almacen:
            query += " AND RTRIM(m.almcen) = ?"
            params.append(almacen.strip())
        if busqueda:
            query += " AND (RTRIM(m.codmat) LIKE ? OR RTRIM(m.desmat) LIKE ?)"
            params.extend([f"%{busqueda}%", f"%{busqueda}%"])
        if solo_stock:
            query += " AND (m.stksub > 0 OR m.stksub < 0)"
            
        query += " ORDER BY m.almcen, m.codmat"
        
        cursor.execute(query, params)
        results = []
        for row in cursor.fetchall():
            results.append({
                "almacen": row.almacen or "",
                "des_almacen": row.des_almacen or "",
                "codmat": row.codmat or "",
                "desmat": row.desmat or "",
                "undstk": row.undstk or "",
                "stock": float(row.stock) if row.stock else 0,
                "valor_mn": float(row.vctomn) if row.vctomn else 0,
                "valor_us": float(row.vctous) if row.vctous else 0,
                "valor_eu": float(row.vctoeu) if row.vctoeu else 0,
                "fch_ingreso": row.fching.strftime("%Y-%m-%d") if row.fching else "",
                "fch_salida": row.fchsal.strftime("%Y-%m-%d") if row.fchsal else "",
            })
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/saldos-lote")
def get_saldos_lote(
    codcia: str = Query(..., description="Código de la empresa"),
    almacen: Optional[str] = Query(None, description="Código de almacén"),
    busqueda: Optional[str] = Query(None, description="Buscar por código, nombre o lote"),
    solo_stock: bool = Query(False, description="Solo lotes con stock > 0"),
    proximos_vencer: bool = Query(False, description="Solo lotes próximos a vencer (90 días)")
):
    """Stock por lote (AlmAcmLt) - con trazabilidad de lote y vencimiento"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")
    try:
        cursor = conn.cursor()
        query = """
            SELECT 
                RTRIM(l.almcen) as almacen, RTRIM(l.codmat) as codmat, 
                RTRIM(l.desmat) as desmat, RTRIM(l.undstk) as undstk,
                RTRIM(l.nrolote) as nrolote, l.fchlote, l.candes as stock,
                RTRIM(a.desalm) as des_almacen
            FROM AlmAcmLt l
            LEFT JOIN AlmTsalm a ON RTRIM(a.codcia) = RTRIM(l.codcia) AND RTRIM(a.almcen) = RTRIM(l.almcen)
            WHERE RTRIM(l.codcia) = ?
        """
        params = [codcia.strip()]
        
        if almacen:
            query += " AND RTRIM(l.almcen) = ?"
            params.append(almacen.strip())
        if busqueda:
            query += " AND (RTRIM(l.codmat) LIKE ? OR RTRIM(l.desmat) LIKE ? OR RTRIM(l.nrolote) LIKE ?)"
            params.extend([f"%{busqueda}%", f"%{busqueda}%", f"%{busqueda}%"])
        if solo_stock:
            query += " AND (l.candes > 0 OR l.candes < 0)"
        if proximos_vencer:
            query += " AND l.fchlote IS NOT NULL AND l.fchlote <= DATEADD(day, 90, GETDATE()) AND l.fchlote >= GETDATE()"
            
        query += " ORDER BY l.almcen, l.codmat, l.nrolote"
        
        cursor.execute(query, params)
        results = []
        for row in cursor.fetchall():
            fch_vto = row.fchlote
            dias_vencer = None
            if fch_vto:
                from datetime import datetime as dt_util
                delta = fch_vto - dt_util.now()
                dias_vencer = delta.days
            
            results.append({
                "almacen": row.almacen or "",
                "des_almacen": row.des_almacen or "",
                "codmat": row.codmat or "",
                "desmat": row.desmat or "",
                "undstk": row.undstk or "",
                "nrolote": row.nrolote or "",
                "fch_vencimiento": fch_vto.strftime("%Y-%m-%d") if fch_vto else "",
                "dias_vencer": dias_vencer,
                "stock": float(row.stock) if row.stock else 0,
            })
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
