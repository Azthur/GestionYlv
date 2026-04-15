from fastapi import APIRouter, HTTPException, Query, File, UploadFile, Form
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
import shutil
import json
import uuid

from database import get_db_connection

router = APIRouter(prefix="/api/finanzas", tags=["Finanzas - Gastos y Rendiciones"])

# ════════════════════════════════════════════════════════════
# ════════════════════════════════════════════════════════════
#  ENDPOINT EMPRESAS
# ════════════════════════════════════════════════════════════
@router.get("/empresas")
def get_empresas():
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT RTRIM(codcia) as codcia, RTRIM(nomcia) as nomcia, RTRIM(ruccia) as ruccia FROM AdmMcias ORDER BY codcia")
        cols = [col[0] for col in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    finally:
        conn.close()

# ════════════════════════════════════════════════════════════
#  ENDPOINT CONGASTO (Categorías de Gasto)
# ════════════════════════════════════════════════════════════
@router.get("/congasto")
def get_congasto(codcia: str = Query(...)):
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT RTRIM(CODCGAS) as CODCGAS, RTRIM(DESCGAS) as DESCGAS, RTRIM(CODCTA) as CODCTA
            FROM CONGASTO WHERE (DESACGAS = 0 OR DESACGAS IS NULL)
            ORDER BY DESCGAS
        """)
        cols = [col[0] for col in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    finally:
        conn.close()

# ════════════════════════════════════════════════════════════
#  ENDPOINT AUXILIARES (Trabajadores / Socios)
# ════════════════════════════════════════════════════════════

@router.get("/auxiliares/{tipo}")
def get_auxiliares(tipo: str, codcia: Optional[str] = Query(None)):
    """
    Obtener trabajadores (003) o socios/rendidores (009)
    Si se envía codcia filtra por empresa, sino trae todo.
    """
    if tipo not in ["003", "009"]:
        raise HTTPException(status_code=400, detail="Tipo de auxiliar inválido. Use 003 o 009.")
        
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        if codcia:
            cursor.execute("""
                SELECT RTRIM(codaux) as codaux, RTRIM(nomaux) as nomaux, RTRIM(rucaux) as rucaux 
                FROM CbdMAuxi 
                WHERE codcia = ? AND clfaux = ?
                ORDER BY nomaux
            """, (codcia, tipo))
        else:
            cursor.execute("""
                SELECT RTRIM(codaux) as codaux, MAX(RTRIM(nomaux)) as nomaux, RTRIM(rucaux) as rucaux 
                FROM CbdMAuxi 
                WHERE clfaux = ?
                GROUP BY codaux, rucaux
                ORDER BY nomaux
            """, (tipo,))
        cols = [col[0] for col in cursor.description]
        results = [dict(zip(cols, row)) for row in cursor.fetchall()]
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ════════════════════════════════════════════════════════════
#  PLANILLA DE MOVILIDAD
# ════════════════════════════════════════════════════════════

@router.get("/planillas")
def get_planillas(codcia: str = Query(...), trabajador_cod: Optional[str] = Query(None)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        query = "SELECT * FROM FinPlanillaMovilidadCab WHERE CodCia = ?"
        params = [codcia]
        if trabajador_cod:
            query += " AND RTRIM(CodAux) = ?"
            params.append(trabajador_cod.strip())
        query += " ORDER BY FechaRegistro DESC"
            
        cursor.execute(query, tuple(params))
        cols = [col[0] for col in cursor.description]
        results = [dict(zip(cols, row)) for row in cursor.fetchall()]
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/planillas/pendientes_rendicion")
def get_planillas_pendientes(codcia: str = Query(...), trabajador_cod: Optional[str] = Query(None)):
    """Planillas que no han sido rendidas en una Rendición de Gastos aún"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        query = """
            SELECT * FROM FinPlanillaMovilidadCab 
            WHERE CodCia = ? AND Estado = 'REGISTRADO'
            AND Id NOT IN (
                SELECT DocReferenciaId FROM FinRendicionGastosDet 
                WHERE TipoDoc = 'PGM-Planilla' AND DocReferenciaId IS NOT NULL
            )
        """
        params = [codcia]
        if trabajador_cod:
            query += " AND RTRIM(CodAux) = ?"
            params.append(trabajador_cod.strip())
            
        query += " ORDER BY FechaEmision DESC"
        
        cursor.execute(query, tuple(params))
        cols = [col[0] for col in cursor.description]
        results = [dict(zip(cols, row)) for row in cursor.fetchall()]
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/planillas/{id}")
def get_planilla_por_id(id: int):
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM FinPlanillaMovilidadCab WHERE Id = ?", (id,))
        row = cursor.fetchone()
        if not row: raise HTTPException(status_code=404, detail="No encontrada")
        cols = [col[0] for col in cursor.description]
        cab = dict(zip(cols, row))
        
        cursor.execute("SELECT * FROM FinPlanillaMovilidadDet WHERE PlanillaId = ?", (id,))
        cols_det = [col[0] for col in cursor.description]
        det = [dict(zip(cols_det, r)) for r in cursor.fetchall()]
        
        cursor.execute("SELECT Id, ArchivoNombre, TipoMime FROM FinPlanillaMovilidadAdjuntos WHERE PlanillaId = ?", (id,))
        cols_adj = [col[0] for col in cursor.description]
        adj = [dict(zip(cols_adj, r)) for r in cursor.fetchall()]
        
        return {"cabecera": cab, "detalle": det, "adjuntos": adj}
    finally:
        conn.close()

@router.post("/planillas")
async def create_planilla(
    codcia: str = Form(...),
    fecha_emision: str = Form(...),
    periodo: str = Form(...),
    codaux: str = Form(...),
    nomaux: str = Form(...),
    rucdni: str = Form(...),
    total_gastado: float = Form(...),
    usuario: str = Form(...),
    detalle: str = Form(...), # JSON string
    id: Optional[int] = Form(None),
    archivos: List[UploadFile] = File(default=[])
):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
        
    upload_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "planillas")
    os.makedirs(upload_dir, exist_ok=True)
    
    try:
        cursor = conn.cursor()
        det = json.loads(detalle)
        
        if id:
            planilla_id = id
            cursor.execute("SELECT NroPlanilla, UuidLink FROM FinPlanillaMovilidadCab WHERE Id=?", (planilla_id,))
            row_exist = cursor.fetchone()
            if not row_exist: raise HTTPException(status_code=404, detail="No se encontró registro a editar")
            nro_planilla, uuid_val = row_exist
            
            cursor.execute("""
                UPDATE FinPlanillaMovilidadCab 
                SET FechaEmision=?, Periodo=?, CodAux=?, NomAux=?, RucDni=?, TotalGastado=?
                WHERE Id=?
            """, (fecha_emision, periodo, codaux, nomaux, rucdni, total_gastado, planilla_id))
            cursor.execute("DELETE FROM FinPlanillaMovilidadDet WHERE PlanillaId=?", (planilla_id,))
        else:
            # Generar correlativo NroPlanilla: PGM-{RucDni}-{YYYY}-000N
            year = fecha_emision.split("-")[0]
            prefix = f"PGM-{rucdni}-{year}"
            
            cursor.execute("""
                SELECT ISNULL(MAX(CAST(RIGHT(NroPlanilla, 4) AS INT)), 0) + 1
                FROM FinPlanillaMovilidadCab 
                WHERE CodCia = ? AND NroPlanilla LIKE ?
            """, (codcia, f"{prefix}-%"))
            next_num = cursor.fetchone()[0]
            nro_planilla = f"{prefix}-{next_num:04d}"
            uuid_val = str(uuid.uuid4())
            
            cursor.execute("""
                INSERT INTO FinPlanillaMovilidadCab 
                (CodCia, NroPlanilla, FechaEmision, Periodo, CodAux, NomAux, RucDni, TotalGastado, Estado, UsuarioRegistro, UuidLink)
                OUTPUT INSERTED.Id
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRADO', ?, ?)
            """, (codcia, nro_planilla, fecha_emision, periodo, codaux, nomaux, rucdni, total_gastado, usuario, uuid_val))
            planilla_id = cursor.fetchone()[0]
            
        # 2. Detalle
        for item in det:
            cursor.execute("""
                INSERT INTO FinPlanillaMovilidadDet
                (PlanillaId, Fecha, Motivo, Desde, Hasta, Monto)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (planilla_id, item['fecha'], item['motivo'], item['desde'], item['hasta'], float(item['monto'])))
            
        # 3. Archivos
        for file in archivos:
            if file.filename:
                timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                sys_filename = f"planilla_{planilla_id}_{timestamp}_{file.filename}"
                file_path = os.path.join(upload_dir, sys_filename)
                
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                
                file_size = os.path.getsize(file_path)
                cursor.execute("""
                    INSERT INTO FinPlanillaMovilidadAdjuntos 
                    (PlanillaId, ArchivoNombre, ArchivoRuta, TipoMime, TamanoBytes)
                    VALUES (?, ?, ?, ?, ?)
                """, (planilla_id, sys_filename, file_path, file.content_type, file_size))
                
        conn.commit()
        return {"status": "success", "id": planilla_id, "nro_planilla": nro_planilla, "uuid_link": uuid_val}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ════════════════════════════════════════════════════════════
