from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from database import get_db_connection

router = APIRouter(prefix="/api/production", tags=["Production Costs"])

# ─────────────────────────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────────────────────────
class EtapaCreate(BaseModel):
    NombreEtapa: str
    Descripcion: Optional[str] = ""
    OrdenSecuencia: int

class OrdenProdCreate(BaseModel):
    NroOrden: str
    Cliente: str
    FchInicio: str
    FchFin: str
    FchEntrega: str
    Almacen: str
    LotePT: str
    CodProducto: str
    ProductoDesc: str
    Presentacion: str
    CantPlanificada: float
    CantProducida: float
    CantMuestras: float
    CantEntregada: float
    UsuarioCrea: str = "Admin"
    Etapas: List[EtapaCreate] = []

class CostoCreate(BaseModel):
    IdOrden: int
    IdEtapa: Optional[int] = None
    TipoCosto: str  # MP, MOD, CIF, MEP, MAQ
    Fecha: str
    Detalle: str
    UnidadMedida: Optional[str] = ""
    Cantidad: float
    CostoUnitario: float
    CostoTotal: float
    ComprobanteRef: Optional[str] = ""

# ─────────────────────────────────────────────────────────────
# CABECERAS Y ETAPAS
# ─────────────────────────────────────────────────────────────
@router.post("/orders")
def create_order(op: OrdenProdCreate):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO Log_Prod_Orden 
            (NroOrden, Cliente, FchInicio, FchFin, FchEntrega, Almacen, LotePT, CodProducto, ProductoDesc, 
             Presentacion, CantPlanificada, CantProducida, CantMuestras, CantEntregada, UsuarioCrea)
            OUTPUT INSERTED.IdOrden
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (op.NroOrden, op.Cliente, op.FchInicio, op.FchFin, op.FchEntrega, op.Almacen, op.LotePT,
              op.CodProducto, op.ProductoDesc, op.Presentacion, op.CantPlanificada, op.CantProducida,
              op.CantMuestras, op.CantEntregada, op.UsuarioCrea))
        
        id_orden = cursor.fetchone()[0]
        
        # Etapas
        for e in op.Etapas:
            cursor.execute("""
                INSERT INTO Log_Prod_Etapas (IdOrden, NombreEtapa, Descripcion, OrdenSecuencia)
                VALUES (?, ?, ?, ?)
            """, (id_orden, e.NombreEtapa, e.Descripcion, e.OrdenSecuencia))
            
        conn.commit()
        return {"status": "success", "IdOrden": id_orden}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/orders")
