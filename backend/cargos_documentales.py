"""
Módulo Cargos Documentales - Backend API
Flujo: Logística → Contabilidad → Tesorería
"""
from fastapi import APIRouter, HTTPException, Query, File, UploadFile, Form
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
import shutil

from database import get_db_connection

router = APIRouter(prefix="/api/cargos", tags=["Cargos Documentales"])


# ════════════════════════════════════════════════════════════
#  MODELOS PYDANTIC
# ════════════════════════════════════════════════════════════

class CargoDetalleItem(BaseModel):
    nro_orden_compra: str
    tipo_oc: Optional[str] = None
    codcia_oc: Optional[str] = None
    anos_oc: Optional[str] = None
    nro_factura: Optional[str] = None
    monto_oc: Optional[float] = 0
    monto_factura: Optional[float] = 0
    proveedor: Optional[str] = None
    ruc_proveedor: Optional[str] = None

class CargoCreate(BaseModel):
    codcia: str
    tipo_cargo: str  # LOG_A_CONT or CONT_A_TES
    usuario_origen: str
    area_origen: str  # LOGISTICA or CONTABILIDAD
    area_destino: str  # CONTABILIDAD or TESORERIA
    observaciones: Optional[str] = None
    detalle: List[CargoDetalleItem]


# ════════════════════════════════════════════════════════════
#  GENERAR CARGO
# ════════════════════════════════════════════════════════════

