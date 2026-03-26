from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from database import get_db_connection
from datetime import datetime

router = APIRouter(prefix="/api/reparto", tags=["Reparto y Rutas"])

# Modelos Pydantic para endpoints
class SolicitudDetalle(BaseModel):
    codmat: Optional[str] = None
    descripcion: str
    cantidad: float
    unidad: Optional[str] = None

class SolicitudCreate(BaseModel):
    tipo: str = "OC" # 'OC' o 'MANUAL'
    codcia: str
    nro_oc: Optional[str] = None
    fecha_recojo: str # YYYY-MM-DD
    hora_recojo: Optional[str] = None
    origen: str
    destino: str
    contacto: Optional[str] = None
    responsable: Optional[str] = None
    proveedor_nombre: Optional[str] = None
    celular_contacto: Optional[str] = None
    observaciones: Optional[str] = None
    url_maps: Optional[str] = None
    items: List[SolicitudDetalle]

@router.get("/recursos")
def get_recursos_reparto(codcia: str = Query(...)):
    """Obtener lista de Choferes y Movilidades desde VtaTabla"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        
        # Choferes (CHOO)
        cursor.execute("SELECT RTRIM(codigo) as codigo, RTRIM(nombre) as nombre, RTRIM(placa) as dni_licencia FROM VtaTabla WHERE RTRIM(Tabla) = 'CHOO' AND RTRIM(CodCia) = ?", (codcia,))
        choferes = []
        for row in cursor.fetchall():
            choferes.append({
                "codigo": row.codigo,
                "nombre": row.nombre,
                "licencia": row.dni_licencia
            })
            
        # Movilidades (CA00)
        cursor.execute("SELECT RTRIM(codigo) as codigo, RTRIM(nombre) as descripcion, RTRIM(placa) as placa FROM VtaTabla WHERE RTRIM(Tabla) = 'CA00' AND RTRIM(CodCia) = ?", (codcia,))
        movilidades = []
        for row in cursor.fetchall():
            movilidades.append({
                "codigo": row.codigo,
                "descripcion": row.descripcion,
                "placa": row.placa
            })
            
        return {
            "choferes": choferes,
            "movilidades": movilidades
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/solicitudes")
def create_solicitud_recojo(solicitud: SolicitudCreate):
    """Crear una Solicitud de Recojo (desde OC o Manual)"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        
        # Insert Head
        insert_head_query = """
            INSERT INTO LogSolicitudesRecojo 
            (tipo, codcia, nro_oc, fecha_recojo, hora_recojo, origen, destino, contacto, responsable, proveedor_nombre, celular_contacto, observaciones, url_maps, estado, created_by)
            OUTPUT INSERTED.id
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)
        """
        cursor.execute(insert_head_query, (
            solicitud.tipo, solicitud.codcia, solicitud.nro_oc, 
            solicitud.fecha_recojo, solicitud.hora_recojo,
            solicitud.origen, solicitud.destino, solicitud.contacto, 
            solicitud.responsable, solicitud.proveedor_nombre,
            solicitud.celular_contacto, solicitud.observaciones, solicitud.url_maps,
            solicitud.responsable
        ))
        solicitud_id = cursor.fetchone()[0]
        
        # Insert Details
        if solicitud.items:
            insert_det_query = """
                INSERT INTO LogSolicitudesRecojoDet (solicitud_id, codmat, descripcion, cantidad, unidad)
                VALUES (?, ?, ?, ?, ?)
            """
            for item in solicitud.items:
                cursor.execute(insert_det_query, (
                    solicitud_id, item.codmat, item.descripcion, item.cantidad, item.unidad
                ))
        
        conn.commit()
        return {"status": "success", "solicitud_id": solicitud_id, "message": "Solicitud generada con éxito"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/solicitudes")
def get_solicitudes(codcia: str = Query(...), estado: Optional[str] = Query(None)):
    """Listar Solicitudes de Recojo"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        query = "SELECT * FROM LogSolicitudesRecojo WHERE codcia = ?"
        params = [codcia]
        if estado:
            query += " AND estado = ?"
            params.append(estado)
            
        query += " ORDER BY fecha_recojo DESC, id DESC"
        cursor.execute(query, tuple(params))
        
        columns = [column[0] for column in cursor.description]
        solicitudes = []
        for row in cursor.fetchall():
            s_dict = dict(zip(columns, row))
            if s_dict['fecha_recojo']: s_dict['fecha_recojo'] = str(s_dict['fecha_recojo'])
            if s_dict['created_at']: s_dict['created_at'] = str(s_dict['created_at'])
            
            # Get items
            cursor.execute("SELECT * FROM LogSolicitudesRecojoDet WHERE solicitud_id = ?", (s_dict['id'],))
            det_cols = [c[0] for c in cursor.description]
            items = [dict(zip(det_cols, it)) for it in cursor.fetchall()]
            
            # Formatting decimals
            for item in items:
                if item['cantidad'] is not None: item['cantidad'] = float(item['cantidad'])
                
            s_dict['items'] = items
            solicitudes.append(s_dict)
            
        return solicitudes
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

class AsignacionHojaRuta(BaseModel):
    codcia: str
    cod_chofer: str
    cod_movilidad: str
    fecha_ruta: str
    solicitudes_ids: List[int]
    responsable: Optional[str] = None

@router.post("/hojas-ruta")
def crear_hoja_ruta(asignacion: AsignacionHojaRuta):
    """Asignar Chofer/Movilidad a Solicitudes y generar Hoja de Ruta"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        
        # Validate that requests are strictly Pendiente
        check_query = f"SELECT id, estado FROM LogSolicitudesRecojo WHERE id IN ({','.join(['?']*len(asignacion.solicitudes_ids))})"
        cursor.execute(check_query, tuple(asignacion.solicitudes_ids))
        valid_ids = []
        for row in cursor.fetchall():
            if row.estado == 'Pendiente':
                valid_ids.append(row.id)
                
        if not valid_ids:
            return {"status": "error", "message": "No hay solicitudes válidas en estado Pendiente para asignar."}
        
        # 1. Crear Hoja Ruta
        query_hr = """
            INSERT INTO LogHojasRuta (codcia, cod_chofer, cod_movilidad, fecha_ruta, created_by)
            OUTPUT INSERTED.id
            VALUES (?, ?, ?, ?, ?)
        """
        cursor.execute(query_hr, (asignacion.codcia, asignacion.cod_chofer, asignacion.cod_movilidad, asignacion.fecha_ruta, asignacion.responsable))
        hoja_ruta_id = cursor.fetchone()[0]
        
        # 2. Insertar Detalle Hoja Ruta y actualizar estado Solicitud a 'Asignada'
        for idx, sid in enumerate(valid_ids):
            cursor.execute("INSERT INTO LogHojasRutaDet (hoja_ruta_id, solicitud_id, orden) VALUES (?, ?, ?)", (hoja_ruta_id, sid, idx+1))
            cursor.execute("UPDATE LogSolicitudesRecojo SET estado = 'Asignada' WHERE id = ?", (sid,))
            
        conn.commit()
        return {"status": "success", "hoja_ruta_id": hoja_ruta_id, "message": "Hoja de Ruta generada con éxito"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/hojas-ruta")
def get_hojas_ruta(codcia: str = Query(...)):
    """Listar hojas de ruta con datos del chofer y movilidad"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        query = """
            SELECT hr.id, hr.codcia, hr.fecha_ruta, hr.estado, hr.created_at, hr.created_by,
                   c.nombre as chofer_nombre, c.placa as chofer_licencia,
                   m.nombre as movilidad_desc, m.placa as movilidad_placa
            FROM LogHojasRuta hr
            LEFT JOIN VtaTabla c ON RTRIM(c.Tabla)='CHOO' AND RTRIM(c.codigo)=hr.cod_chofer AND RTRIM(c.CodCia)=hr.codcia
            LEFT JOIN VtaTabla m ON RTRIM(m.Tabla)='CA00' AND RTRIM(m.codigo)=hr.cod_movilidad AND RTRIM(m.CodCia)=hr.codcia
            WHERE hr.codcia = ?
            ORDER BY hr.id DESC
        """
        cursor.execute(query, (codcia,))
        columns = [column[0] for column in cursor.description]
        hojas = []
        for row in cursor.fetchall():
            h_dict = dict(zip(columns, row))
            if h_dict['fecha_ruta']: h_dict['fecha_ruta'] = str(h_dict['fecha_ruta'])
            if h_dict['created_at']: h_dict['created_at'] = str(h_dict['created_at'])
            
            # Count solicitudes assigned
            cursor.execute("SELECT COUNT(*) FROM LogHojasRutaDet WHERE hoja_ruta_id = ?", (h_dict['id'],))
            h_dict['total_solicitudes'] = cursor.fetchone()[0]
            
            hojas.append(h_dict)
        return hojas
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/hojas-ruta/{hr_id}")
def get_hoja_ruta_detail(hr_id: int):
    """Detalle completo de una Hoja de Ruta para impresión"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        query = """
            SELECT hr.id, hr.codcia, hr.fecha_ruta, hr.estado, hr.created_at, hr.created_by,
                   c.nombre as chofer_nombre, c.placa as chofer_licencia,
                   m.nombre as movilidad_desc, m.placa as movilidad_placa
            FROM LogHojasRuta hr
            LEFT JOIN VtaTabla c ON RTRIM(c.Tabla)='CHOO' AND RTRIM(c.codigo)=hr.cod_chofer AND RTRIM(c.CodCia)=hr.codcia
            LEFT JOIN VtaTabla m ON RTRIM(m.Tabla)='CA00' AND RTRIM(m.codigo)=hr.cod_movilidad AND RTRIM(m.CodCia)=hr.codcia
            WHERE hr.id = ?
        """
        cursor.execute(query, (hr_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Hoja Ruta no encontrada")
        cols = [c[0] for c in cursor.description]
        hoja = dict(zip(cols, row))
        if hoja['fecha_ruta']: hoja['fecha_ruta'] = str(hoja['fecha_ruta'])
        if hoja['created_at']: hoja['created_at'] = str(hoja['created_at'])
        
        # Get requests assigned to this route sheet
        cursor.execute("""
            SELECT sr.* 
            FROM LogHojasRutaDet hd
            JOIN LogSolicitudesRecojo sr ON sr.id = hd.solicitud_id
            WHERE hd.hoja_ruta_id = ?
            ORDER BY hd.orden ASC
        """, (hr_id,))
        sr_cols = [c[0] for c in cursor.description]
        solicitudes = []
        for sr_row in cursor.fetchall():
            sr_dict = dict(zip(sr_cols, sr_row))
            if sr_dict['fecha_recojo']: sr_dict['fecha_recojo'] = str(sr_dict['fecha_recojo'])
            if sr_dict['created_at']: sr_dict['created_at'] = str(sr_dict['created_at'])
            
            cursor.execute("SELECT * FROM LogSolicitudesRecojoDet WHERE solicitud_id = ?", (sr_dict['id'],))
            det_cols = [c[0] for c in cursor.description]
            items = []
            for it in cursor.fetchall():
                it_dict = dict(zip(det_cols, it))
                if it_dict['cantidad'] is not None: it_dict['cantidad'] = float(it_dict['cantidad'])
                items.append(it_dict)
                
            sr_dict['items'] = items
            solicitudes.append(sr_dict)
            
        hoja['solicitudes'] = solicitudes
        return hoja
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