#  RENDICIÓN DE GASTOS
# ════════════════════════════════════════════════════════════

@router.get("/rendiciones/buscar-factura")
def buscar_factura(codcia: str = Query(...), q: str = Query(...)):
    """Busca facturas contabilizadas por Serie/Número o por RUC/Razón Social"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        search = f"%{q}%"
        cursor.execute("""
            SELECT TOP 40 
                RTRIM(f.Serie) as Serie, 
                RTRIM(f.Numero) as Numero,
                f.FecEmision,
                f.Total,
                f.CodMoneda as CodMon,
                RTRIM(f.NumRucProveedor) as RucPro,
                RTRIM(f.NomProveedor) as NomPro,
                f.Id as FacturaId
            FROM CntFacturaCab f
            WHERE f.Estado != 'Anulada' AND RTRIM(f.CodCia) = ?
            AND (f.Serie LIKE ? OR f.Numero LIKE ? OR f.NumRucProveedor LIKE ? OR f.NomProveedor LIKE ?)
            ORDER BY f.FecEmision DESC
        """, (codcia, search, search, search, search))
        
        cols = [c[0] for c in cursor.description]
        results = [dict(zip(cols, row)) for row in cursor.fetchall()]
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/rendiciones/{id}")
def get_rendicion_por_id(id: int):
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM FinRendicionGastosCab WHERE Id = ?", (id,))
        row = cursor.fetchone()
        if not row: raise HTTPException(status_code=404, detail="No encontrada")
        cols = [col[0] for col in cursor.description]
        cab = dict(zip(cols, row))
        
        cursor.execute("SELECT * FROM FinRendicionGastosDet WHERE RendicionId = ?", (id,))
        cols_det = [col[0] for col in cursor.description]
        det = [dict(zip(cols_det, r)) for r in cursor.fetchall()]
        
        cursor.execute("SELECT Id, ArchivoNombre, TipoMime FROM FinRendicionGastosAdjuntos WHERE RendicionId = ?", (id,))
        cols_adj = [col[0] for col in cursor.description]
        adj = [dict(zip(cols_adj, r)) for r in cursor.fetchall()]
        
        return {"cabecera": cab, "detalle": det, "adjuntos": adj}
    finally:
        conn.close()


@router.post("/rendiciones")
async def create_rendicion(
    codcia: str = Form(...),
    fecha: str = Form(...),
    periodo: str = Form(...),
    moneda: str = Form(...),
    codaux: str = Form(...),
    nomaux: str = Form(...),
    rucdni: str = Form(...),
    tipo_rendicion: str = Form(...),
    saldo_inicial: float = Form(...),
    saldo_final: float = Form(...),
    total_gastado: float = Form(...),
    total_reembolso: float = Form(...),
    usuario: str = Form(...),
    detalle: str = Form(...), # JSON string
    id: Optional[int] = Form(None),
    archivos: List[UploadFile] = File(default=[])
):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
        
    upload_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "rendiciones")
    os.makedirs(upload_dir, exist_ok=True)
    
    try:
        cursor = conn.cursor()
        items = json.loads(detalle)
        
        if id:
            rendicion_id = id
            cursor.execute("SELECT NroRendicion, UuidLink FROM FinRendicionGastosCab WHERE Id=?", (rendicion_id,))
            row_exist = cursor.fetchone()
            if not row_exist: raise HTTPException(status_code=404, detail="No se encontró registro a editar")
            nro_rendicion, uuid_val = row_exist
            
            cursor.execute("""
                UPDATE FinRendicionGastosCab 
                SET Fecha=?, Periodo=?, Moneda=?, CodAux=?, NomAux=?, RucDni=?,
                    TipoRendicion=?, SaldoInicial=?, SaldoFinal=?, TotalGastado=?, TotalReembolso=?
                WHERE Id=?
            """, (fecha, periodo, moneda, codaux, nomaux, rucdni, tipo_rendicion, saldo_inicial, saldo_final, total_gastado, total_reembolso, rendicion_id))
            
            # Liberar facturas o planillas anteriores asociadas
            cursor.execute("UPDATE FinPlanillaMovilidadCab SET Estado = 'REGISTRADO' WHERE Id IN (SELECT DocReferenciaId FROM FinRendicionGastosDet WHERE RendicionId=? AND TipoDoc='PGM-Planilla')", (rendicion_id,))
            cursor.execute("DELETE FROM FinRendicionGastosDet WHERE RendicionId=?", (rendicion_id,))
            
        else:
            # Generar correlativo NroRendicion: RG-{RucDni}-{YYYY}-000N
            year = fecha.split("-")[0]
            prefix = f"RG-{rucdni}-{year}"
            
            cursor.execute("""
                SELECT ISNULL(MAX(CAST(RIGHT(NroRendicion, 4) AS INT)), 0) + 1
                FROM FinRendicionGastosCab 
                WHERE CodCia = ? AND NroRendicion LIKE ?
            """, (codcia, f"{prefix}-%"))
            next_num = cursor.fetchone()[0]
            nro_rendicion = f"{prefix}-{next_num:04d}"
            uuid_val = str(uuid.uuid4())
            
            cursor.execute("""
                INSERT INTO FinRendicionGastosCab
                (CodCia, NroRendicion, Fecha, Periodo, Moneda, CodAux, NomAux, RucDni, 
                 TipoRendicion, SaldoInicial, SaldoFinal, TotalGastado, TotalReembolso, Estado, UsuarioRegistro, UuidLink)
                OUTPUT INSERTED.Id
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRADO', ?, ?)
            """, (codcia, nro_rendicion, fecha, periodo, moneda, codaux, nomaux, rucdni, 
                  tipo_rendicion, saldo_inicial, saldo_final, total_gastado, total_reembolso, usuario, uuid_val))
            rendicion_id = cursor.fetchone()[0]
            
        # 2. Detalle
        for item in items:
            
            # Bloqueo Anti-Duplicados
            ref_id = item.get('doc_referencia_id')
            tipo_doc = item.get('tipo_doc')
            if ref_id and tipo_doc in ['01-Factura', '03-Boleta']:
                # Revisar si se usó en otra rendición
                cursor.execute("""
                    SELECT 1 FROM FinRendicionGastosDet d
                    INNER JOIN FinRendicionGastosCab c ON d.RendicionId = c.Id
                    WHERE d.DocReferenciaId = ? AND d.TipoDoc = ? AND c.Estado != 'ANULADO'
                """, (ref_id, tipo_doc))
                if cursor.fetchone():
                    raise HTTPException(status_code=400, detail=f"El comprobante {item.get('serie')}-{item.get('numero')} ya fue rendido.")

            # Bloqueo Planilla
            if ref_id and tipo_doc == 'PGM-Planilla':
                cursor.execute("SELECT 1 FROM FinPlanillaMovilidadCab WHERE Id = ? AND Estado = 'RENDIDO'", (ref_id,))
                if cursor.fetchone():
                    raise HTTPException(status_code=400, detail=f"La planilla {item.get('numero')} ya fue rendida.")

            cursor.execute("""
                INSERT INTO FinRendicionGastosDet
                (RendicionId, Fecha, TipoDoc, Serie, Numero, RucPro, NomPro, 
                 ProjectCard, CentroCostos, ExpenseCategory, Detalles, ImporteSoles, ImporteDolares, DocReferenciaId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (rendicion_id, item.get('fecha'), item.get('tipo_doc'), item.get('serie'), item.get('numero'),
                  item.get('ruc_pro'), item.get('nom_pro'), item.get('project_card'), item.get('centro_costos'),
                  item.get('expense_category'), item.get('detalles'), float(item.get('importe_soles') or 0), 
                  float(item.get('importe_dolares') or 0), item.get('doc_referencia_id')))
            
            # Si referenciamos una Planilla, actualizar su estado para que no se use doble
            if item.get('tipo_doc') == 'PGM-Planilla' and item.get('doc_referencia_id'):
                cursor.execute("UPDATE FinPlanillaMovilidadCab SET Estado = 'RENDIDO' WHERE Id = ?", (item['doc_referencia_id'],))
            
        # 3. Archivos
        for file in archivos:
            if file.filename:
                timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                sys_filename = f"rendicion_{rendicion_id}_{timestamp}_{file.filename}"
                file_path = os.path.join(upload_dir, sys_filename)
                
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                
                file_size = os.path.getsize(file_path)
                cursor.execute("""
                    INSERT INTO FinRendicionGastosAdjuntos 
                    (RendicionId, ArchivoNombre, ArchivoRuta, TipoMime, TamanoBytes)
                    VALUES (?, ?, ?, ?, ?)
                """, (rendicion_id, sys_filename, file_path, file.content_type, file_size))
                
        conn.commit()
        return {"status": "success", "id": rendicion_id, "nro_rendicion": nro_rendicion, "uuid_link": uuid_val}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/rendiciones")
