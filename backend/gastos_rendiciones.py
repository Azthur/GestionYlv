from fastapi import APIRouter, HTTPException, Query, File, UploadFile, Form
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
import shutil
import json
import uuid

from database import get_db_connection

def normalize_moneda_valor(v):
    """Normaliza cualquier valor de moneda a '1' (Soles) o '2' (Dólares)"""
    if v is None:
        return '1'
    raw = str(v).strip().replace('.0', '').upper()
    if raw in ('2', 'USD', 'US$', 'ME', 'DOLARES'):
        return '2'
    return '1'

router = APIRouter(prefix="/api/finanzas", tags=["Finanzas - Gastos y Rendiciones"])

from dotenv import load_dotenv

load_dotenv()

FILE_SERVER = os.getenv("FILE_SERVER", "")
if FILE_SERVER:
    SMB_PATH = FILE_SERVER.replace("\\", "//")
    BASE_UPLOAD_DIR = os.getenv("ATTACHMENTS_ROOT", f"/mnt/smb/{SMB_PATH.replace('//', '').replace('/', '_')}")
else:
    BASE_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")

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
#  ENDPOINT PROVEEDORES (RUC Lookup y Creación)
# ════════════════════════════════════════════════════════════
from pydantic import BaseModel
class ProveedorCreate(BaseModel):
    codcia: str
    ruc: str
    razon_social: str
    direccion: str
    ubigeo: str = ""
    coddep: str = ""
    codpro: str = ""
    coddis: str = ""
    email: str = ""