@router.post("/generar")
def generar_cargo(payload: CargoCreate):
    """Crear un cargo documental con sus líneas de detalle"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("SET ARITHABORT ON")

        # Generate correlative number
        cursor.execute("""
            SELECT ISNULL(MAX(CAST(REPLACE(NroCargo, 'CARGO-', '') AS INT)), 0) + 1
            FROM CntCargosDocumentales WHERE CodCia = ?
        """, (payload.codcia,))
        next_num = cursor.fetchone()[0]
        nro_cargo = f"CARGO-{next_num:04d}"

        # Insert header
        cursor.execute("""
            INSERT INTO CntCargosDocumentales 
            (CodCia, NroCargo, TipoCargo, UsuarioOrigen, AreaOrigen, AreaDestino, Observaciones)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (payload.codcia, nro_cargo, payload.tipo_cargo,
              payload.usuario_origen, payload.area_origen, payload.area_destino,
              payload.observaciones))

        # Get the new ID
        cursor.execute("SELECT @@IDENTITY")
        cargo_id = int(cursor.fetchone()[0])

        # Insert detail lines
        for item in payload.detalle:
            cursor.execute("""
                INSERT INTO CntCargosDetalle 
                (CargoId, NroOrdenCompra, TipoOc, CodCiaOc, AnosOc, NroFactura,
                 MontoOC, MontoFactura, Proveedor, RucProveedor)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (cargo_id, item.nro_orden_compra, item.tipo_oc, item.codcia_oc,
                  item.anos_oc, item.nro_factura, item.monto_oc, item.monto_factura,
                  item.proveedor, item.ruc_proveedor))

        conn.commit()
        return {"status": "success", "nro_cargo": nro_cargo, "cargo_id": cargo_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  LISTAR CARGOS
# ════════════════════════════════════════════════════════════


import json

@router.get("")
def listar_cargos(
    codcia: str = Query(...),
    area_destino: Optional[str] = Query(None),
    estado: Optional[str] = Query(None)
):
    """Listar cargos documentales con filtros opcionales"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        query = """
            SELECT c.Id, RTRIM(c.CodCia) as CodCia, RTRIM(c.NroCargo) as NroCargo,
                   RTRIM(c.TipoCargo) as TipoCargo, c.FechaCargo,
                   RTRIM(c.UsuarioOrigen) as UsuarioOrigen, RTRIM(c.AreaOrigen) as AreaOrigen,
                   RTRIM(c.UsuarioDestino) as UsuarioDestino, RTRIM(c.AreaDestino) as AreaDestino,
                   RTRIM(c.Estado) as Estado, c.FechaRecepcion,
                   RTRIM(c.Observaciones) as Observaciones,
                   (SELECT COUNT(*) FROM CntCargosDetalle WHERE CargoId = c.Id) as TotalItems,
                   (SELECT ISNULL(SUM(MontoFactura), 0) FROM CntCargosDetalle WHERE CargoId = c.Id) as MontoTotal
            FROM CntCargosDocumentales c
            WHERE RTRIM(c.CodCia) = ?
        """
        params = [codcia]

        if area_destino:
            query += " AND RTRIM(c.AreaDestino) = ?"
            params.append(area_destino)
        if estado:
            query += " AND RTRIM(c.Estado) = ?"
            params.append(estado)

        query += " ORDER BY c.FechaCargo DESC"
        cursor.execute(query, tuple(params))

        columns = [col[0] for col in cursor.description]
        results = []
        for row in cursor.fetchall():
            d = dict(zip(columns, row))
            if d['FechaCargo']:
                d['FechaCargo'] = d['FechaCargo'].strftime("%Y-%m-%d %H:%M")
            if d['FechaRecepcion']:
                d['FechaRecepcion'] = d['FechaRecepcion'].strftime("%Y-%m-%d %H:%M")
            results.append(d)
        
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  HISTORIAL DETALLADO (OC por OC)
# ════════════════════════════════════════════════════════════

@router.get("/detallado/lista")
def get_cargos_detallado(
    codcia: str = Query(...),
    area_destino: str = Query(None),
    estado: str = Query(None)
):
    """Obtener tabla plana (1 fila = 1 OC) cruzada con su Cargo Documental."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de DB")
    try:
        cursor = conn.cursor()
        query = """
            SELECT 
                c.Id as CargoId, RTRIM(c.NroCargo) as NroCargo, RTRIM(c.TipoCargo) as TipoCargo, 
                c.FechaCargo, c.FechaRecepcion, RTRIM(c.AreaOrigen) as AreaOrigen, RTRIM(c.AreaDestino) as AreaDestino, 
                RTRIM(c.Estado) as EstadoCargo,
                d.Id as DetalleId, RTRIM(d.NroOrdenCompra) as NroOrdenCompra, RTRIM(d.TipoOc) as TipoOc,
                RTRIM(d.NroFactura) as NroFactura, RTRIM(d.Proveedor) as Proveedor, d.MontoOC, d.MontoFactura,
                RTRIM(d.EstadoContable) as EstadoContable,
                RTRIM(d.CodCiaOc) as CodCiaOc,
                f.Uuid as FacturaUuid,
                ISNULL((SELECT SUM(CanDes) FROM CmpROcom r WHERE RTRIM(r.NroDoc) = RTRIM(d.NroOrdenCompra) AND RTRIM(r.CodCia) = RTRIM(d.CodCiaOc)), 0) as cant_pedida,
                ISNULL((SELECT SUM(candes) FROM AlmRMovm a WHERE RTRIM(a.ordcmp) = RTRIM(d.NroOrdenCompra) AND RTRIM(a.CodCia) = RTRIM(d.CodCiaOc)), 0) as cant_recibida
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            OUTER APPLY (
                SELECT TOP 1 f2.Uuid
                FROM CntFacturaCab f2
                WHERE RTRIM(f2.NroOrdenCompra) = RTRIM(d.NroOrdenCompra)
                  AND RTRIM(f2.Serie) + '-' + RTRIM(f2.Numero) = RTRIM(d.NroFactura)
                  AND f2.Estado != 'Anulada'
            ) f
            WHERE RTRIM(c.CodCia) = ?
        """
        params = [codcia]
        if area_destino:
            query += " AND RTRIM(c.AreaDestino) = ?"
            params.append(area_destino)
        if estado:
            query += " AND RTRIM(c.Estado) = ?"
            params.append(estado)
        
        query += " ORDER BY c.FechaCargo DESC"
        cursor.execute(query, tuple(params))
        
        cols = [col[0] for col in cursor.description]
        results = []
        for r in cursor.fetchall():
            row = dict(zip(cols, r))
            if row['FechaCargo']: row['FechaCargo'] = row['FechaCargo'].strftime("%Y-%m-%d %H:%M")
            if row['FechaRecepcion']: row['FechaRecepcion'] = row['FechaRecepcion'].strftime("%Y-%m-%d %H:%M")
            # Estado Almacen
            pedida = float(row.get('cant_pedida') or 0)
            recibida = float(row.get('cant_recibida') or 0)
            if pedida == 0 and recibida == 0: row['EstadoAlmacen'] = 'SIN INGRESO'
            elif recibida >= pedida: row['EstadoAlmacen'] = 'COMPLETO'
            elif recibida > 0: row['EstadoAlmacen'] = 'PARCIAL'
            else: row['EstadoAlmacen'] = 'SIN INGRESO'
            results.append(row)
            
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ════════════════════════════════════════════════════════════
#  OCs DISPONIBLES (MUST BE BEFORE /{cargo_id})
# ════════════════════════════════════════════════════════════