def get_rendiciones(codcia: str = Query(...)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM FinRendicionGastosCab WHERE CodCia = ? ORDER BY FechaRegistro DESC", (codcia,))
        cols = [col[0] for col in cursor.description]
        results = [dict(zip(cols, row)) for row in cursor.fetchall()]
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/public/planillas/{uuid_link}")
def get_planilla_publica(uuid_link: str):
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM FinPlanillaMovilidadCab WHERE UuidLink = ?", (uuid_link,))
        row = cursor.fetchone()
        if not row: raise HTTPException(status_code=404, detail="No encontrada")
        cols = [col[0] for col in cursor.description]
        cab = dict(zip(cols, row))
        
        cursor.execute("SELECT nomcia, ruccia FROM AdmMcias WHERE codcia = ?", (cab['CodCia'],))
        cia = cursor.fetchone()
        if cia:
            cab['EmpresaNom'] = cia.nomcia
            cab['EmpresaRuc'] = cia.ruccia
            
        cursor.execute("SELECT * FROM FinPlanillaMovilidadDet WHERE PlanillaId = ?", (cab['Id'],))
        cols_det = [col[0] for col in cursor.description]
        det = [dict(zip(cols_det, r)) for r in cursor.fetchall()]
        
        cursor.execute("SELECT Id, ArchivoNombre, TipoMime FROM FinPlanillaMovilidadAdjuntos WHERE PlanillaId = ?", (cab['Id'],))
        cols_adj = [col[0] for col in cursor.description]
        adjuntos = [dict(zip(cols_adj, r)) for r in cursor.fetchall()]
        
        return {"cabecera": cab, "detalle": det, "adjuntos": adjuntos}
    finally:
        conn.close()

@router.get("/public/rendiciones/{uuid_link}")
def get_rendicion_publica(uuid_link: str):
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM FinRendicionGastosCab WHERE UuidLink = ?", (uuid_link,))
        row = cursor.fetchone()
        if not row: raise HTTPException(status_code=404, detail="No encontrada")
        cols = [col[0] for col in cursor.description]
        cab = dict(zip(cols, row))
        
        cursor.execute("SELECT nomcia, ruccia FROM AdmMcias WHERE codcia = ?", (cab['CodCia'],))
        cia = cursor.fetchone()
        if cia:
            cab['EmpresaNom'] = cia.nomcia
            cab['EmpresaRuc'] = cia.ruccia
            
        cursor.execute("""
            SELECT 
                d.*,
                ISNULL(f.Uuid, p.UuidLink) as UuidSoporte
            FROM FinRendicionGastosDet d
            LEFT JOIN CntFacturaCab f ON d.DocReferenciaId = f.Id AND d.TipoDoc IN ('01-Factura', '03-Boleta')
            LEFT JOIN FinPlanillaMovilidadCab p ON d.DocReferenciaId = p.Id AND d.TipoDoc = 'PGM-Planilla'
            WHERE d.RendicionId = ?
        """, (cab['Id'],))
        cols_det = [col[0] for col in cursor.description]
        det = [dict(zip(cols_det, r)) for r in cursor.fetchall()]
        
        cursor.execute("SELECT Id, ArchivoNombre, TipoMime FROM FinRendicionGastosAdjuntos WHERE RendicionId = ?", (cab['Id'],))
        cols_adj = [col[0] for col in cursor.description]
        adjuntos = [dict(zip(cols_adj, r)) for r in cursor.fetchall()]
        
        return {"cabecera": cab, "detalle": det, "adjuntos": adjuntos}
    finally:
        conn.close()

@router.get("/rendiciones/revision")
def get_rendiciones_para_revision(codcia: Optional[str] = Query(None)):
    """Si codcia no se envia trae todas, si se envia trae solo esa CIA"""
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        query = "SELECT r.*, e.nomcia FROM FinRendicionGastosCab r LEFT JOIN AdmMcias e ON r.CodCia = e.codcia"
        params = []
        if codcia:
            query += " WHERE r.CodCia = ?"
            params.append(codcia)
        query += " ORDER BY r.FechaRegistro DESC"
        
        cursor.execute(query, tuple(params))
        cols = [col[0] for col in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    finally:
        conn.close()

class AprobarRendicionInput(BaseModel):
    aprobador_documento: str
    aprobador_nombre: str

@router.post("/rendiciones/{id_rendicion}/aprobar")
def aprobar_rendicion(id_rendicion: int, data: AprobarRendicionInput):
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT FechaAprobacion FROM FinRendicionGastosCab WHERE Id = ?", (id_rendicion,))
        row = cursor.fetchone()
        if not row: raise HTTPException(status_code=404, detail="No encontrada")
        if row.FechaAprobacion: raise HTTPException(status_code=400, detail="Ya aprobada.")
        
        now = datetime.now()
        # Aprobar Rendicion
        cursor.execute("""
            UPDATE FinRendicionGastosCab 
            SET AprobadorDocumento = ?, AprobadorNombre = ?, FechaAprobacion = ? 
            WHERE Id = ?
        """, (data.aprobador_documento, data.aprobador_nombre, now, id_rendicion))
        
        # Aprobar Planillas Anidadas en este REPORTE para que también se firmen
        cursor.execute("""
            UPDATE FinPlanillaMovilidadCab 
            SET AprobadorDocumento = ?, AprobadorNombre = ?, FechaAprobacion = ?
            WHERE Id IN (SELECT DocReferenciaId FROM FinRendicionGastosDet WHERE RendicionId = ? AND TipoDoc = 'PGM-Planilla')
        """, (data.aprobador_documento, data.aprobador_nombre, now, id_rendicion))
        
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

from fastapi.responses import FileResponse

@router.get("/adjuntos/{tipo}/{id_adjunto}")
def descargar_adjunto(tipo: str, id_adjunto: int):
    """Descargar archivo adjunto de planilla o rendición"""
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        if tipo == 'planilla':
            cursor.execute("SELECT ArchivoRuta, ArchivoNombre, TipoMime FROM FinPlanillaMovilidadAdjuntos WHERE Id = ?", (id_adjunto,))
        elif tipo == 'rendicion':
            cursor.execute("SELECT ArchivoRuta, ArchivoNombre, TipoMime FROM FinRendicionGastosAdjuntos WHERE Id = ?", (id_adjunto,))
        else:
            raise HTTPException(status_code=400, detail="Tipo inválido")
            
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
            
        ruta, nombre, mime = row
        if not os.path.exists(ruta):
            raise HTTPException(status_code=404, detail="El archivo físico no existe")
            
        return FileResponse(path=ruta, filename=nombre, media_type=mime)
    finally:
        conn.close()