@router.get("/proveedor/{ruc}")
def get_proveedor_ruc(ruc: str, codcia: str = Query(...)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        
        # 1. Buscar en BD local
        cursor.execute("""
            SELECT RTRIM(codaux) as codaux, RTRIM(nomaux) as nomaux, RTRIM(rucaux) as rucaux, RTRIM(diraux) as diraux 
            FROM CbdMAuxi 
            WHERE codcia = ? AND clfaux = '005' AND RTRIM(rucaux) = ?
        """, (codcia, ruc.strip()))
        row = cursor.fetchone()
        
        if row:
            cols = [col[0] for col in cursor.description]
            return {"origen": "local", "data": dict(zip(cols, row))}
            
        # 2. Buscar en API externa
        import requests
        url = f"https://api.org.pe/v1/ruc/{ruc.strip()}"
        headers = {'Authorization': 'Bearer 8b95d098223b4c2cbc4249d3fa490b17'}
        
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            api_data = resp.json()
            if api_data.get('success'):
                d = api_data['data']
                ubigeo_arr = d.get('ubigeo', [])
                
                return {
                    "origen": "api", 
                    "data": {
                        "rucaux": str(d.get('ruc', '')),
                        "nomaux": str(d.get('nombre_o_razon_social', '')),
                        "diraux": str(d.get('direccion_completa', '')),
                        "ubigeo": ubigeo_arr[2] if len(ubigeo_arr) > 2 else '',
                        "coddep": ubigeo_arr[0] if len(ubigeo_arr) > 0 else '',
                        "codpro": ubigeo_arr[1] if len(ubigeo_arr) > 1 else '',
                        "coddis": ubigeo_arr[2] if len(ubigeo_arr) > 2 else ''
                    }
                }
            else:
                raise HTTPException(status_code=404, detail="RUC no encontrado en la API.")
        else:
            raise HTTPException(status_code=404, detail="RUC no encontrado en la API externa.")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/proveedor")
def create_proveedor(prov: ProveedorCreate):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        jruc = prov.ruc[:15]
        jrs = prov.razon_social[:60]
        jdir = prov.direccion[:60] # diraux usually varchar(60) or 40
        xtpodoc = '6' if len(jruc) == 11 else '1'
        
        cursor.execute("""
            INSERT INTO Cbdmauxi 
            (CODCIA, clfaux, codaux, nomaux, diraux, rucaux, TLFaux, contacto, 
             coddep, codpro, coddis, ptolle, TPODOC, CODZON, CODNAC, CODVEN, 
             CODEST, CODRET, FCHALT, TPOVTA, EMAIL, pais, email2) 
            VALUES (?, '005', ?, ?, ?, ?, '', '', 
                    ?, ?, ?, '', ?, '06', '0001', '', 
                    '1', '2', GETDATE(), '02', ?, '', '')
        """, (
            prov.codcia[:3], jruc[:18], jrs[:200], jdir[:200], jruc[:18],
            prov.coddep[:4], prov.codpro[:4], prov.coddis[:4], xtpodoc[:4],
            prov.email[:100]
        ))
        conn.commit()
        return {"status": "success", "data": {"codaux": jruc, "nomaux": jrs, "rucaux": jruc, "diraux": jdir}}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
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
        
    upload_dir = os.path.join(BASE_UPLOAD_DIR, "planillas")
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
                RTRIM(f.CodTipoDoc) as TipoDoc,
                RTRIM(f.Serie) as Serie, 
                RTRIM(f.Numero) as Numero,
                f.FecEmision,
                f.Total,
                f.CodMoneda as CodMon,
                RTRIM(f.NumRucProveedor) as RucPro,
                RTRIM(f.NomProveedor) as NomPro,
                f.Id as FacturaId,
                ISNULL(f.Observaciones, '') as Observaciones
            FROM CntFacturaCab f
            WHERE f.Estado != 'Anulada' AND RTRIM(f.CodCia) = ?
            AND (f.Serie LIKE ? OR f.Numero LIKE ? OR f.NumRucProveedor LIKE ? OR f.NomProveedor LIKE ?)
            AND NOT EXISTS (
                SELECT 1 FROM FinRendicionGastosDet d
                INNER JOIN FinRendicionGastosCab c ON d.RendicionId = c.Id
                WHERE d.DocReferenciaId = f.Id 
                  AND d.TipoDoc IN ('01-Factura', '03-Boleta')
                  AND c.Estado != 'ANULADO'
            )
            ORDER BY f.FecEmision DESC
        """, (codcia, search, search, search, search))
        
        cols = [c[0] for c in cursor.description]
        results = [dict(zip(cols, row)) for row in cursor.fetchall()]
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/rendiciones/aprobadas")
def get_rendiciones_aprobadas(
    codcia: str = Query(...),
    ano: Optional[str] = Query("0"),
    mes: Optional[int] = Query(0)
):
    """Listar rendiciones aprobadas para enviar a Tesorería - EXCLUYE rendiciones ya en cargos"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        # Primero verificar qué estados existen
        cursor.execute("SELECT DISTINCT Estado FROM FinRendicionGastosCab WHERE RTRIM(CodCia) = ?", (codcia.strip(),))
        estados = cursor.fetchall()
        print(f"Estados encontrados en FinRendicionGastosCab: {estados}")

        # Filtrar por rendiciones que tienen FechaAprobacion (indica que están aprobadas)
        # EXCLUYE rendiciones que ya están en CntCargosDetalle (NroOrdenCompra = NroRendicion)
        where_clause = ""
        params = [codcia.strip()]
        if ano and ano != "0":
            where_clause += " AND YEAR(r.Fecha) = ?"
            params.append(ano)
        if mes and mes > 0:
            where_clause += " AND MONTH(r.Fecha) = ?"
            params.append(mes)

        cursor.execute(f"""
            SELECT Id, RTRIM(CodCia) as CodCia, NroRendicion, RTRIM(CodAux) as CodAux, RTRIM(NomAux) as NomAux,
                   Fecha, RTRIM(Moneda) as Moneda, TotalGastado, Estado, UuidLink
            FROM FinRendicionGastosCab r
            WHERE RTRIM(r.CodCia) = ?
              AND r.FechaAprobacion IS NOT NULL
              {{where_clause}}
              AND NOT EXISTS (
                  SELECT 1 FROM CntCargosDetalle d
                  WHERE RTRIM(d.NroOrdenCompra) = RTRIM(r.NroRendicion)
                    AND RTRIM(d.CodCiaOc) = RTRIM(r.CodCia)
              )
            ORDER BY r.Fecha DESC
        """.format(where_clause=where_clause), tuple(params))
        cols = [c[0] for c in cursor.description]
        data = []
        for r in cursor.fetchall():
            d = dict(zip(cols, r))
            if d.get('Fecha'):
                d['Fecha'] = d['Fecha'].strftime("%Y-%m-%d")
            if d.get('TotalGastado') is not None:
                d['TotalGastado'] = float(d['TotalGastado'])
            data.append(d)
        return data
    except Exception as e:
        print(f"Error en rendiciones-aprobadas: {e}")
        raise HTTPException(status_code=500, detail=str(e))
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
        
    upload_dir = os.path.join(BASE_UPLOAD_DIR, "rendiciones")
    os.makedirs(upload_dir, exist_ok=True)
    
    try:
        cursor = conn.cursor()
        items = json.loads(detalle)
        
        # Normalizar moneda a '1' o '2'
        moneda = normalize_moneda_valor(moneda)
        
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
        cursor.execute("""
            SELECT r.*, 
                   (SELECT TOP 1 Uuid FROM FinPagos p WHERE RTRIM(p.NroOrdenCompra) = RTRIM(r.NroRendicion) AND RTRIM(p.CodCia) = RTRIM(r.CodCia) ORDER BY p.FechaRegistro DESC) as PagoUuid
            FROM FinRendicionGastosCab r 
            WHERE RTRIM(r.CodCia) = ? 
            ORDER BY r.FechaRegistro DESC
        """, (codcia.strip(),))
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
            SET Estado = 'APROBADO', AprobadorDocumento = ?, AprobadorNombre = ?, FechaAprobacion = ?
            WHERE Id = ?
        """, (data.aprobador_documento, data.aprobador_nombre, now, id_rendicion))

        # Aprobar Planillas Anidadas en este REPORTE para que también se firmen
        cursor.execute("""
            UPDATE FinPlanillaMovilidadCab
            SET Estado = 'APROBADO', AprobadorDocumento = ?, AprobadorNombre = ?, FechaAprobacion = ?
            WHERE Id IN (SELECT DocReferenciaId FROM FinRendicionGastosDet WHERE RendicionId=? AND TipoDoc='PGM-Planilla')
        """, (data.aprobador_documento, data.aprobador_nombre, now, id_rendicion))

        # Marcar Facturas asociadas a esta Rendición como CONTABILIZADAS
        cursor.execute("""
            UPDATE CntFacturaCab
            SET Estado = 'CONTABILIZADA'
            WHERE Id IN (
                SELECT DocReferenciaId FROM FinRendicionGastosDet 
                WHERE RendicionId=? AND TipoDoc != 'PGM-Planilla' AND DocReferenciaId IS NOT NULL
            )
        """, (id_rendicion,))

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
            
        headers = {"Content-Disposition": f'inline; filename="{nombre}"'}
        return FileResponse(path=ruta, media_type=mime, headers=headers)
    finally:
        conn.close()

@router.delete("/adjuntos/{tipo}/{id_adjunto}")
def eliminar_adjunto(tipo: str, id_adjunto: int):
    """Eliminar archivo adjunto de planilla o rendición"""
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        if tipo == 'planilla':
            cursor.execute("SELECT ArchivoRuta FROM FinPlanillaMovilidadAdjuntos WHERE Id = ?", (id_adjunto,))
        elif tipo == 'rendicion':
            cursor.execute("SELECT ArchivoRuta FROM FinRendicionGastosAdjuntos WHERE Id = ?", (id_adjunto,))
        else:
            raise HTTPException(status_code=400, detail="Tipo inválido")
            
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
            
        ruta = row[0]
        
        # Eliminar archivo físico si existe
        if os.path.exists(ruta):
            try:
                os.remove(ruta)
            except Exception as e:
                print(f"Error eliminando archivo físico {ruta}: {e}")
                
        # Eliminar registro
        if tipo == 'planilla':
            cursor.execute("DELETE FROM FinPlanillaMovilidadAdjuntos WHERE Id = ?", (id_adjunto,))
        else:
            cursor.execute("DELETE FROM FinRendicionGastosAdjuntos WHERE Id = ?", (id_adjunto,))
            
        conn.commit()
        return {"status": "success"}
    finally:
        conn.close()