@router.get("/ocs-disponibles")
def get_ocs_disponibles(
    codcia: str = Query(...),
    ano: str = Query(...),
    mes: int = Query(0),
    tipo_cargo: str = Query("LOG_A_CONT")
):
    """
    Obtener OCs filtradas por año/mes, aplicando dependencias de flujo según el área.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()

        query = """
            SELECT 
                RTRIM(o.NroDoc) as nrodoc,
                RTRIM(o.TipoOc) as tipooc,
                RTRIM(o.Anos) as anos,
                o.Fchdoc as fchdoc,
                RTRIM(o.NomAux) as proveedor,
                RTRIM(o.RucAux) as ruc,
                o.CodMon as moneda,
                o.ImpTot as total_oc,
                f.Serie + '-' + f.Numero as factura,
                f.Total as total_factura,
                f.FecEmision as fec_factura,
                CASE WHEN f.Id IS NOT NULL THEN 1 ELSE 0 END as tiene_factura,
                ISNULL((SELECT SUM(CanDes) FROM CmpROcom r WHERE RTRIM(r.NroDoc) = RTRIM(o.NroDoc) AND RTRIM(r.CodCia) = RTRIM(o.CodCia)), 0) as cant_pedida,
                ISNULL((SELECT SUM(candes) FROM AlmRMovm a WHERE RTRIM(a.ordcmp) = RTRIM(o.NroDoc) AND RTRIM(a.CodCia) = RTRIM(o.CodCia)), 0) as cant_recibida,
                f.Uuid as factura_uuid,
                (
                    SELECT TOP 1 RTRIM(d_rej.ObservacionRechazo)
                    FROM CntCargosDetalle d_rej
                    INNER JOIN CntCargosDocumentales c_rej ON d_rej.CargoId = c_rej.Id
                    WHERE RTRIM(d_rej.NroOrdenCompra) = RTRIM(o.NroDoc)
                      AND RTRIM(c_rej.CodCia) = RTRIM(o.CodCia)
                      AND RTRIM(d_rej.EstadoContable) = 'RECHAZADO'
                      AND RTRIM(c_rej.TipoCargo) = ?
                    ORDER BY d_rej.Id DESC
                ) as observacion_rechazo
            FROM CmpVOcom o
            LEFT JOIN CntFacturaCab f ON RTRIM(f.NroOrdenCompra) = RTRIM(o.NroDoc) AND f.Estado != 'Anulada'
            WHERE RTRIM(o.CodCia) = ?
        """
        params = [tipo_cargo, codcia]

        if tipo_cargo != 'CONT_A_TES':
            query += "  AND RTRIM(o.Anos) = ?"
            params.append(ano)
            if mes and int(mes) > 0:
                query += " AND MONTH(o.Fchdoc) = ?"
                params.append(mes)

        if tipo_cargo == 'LOG_A_CONT':
            query += """
              AND NOT EXISTS (
                  SELECT 1 FROM CntCargosDetalle d
                  INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id
                  WHERE RTRIM(d.NroOrdenCompra) = RTRIM(o.NroDoc)
                    AND RTRIM(c.CodCia) = RTRIM(o.CodCia)
                    AND (
                        (f.Id IS NOT NULL AND RTRIM(d.NroFactura) = RTRIM(f.Serie) + '-' + RTRIM(f.Numero))
                        OR
                        (f.Id IS NULL)
                    )
                    AND c.Estado != 'ANULADO'
                    AND ISNULL(RTRIM(d.EstadoContable), 'PENDIENTE') != 'RECHAZADO'
              )
            """
        elif tipo_cargo == 'CONT_A_TES':
            query += """
              AND EXISTS (
                  SELECT 1 FROM CntCargosDetalle d2
                  INNER JOIN CntCargosDocumentales c2 ON d2.CargoId = c2.Id
                  WHERE RTRIM(d2.NroOrdenCompra) = RTRIM(o.NroDoc)
                    AND RTRIM(c2.CodCia) = RTRIM(o.CodCia)
                    AND c2.Estado != 'ANULADO'
                    AND RTRIM(c2.TipoCargo) = 'LOG_A_CONT'
                    AND RTRIM(d2.EstadoContable) = 'ACEPTADO'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM CntCargosDetalle d3
                  INNER JOIN CntCargosDocumentales c3 ON d3.CargoId = c3.Id
                  WHERE RTRIM(d3.NroOrdenCompra) = RTRIM(o.NroDoc)
                    AND RTRIM(c3.CodCia) = RTRIM(o.CodCia)
                    AND c3.Estado != 'ANULADO'
                    AND RTRIM(c3.TipoCargo) = 'CONT_A_TES'
                    AND ISNULL(RTRIM(d3.EstadoContable), 'PENDIENTE') != 'RECHAZADO'
              )
            """

        query += " ORDER BY o.Fchdoc DESC"
        cursor.execute(query, tuple(params)) 

        cols = [c[0] for c in cursor.description]
        results = []
        for row in cursor.fetchall():
            d = dict(zip(cols, row))
            if d.get('fchdoc'):
                d['fchdoc'] = d['fchdoc'].strftime("%Y-%m-%d")
            if d.get('fec_factura'):
                d['fec_factura'] = d['fec_factura'].strftime("%Y-%m-%d")
            
            # Evaluar estado de almacén
            pedida = float(d.get('cant_pedida') or 0)
            recibida = float(d.get('cant_recibida') or 0)
            
            if recibida >= pedida and pedida > 0:
                d['estado_almacen'] = 'COMPLETO'
            elif recibida > 0:
                d['estado_almacen'] = 'PARCIAL'
            else:
                d['estado_almacen'] = 'SIN INGRESO'
                
            results.append(d)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  PAGOS TESORERIA - LISTADOS (MUST BE BEFORE /{cargo_id})
# ════════════════════════════════════════════════════════════

@router.get("/pagos/pendientes")
def get_pagos_pendientes(codcia: str = Query(...)):
    """Listar todas las OCs aceptadas en Tesorería que NO han sido pagadas."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                d.Id as DetalleId,
                c.Id as CargoId,
                RTRIM(c.NroCargo) as NroCargo,
                c.FechaCargo,
                RTRIM(d.NroOrdenCompra) as NroOrdenCompra,
                RTRIM(d.TipoOc) as TipoOc,
                RTRIM(d.CodCiaOc) as CodCiaOc,
                RTRIM(d.NroFactura) as NroFactura,
                RTRIM(d.Proveedor) as Proveedor,
                RTRIM(d.RucProveedor) as RucProveedor,
                d.MontoOC,
                d.MontoFactura,
                RTRIM(d.EstadoContable) as EstadoContable,
                f.Uuid as FacturaUuid,
                o.Fchdoc as FechaOC,
                o.CodMon as Moneda
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            OUTER APPLY (
                SELECT TOP 1 f2.Uuid FROM CntFacturaCab f2
                WHERE RTRIM(f2.NroOrdenCompra) = RTRIM(d.NroOrdenCompra)
                  AND RTRIM(f2.Serie) + '-' + RTRIM(f2.Numero) = RTRIM(d.NroFactura)
                  AND f2.Estado != 'Anulada'
            ) f
            OUTER APPLY (
                SELECT TOP 1 o2.Fchdoc, o2.CodMon FROM CmpVOcom o2
                WHERE RTRIM(o2.NroDoc) = RTRIM(d.NroOrdenCompra)
                  AND RTRIM(o2.CodCia) = RTRIM(d.CodCiaOc)
                  AND RTRIM(o2.TipoOc) = RTRIM(d.TipoOc)
            ) o
            WHERE RTRIM(c.CodCia) = ?
              AND RTRIM(c.TipoCargo) = 'CONT_A_TES'
              AND c.Estado IN ('RECIBIDO', 'PENDIENTE')
              AND ISNULL(RTRIM(d.EstadoContable), 'PENDIENTE') NOT IN ('PAGADO', 'RECHAZADO')
            ORDER BY c.FechaCargo DESC
        """, (codcia.strip(),))
        cols = [col[0] for col in cursor.description]
        results = []
        for r in cursor.fetchall():
            row = dict(zip(cols, r))
            if row.get('FechaCargo') and hasattr(row['FechaCargo'], 'strftime'):
                row['FechaCargo'] = row['FechaCargo'].strftime("%Y-%m-%d %H:%M")
            if row.get('FechaOC') and hasattr(row['FechaOC'], 'strftime'):
                row['FechaOC'] = row['FechaOC'].strftime("%Y-%m-%d")
            results.append(row)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/pagos/historial")
def get_pagos_historial(codcia: str = Query(...)):
    """Listar todos los pagos realizados desde FinPagos."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                p.Id as PagoId,
                p.NroOrdenCompra,
                p.MontoPago,
                p.FechaPago,
                p.BancoPago,
                p.Moneda,
                p.TipoPago,
                p.NroOperacion,
                p.Notas,
                p.UsuarioRegistro,
                p.FechaRegistro,
                d.NroFactura,
                RTRIM(d.Proveedor) as Proveedor,
                RTRIM(d.RucProveedor) as RucProveedor,
                (SELECT COUNT(*) FROM FinPagosAdjuntos a WHERE a.PagoId = p.Id) as NumAdjuntos
            FROM FinPagos p
            INNER JOIN CntCargosDetalle d ON p.DetalleId = d.Id
            WHERE RTRIM(p.CodCia) = ?
            ORDER BY p.FechaRegistro DESC
        """, (codcia.strip(),))
        cols = [col[0] for col in cursor.description]
        results = []
        for r in cursor.fetchall():
            row = dict(zip(cols, r))
            if row.get('FechaPago') and hasattr(row['FechaPago'], 'strftime'):
                row['FechaPago'] = row['FechaPago'].strftime("%Y-%m-%d")
            if row.get('FechaRegistro') and hasattr(row['FechaRegistro'], 'strftime'):
                row['FechaRegistro'] = row['FechaRegistro'].strftime("%Y-%m-%d %H:%M")
            if row.get('MontoPago'):
                row['MontoPago'] = float(row['MontoPago'])
            results.append(row)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  DETALLE DE UN CARGO
# ════════════════════════════════════════════════════════════

@router.get("/{cargo_id}")
def get_cargo_detalle(cargo_id: int):
    """Obtener cabecera + detalle de un cargo"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()

        # Header
        cursor.execute("""
            SELECT Id, RTRIM(CodCia) as CodCia, RTRIM(NroCargo) as NroCargo,
                   RTRIM(TipoCargo) as TipoCargo, FechaCargo,
                   RTRIM(UsuarioOrigen) as UsuarioOrigen, RTRIM(AreaOrigen) as AreaOrigen,
                   RTRIM(UsuarioDestino) as UsuarioDestino, RTRIM(AreaDestino) as AreaDestino,
                   RTRIM(Estado) as Estado, FechaRecepcion, RTRIM(Observaciones) as Observaciones
            FROM CntCargosDocumentales WHERE Id = ?
        """, (cargo_id,))
        cols = [c[0] for c in cursor.description]
        hdr = cursor.fetchone()
        if not hdr:
            raise HTTPException(status_code=404, detail="Cargo no encontrado")
        header = dict(zip(cols, hdr))
        if header['FechaCargo']:
            header['FechaCargo'] = header['FechaCargo'].strftime("%Y-%m-%d %H:%M")
        if header['FechaRecepcion']:
            header['FechaRecepcion'] = header['FechaRecepcion'].strftime("%Y-%m-%d %H:%M")

        # Detail
        cursor.execute("""
            SELECT d.Id, RTRIM(d.NroOrdenCompra) as NroOrdenCompra, RTRIM(d.TipoOc) as TipoOc,
                   RTRIM(d.CodCiaOc) as CodCiaOc, RTRIM(d.AnosOc) as AnosOc,
                   RTRIM(d.NroFactura) as NroFactura, d.MontoOC, d.MontoFactura,
                   RTRIM(d.Proveedor) as Proveedor, RTRIM(d.RucProveedor) as RucProveedor,
                   RTRIM(d.EstadoContable) as EstadoContable,
                   f.Uuid as FacturaUuid,
                   f.FecEmision as fch_factura,
                   o.Fchdoc as fch_oc,
                   RTRIM(o.RucAux) as ruc_proveedor_oc,
                   ISNULL((SELECT SUM(CanDes) FROM CmpROcom r WHERE RTRIM(r.NroDoc) = RTRIM(d.NroOrdenCompra) AND RTRIM(r.CodCia) = RTRIM(d.CodCiaOc)), 0) as cant_pedida,
                   ISNULL((SELECT SUM(candes) FROM AlmRMovm a WHERE RTRIM(a.ordcmp) = RTRIM(d.NroOrdenCompra) AND RTRIM(a.CodCia) = RTRIM(d.CodCiaOc)), 0) as cant_recibida,
                   (
                       SELECT TOP 1 a.fchdoc 
                       FROM AlmRMovm a 
                       WHERE RTRIM(a.ordcmp) = RTRIM(d.NroOrdenCompra) 
                         AND RTRIM(a.CodCia) = RTRIM(d.CodCiaOc) 
                       ORDER BY a.fchdoc DESC
                   ) as fch_almacen,
                   STUFF((
                       SELECT ', ' + RTRIM(r.DesMat)
                       FROM CmpROcom r 
                       WHERE RTRIM(r.NroDoc) = RTRIM(d.NroOrdenCompra) AND RTRIM(r.CodCia) = RTRIM(d.CodCiaOc)
                       FOR XML PATH('')
                   ), 1, 2, '') as OCItems
            FROM CntCargosDetalle d
            OUTER APPLY (
                SELECT TOP 1 o2.Fchdoc, RTRIM(o2.RucAux) as RucAux
                FROM CmpVOcom o2
                WHERE RTRIM(o2.NroDoc) = RTRIM(d.NroOrdenCompra) 
                  AND RTRIM(o2.CodCia) = RTRIM(d.CodCiaOc)
                  AND RTRIM(o2.TipoOc) = RTRIM(d.TipoOc)
            ) o
            OUTER APPLY (
                SELECT TOP 1 f2.Uuid, f2.FecEmision, f2.Serie, f2.Numero
                FROM CntFacturaCab f2
                WHERE RTRIM(f2.NroOrdenCompra) = RTRIM(d.NroOrdenCompra)
                  AND RTRIM(f2.Serie) + '-' + RTRIM(f2.Numero) = RTRIM(d.NroFactura)
                  AND f2.Estado != 'Anulada'
            ) f
            WHERE d.CargoId = ?
        """, (cargo_id,))
        dcols = [c[0] for c in cursor.description]
        detail = []
        for r in cursor.fetchall():
            row_dict = dict(zip(dcols, r))
            
            # Formatos de fecha
            if row_dict.get('fch_oc'):
                row_dict['fch_oc'] = row_dict['fch_oc'].strftime("%Y-%m-%d")
            else:
                row_dict['fch_oc'] = '-'
                
            if row_dict.get('fch_factura'):
                row_dict['fch_factura'] = row_dict['fch_factura'].strftime("%Y-%m-%d")
            else:
                row_dict['fch_factura'] = '-'
                
            # Fecha Almacén (Solo para tipo M)
            raw_fch_almacen = row_dict.get('fch_almacen')
            if row_dict.get('TipoOc') and row_dict.get('TipoOc').strip() == 'M':
                if raw_fch_almacen and hasattr(raw_fch_almacen, 'strftime'):
                    row_dict['fch_almacen'] = raw_fch_almacen.strftime("%Y-%m-%d")
                elif raw_fch_almacen:
                    row_dict['fch_almacen'] = str(raw_fch_almacen)
                else:
                    row_dict['fch_almacen'] = 'SIN INGRESO'
            else:
                row_dict['fch_almacen'] = 'NO APLICA'
            
            # Evaluar estado de almacén para el reporte
            pedida = float(row_dict.get('cant_pedida') or 0)
            recibida = float(row_dict.get('cant_recibida') or 0)
            
            if recibida >= pedida and pedida > 0:
                row_dict['EstadoAlmacen'] = 'COMPLETO'
            elif recibida > 0:
                row_dict['EstadoAlmacen'] = 'PARCIAL'
            else:
                row_dict['EstadoAlmacen'] = 'SIN INGRESO'
                
            # Preferencia de RUC
            if row_dict.get('ruc_proveedor_oc') and row_dict.get('ruc_proveedor_oc').strip():
                row_dict['RucProveedor'] = row_dict['ruc_proveedor_oc']
                
            detail.append(row_dict)

        return {"header": header, "detail": detail}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  RECIBIR CARGO (firma de recepción)