def get_orders():
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM Log_Prod_Orden ORDER BY FchRegistro DESC")
        cols = [column[0] for column in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/orders/{id_orden}/etapas")
def get_order_etapas(id_orden: int):
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM Log_Prod_Etapas WHERE IdOrden=? ORDER BY OrdenSecuencia", (id_orden,))
        cols = [column[0] for column in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ─────────────────────────────────────────────────────────────
# ASIGNACIÓN DE COSTOS
# ─────────────────────────────────────────────────────────────
@router.post("/costs")
def register_cost(costo: CostoCreate):
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO Log_Prod_Costos (IdOrden, IdEtapa, TipoCosto, Fecha, Detalle, UnidadMedida, Cantidad, CostoUnitario, CostoTotal, ComprobanteRef)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (costo.IdOrden, costo.IdEtapa, costo.TipoCosto, costo.Fecha, costo.Detalle, costo.UnidadMedida,
              costo.Cantidad, costo.CostoUnitario, costo.CostoTotal, costo.ComprobanteRef))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/orders/{id_orden}/costs")
def get_order_costs(id_orden: int):
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.*, e.NombreEtapa 
            FROM Log_Prod_Costos c
            LEFT JOIN Log_Prod_Etapas e ON c.IdEtapa = e.IdEtapa
            WHERE c.IdOrden = ?
            ORDER BY c.Fecha DESC
        """, (id_orden,))
        cols = [column[0] for column in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ─────────────────────────────────────────────────────────────
# REPORTES DE ESTRUCTURA Y SUNAT
# ─────────────────────────────────────────────────────────────
@router.get("/reports/order/{id_orden}")
def get_reporte_orden(id_orden: int):
    """Estructura completa de costos para imprimir la Orden de Producción (como la Imagen)."""
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM Log_Prod_Orden WHERE IdOrden=?", (id_orden,))
        hdr_row = cursor.fetchone()
        if not hdr_row: raise HTTPException(status_code=404, detail="Orden no encontrada")
        header = dict(zip([c[0] for c in cursor.description], hdr_row))
        
        cursor.execute("SELECT * FROM Log_Prod_Costos WHERE IdOrden=? ORDER BY Fecha", (id_orden,))
        cost_rows = cursor.fetchall()
        cols = [c[0] for c in cursor.description]
        
        costs = {"MP": [], "MOD": [], "CIF": [], "MEP": [], "MAQ": []}
        totals = {"MP": 0, "MOD": 0, "CIF": 0, "MEP": 0, "MAQ": 0}
        
        for r in cost_rows:
            d = dict(zip(cols, r))
            tipo = d['TipoCosto']
            if tipo in costs:
                costs[tipo].append(d)
                totals[tipo] += float(d['CostoTotal'] or 0)
                
        total_gen = sum(totals.values())
        costo_unitario = total_gen / float(header['CantProducida'] or 1)
        
        return {
            "header": header,
            "costos_detalles": costs,
            "resumen": {
                "MP_Total": totals["MP"],
                "MOD_Total": totals["MOD"],
                "CIF_Total": totals["CIF"],
                "MEP_Total": totals["MEP"],
                "MAQ_Total": totals["MAQ"],
                "Costo_Produccion_Total": total_gen,
                "Costo_Unitario": costo_unitario
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# Reportes Formatos SUNAT (Mock structure as standard queries)
@router.get("/reports/sunat/10")
def get_sunat_format(formato: str = Query("10.1"), year: str = "2026", month: str = ""):
    """End-point unificado para extraer métricas para los Formatos SUNAT (Anual/Mensual)"""
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        if formato == "10.1":
            # Estado Costo Ventas Anual = Inv Inicial + Costo Prod - Inv Final
            # Ex: Sum of all costs in the year
            cursor.execute("""
                SELECT TipoCosto, SUM(CostoTotal) as Total 
                FROM Log_Prod_Costos 
                WHERE YEAR(Fecha) = ?
                GROUP BY TipoCosto
            """, (year,))
            
        elif formato == "10.2":
            # Elementos del Costo Mensual
            cursor.execute("""
                SELECT o.LotePT, o.ProductoDesc, c.TipoCosto, SUM(c.CostoTotal) as Total
                FROM Log_Prod_Costos c
                JOIN Log_Prod_Orden o ON c.IdOrden = o.IdOrden
                WHERE YEAR(c.Fecha) = ? AND MONTH(c.Fecha) = ?
                GROUP BY o.LotePT, o.ProductoDesc, c.TipoCosto
            """, (year, month))
            
        elif formato == "10.3":
            # Estado de Costo de Producción Valorizado Anual
            cursor.execute("""
                SELECT o.ProductoDesc, o.Presentacion, SUM(o.CantProducida) as Unidades, 
                       SUM(c.CostoTotal) as CostoValorizado
                FROM Log_Prod_Costos c
                JOIN Log_Prod_Orden o ON c.IdOrden = o.IdOrden
                WHERE YEAR(c.Fecha) = ?
                GROUP BY o.ProductoDesc, o.Presentacion
            """, (year,))
            
        cols = [c[0] for c in cursor.description]
        data = [dict(zip(cols, row)) for row in cursor.fetchall()]
        return {"formato": formato, "year": year, "month": month, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
