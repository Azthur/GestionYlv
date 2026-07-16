import os
import shutil
import uuid
from database import get_db_connection
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# CONFIGURACIÓN DE SERVIDOR DE ARCHIVOS
BASE_UPLOAD_DIR = os.getenv("ATTACHMENTS_ROOT", "/app/gestion-ylv")

REPARTO_UPLOAD_DIR = os.path.join(BASE_UPLOAD_DIR, "reparto")
os.makedirs(REPARTO_UPLOAD_DIR, exist_ok=True)

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, Body, File, UploadFile
from pydantic import BaseModel
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
    proveedor_ruc: Optional[str] = None
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
        
        # Soporte para ALL en recursos
        where_cia = ""
        params = []
        if codcia.upper() != 'ALL':
            where_cia = "AND RTRIM(UPPER(CodCia)) = ?"
            params = [codcia.upper()]

        # Choferes (CHOO)
        cursor.execute(f"SELECT RTRIM(codigo) as codigo, RTRIM(nombre) as nombre, RTRIM(placa) as dni_licencia, RTRIM(CodCia) as codcia FROM VtaTabla WHERE RTRIM(Tabla) = 'CHOO' {where_cia}", tuple(params))
        choferes = []
        for row in cursor.fetchall():
            choferes.append({
                "codigo": row.codigo,
                "nombre": row.nombre + (f" ({row.codcia})" if codcia == 'ALL' else ""),
                "licencia": row.dni_licencia,
                "codcia_origen": row.codcia
            })
            
        # Movilidades (CA00)
        cursor.execute(f"SELECT RTRIM(codigo) as codigo, RTRIM(nombre) as descripcion, RTRIM(placa) as placa, RTRIM(CodCia) as codcia FROM VtaTabla WHERE RTRIM(Tabla) = 'CA00' {where_cia}", tuple(params))
        movilidades = []
        for row in cursor.fetchall():
            movilidades.append({
                "codigo": row.codigo,
                "descripcion": row.descripcion + (f" ({row.codcia})" if codcia == 'ALL' else ""),
                "placa": row.placa,
                "codcia_origen": row.codcia
            })
            
        return {
            "choferes": choferes,
            "movilidades": movilidades
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/solicitudes/cantidades-recojo/{nro_oc}")
def get_cantidades_recojo_oc(nro_oc: str, codcia: str = Query(...), tipo_oc: str = Query(...)):
    """Obtener la suma de cantidades ya solicitadas para recoger de una OC filtrando por Tipo"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        # Sumamos cantidades de solicitudes que no estén anuladas para esta OC y Tipo específico
        query = """
            SELECT RTRIM(d.codmat) as codmat, SUM(d.cantidad) as total_recojido
            FROM LogSolicitudesRecojo h
            JOIN LogSolicitudesRecojoDet d ON h.id = d.solicitud_id
            WHERE RTRIM(h.nro_oc) = ? AND RTRIM(h.codcia) = ? AND RTRIM(h.tipo) = ? AND h.estado <> 'Anulado'
            GROUP BY d.codmat
        """
        cursor.execute(query, (nro_oc.strip(), codcia.strip(), tipo_oc.strip()))
        results = {}
        for row in cursor.fetchall():
            results[row.codmat] = float(row.total_recojido)
        return results
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
            (tipo, codcia, nro_oc, fecha_recojo, hora_recojo, origen, destino, contacto, responsable, proveedor_ruc, proveedor_nombre, celular_contacto, observaciones, url_maps, estado, created_by)
            OUTPUT INSERTED.id
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)
        """
        cursor.execute(insert_head_query, (
            solicitud.tipo, solicitud.codcia, solicitud.nro_oc, 
            solicitud.fecha_recojo, solicitud.hora_recojo,
            solicitud.origen, solicitud.destino, solicitud.contacto, 
            solicitud.responsable, solicitud.proveedor_ruc, solicitud.proveedor_nombre,
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
        # Soporte para ver solicitudes de TODAS las empresas (CROSS-COMPANY)
        base_select = "SELECT sr.*, ISNULL(c.nomcia, sr.codcia) as codcia_nombre FROM LogSolicitudesRecojo sr LEFT JOIN AdmMcias c ON RTRIM(c.codcia) = RTRIM(sr.codcia) WHERE 1=1"
        if codcia.upper() == 'ALL':
            query = base_select
            params = []
        else:
            query = base_select + " AND UPPER(sr.codcia) = ?"
            params = [codcia.upper()]
            
        if estado:
            query += " AND UPPER(sr.estado) = ?"
            params.append(estado.upper())
            
        query += " ORDER BY sr.fecha_recojo DESC, sr.id DESC"
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
    codcia_chofer: Optional[str] = None
    codcia_movilidad: Optional[str] = None

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
            INSERT INTO LogHojasRuta (codcia, cod_chofer, cod_movilidad, fecha_ruta, created_by, codcia_chofer, codcia_movilidad)
            OUTPUT INSERTED.id
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        cursor.execute(query_hr, (asignacion.codcia, asignacion.cod_chofer, asignacion.cod_movilidad, asignacion.fecha_ruta, asignacion.responsable, asignacion.codcia_chofer, asignacion.codcia_movilidad))
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
        # Hojas de ruta también soportan filtrado total
        if codcia.upper() == 'ALL':
            query = """
                SELECT hr.id, hr.codcia, hr.fecha_ruta, hr.estado, hr.created_at, hr.created_by, hr.archivo_firmado,
                       ISNULL(cia.nomcia, hr.codcia) as codcia_nombre,
                       c.nombre as chofer_nombre, c.placa as chofer_licencia,
                       m.nombre as movilidad_desc, m.placa as movilidad_placa
                FROM LogHojasRuta hr
                LEFT JOIN AdmMcias cia ON RTRIM(cia.codcia) = RTRIM(hr.codcia)
                OUTER APPLY (
                    SELECT TOP 1 nombre, placa FROM VtaTabla 
                    WHERE RTRIM(Tabla)='CHOO' AND RTRIM(codigo)=hr.cod_chofer 
                    AND (RTRIM(CodCia)=hr.codcia_chofer OR hr.codcia_chofer IS NULL)
                ) c
                OUTER APPLY (
                    SELECT TOP 1 nombre, placa FROM VtaTabla 
                    WHERE RTRIM(Tabla)='CA00' AND RTRIM(codigo)=hr.cod_movilidad 
                    AND (RTRIM(CodCia)=hr.codcia_movilidad OR hr.codcia_movilidad IS NULL)
                ) m
                ORDER BY hr.id DESC
            """
            cursor.execute(query)
        else:
            query = """
                SELECT hr.id, hr.codcia, hr.fecha_ruta, hr.estado, hr.created_at, hr.created_by,
                       ISNULL(cia.nomcia, hr.codcia) as codcia_nombre,
                       c.nombre as chofer_nombre, c.placa as chofer_licencia,
                       m.nombre as movilidad_desc, m.placa as movilidad_placa
                FROM LogHojasRuta hr
                LEFT JOIN AdmMcias cia ON RTRIM(cia.codcia) = RTRIM(hr.codcia)
                OUTER APPLY (
                    SELECT TOP 1 nombre, placa FROM VtaTabla 
                    WHERE RTRIM(Tabla)='CHOO' AND RTRIM(codigo)=hr.cod_chofer 
                    AND (RTRIM(CodCia)=hr.codcia_chofer OR hr.codcia_chofer IS NULL)
                ) c
                OUTER APPLY (
                    SELECT TOP 1 nombre, placa FROM VtaTabla 
                    WHERE RTRIM(Tabla)='CA00' AND RTRIM(codigo)=hr.cod_movilidad 
                    AND (RTRIM(CodCia)=hr.codcia_movilidad OR hr.codcia_movilidad IS NULL)
                ) m
                WHERE UPPER(hr.codcia) = ?
                ORDER BY hr.id DESC
            """
            cursor.execute(query, (codcia.upper(),))
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
            SELECT hr.id, hr.codcia, hr.fecha_ruta, hr.estado, hr.created_at, hr.created_by, hr.archivo_firmado,
                   c.nombre as chofer_nombre, c.placa as chofer_licencia,
                   m.nombre as movilidad_desc, m.placa as movilidad_placa
            FROM LogHojasRuta hr
            OUTER APPLY (
                SELECT TOP 1 nombre, placa FROM VtaTabla 
                WHERE RTRIM(Tabla)='CHOO' AND RTRIM(codigo)=hr.cod_chofer 
                AND (RTRIM(CodCia)=hr.codcia_chofer OR hr.codcia_chofer IS NULL)
            ) c
            OUTER APPLY (
                SELECT TOP 1 nombre, placa FROM VtaTabla 
                WHERE RTRIM(Tabla)='CA00' AND RTRIM(codigo)=hr.cod_movilidad 
                AND (RTRIM(CodCia)=hr.codcia_movilidad OR hr.codcia_movilidad IS NULL)
            ) m
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
            SELECT sr.*, hd.id as hr_det_id, hd.obs_chofer, hd.evidencias, ISNULL(lc.nomcia, sr.codcia) as codcia_nombre
            FROM LogHojasRutaDet hd
            JOIN LogSolicitudesRecojo sr ON sr.id = hd.solicitud_id
            LEFT JOIN AdmMcias lc ON RTRIM(lc.codcia) = RTRIM(sr.codcia)
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
@router.put("/hojas-ruta/{hr_id}/estado")
def update_hr_status(hr_id: int, payload: Dict[str, str]):
    """Actualizar estado de la Hoja de Ruta (ej. Terminado, Anulado)"""
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE LogHojasRuta SET estado = ? WHERE id = ?", (payload.get('estado'), hr_id))
        conn.commit()
        return {"status": "success", "message": "Estado actualizado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/hojas-ruta/detalle/{det_id}/upload-evidencia")
async def upload_det_evidencia_files(det_id: int, archivos: List[UploadFile] = File(...)):
    """Subir archivos de evidencia para una parada específica"""
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        saved_files = []
        for file in archivos:
            if not file.filename: continue
            
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            unique_id = uuid.uuid4().hex[:6]
            sys_filename = f"evid_{det_id}_{timestamp}_{unique_id}_{file.filename}"
            file_path = os.path.join(REPARTO_UPLOAD_DIR, sys_filename)
            
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Guardamos la ruta en la DB (podríamos usar una tabla de adjuntos, pero por ahora en la columna evidencias separada por comas)
            saved_files.append(sys_filename)
            
        # Actualizar columna evidencias (concatenando si ya hay)
        cursor.execute("SELECT evidencias FROM LogHojasRutaDet WHERE id = ?", (det_id,))
        row = cursor.fetchone()
        current_ev = row[0] if row and row[0] else ""
        new_ev = ",".join(saved_files)
        total_ev = (current_ev + "," + new_ev) if current_ev else new_ev
        
        cursor.execute("UPDATE LogHojasRutaDet SET evidencias = ? WHERE id = ?", (total_ev, det_id))
        conn.commit()
        return {"status": "success", "files": saved_files}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.put("/hojas-ruta/detalle/{det_id}/obs")
def update_det_obs(det_id: int, payload: Dict[str, str]):
    """Actualizar solo las observaciones del chofer"""
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE LogHojasRutaDet SET obs_chofer = ? WHERE id = ?", (payload.get('obs_chofer'), det_id))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

from fastapi.responses import FileResponse
@router.get("/evidencia-archivo/{filename}")
def get_evidencia_file(filename: str):
    """Descargar/Ver archivo de evidencia"""
    file_path = os.path.join(REPARTO_UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(file_path)

@router.post("/hojas-ruta/{hr_id}/firmada")
async def upload_hr_firmada(hr_id: int, file: UploadFile = File(...)):
    """Subir Hoja de Ruta firmada"""
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file")
            
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        unique_id = uuid.uuid4().hex[:6]
        sys_filename = f"hr_firmada_{hr_id}_{timestamp}_{unique_id}_{file.filename}"
        file_path = os.path.join(REPARTO_UPLOAD_DIR, sys_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        cursor = conn.cursor()
        cursor.execute("UPDATE LogHojasRuta SET archivo_firmado = ? WHERE id = ?", (sys_filename, hr_id))
        conn.commit()
        return {"status": "success", "file": sys_filename}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/historial-detallado")
def get_historial_detallado(codcia: str = Query(...)):
    """Obtener el historial completo y plano de todas las hojas de ruta y sus items"""
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        
        base_query = """
            SELECT 
                hr.id as hr_id, hr.fecha_ruta, hr.estado as hr_estado, hr.archivo_firmado,
                ISNULL(c.nombre, hr.cod_chofer) as chofer_nombre,
                ISNULL(m.placa, hr.cod_movilidad) as movilidad_placa,
                hd.orden as parada_orden, hd.obs_chofer, hd.evidencias,
                sr.tipo as oc_tipo, sr.nro_oc, sr.fecha_recojo, sr.contacto, sr.observaciones as obs_general,
                sr.created_at as sr_created_at,
                sr.codcia, ISNULL(cia.nomcia, sr.codcia) as codcia_nombre,
                ISNULL(sr.proveedor_ruc, '') as proveedor_ruc,
                ISNULL(sr.proveedor_nombre, ISNULL(sr.contacto, 'S/D')) as proveedor_nombre,
                srd.codmat, srd.descripcion as item_desc, srd.cantidad, srd.unidad
            FROM LogHojasRuta hr
            JOIN LogHojasRutaDet hd ON hr.id = hd.hoja_ruta_id
            JOIN LogSolicitudesRecojo sr ON sr.id = hd.solicitud_id
            JOIN LogSolicitudesRecojoDet srd ON sr.id = srd.solicitud_id
            LEFT JOIN AdmMcias cia ON RTRIM(cia.codcia) = RTRIM(sr.codcia)
            OUTER APPLY (
                SELECT TOP 1 nombre, placa FROM VtaTabla 
                WHERE RTRIM(Tabla)='CHOO' AND RTRIM(codigo)=hr.cod_chofer 
                AND (RTRIM(CodCia)=hr.codcia_chofer OR hr.codcia_chofer IS NULL)
            ) c
            OUTER APPLY (
                SELECT TOP 1 nombre, placa FROM VtaTabla 
                WHERE RTRIM(Tabla)='CA00' AND RTRIM(codigo)=hr.cod_movilidad 
                AND (RTRIM(CodCia)=hr.codcia_movilidad OR hr.codcia_movilidad IS NULL)
            ) m
            WHERE 1=1
        """
        
        params = []
        if codcia.upper() != 'ALL':
            base_query += " AND (hr.codcia = ? OR sr.codcia = ?)"
            params.append(codcia)
            params.append(codcia)
            
        base_query += " ORDER BY hr.fecha_ruta DESC, hr.id DESC, hd.orden ASC"
        
        cursor.execute(base_query, tuple(params))
        cols = [c[0] for c in cursor.description]
        data = []
        for row in cursor.fetchall():
            d = dict(zip(cols, row))
            # Formatear fechas para JSON
            if d.get('fecha_ruta') and hasattr(d['fecha_ruta'], 'isoformat'):
                d['fecha_ruta'] = d['fecha_ruta'].isoformat()
            if d.get('fecha_recojo') and hasattr(d['fecha_recojo'], 'isoformat'):
                d['fecha_recojo'] = d['fecha_recojo'].isoformat()
            if d.get('sr_created_at') and hasattr(d['sr_created_at'], 'isoformat'):
                d['sr_created_at'] = d['sr_created_at'].isoformat()
            data.append(d)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