# ════════════════════════════════════════════════════════════

class CargoItemRechazo(BaseModel):
    id: int
    observacion: str

class CargoRecepcionRequest(BaseModel):
    usuario: str
    ids_aceptados: List[int]
    items_rechazados: List[CargoItemRechazo] = []

@router.post("/{cargo_id}/recibir")
def recibir_cargo(cargo_id: int, body: CargoRecepcionRequest):
    """Marcar un cargo como RECIBIDO, asumiendo rechazo de los items no incluidos en ids_aceptados y guardando su observacion."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("SET ARITHABORT ON")

        # Obtener el TipoCargo antes de actualizar
        cursor.execute("SELECT RTRIM(TipoCargo) FROM CntCargosDocumentales WHERE Id = ?", (cargo_id,))
        tipo_cargo_row = cursor.fetchone()
        tipo_cargo = tipo_cargo_row[0] if tipo_cargo_row else None
        
        # Marcar los items aceptados (que fueron seleccionados en el front)
        if body.ids_aceptados:
            placeholders = ",".join(["?"] * len(body.ids_aceptados))
            cursor.execute(f"""
                UPDATE CntCargosDetalle
                SET EstadoContable = 'ACEPTADO', ObservacionRechazo = NULL
                WHERE CargoId = ? AND Id IN ({placeholders})
            """, [cargo_id] + body.ids_aceptados)
            
            # SI EL CARGO ES DE LOG A CONTABILIDAD, ACTUALIZAR LAS FACTURAS A CONTABILIZADO
            if tipo_cargo == 'LOG_A_CONT':
                cursor.execute(f"""
                    UPDATE f
                    SET f.Estado = 'Contabilizado'
                    FROM CntFacturaCab f
                    INNER JOIN CntCargosDetalle d ON RTRIM(f.NroOrdenCompra) = RTRIM(d.NroOrdenCompra)
                    WHERE d.CargoId = ? AND d.Id IN ({placeholders})
                      AND f.Estado != 'Anulada'
                """, [cargo_id] + body.ids_aceptados)

        # Marcar los items rechazados iterando para guardar su observacion
        for rechazo in body.items_rechazados:
            cursor.execute("""
                UPDATE CntCargosDetalle
                SET EstadoContable = 'RECHAZADO', ObservacionRechazo = ?
                WHERE CargoId = ? AND Id = ?
            """, (rechazo.observacion, cargo_id, rechazo.id))

        # Actualizar la cabecera
        cursor.execute("""
            UPDATE CntCargosDocumentales
            SET Estado = 'RECIBIDO', UsuarioDestino = ?, FechaRecepcion = GETDATE()
            WHERE Id = ?
        """, (body.usuario, cargo_id))
        
        conn.commit()
        return {"status": "success", "message": "Cargo recibido con validaciones por ítem"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  PAGAR INDIVIDUALMENTE Y PROCESAR CARGO
# ════════════════════════════════════════════════════════════

@router.put("/detalle/{detalle_id}/pagar")
def pagar_detalle_cargo(detalle_id: int, usuario: str = Query(...)):
    """Marcar una linea de OC como PAGADO por tesoreria, y liquidar global si aplica"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        # Mark target detail as PAGADO
        cursor.execute("UPDATE CntCargosDetalle SET EstadoContable = 'PAGADO' WHERE Id = ?", (detalle_id,))
        
        # Check global fulfillment
        cursor.execute("SELECT CargoId FROM CntCargosDetalle WHERE Id = ?", (detalle_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Detalle no encontrado")
        cargo_id = row[0]
        
        cursor.execute("""
            SELECT COUNT(*) FROM CntCargosDetalle
            WHERE CargoId = ? AND ISNULL(EstadoContable, '') NOT IN ('PAGADO', 'RECHAZADO')
        """, (cargo_id,))
        pending_items = cursor.fetchone()[0]
        
        # If all items are completely handled, finish the global cargo
        if pending_items == 0:
            cursor.execute("UPDATE CntCargosDocumentales SET Estado = 'PROCESADO' WHERE Id = ?", (cargo_id,))
            
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/detalle/{detalle_id}/pagar_completo")
async def pagar_cargo_completo(
    detalle_id: int,
    usuario: str = Form(...),
    moneda: str = Form(...),
    monto: float = Form(...),
    banco: str = Form(...),
    tipo: str = Form(...),
    fecha: str = Form(...),
    nro_operacion: str = Form(...),
    notas: str = Form(""),
    archivos: List[UploadFile] = File(default=[])
):
    """Marcar una linea de OC como PAGADA y registrar en FinPagos con multiples archivos"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
        
    # Crear carpeta de pagos si no existe
    upload_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "pagos")
    os.makedirs(upload_dir, exist_ok=True)
    
    try:
        cursor = conn.cursor()
        
        # 1. Obtener Info de OC para FinPagos
        cursor.execute("SELECT CargoId, CodCiaOc, NroOrdenCompra FROM CntCargosDetalle WHERE Id = ?", (detalle_id,))
        detRow = cursor.fetchone()
        if not detRow:
            raise HTTPException(status_code=404, detail="Detalle no encontrado")
        cargo_id, codcia, nrodoc = detRow
        
        # 2. Registrar en FinPagos
        cursor.execute("""
            INSERT INTO FinPagos 
            (CodCia, NroOrdenCompra, DetalleId, MontoPago, FechaPago, BancoPago, Moneda, TipoPago, NroOperacion, Notas, UsuarioRegistro)
            OUTPUT INSERTED.Id
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (codcia, nrodoc, detalle_id, monto, fecha, banco, moneda, tipo, nro_operacion, notas, usuario))
        
        pago_id = cursor.fetchone()[0]
        
        # 3. Guardar Archivos Físicos y referenciar en FinPagosAdjuntos
        for file in archivos:
            if file.filename:
                timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                sys_filename = f"pago_{pago_id}_{timestamp}_{file.filename}"
                file_path = os.path.join(upload_dir, sys_filename)
                
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                
                file_size = os.path.getsize(file_path)
                cursor.execute("""
                    INSERT INTO FinPagosAdjuntos 
                    (PagoId, ArchivoNombre, ArchivoRuta, TipoMime, TamanoBytes)
                    VALUES (?, ?, ?, ?, ?)
                """, (pago_id, sys_filename, file_path, file.content_type, file_size))
        
        # 4. Actualizar EstadoContable en Detalle
        cursor.execute("UPDATE CntCargosDetalle SET EstadoContable = 'PAGADO' WHERE Id = ?", (detalle_id,))
        
        # 5. Check global fulfillment
        cursor.execute("""
            SELECT COUNT(*) FROM CntCargosDetalle
            WHERE CargoId = ? AND ISNULL(EstadoContable, '') NOT IN ('PAGADO', 'RECHAZADO')
        """, (cargo_id,))
        pending_items = cursor.fetchone()[0]
        
        if pending_items == 0:
            cursor.execute("UPDATE CntCargosDocumentales SET Estado = 'PROCESADO' WHERE Id = ?", (cargo_id,))
            
        conn.commit()
        return {"status": "success", "pago_id": pago_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/{cargo_id}/procesar")
def procesar_cargo(cargo_id: int, usuario: str = Query(...)):
    """Marcar un cargo como PROCESADO"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("SET ARITHABORT ON")
        cursor.execute("""
            UPDATE CntCargosDocumentales
            SET Estado = 'PROCESADO'
            WHERE Id = ?
        """, (cargo_id,))
        # Mark all detail lines as CONTABILIZADO
        cursor.execute("""
            UPDATE CntCargosDetalle SET EstadoContable = 'CONTABILIZADO' WHERE CargoId = ?
        """, (cargo_id,))
        conn.commit()
        return {"status": "success", "message": "Cargo procesado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  ELIMINAR CARGO
# ════════════════════════════════════════════════════════════

@router.delete("/{cargo_id}")
def eliminar_cargo(cargo_id: int):
    """Eliminar un cargo y su detalle permanentemente"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("SET ARITHABORT ON")
        cursor.execute("DELETE FROM CntCargosDetalle WHERE CargoId = ?", (cargo_id,))
        cursor.execute("DELETE FROM CntCargosDocumentales WHERE Id = ?", (cargo_id,))
        conn.commit()
        return {"status": "success", "message": "Cargo eliminado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
