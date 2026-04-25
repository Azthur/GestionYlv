"""
Módulo Cargos Documentales - Backend API
Flujo: Logística → Contabilidad → Tesquería
"""
from fastapi import APIRouter, HTTPException, Query, File, UploadFile, Form
from pydantic import BaseModel, field_validator
from typing import List, Optional
from datetime import datetime
import os
import shutil
from dotenv import load_dotenv

from database import get_db_connection

# Cargar variables de entorno
load_dotenv()

# ════════════════════════════════════════════════════════════
#  CONFIGURACIÓN DE SERVIDOR DE ARCHIVOS
# ════════════════════════════════════════════════════════════
FILE_SERVER = os.getenv("FILE_SERVER", "")
FILE_USER = os.getenv("FILE_USER", "")
FILE_PASSWORD = os.getenv("FILE_PASSWORD", "")

# Si hay servidor de archivos configurado, usarlo; si no, usar carpeta local
if FILE_SERVER:
    # Convertir ruta Windows SMB a formato Linux: \\server\share -> //server/share
    SMB_PATH = FILE_SERVER.replace("\\", "//")
    UPLOAD_DIR = os.getenv("ATTACHMENTS_ROOT", f"/mnt/smb/{SMB_PATH.replace('//', '').replace('/', '_')}")
else:
    UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "pagos")

# Subcarpeta específica para pagos
PAGOS_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "pagos")
os.makedirs(PAGOS_UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/cargos", tags=["Cargos Documentales"])

# ════════════════════════════════════════════════════════════
#  MODELOS PYDANTIC
# ════════════════════════════════════════════════════════════

class CargoDetalleItem(BaseModel):
    nro_orden_compra: str
    tipo_oc: str  # OC, FACTURA_SIN_OC, RENDICION
    codcia_oc: str
    anos_oc: str
    nro_factura: str
    monto_oc: float
    monto_factura: float
    proveedor: Optional[str] = None
    ruc_proveedor: Optional[str] = None
    moneda: Optional[str] = "PEN"  # CodMon de la OC: 1=PEN, 2=USD

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

def generar_cargo(payload: CargoCreate):
    """Crear un cargo documental con sus líneas de detalle"""
    # DEBUG: Verificar datos recibidos del frontend
    print(f"DEBUG generar_cargo: Recibidos {len(payload.detalle)} items")
    for idx, item in enumerate(payload.detalle):
        print(f"DEBUG Item {idx}: nro_orden_compra={item.nro_orden_compra}, tipo_oc={item.tipo_oc}, monto_oc={item.monto_oc}, monto_factura={item.monto_factura}")
    
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
            # Truncar todos los campos string para evitar error de truncamiento
            # Usar tamaños muy conservadores basados en la estructura típica de la tabla
            nro_oc = str(item.nro_orden_compra or '')[:30]  # VARCHAR(30) - permite NroRendicion completos
            tipo = str(item.tipo_oc or '')[:5]  # Reducido de 10 a 5 - solo guardar 'OC', 'FACT', 'REND'
            codcia = str(item.codcia_oc or '')[:5]  # Reducido de 10 a 5
            anos = str(item.anos_oc or '')[:10]
            nro_fac = str(item.nro_factura or '')[:30]  # Reducido de 50 a 30
            prov = str(item.proveedor or '')[:50]  # Reducido de 100 a 50
            ruc = str(item.ruc_proveedor or '')[:15]  # Reducido de 20 a 15
            
            # Normalizar moneda: aceptar cualquier forma (1, 2, '1', '2', '1.0', '2.0', 'PEN', 'USD')
            raw_moneda = str(item.moneda or '1').strip()
            # Eliminar .0 si viene como float serializado
            if raw_moneda.endswith('.0'):
                raw_moneda = raw_moneda[:-2]
            if raw_moneda in ('2', 'USD', 'US$', 'ME'):
                moneda = '2'
            else:
                moneda = '1'

            print(f"DEBUG: Insertando item - nro_oc: [{nro_oc}], tipo: [{tipo}], moneda: [{moneda}], monto_oc: {item.monto_oc}, monto_factura: {item.monto_factura}")
            try:
                cursor.execute("""
                    INSERT INTO CntCargosDetalle
                    (CargoId, NroOrdenCompra, TipoOc, CodCiaOc, AnosOc, NroFactura,
                     MontoOC, MontoFactura, Proveedor, RucProveedor, Moneda)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (cargo_id, nro_oc, tipo, codcia, anos, nro_fac, item.monto_oc, item.monto_factura, prov, ruc, moneda))
            except Exception as e:
                print(f"ERROR al insertar item: {e}")
                print(f"Tamaños: nro_oc={len(nro_oc)}, tipo={len(tipo)}, codcia={len(codcia)}, anos={len(anos)}, nro_fac={len(nro_fac)}, prov={len(prov)}, ruc={len(ruc)}")
                raise

        # Marcar facturas como CONTABILIZADA si se envía a Tesorería
        if payload.tipo_cargo == 'CONT_A_TES':
            for item in payload.detalle:
                if item.tipo_oc in ['OC', 'FACT'] and item.nro_factura and item.nro_factura != '-':
                    parts = item.nro_factura.split('-', 1)
                    if len(parts) == 2:
                        serie, numero = parts[0].strip(), parts[1].strip()
                        try:
                            cursor.execute("""
                                UPDATE CntFacturaCab
                                SET Estado = 'CONTABILIZADA'
                                WHERE RTRIM(CodCia) = ? AND RTRIM(Serie) = ? AND RTRIM(Numero) = ?
                                  AND Estado != 'Anulada'
                            """, (str(item.codcia_oc or '').strip(), serie, numero))
                        except Exception as e:
                            print(f"ERROR actualizando estado de factura a CONTABILIZADA: {e}")

        conn.commit()
        return {"status": "success", "nro_cargo": nro_cargo, "cargo_id": cargo_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ════════════════════════════════════════════════════════════
#  RUTAS GET
# ════════════════════════════════════════════════════════════

@router.get("/bandeja")
def get_cargos_bandeja(codcia: str = Query(...), current_area: str = Query(...)):
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SET ANSI_NULLS, ANSI_PADDING, ANSI_WARNINGS, ARITHABORT, CONCAT_NULL_YIELDS_NULL, QUOTED_IDENTIFIER ON;")
        
        query = '''
            SELECT c.Id as CargoId, RTRIM(c.NroCargo) as NroCargo, RTRIM(c.TipoCargo) as TipoCargo, 
                c.FechaCargo, c.FechaRecepcion, RTRIM(c.AreaOrigen) as AreaOrigen, RTRIM(c.AreaDestino) as AreaDestino, 
                RTRIM(c.Estado) as EstadoCargo,
                d.Id as DetalleId, RTRIM(d.NroOrdenCompra) as NroOrdenCompra, RTRIM(d.TipoOc) as TipoOc,
                RTRIM(d.NroFactura) as NroFactura, RTRIM(d.Proveedor) as Proveedor, d.MontoOC, d.MontoFactura,
                RTRIM(d.EstadoContable) as EstadoContable, RTRIM(d.CodCiaOc) as CodCiaOc, RTRIM(d.Moneda) as Moneda
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            WHERE RTRIM(c.CodCia) = ?
        '''
        
        if current_area == 'CONTABILIDAD':
            query += " AND (RTRIM(c.AreaDestino) = 'CONTABILIDAD' AND c.Estado IN ('PENDIENTE', 'RECIBIDO', 'PROCESADO'))"
        elif current_area == 'TESORERIA':
            query += " AND (RTRIM(c.AreaDestino) = 'TESORERIA' AND c.Estado IN ('PENDIENTE', 'RECIBIDO'))"
        
        query += " ORDER BY c.FechaCargo DESC"
        cursor.execute(query, (codcia,))
        cols = [col[0] for col in cursor.description]
        base_results = [dict(zip(cols, r)) for r in cursor.fetchall()]

        if not base_results: return []

        cursor.execute('''
            IF OBJECT_ID('tempdb..#TempOcs') IS NOT NULL DROP TABLE #TempOcs;
            CREATE TABLE #TempOcs (nrodoc VARCHAR(100) PRIMARY KEY)
        ''')
        nrodocs_set = list(set(r['NroOrdenCompra'].strip() for r in base_results if r.get('NroOrdenCompra')))
        if hasattr(cursor, 'fast_executemany'): cursor.fast_executemany = True
        vals = [(d,) for d in nrodocs_set]
        cursor.executemany("INSERT INTO #TempOcs (nrodoc) VALUES (?)", vals)

        cursor.execute('''SELECT RTRIM(f.NroOrdenCompra), RTRIM(MIN(f.Serie)) + '-' + RTRIM(MIN(f.Numero)), MIN(f.Uuid) FROM CntFacturaCab f INNER JOIN #TempOcs t ON RTRIM(f.NroOrdenCompra)=t.nrodoc WHERE f.Estado != 'Anulada' GROUP BY f.NroOrdenCompra''')
        factura_map = {r[0].strip(): {'factura': r[1], 'uuid': r[2]} for r in cursor.fetchall()}

        cursor.execute('''SELECT RTRIM(r.NroDoc), SUM(r.CanDes) FROM CmpROcom r INNER JOIN #TempOcs t ON RTRIM(r.NroDoc)=t.nrodoc WHERE RTRIM(r.CodCia)=? GROUP BY r.NroDoc''', (codcia.strip(),))
        pedida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}

        cursor.execute('''SELECT RTRIM(m.ordcmp), SUM(m.candes) FROM AlmRMovm m WITH(INDEX(PK_AlmRmovm)) INNER JOIN #TempOcs t ON RTRIM(m.ordcmp)=t.nrodoc WHERE RTRIM(m.CodCia)=? GROUP BY m.ordcmp''', (codcia.strip(),))
        recibida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}

        cursor.execute("DROP TABLE #TempOcs")

        for d in base_results:
            ncond = d['NroOrdenCompra'].strip() if d['NroOrdenCompra'] else ""
            fac_info = factura_map.get(ncond, {})
            if not d.get('NroFactura') or d['NroFactura'] == '-': d['NroFactura'] = fac_info.get('factura', '')
            d['FacturaUuid'] = fac_info.get('uuid')

            ped = pedida_map.get(ncond, 0.0)
            rec = recibida_map.get(ncond, 0.0)
            d['EstadoAlmacen'] = 'Pendiente'
            if ped > 0:
                if rec >= ped: d['EstadoAlmacen'] = 'Completo'
                elif rec > 0: d['EstadoAlmacen'] = 'Parcial'
            else: d['EstadoAlmacen'] = 'Sin Ítems'

            if d['FechaCargo']: d['FechaCargo'] = d['FechaCargo'].strftime("%Y-%m-%d %H:%M")
        return base_results

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

from fastapi import Request

@router.get("/ocs-disponibles-ssr")
def get_ocs_disponibles_ssr(request: Request):
    q = request.query_params
    draw = int(q.get("draw", 1))
    start = int(q.get("start", 0))
    length = int(q.get("length", 10))
    search_val = q.get("search[value]", "").strip()
    
    codcia = q.get("codcia", "")
    ano = q.get("ano", "")
    mes = int(q.get("mes", "0"))
    tipo_cargo = q.get("tipo_cargo", "LOG_A_CONT")
    login = q.get("login", "")
    tipo_oc = q.get("tipo_oc", "ALL")
    only_my_records = q.get("only_my_records", "true")
    ocs_directas = q.get("ocs_directas", "false")
    
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")

    try:
        cursor = conn.cursor()
        cursor.execute("SET ANSI_NULLS, ANSI_PADDING, ANSI_WARNINGS, ARITHABORT, CONCAT_NULL_YIELDS_NULL, QUOTED_IDENTIFIER ON;")

        login_clean = login.strip().upper() if login else None
        is_only_mine = (only_my_records.lower() == 'true')
        puede_ver_todo = False
        allowed_types = []
        is_directas = (ocs_directas.lower() == 'true')

        if tipo_cargo == 'LOG_A_CONT' and login_clean:
            is_admin_or_super = (login_clean == '71941916JL')
            if is_admin_or_super:
                puede_ver_todo = True
                allowed_types = ['M', 'S', 'T']
            else:
                cursor.execute("SELECT ISNULL(PuedeVerTodo, 0) FROM WebUsers WHERE login = ?", (login_clean,))
                r = cursor.fetchone()
                if r: puede_ver_todo = bool(r[0])
                cursor.execute("SELECT RTRIM(TipoOc) FROM WebUsuarioTipoOc WHERE Login = ?", (login_clean,))
                allowed_types = [row[0] for row in cursor.fetchall()]
        elif tipo_cargo == 'CONT_A_TES':
            puede_ver_todo = True
            allowed_types = ['M', 'S', 'T']

        # Determine Cargo valid lists before filtering bases (Only applies to Logistica/Tesoreria links)
        # We fetch all the states once for this company/year? No! Fetching states for 40,000 OCs is what we want to avoid inside SSR if possible!
        # Actually, since #TempOcs is so fast, we can just fetch the keys.
        
        # Base query to determine the eligible NroDocs
        # Wait, if we construct a base table...
        
        where_clauses = ["RTRIM(o.CodCia) = ?"]
        params = [codcia.strip()]
        
        if ano != "0": # '0' means Todos los Años
            where_clauses.append("RTRIM(o.Anos) = ?")
            params.append(ano.strip())
            
        if mes > 0:
            where_clauses.append("MONTH(o.Fchdoc) = ?")
            params.append(mes)
            
        if login_clean:
            if is_only_mine or not puede_ver_todo:
                where_clauses.append("RTRIM(o.Usuario) = ?")
                params.append(login_clean)

            if tipo_oc != 'ALL':
                if tipo_oc in allowed_types or puede_ver_todo:
                    where_clauses.append("RTRIM(o.TipoOc) = ?")
                    params.append(tipo_oc)
                else: return {"draw": draw, "recordsTotal": 0, "recordsFiltered": 0, "data": []}
            else:
                if not puede_ver_todo and allowed_types:
                    ph = ",".join(["?"] * len(allowed_types))
                    where_clauses.append(f"RTRIM(o.TipoOc) IN ({ph})")
                    params.extend(allowed_types)
                elif not puede_ver_todo and not allowed_types:
                    return {"draw": draw, "recordsTotal": 0, "recordsFiltered": 0, "data": []}
                    
        # Add Search Value Filter
        if search_val:
            where_clauses.append("(o.NroDoc LIKE ? OR o.NomAux LIKE ? OR o.RucAux LIKE ?)")
            params.extend([f"%{search_val}%", f"%{search_val}%", f"%{search_val}%"])

        where_sql = " AND ".join(where_clauses)
        
        # We need ALL eligible NroDocs first to handle the Logistica/Aceptados exclusions?
        # NO! If we do Log/Aceptados exclusions in Python after paginating, we break Pagination! (Page size will drop).
        # We MUST do Log/Aceptados exclusions IN SQL BEFORE ROW_NUMBER!
        
        # Let's write the Mega-Query with ROW_NUMBER!
        
        # Exclusions Logic:
        # If type is LOG_A_CONT: Exclude if NroDoc is in Cargo (not anulado).
        # If type is CONT_A_TES: 
        #   Normal path: Include if Logistica accepted it (and not in TES yet).
        #   Directa path: Include if NEVER touched by logistica (and not in TES yet).
        
        exclusion_joins = ""
        exclusion_where = ""
        
        if tipo_cargo == 'LOG_A_CONT':
            # Excluir OCs que ya están en cargos LOG_A_CONT no anulados (y no rechazadas)
            # TAMBIÉN excluir OCs que ya fueron enviadas a Tesorería (CONT_A_TES)
            exclusion_joins = ""
            exclusion_where = """ AND NOT EXISTS (
                SELECT 1 FROM CntCargosDetalle dlog
                INNER JOIN CntCargosDocumentales clog ON clog.Id = dlog.CargoId
                WHERE RTRIM(dlog.NroOrdenCompra) = RTRIM(o.NroDoc)
                AND RTRIM(dlog.CodCiaOc) = RTRIM(o.CodCia)
                AND RTRIM(dlog.AnosOc) = RTRIM(o.Anos)
                AND clog.TipoCargo = 'LOG_A_CONT'
                AND clog.Estado != 'ANULADO'
                AND ISNULL(dlog.EstadoContable, 'PENDIENTE') != 'RECHAZADO'
            )
            AND NOT EXISTS (
                SELECT 1 FROM CntCargosDetalle dtes
                INNER JOIN CntCargosDocumentales ctes ON ctes.Id = dtes.CargoId
                WHERE RTRIM(dtes.NroOrdenCompra) = RTRIM(o.NroDoc)
                AND RTRIM(dtes.CodCiaOc) = RTRIM(o.CodCia)
                AND RTRIM(dtes.AnosOc) = RTRIM(o.Anos)
                AND ctes.TipoCargo = 'CONT_A_TES'
                AND ctes.Estado != 'ANULADO'
            )"""
            
        elif tipo_cargo == 'CONT_A_TES':
            # Needs to know if it's already in TES
            exclusion_joins = ""
            # Excluir OCs que ya están en TES no anuladas (y no rechazadas)
            exclusion_where = """ AND NOT EXISTS (
                SELECT 1 FROM CntCargosDetalle dt
                INNER JOIN CntCargosDocumentales ct ON dt.CargoId = ct.Id
                WHERE RTRIM(dt.NroOrdenCompra) = RTRIM(o.NroDoc)
                AND RTRIM(dt.CodCiaOc) = RTRIM(o.CodCia)
                AND RTRIM(dt.AnosOc) = RTRIM(o.Anos)
                AND ct.TipoCargo = 'CONT_A_TES'
                AND ct.Estado != 'ANULADO'
                AND ISNULL(dt.EstadoContable, 'PENDIENTE') != 'RECHAZADO'
            )"""
            
            # Now, for logistica normal vs directa:
            if is_directas:
                # Checkbox MARCADO: Mostrar TODAS las OCs disponibles (no enviadas a TES)
                # Pero excluir las que ya están en LOG_A_CONT (para evitar duplicados)
                exclusion_where += """ AND NOT EXISTS (
                    SELECT 1 FROM CntCargosDetalle dlg
                    INNER JOIN CntCargosDocumentales clg ON clg.Id = dlg.CargoId
                    WHERE RTRIM(dlg.NroOrdenCompra) = RTRIM(o.NroDoc)
                    AND RTRIM(dlg.CodCiaOc) = RTRIM(o.CodCia)
                    AND RTRIM(dlg.AnosOc) = RTRIM(o.Anos)
                    AND clg.TipoCargo = 'LOG_A_CONT'
                    AND clg.Estado != 'ANULADO'
                )"""
            else:
                # Checkbox NO marcado: Mostrar SOLO OCs que fueron enviadas a Logistica y NO rechazadas
                # Las OCs deben estar en un cargo LOG_A_CONT (aceptadas o recibidas, pero no rechazadas)
                exclusion_where += """ AND EXISTS (
                    SELECT 1 FROM CntCargosDetalle dl
                    INNER JOIN CntCargosDocumentales cl ON dl.CargoId = cl.Id
                    WHERE RTRIM(dl.NroOrdenCompra) = RTRIM(o.NroDoc)
                    AND RTRIM(dl.CodCiaOc) = RTRIM(o.CodCia)
                    AND RTRIM(dl.AnosOc) = RTRIM(o.Anos)
                    AND cl.TipoCargo = 'LOG_A_CONT'
                    AND cl.Estado != 'ANULADO'
                    AND ISNULL(dl.EstadoContable, 'PENDIENTE') NOT IN ('RECHAZADO')
                )"""
            
            # Adicionalmente, excluir OCs que están en cargos LOG_A_CONT rechazados (para poder reenviar desde Logistica, no desde aquí)
            exclusion_where += """ AND NOT EXISTS (
                SELECT 1 FROM CntCargosDetalle dr
                INNER JOIN CntCargosDocumentales cr ON dr.CargoId = cr.Id
                WHERE RTRIM(dr.NroOrdenCompra) = RTRIM(o.NroDoc)
                AND RTRIM(dr.CodCiaOc) = RTRIM(o.CodCia)
                AND RTRIM(dr.AnosOc) = RTRIM(o.Anos)
                AND cr.TipoCargo = 'LOG_A_CONT'
                AND cr.Estado != 'ANULADO'
                AND dr.EstadoContable = 'RECHAZADO'
            )"""
            
        exclusion_where += """ AND NOT EXISTS (
            SELECT 1 FROM CntFacturaCab f
            INNER JOIN FinRendicionGastosDet rd ON f.Id = rd.DocReferenciaId
            INNER JOIN FinRendicionGastosCab rc ON rd.RendicionId = rc.Id
            WHERE RTRIM(f.NroOrdenCompra) = RTRIM(o.NroDoc)
              AND RTRIM(f.CodCia) = RTRIM(o.CodCia)
              AND rc.FechaAprobacion IS NOT NULL
        )"""
        
        # 1. Total Records Count (Filtered but without pagination)
        count_query = f"SELECT COUNT(*) FROM CmpVOcom o WITH (NOLOCK) {exclusion_joins} WHERE {where_sql} {exclusion_where}"
        cursor.execute(count_query, tuple(params))
        total_records = cursor.fetchone()[0]

        if total_records == 0:
            return {"draw": draw, "recordsTotal": 0, "recordsFiltered": 0, "data": []}

        # 2. Paginated Query with ROW_NUMBER()
        # DataTables usually wants DESC ordering on the first column or by Date
        order_by = "o.Fchdoc DESC" # Default
        
        query = f'''
            WITH CTE_Data AS (
                SELECT 
                    RTRIM(o.NroDoc) as nrodoc, RTRIM(o.TipoOc) as tipooc, RTRIM(o.Anos) as anos,
                    o.Fchdoc as fchdoc, RTRIM(o.NomAux) as proveedor, RTRIM(o.RucAux) as ruc,
                    o.CodMon as moneda, o.ImpTot as total_oc,
                    ROW_NUMBER() OVER (ORDER BY {order_by}) as rn
                    {", (SELECT TOP 1 RTRIM(clog.NroCargo) FROM CntCargosDetalle dlog INNER JOIN CntCargosDocumentales clog ON dlog.CargoId = clog.Id WHERE RTRIM(dlog.NroOrdenCompra) = RTRIM(o.NroDoc) AND RTRIM(dlog.CodCiaOc) = RTRIM(o.CodCia) AND RTRIM(dlog.AnosOc) = RTRIM(o.Anos) AND clog.TipoCargo = 'LOG_A_CONT' AND clog.Estado != 'ANULADO' ORDER BY clog.Id DESC) as cargo_origen" if tipo_cargo == 'CONT_A_TES' and not is_directas else ", NULL as cargo_origen"}
                FROM CmpVOcom o WITH (NOLOCK)
                {exclusion_joins}
                WHERE {where_sql} {exclusion_where}
            )
            SELECT * FROM CTE_Data WHERE rn > ? AND rn <= ?
        '''
        paginate_params = params + [start, start + length]
        cursor.execute(query, tuple(paginate_params))
        
        cols = [c[0] for c in cursor.description]
        base_ocs = [dict(zip(cols, row)) for row in cursor.fetchall()]
        
        if not base_ocs:
            return {"draw": draw, "recordsTotal": total_records, "recordsFiltered": total_records, "data": []}

        # Optimization: Fetch auxiliary data ONLY FOR THESE ~10 ITEMS!
        cursor.execute('''
            IF OBJECT_ID('tempdb..#TempOcs') IS NOT NULL DROP TABLE #TempOcs;
            CREATE TABLE #TempOcs (nrodoc VARCHAR(20) PRIMARY KEY)
        ''')
        
        nrodocs_set = list(set(r['nrodoc'] for r in base_ocs))
        if hasattr(cursor, 'fast_executemany'):
            cursor.fast_executemany = True
        
        vals = [(d,) for d in nrodocs_set]
        cursor.executemany("INSERT INTO #TempOcs (nrodoc) VALUES (?)", vals)
            
        cursor.execute('''
            SELECT RTRIM(f.NroOrdenCompra), RTRIM(MIN(f.Serie)) + '-' + RTRIM(MIN(f.Numero)), SUM(f.Total), MAX(f.FecEmision), MIN(f.Uuid), MIN(f.Id)
            FROM CntFacturaCab f INNER JOIN #TempOcs t ON RTRIM(f.NroOrdenCompra)=t.nrodoc 
            WHERE f.Estado != 'Anulada' GROUP BY f.NroOrdenCompra
        ''')
        factura_map = {}
        for r in cursor.fetchall():
            factura_map[r[0].strip()] = {'factura': r[1], 'total_factura': r[2], 'fec_factura': r[3], 'factura_uuid': r[4], 'fac_id': r[5]}

        cursor.execute('''SELECT RTRIM(r.NroDoc), SUM(r.CanDes) FROM CmpROcom r INNER JOIN #TempOcs t ON RTRIM(r.NroDoc)=t.nrodoc WHERE RTRIM(r.CodCia)=? GROUP BY r.NroDoc''', (codcia.strip(),))
        pedida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}

        cursor.execute('''SELECT RTRIM(m.ordcmp), SUM(m.candes) FROM AlmRMovm m WITH(INDEX(PK_AlmRmovm)) INNER JOIN #TempOcs t ON RTRIM(m.ordcmp)=t.nrodoc WHERE RTRIM(m.CodCia)=? GROUP BY m.ordcmp''', (codcia.strip(),))
        recibida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}
        
        cursor.execute("DROP TABLE #TempOcs")

        results = []
        for d in base_ocs:
            nro = d['nrodoc']
            fac_info = factura_map.get(nro, {})
            ped = pedida_map.get(nro, 0.0)
            rec = recibida_map.get(nro, 0.0)
            
            est_almacen = 'Pendiente'
            if ped > 0:
                if rec >= ped: est_almacen = 'COMPLETO'
                elif rec > 0: est_almacen = 'PARCIAL'
            else: est_almacen = 'Sin Items'

            d.update({
                'factura': fac_info.get('factura', ''),
                'total_factura': fac_info.get('total_factura', 0.0),
                'fec_factura': fac_info.get('fec_factura'),
                'factura_uuid': fac_info.get('factura_uuid'),
                'fac_id': fac_info.get('fac_id'),
                'cant_pedida': ped,
                'cant_recibida': rec,
                'estado_almacen': est_almacen,
                'observacion_rechazo': '', # Can fetch if needed but not strictly required
                'cargo_origen': d.get('cargo_origen', '')
            })
            if d['fchdoc']:
                d['fchdoc'] = d['fchdoc'].strftime("%Y-%m-%d")

            results.append(d)

        return {
            "draw": draw,
            "recordsTotal": total_records,
            "recordsFiltered": total_records,  # Normally total after search filter
            "data": results
        }

    except Exception as e:
        print("Error SSR:", str(e))
        return {"draw": draw, "recordsTotal": 0, "recordsFiltered": 0, "data": []}
    finally:
        conn.close()




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
    moneda: Optional[str] = "1"

    @field_validator('moneda', mode='before')
    @classmethod
    def coerce_moneda(cls, v):
        """Aceptar int, float o str para moneda y siempre convertir a str"""
        if v is None:
            return '1'
        return str(v).strip()

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
            SELECT TOP 2000 c.Id, RTRIM(c.CodCia) as CodCia, RTRIM(c.NroCargo) as NroCargo,
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
    estado: str = Query(None),
    ano: str = Query(None),
    mes: int = Query(0)
):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SET ANSI_NULLS, ANSI_PADDING, ANSI_WARNINGS, ARITHABORT, CONCAT_NULL_YIELDS_NULL, QUOTED_IDENTIFIER ON;")

        # Base query to get Cargo + Detalle
        query = '''
            SELECT TOP 4000 c.Id as CargoId, RTRIM(c.NroCargo) as NroCargo, RTRIM(c.TipoCargo) as TipoCargo,
                c.FechaCargo, c.FechaRecepcion, RTRIM(c.AreaOrigen) as AreaOrigen, RTRIM(c.AreaDestino) as AreaDestino,
                RTRIM(c.Estado) as EstadoCargo,
                d.Id as DetalleId, RTRIM(d.NroOrdenCompra) as NroOrdenCompra, RTRIM(d.TipoOc) as TipoOc,
                RTRIM(d.NroFactura) as NroFactura, RTRIM(d.Proveedor) as Proveedor, d.MontoOC, d.MontoFactura,
                RTRIM(d.EstadoContable) as EstadoContable, RTRIM(d.CodCiaOc) as CodCiaOc, ISNULL(RTRIM(d.Moneda), 'PEN') as Moneda
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            WHERE RTRIM(c.CodCia) = ?
        '''

        params = [codcia]
        if ano and ano != "0":
            query += " AND YEAR(c.FechaCargo) = ?"
            params.append(ano)
        if mes and mes > 0:
            query += " AND MONTH(c.FechaCargo) = ?"
            params.append(mes)

        if area_destino:
            query += " AND RTRIM(c.AreaDestino) = ?"
            params.append(area_destino)
        if estado:
            query += " AND RTRIM(c.Estado) = ?"
            params.append(estado)
        
        query += " ORDER BY c.FechaCargo DESC"
        cursor.execute(query, tuple(params))
        
        cols = [col[0] for col in cursor.description]
        base_results = [dict(zip(cols, r)) for r in cursor.fetchall()]

        if not base_results:
            return []

        # Optimization: Push base NroDocs to #TempOcs
        cursor.execute('''
            IF OBJECT_ID('tempdb..#TempOcs') IS NOT NULL DROP TABLE #TempOcs;
            CREATE TABLE #TempOcs (nrodoc VARCHAR(100) PRIMARY KEY)
        ''')
        
        nrodocs_set = list(set(r['NroOrdenCompra'].strip() for r in base_results if r.get('NroOrdenCompra')))
        if hasattr(cursor, 'fast_executemany'):
            cursor.fast_executemany = True
            
        chunk_size = 1000
        for i in range(0, len(nrodocs_set), chunk_size):
            chunk = nrodocs_set[i:i+chunk_size]
            vals = [(d,) for d in chunk]
            cursor.executemany("INSERT INTO #TempOcs (nrodoc) VALUES (?)", vals)

        # Build maps using SQL JOINs
        cursor.execute('''
            SELECT RTRIM(f.NroOrdenCompra), RTRIM(MIN(f.Serie)) + '-' + RTRIM(MIN(f.Numero)), MIN(f.Uuid), MIN(f.Id)
            FROM CntFacturaCab f INNER JOIN #TempOcs t ON RTRIM(f.NroOrdenCompra)=t.nrodoc 
            WHERE f.Estado != 'Anulada' GROUP BY f.NroOrdenCompra
        ''')
        factura_map = {r[0].strip(): {'factura': r[1], 'uuid': r[2], 'fac_id': r[3]} for r in cursor.fetchall()}

        cursor.execute('''SELECT RTRIM(r.NroDoc), SUM(r.CanDes) FROM CmpROcom r INNER JOIN #TempOcs t ON RTRIM(r.NroDoc)=t.nrodoc WHERE RTRIM(r.CodCia)=? GROUP BY r.NroDoc''', (codcia.strip(),))
        pedida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}

        cursor.execute('''SELECT RTRIM(m.ordcmp), SUM(m.candes) FROM AlmRMovm m WITH(INDEX(PK_AlmRmovm)) INNER JOIN #TempOcs t ON RTRIM(m.ordcmp)=t.nrodoc WHERE RTRIM(m.CodCia)=? GROUP BY m.ordcmp''', (codcia.strip(),))
        recibida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}

        cursor.execute("DROP TABLE #TempOcs")

        for d in base_results:
            ncond = d['NroOrdenCompra']
            if not ncond: ncond = ""
            ncond = ncond.strip()

            fac_info = factura_map.get(ncond, {})
            # Only override if detail doesn't already have a valid NroFactura recorded
            if not d.get('NroFactura') or d['NroFactura'] == '-':
                d['NroFactura'] = fac_info.get('factura', '')
            d['FacturaUuid'] = fac_info.get('uuid')

            ped = pedida_map.get(ncond, 0.0)
            rec = recibida_map.get(ncond, 0.0)

            est_almacen = 'Pendiente'
            if ped > 0:
                if rec >= ped: est_almacen = 'Completo'
                elif rec > 0: est_almacen = 'Parcial'
            else: est_almacen = 'Sin Ítems'
            d['EstadoAlmacen'] = est_almacen

            if d['FechaCargo']: d['FechaCargo'] = d['FechaCargo'].strftime("%Y-%m-%d %H:%M")
            if d['FechaRecepcion']: d['FechaRecepcion'] = d['FechaRecepcion'].strftime("%Y-%m-%d %H:%M")

        return base_results

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
    tipo_cargo: str = Query("LOG_A_CONT"),
    login: str = Query(None),
    tipo_oc: str = Query("ALL"),
    only_my_records: str = Query("true"),
    ocs_directas: str = Query("false")
):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")

    try:
        cursor = conn.cursor()
        cursor.execute("SET ANSI_NULLS, ANSI_PADDING, ANSI_WARNINGS, ARITHABORT, CONCAT_NULL_YIELDS_NULL, QUOTED_IDENTIFIER ON;")

        login_clean = login.strip().upper() if login else None
        is_only_mine = (only_my_records.lower() == 'true')
        puede_ver_todo = False
        allowed_types = []
        is_directas = (ocs_directas.lower() == 'true')

        if tipo_cargo == 'LOG_A_CONT' and login_clean:
            is_admin_or_super = (login_clean == '71941916JL')
            if is_admin_or_super:
                puede_ver_todo = True
                allowed_types = ['M', 'S', 'T']
            else:
                cursor.execute("SELECT ISNULL(PuedeVerTodo, 0) FROM WebUsers WHERE login = ?", (login_clean,))
                r = cursor.fetchone()
                if r: puede_ver_todo = bool(r[0])
                cursor.execute("SELECT RTRIM(TipoOc) FROM WebUsuarioTipoOc WHERE Login = ?", (login_clean,))
                allowed_types = [row[0] for row in cursor.fetchall()]
        elif tipo_cargo == 'CONT_A_TES':
            puede_ver_todo = True
            allowed_types = ['M', 'S', 'T']

        query_base = '''
            SELECT 
                RTRIM(o.NroDoc) as nrodoc, RTRIM(o.TipoOc) as tipooc, RTRIM(o.Anos) as anos,
                o.Fchdoc as fchdoc, RTRIM(o.NomAux) as proveedor, RTRIM(o.RucAux) as ruc,
                o.CodMon as moneda, o.ImpTot as total_oc
            FROM CmpVOcom o
            WHERE RTRIM(o.CodCia) = ? AND RTRIM(o.Anos) = ?
        '''
        params = [codcia.strip(), ano.strip()]

        if mes and int(mes) > 0:
            query_base += " AND MONTH(o.Fchdoc) = ?"
            params.append(int(mes))

        if login_clean:
            if is_only_mine or not puede_ver_todo:
                query_base += " AND RTRIM(o.Usuario) = ?"
                params.append(login_clean)

            if tipo_oc != 'ALL':
                if tipo_oc in allowed_types or puede_ver_todo:
                    query_base += " AND RTRIM(o.TipoOc) = ?"
                    params.append(tipo_oc)
                else: return []
            else:
                if not puede_ver_todo and allowed_types:
                    ph = ",".join(["?"] * len(allowed_types))
                    query_base += f" AND RTRIM(o.TipoOc) IN ({ph})"
                    params.extend(allowed_types)
                elif not puede_ver_todo and not allowed_types:
                    return []

        # EXCLUIR OCs que ya están en cargos documentales LOG_A_CONT (no anulados y no rechazadas)
        # TAMBIÉN excluir OCs que ya fueron enviadas a Tesorería (CONT_A_TES)
        query_base += """ AND NOT EXISTS (
            SELECT 1 FROM CntCargosDetalle d
            INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id
            WHERE RTRIM(d.NroOrdenCompra) = RTRIM(o.NroDoc)
            AND RTRIM(d.CodCiaOc) = RTRIM(o.CodCia)
            AND c.TipoCargo = 'LOG_A_CONT'
            AND c.Estado != 'ANULADO'
            AND ISNULL(d.EstadoContable, 'PENDIENTE') != 'RECHAZADO'
        )
        AND NOT EXISTS (
            SELECT 1 FROM CntCargosDetalle dtes
            INNER JOIN CntCargosDocumentales ctes ON dtes.CargoId = ctes.Id
            WHERE RTRIM(dtes.NroOrdenCompra) = RTRIM(o.NroDoc)
            AND RTRIM(dtes.CodCiaOc) = RTRIM(o.CodCia)
            AND ctes.TipoCargo = 'CONT_A_TES'
            AND ctes.Estado != 'ANULADO'
        )"""

        # Get the Base OCs to Python first to drastically shrink Temp table size
        cursor.execute(query_base, tuple(params))
        cols1 = [c[0] for c in cursor.description]
        base_ocs = [dict(zip(cols1, row)) for row in cursor.fetchall()]
        if not base_ocs: return []

        # Optimization: Push base NroDocs to #TempOcs
        cursor.execute('''
            IF OBJECT_ID('tempdb..#TempOcs') IS NOT NULL DROP TABLE #TempOcs;
            CREATE TABLE #TempOcs (nrodoc VARCHAR(20) PRIMARY KEY)
        ''')
        
        nrodocs_set = list(set(r['nrodoc'] for r in base_ocs))
        # Batch insert for speed
        if hasattr(cursor, 'fast_executemany'):
            cursor.fast_executemany = True
        
        chunk_size = 1000
        for i in range(0, len(nrodocs_set), chunk_size):
            chunk = nrodocs_set[i:i+chunk_size]
            vals = [(d,) for d in chunk]
            cursor.executemany("INSERT INTO #TempOcs (nrodoc) VALUES (?)", vals)
            
        # Bulk Fetch Facturas
        cursor.execute('''
            SELECT RTRIM(NroOrdenCompra), RTRIM(Serie) + '-' + RTRIM(Numero), Total, FecEmision, Uuid, Id
            FROM CntFacturaCab f INNER JOIN #TempOcs t ON RTRIM(f.NroOrdenCompra)=t.nrodoc 
            WHERE f.Estado != 'Anulada'
        ''')
        factura_map = {}
        for r in cursor.fetchall():
            factura_map[r[0].strip()] = {'factura': r[1], 'total_factura': r[2], 'fec_factura': r[3], 'factura_uuid': r[4], 'fac_id': r[5]}

        # Bulk Fetch Pedida
        cursor.execute('''SELECT RTRIM(r.NroDoc), SUM(r.CanDes) FROM CmpROcom r INNER JOIN #TempOcs t ON RTRIM(r.NroDoc)=t.nrodoc WHERE RTRIM(r.CodCia)=? GROUP BY r.NroDoc''', (codcia.strip(),))
        pedida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}

        # Bulk Fetch Recibida
        cursor.execute('''SELECT RTRIM(m.ordcmp), SUM(m.candes) FROM AlmRMovm m WITH(INDEX(PK_AlmRmovm)) INNER JOIN #TempOcs t ON RTRIM(m.ordcmp)=t.nrodoc WHERE RTRIM(m.CodCia)=? GROUP BY m.ordcmp''', (codcia.strip(),))
        recibida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}

        # Cargos states via Joins
        cursor.execute('''
            SELECT DISTINCT RTRIM(d.NroOrdenCompra), RTRIM(c.TipoCargo), ISNULL(RTRIM(d.EstadoContable), 'PENDIENTE'), RTRIM(d.ObservacionRechazo) 
            FROM CntCargosDetalle d INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id INNER JOIN #TempOcs t ON RTRIM(d.NroOrdenCompra)=t.nrodoc 
            WHERE RTRIM(c.CodCia)=? AND c.Estado != 'ANULADO'
        ''', (codcia.strip(),))
        
        log_existentes = set()
        log_aceptados = set()
        log_rechazados = set()
        rechazo_obs = {}
        tes_existentes = set()
        
        for r in cursor.fetchall():
            ndoc = r[0].strip()
            tcargo = r[1]
            econt = r[2]
            obs = r[3]
            
            if tcargo == 'LOG_A_CONT':
                if econt != 'RECHAZADO':
                    log_existentes.add(ndoc)
                if econt == 'ACEPTADO':
                    log_aceptados.add(ndoc)
                if econt == 'RECHAZADO':
                    log_rechazados.add(ndoc)
                    rechazo_obs[ndoc] = obs
                    
            if tcargo == 'CONT_A_TES' and econt != 'RECHAZADO':
                tes_existentes.add(ndoc)

        cursor.execute("DROP TABLE #TempOcs")

        results = []
        for d in base_ocs:
            nro = d['nrodoc']

            if tipo_cargo == 'LOG_A_CONT':
                if nro in log_existentes: continue
            elif tipo_cargo == 'CONT_A_TES':
                if nro in tes_existentes: continue
                
                # Check normal logistica route
                is_normal = (nro in log_aceptados)
                
                if not is_normal:
                    # User clicked filterDirectasCont checkbox! (is_directas = true)
                    # We show ONLY OCs that were NEVER recorded by Logistica, NOR rejected!
                    # Wait, if it was logged but not accepted, it shouldn't show as directa.
                    # Or maybe if it's completely untouched by logistica?
                    if not is_directas:
                        continue
                    if nro in log_existentes or nro in log_rechazados:
                        # Can't bypass if Logistica already grabbed it and it's pending/rejected.
                        continue

            fac_info = factura_map.get(nro, {})
            ped = pedida_map.get(nro, 0.0)
            rec = recibida_map.get(nro, 0.0)
            
            est_almacen = 'Pendiente'
            if ped > 0:
                if rec >= ped: est_almacen = 'Completo'
                elif rec > 0: est_almacen = 'Parcial'
            else:
                est_almacen = 'Sin Ítems'

            estado_doc = ''
            if nro in rechazo_obs:
                estado_doc = f"Rechazado: {rechazo_obs[nro]}"

            d.update({
                'factura': fac_info.get('factura', ''),
                'total_factura': fac_info.get('total_factura', 0.0),
                'fec_factura': fac_info.get('fec_factura'),
                'factura_uuid': fac_info.get('factura_uuid'),
                'fac_id': fac_info.get('fac_id'),
                'cant_pedida': ped,
                'cant_recibida': rec,
                'estado_almacen': est_almacen,
                'estado_documental': estado_doc
            })
            if d['fchdoc']:
                d['fchdoc'] = d['fchdoc'].strftime("%Y-%m-%d")
            if d['fec_factura']:
                d['fec_factura'] = d['fec_factura'].strftime("%Y-%m-%d")

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
                RTRIM(d.AnosOc) as AnosOc,
                RTRIM(d.NroFactura) as NroFactura,
                RTRIM(d.Proveedor) as Proveedor,
                RTRIM(d.RucProveedor) as RucProveedor,
                d.MontoOC,
                d.MontoFactura, RTRIM(d.EstadoContable) as EstadoContable, RTRIM(d.Moneda) as Moneda,
                ISNULL(d.TipoDocumento, 'OC') as TipoDocumento,
                ISNULL(d.TipoComprobante, '') as TipoComprobante,
                ISNULL(d.FechaEmision, '') as FechaEmision,
                ISNULL(d.FechaVencimiento, '') as FechaVencimiento,
                ISNULL(d.MontoRendicion, 0) as MontoRendicion,
                ISNULL(d.Moneda, 'PEN') as Moneda
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            WHERE RTRIM(c.CodCia) = ?
              AND RTRIM(c.TipoCargo) = 'CONT_A_TES'
              AND c.Estado IN ('RECIBIDO', 'PENDIENTE')
              AND ISNULL(RTRIM(d.EstadoContable), 'PENDIENTE') NOT IN ('PAGADO', 'RECHAZADO')
            ORDER BY c.FechaCargo DESC
        """, (codcia.strip(),))
        cols = [col[0] for col in cursor.description]
        base_results = [dict(zip(cols, r)) for r in cursor.fetchall()]

        if not base_results:
            return []

        def chunked(lst, n):
            for i in range(0, len(lst), n):
                yield lst[i:i + n]

        nrodocs = list(set(r['NroOrdenCompra'].strip() for r in base_results if r.get('NroOrdenCompra')))
        nrofacs = list(set(r['NroFactura'].strip() for r in base_results if r.get('NroFactura') and r['NroFactura'].strip()))
        CHUNK = 1000

        factura_map = {}
        factura_fechas_map = {}  # {NroFactura: {FechaEmision, FechaVencimiento, Uuid}}
        ocom_map = {}

        # Buscar facturas por NroOrdenCompra
        for chunk in chunked(nrodocs, CHUNK):
            ph = ",".join(["?"] * len(chunk))
            try:
                cursor.execute(f"""
                    SELECT RTRIM(NroOrdenCompra), RTRIM(Serie)+'-'+RTRIM(Numero), RTRIM(Uuid),
                           FechaEmision, FechaVencimiento
                    FROM CntFacturaCab
                    WHERE RTRIM(NroOrdenCompra) IN ({ph}) AND Estado != 'Anulada'
                """, tuple(chunk))
                for row in cursor.fetchall():
                    serie_num = row[1]
                    factura_map[(row[0], serie_num)] = row[2]
                    factura_fechas_map[serie_num] = {
                        'FechaEmision': row[3],
                        'FechaVencimiento': row[4],
                        'Uuid': row[2]
                    }
            except:
                pass

        def strip_fac(nf):
            if not nf or '-' not in nf: return nf
            s, n = nf.split('-', 1)
            n_clean = n.lstrip('0')
            return f"{s}-{n_clean}" if n_clean else f"{s}-0"

        expanded_nrofacs = []
        for nf in nrofacs:
            if '-' in nf:
                s, n = nf.split('-', 1)
                n_clean = n.lstrip('0')
                if not n_clean: n_clean = '0'
                expanded_nrofacs.extend([nf, f"{s}-{n_clean}", f"{s}-{n_clean.zfill(8)}", f"{s}-{n_clean.zfill(7)}"])
            else:
                expanded_nrofacs.append(nf)
        expanded_nrofacs = list(set(expanded_nrofacs))

        # Buscar facturas por Serie-Numero directamente (para facturas sin OC)
        for chunk in chunked(expanded_nrofacs, CHUNK):
            ph = ",".join(["?"] * len(chunk))
            try:
                cursor.execute(f"""
                    SELECT RTRIM(Serie)+'-'+RTRIM(Numero), RTRIM(Uuid), 
                           FechaEmision, FechaVencimiento, RTRIM(NroOrdenCompra)
                    FROM CntFacturaCab
                    WHERE RTRIM(Serie)+'-'+RTRIM(Numero) IN ({ph}) AND Estado != 'Anulada'
                """, tuple(chunk))
                for row in cursor.fetchall():
                    serie_num = row[0]
                    stripped_sn = strip_fac(serie_num)
                    if stripped_sn not in factura_fechas_map:
                        factura_fechas_map[stripped_sn] = {
                            'FechaEmision': row[2],
                            'FechaVencimiento': row[3],
                            'Uuid': row[1]
                        }
                    # Agregar al factura_map con OC vacía para fallback
                    oc = (row[4] or '').strip()
                    if (oc, stripped_sn) not in factura_map:
                        factura_map[(oc, stripped_sn)] = row[1]
                    if ('', stripped_sn) not in factura_map:
                        factura_map[('', stripped_sn)] = row[1]
            except:
                pass
            
            try:
                cursor.execute(f"""
                    SELECT RTRIM(NroDoc), Fchdoc, RTRIM(CodMon), RTRIM(Anos), RTRIM(TipoOc)
                    FROM CmpVOcom
                    WHERE RTRIM(NroDoc) IN ({ph})
                """, tuple(chunk))
                for row in cursor.fetchall():
                    ocom_map[(row[0].strip(), row[3].strip(), row[4].strip())] = {'Fchdoc': row[1], 'CodMon': row[2]}
            except:
                pass

        # Buscar información de Rendiciones
        rendiciones_map = {}
        for chunk in chunked(nrodocs, CHUNK):
            ph = ",".join(["?"] * len(chunk))
            try:
                cursor.execute(f"""
                    SELECT RTRIM(NroRendicion), Fecha, TotalGastado, TotalReembolso, UuidLink
                    FROM FinRendicionGastosCab
                    WHERE RTRIM(NroRendicion) IN ({ph})
                """, tuple(chunk))
                for row in cursor.fetchall():
                    rendiciones_map[row[0].strip()] = {
                        'Fecha': row[1],
                        'TotalGastado': row[2],
                        'TotalReembolso': row[3],
                        'UuidLink': row[4]
                    }
            except:
                pass

        results = []
        for r in base_results:
            if r.get('FechaCargo') and hasattr(r['FechaCargo'], 'strftime'):
                r['FechaCargo'] = r['FechaCargo'].strftime("%Y-%m-%d %H:%M")

            nro_oc = (r.get('NroOrdenCompra') or '').strip()
            nro_fac = (r.get('NroFactura') or '').strip()

            # Enlaces a documentos — buscar por (nro_oc, nro_fac) O por ('', nro_fac) para facturas sin OC
            nro_fac_stripped = strip_fac(nro_fac) if 'strip_fac' in locals() else nro_fac
            
            r['FacturaUuid'] = factura_map.get((nro_oc, nro_fac_stripped), None)
            if not r['FacturaUuid'] and nro_fac_stripped:
                r['FacturaUuid'] = factura_map.get(('', nro_fac_stripped), None)
                # También buscar sin importar la OC
                for k, v in factura_map.items():
                    if k[1] == nro_fac_stripped and v:
                        r['FacturaUuid'] = v
                        break

            # Fechas de factura desde CntFacturaCab
            fac_info = factura_fechas_map.get(nro_fac_stripped, {})
            if fac_info:
                if not r.get('FechaEmision') or str(r.get('FechaEmision','')).strip() in ('', 'None'):
                    r['FechaEmision'] = fac_info.get('FechaEmision')
                if not r.get('FechaVencimiento') or str(r.get('FechaVencimiento','')).strip() in ('', 'None'):
                    r['FechaVencimiento'] = fac_info.get('FechaVencimiento')


            # Formatear fechas
            for fcol in ('FechaEmision', 'FechaVencimiento'):
                val = r.get(fcol)
                if val and hasattr(val, 'strftime'):
                    r[fcol] = val.strftime("%Y-%m-%d")

            # Info OC
            anos_oc = (r.get('AnosOc') or '').strip()
            tipo_oc = (r.get('TipoOc') or '').strip()
            ocom_data = ocom_map.get((nro_oc, anos_oc, tipo_oc))
            if not ocom_data:
                for k, v in ocom_map.items():
                    if k[0] == nro_oc and k[1] == anos_oc:
                        ocom_data = v
                        break
            if not ocom_data:
                ocom_data = {}
                
            fchdoc = ocom_data.get('Fchdoc')
            if fchdoc and hasattr(fchdoc, 'strftime'):
                r['FechaOC'] = fchdoc.strftime("%Y-%m-%d")
            else:
                r['FechaOC'] = None
            r['MonedaOC'] = ocom_data.get('CodMon', 'PEN')

            # Info Rendición
            rend_data = rendiciones_map.get(nro_oc, {})
            if rend_data:
                r['FechaRendicion'] = rend_data.get('Fecha')
                if r['FechaRendicion'] and hasattr(r['FechaRendicion'], 'strftime'):
                    r['FechaRendicion'] = r['FechaRendicion'].strftime("%Y-%m-%d")
                r['TotalGastado'] = float(rend_data.get('TotalGastado', 0))
                r['TotalReembolso'] = float(rend_data.get('TotalReembolso', 0))
                r['RendicionUuid'] = rend_data.get('UuidLink')
            else:
                r['FechaRendicion'] = None
                r['TotalGastado'] = 0
                r['TotalReembolso'] = 0
                r['RendicionUuid'] = None

            # Normalizar moneda
            moneda = r.get('Moneda') or r.get('MonedaOC') or 'PEN'
            if moneda == '1':
                r['Moneda'] = 'PEN'
                r['MonedaDesc'] = 'Soles'
            elif moneda == '2':
                r['Moneda'] = 'USD'
                r['MonedaDesc'] = 'Dólares'
            else:
                r['Moneda'] = moneda
                r['MonedaDesc'] = 'Soles' if moneda == 'PEN' else 'Dólares'

            # Determinar tipo de documento principal
            tipo_doc = r.get('TipoDocumento', 'OC')
            
            # Auto-detectar facturas sin OC
            if (not nro_oc or nro_oc == '-') and nro_fac:
                tipo_doc = 'FACTURA_SIN_OC'
                
            # Auto-detectar rendiciones por NroOrdenCompra que empieza con 'RG-'
            if nro_oc.upper().startswith('RG-') or nro_oc.upper().startswith('RG0'):
                tipo_doc = 'RENDICION'

            if tipo_doc == 'FACTURA_SIN_OC':
                r['TipoDocDesc'] = 'Factura'
                r['NroDocPrincipal'] = r.get('NroFactura', '')
                r['ImportePrincipal'] = float(r.get('MontoFactura', 0))
                r['TipoDocumento'] = 'FACTURA_SIN_OC'
            elif tipo_doc == 'RENDICION':
                r['TipoDocDesc'] = 'Rendición'
                r['NroDocPrincipal'] = nro_oc
                r['TipoDocumento'] = 'RENDICION'
                r['ImportePrincipal'] = float(r.get('TotalReembolso', 0) or r.get('MontoRendicion', 0))
                # NroRendicion para mostrar
                r['NroRendicion'] = nro_oc
            else:
                r['TipoDocDesc'] = 'OC'
                r['NroDocPrincipal'] = nro_oc
                if r.get('MontoFactura') and r.get('MontoFactura') > 0:
                    r['ImportePrincipal'] = float(r.get('MontoFactura', 0))
                else:
                    r['ImportePrincipal'] = float(r.get('MontoOC', 0))

            # Formatear importes
            r['MontoOC'] = float(r.get('MontoOC', 0))
            r['MontoFactura'] = float(r.get('MontoFactura', 0))
            r['MontoRendicion'] = float(r.get('MontoRendicion', 0))

            results.append(r)

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
                a.Id as AdjuntoId,
                a.ArchivoNombre,
                a.ArchivoRuta
            FROM FinPagos p
            INNER JOIN CntCargosDetalle d ON p.DetalleId = d.Id
            LEFT JOIN FinPagosAdjuntos a ON p.Id = a.PagoId
            WHERE RTRIM(p.CodCia) = ?
            ORDER BY p.FechaRegistro DESC
        """, (codcia.strip(),))
        
        cols = [col[0] for col in cursor.description]
        pagos_map = {}
        for r in cursor.fetchall():
            row = dict(zip(cols, r))
            pago_id = row['PagoId']

            if pago_id not in pagos_map:
                if row.get('FechaPago') and hasattr(row['FechaPago'], 'strftime'):
                    row['FechaPago'] = row['FechaPago'].strftime("%Y-%m-%d")
                if row.get('FechaRegistro') and hasattr(row['FechaRegistro'], 'strftime'):
                    row['FechaRegistro'] = row['FechaRegistro'].strftime("%Y-%m-%d %H:%M")
                if row.get('MontoPago'):
                    row['MontoPago'] = float(row['MontoPago'])

                pagos_map[pago_id] = {
                    'PagoId': pago_id,
                    'NroOrdenCompra': row['NroOrdenCompra'],
                    'MontoPago': row['MontoPago'],
                    'FechaPago': row['FechaPago'],
                    'BancoPago': row['BancoPago'],
                    'Moneda': row['Moneda'],
                    'TipoPago': row['TipoPago'],
                    'NroOperacion': row['NroOperacion'],
                    'Notas': row['Notas'],
                    'UsuarioRegistro': row['UsuarioRegistro'],
                    'FechaRegistro': row['FechaRegistro'],
                    'NroFactura': row['NroFactura'],
                    'Proveedor': row['Proveedor'],
                    'RucProveedor': row['RucProveedor'],
                    'Adjuntos': []
                }

            if row.get('AdjuntoId'):
                pagos_map[pago_id]['Adjuntos'].append({
                    'AdjuntoId': row['AdjuntoId'],
                    'ArchivoNombre': row['ArchivoNombre']
                })

        return list(pagos_map.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/pagos/oc/{nro_oc}")
def get_pagos_por_oc(nro_oc: str, codcia: str = Query(...)):
    """Obtener todos los pagos (vouchers) de una OC específica con sus adjuntos."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        # Obtener pagos con info de adjuntos
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
                p.TipoDocumento,
                d.NroFactura,
                RTRIM(d.Proveedor) as Proveedor,
                RTRIM(d.RucProveedor) as RucProveedor,
                a.Id as AdjuntoId,
                a.ArchivoNombre,
                a.ArchivoRuta,
                a.TipoMime,
                a.TamanoBytes
            FROM FinPagos p
            INNER JOIN CntCargosDetalle d ON p.DetalleId = d.Id
            LEFT JOIN FinPagosAdjuntos a ON p.Id = a.PagoId
            WHERE RTRIM(p.CodCia) = ? AND RTRIM(p.NroOrdenCompra) = ?
            ORDER BY p.FechaRegistro DESC
        """, (codcia.strip(), nro_oc.strip()))

        cols = [col[0] for col in cursor.description]
        rows = cursor.fetchall()

        # Agrupar por pago
        pagos_map = {}
        for r in rows:
            row = dict(zip(cols, r))
            pago_id = row['PagoId']

            if pago_id not in pagos_map:
                # Formatear fechas y montos
                if row.get('FechaPago') and hasattr(row['FechaPago'], 'strftime'):
                    row['FechaPago'] = row['FechaPago'].strftime("%Y-%m-%d")
                if row.get('FechaRegistro') and hasattr(row['FechaRegistro'], 'strftime'):
                    row['FechaRegistro'] = row['FechaRegistro'].strftime("%Y-%m-%d %H:%M")
                if row.get('MontoPago'):
                    row['MontoPago'] = float(row['MontoPago'])

                pagos_map[pago_id] = {
                    'PagoId': pago_id,
                    'NroOrdenCompra': row['NroOrdenCompra'],
                    'MontoPago': row['MontoPago'],
                    'FechaPago': row['FechaPago'],
                    'BancoPago': row['BancoPago'],
                    'Moneda': row['Moneda'],
                    'TipoPago': row['TipoPago'],
                    'NroOperacion': row['NroOperacion'],
                    'Notas': row['Notas'],
                    'UsuarioRegistro': row['UsuarioRegistro'],
                    'FechaRegistro': row['FechaRegistro'],
                    'TipoDocumento': row['TipoDocumento'],
                    'NroFactura': row['NroFactura'],
                    'Proveedor': row['Proveedor'],
                    'Adjuntos': []
                }

            # Agregar adjunto si existe
            if row.get('AdjuntoId'):
                pagos_map[pago_id]['Adjuntos'].append({
                    'AdjuntoId': row['AdjuntoId'],
                    'ArchivoNombre': row['ArchivoNombre'],
                    'ArchivoRuta': row['ArchivoRuta'],
                    'TipoMime': row['TipoMime'],
                    'TamanoBytes': row['TamanoBytes']
                })

        return list(pagos_map.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

from fastapi.responses import FileResponse
@router.get("/pagos/adjunto/{adjunto_id}")
def descargar_adjunto_pago(adjunto_id: int):
    """Descargar archivo adjunto de un pago"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT ArchivoRuta, ArchivoNombre, TipoMime FROM FinPagosAdjuntos WHERE Id = ?", (adjunto_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        file_path, file_name, mime_type = row
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo físico no encontrado")
            
        return FileResponse(path=file_path, filename=file_name, media_type=mime_type or "application/octet-stream")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()



# ════════════════════════════════════════════════════════════
#  PARAMETROS PARA PAGOS TESORERIA (Monedas, Bancos, Tipos)
# ════════════════════════════════════════════════════════════

@router.get("/parametros/monedas")
def get_monedas(codcia: str = Query(...)):
    """Obtener lista de monedas desde CcbTabla (Tabla '0001')"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        # Se usa Nombre como descripción
        cursor.execute("""
            SELECT RTRIM(Codigo) as Codigo, RTRIM(Nombre) as Descripcion
            FROM bk030226.dbo.CcbTabla
            WHERE CodCia = ? AND Tabla = '0001'
            ORDER BY Codigo
        """, (codcia.strip(),))
        cols = [col[0] for col in cursor.description]
        results = [dict(zip(cols, r)) for r in cursor.fetchall()]
        if not results:
            return [{"Codigo": "1", "Descripcion": "Soles"}, {"Codigo": "2", "Descripcion": "Dólares"}]
        return results
    except Exception as e:
        # Fallback: retornar monedas estándar
        return [
            {"Codigo": "1", "Descripcion": "Soles"},
            {"Codigo": "2", "Descripcion": "Dólares"}
        ]
    finally:
        conn.close()

@router.get("/parametros/bancos")
def get_bancos(codcia: str = Query(...)):
    """Obtener lista de bancos desde CcbTabla (Tabla '0001') - bancos específicos"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT RTRIM(Codigo) as Codigo, RTRIM(Nombre) as Descripcion
            FROM bk030226.dbo.CcbTabla
            WHERE CodCia = ? AND Tabla = '0001'
              AND (Nombre LIKE '%BANCO%' OR Nombre LIKE '%BCP%' OR Nombre LIKE '%BBVA%'
                   OR Nombre LIKE '%SCOTIA%' OR Nombre LIKE '%INTERBANK%' OR Nombre LIKE '%BANBIF%')
            ORDER BY Nombre
        """, (codcia.strip(),))
        cols = [col[0] for col in cursor.description]
        results = [dict(zip(cols, r)) for r in cursor.fetchall()]
        if not results:
            # Fallback: bancos comunes
            results = [
                {"Codigo": "BCP", "Descripcion": "BANCO DE CREDITO DEL PERU"},
                {"Codigo": "BBVA", "Descripcion": "BBVA PERU"},
                {"Codigo": "SCOTIABANK", "Descripcion": "SCOTIABANK PERU"},
                {"Codigo": "INTERBANK", "Descripcion": "INTERBANK"},
                {"Codigo": "BANBIF", "Descripcion": "BANBIF"}
            ]
        return results
    except Exception as e:
        # Fallback: bancos comunes
        return [
            {"Codigo": "BCP", "Descripcion": "BANCO DE CREDITO DEL PERU"},
            {"Codigo": "BBVA", "Descripcion": "BBVA PERU"},
            {"Codigo": "SCOTIABANK", "Descripcion": "SCOTIABANK PERU"},
            {"Codigo": "INTERBANK", "Descripcion": "INTERBANK"},
            {"Codigo": "BANBIF", "Descripcion": "BANBIF"}
        ]
    finally:
        conn.close()

@router.get("/parametros/tipos-pago")
def get_tipos_pago(codcia: str = Query(...)):
    """Obtener tipos de pago desde CjaMTipo (Tabla '0002')"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        # Intentar con Nombre si Descripcion no existe
        cursor.execute("""
            SELECT RTRIM(Codigo) as Codigo, RTRIM(Nombre) as Descripcion
            FROM bk030226.dbo.CjaMTipo
            WHERE CodCia = ? AND Tabla = '0002'
            ORDER BY Codigo
        """, (codcia.strip(),))
        cols = [col[0] for col in cursor.description]
        results = [dict(zip(cols, r)) for r in cursor.fetchall()]
        if not results:
            # Fallback: tipos de pago estándar
            results = [
                {"Codigo": "TRANS", "Descripcion": "TRANSFERENCIA"},
                {"Codigo": "CHEQUE", "Descripcion": "CHEQUE"},
                {"Codigo": "EFECT", "Descripcion": "EFECTIVO"},
                {"Codigo": "TARJET", "Descripcion": "TARJETA"}
            ]
        return results
    except Exception as e:
        # Fallback: tipos de pago estándar
        return [
            {"Codigo": "TRANS", "Descripcion": "TRANSFERENCIA"},
            {"Codigo": "CHEQUE", "Descripcion": "CHEQUE"},
            {"Codigo": "EFECT", "Descripcion": "EFECTIVO"},
            {"Codigo": "TARJET", "Descripcion": "TARJETA"}
        ]
    finally:
        conn.close()

@router.get("/parametros/bancos-all")
def get_bancos_all(codcia: str = Query(...)):
    """Obtener TODAS las cuentas bancarias con su CodMon desde CcbTabla (Tabla '0001')"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT RTRIM(Codigo) as Codigo, RTRIM(Nombre) as Descripcion, ISNULL(CodMon, 1) as CodMon
            FROM bk030226.dbo.CcbTabla
            WHERE CodCia = ? AND Tabla = '0001'
            ORDER BY Nombre
        """, (codcia.strip(),))
        cols = [col[0] for col in cursor.description]
        return [dict(zip(cols, r)) for r in cursor.fetchall()]
    except Exception as e:
        return []
    finally:
        conn.close()

@router.get("/parametros/conceptos-pago")
def get_conceptos_pago(codcia: str = Query(...)):
    """Obtener conceptos de pago desde CjaMTipo (Tabla '0002')"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT RTRIM(Codigo) as Codigo, RTRIM(Nombre) as Descripcion
            FROM bk030226.dbo.CjaMTipo
            WHERE CodCia = ? AND Tabla = '0002'
            ORDER BY Codigo
        """, (codcia.strip(),))
        cols = [col[0] for col in cursor.description]
        return [dict(zip(cols, r)) for r in cursor.fetchall()]
    except Exception as e:
        return []
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  FACTURAS Y RENDICIONES DISPONIBLES PARA TESORERÍA
#  (DEBE IR ANTES DE /{cargo_id})
# ════════════════════════════════════════════════════════════

@router.get("/facturas-disponibles-tesoreria")
def get_facturas_disponibles_tesoreria(codcia: str = Query(...)):
    """Listar facturas sin OC que fueron aceptadas en un cargo LOG_A_CONT y están disponibles para enviar a Tesorería"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("SET ARITHABORT ON")
        
        # Buscar facturas que están en un cargo LOG_A_CONT aceptado pero no en CONT_A_TES
        query = """
            SELECT DISTINCT 
                f.Id,
                RTRIM(f.Serie) + '-' + RTRIM(f.Numero) as NroFactura,
                f.FecEmision,
                f.FecVencimiento,
                f.Total as MontoFactura,
                RTRIM(f.CodMoneda) as Moneda,
                RTRIM(f.NomProveedor) as Proveedor,
                RTRIM(f.NumRucProveedor) as RucProveedor,
                f.Uuid as FacturaUuid,
                d.MontoFactura as MontoEnCargo,
                c.NroCargo as CargoOrigen,
                c.FechaCargo
            FROM CntFacturaCab f
            INNER JOIN CntCargosDetalle d ON RTRIM(d.NroFactura) = RTRIM(f.Serie) + '-' + RTRIM(f.Numero)
            INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id
            WHERE c.TipoCargo = 'LOG_A_CONT'
              AND c.Estado != 'ANULADO'
              AND d.TipoOc = 'FACT'
              AND d.EstadoContable = 'ACEPTADO'
              AND RTRIM(f.CodCia) = RTRIM(?)
              -- No debe estar ya en un cargo CONT_A_TES
              AND NOT EXISTS (
                  SELECT 1 FROM CntCargosDetalle d2
                  INNER JOIN CntCargosDocumentales c2 ON d2.CargoId = c2.Id
                  WHERE RTRIM(d2.NroFactura) = RTRIM(f.Serie) + '-' + RTRIM(f.Numero)
                    AND d2.TipoOc = 'FACT'
                    AND c2.TipoCargo = 'CONT_A_TES'
                    AND c2.Estado != 'ANULADO'
                    AND ISNULL(d2.EstadoContable, 'PENDIENTE') != 'RECHAZADO'
              )
            ORDER BY f.FecEmision DESC
        """
        cursor.execute(query, (codcia,))
        columns = [col[0] for col in cursor.description]
        results = []
        for row in cursor.fetchall():
            d = dict(zip(columns, row))
            if d.get('FecEmision'):
                d['FecEmision'] = d['FecEmision'].strftime("%Y-%m-%d")
            if d.get('FecVencimiento'):
                d['FecVencimiento'] = d['FecVencimiento'].strftime("%Y-%m-%d")
            if d.get('FechaCargo'):
                d['FechaCargo'] = d['FechaCargo'].strftime("%Y-%m-%d %H:%M")
            results.append(d)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/rendiciones-disponibles-tesoreria")
def get_rendiciones_disponibles_tesoreria(codcia: str = Query(...)):
    """Listar rendiciones que fueron aceptadas en un cargo LOG_A_CONT y están disponibles para enviar a Tesorería"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("SET ARITHABORT ON")
        
        # Buscar rendiciones que están en un cargo LOG_A_CONT aceptado pero no en CONT_A_TES
        query = """
            SELECT DISTINCT 
                r.Id,
                RTRIM(r.NroRendicion) as NroRendicion,
                r.Fecha,
                r.TotalGastado as MontoRendicion,
                RTRIM(r.Moneda) as Moneda,
                RTRIM(r.NomAux) as Proveedor,
                RTRIM(r.CodAux) as Usuario,
                RTRIM(r.CodAux) as RucProveedor,
                r.UuidLink as RendicionUuid,
                d.MontoOC as MontoEnCargo,
                c.NroCargo as CargoOrigen,
                c.FechaCargo
            FROM FinRendicionGastosCab r
            INNER JOIN CntCargosDetalle d ON RTRIM(d.NroOrdenCompra) = RTRIM(r.NroRendicion)
            INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id
            WHERE c.TipoCargo = 'LOG_A_CONT'
              AND c.Estado != 'ANULADO'
              AND d.TipoOc = 'REND'
              AND d.EstadoContable = 'ACEPTADO'
              AND RTRIM(r.CodCia) = RTRIM(?)
              -- No debe estar ya en un cargo CONT_A_TES
              AND NOT EXISTS (
                  SELECT 1 FROM CntCargosDetalle d2
                  INNER JOIN CntCargosDocumentales c2 ON d2.CargoId = c2.Id
                  WHERE RTRIM(d2.NroOrdenCompra) = RTRIM(r.NroRendicion)
                    AND d2.TipoOc = 'REND'
                    AND c2.TipoCargo = 'CONT_A_TES'
                    AND c2.Estado != 'ANULADO'
                    AND ISNULL(d2.EstadoContable, 'PENDIENTE') != 'RECHAZADO'
              )
            ORDER BY r.Fecha DESC
        """
        cursor.execute(query, (codcia,))
        columns = [col[0] for col in cursor.description]
        results = []
        for row in cursor.fetchall():
            d = dict(zip(columns, row))
            if d.get('Fecha'):
                d['Fecha'] = d['Fecha'].strftime("%Y-%m-%d")
            if d.get('FechaCargo'):
                d['FechaCargo'] = d['FechaCargo'].strftime("%Y-%m-%d %H:%M")
            results.append(d)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/documentos-aceptados-tesoreria")
def get_documentos_aceptados_tesoreria(codcia: str = Query(...)):
    """Listar TODOS los documentos (OC, FACT, REND) aceptados en cargos LOG_A_CONT 
    que están disponibles para enviar a Tesorería.
    Este endpoint consulta directamente CntCargosDetalle con EstadoContable='ACEPTADO'."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("SET ARITHABORT ON")
        
        # Obtener todos los items aceptados en cargos LOG_A_CONT que no estén ya en CONT_A_TES
        query = """
            SELECT 
                d.Id,
                RTRIM(d.NroOrdenCompra) as NroOrdenCompra,
                RTRIM(d.TipoOc) as TipoOc,
                RTRIM(d.NroFactura) as NroFactura,
                RTRIM(d.Proveedor) as Proveedor,
                RTRIM(d.RucProveedor) as RucProveedor,
                d.MontoOC,
                d.MontoFactura,
                RTRIM(d.CodCiaOc) as CodCiaOc,
                RTRIM(d.AnosOc) as AnosOc,
                RTRIM(d.Moneda) as Moneda,
                RTRIM(c.NroCargo) as CargoOrigen,
                c.FechaCargo,
                -- OC info
                RTRIM(o.NomAux) as OcProveedor,
                o.Fchdoc as FchOc,
                o.ImpTot as TotalOc,
                RTRIM(o.TipoOc) as OcTipo,
                -- Factura info
                f.Uuid as FacturaUuid,
                f.FecEmision as FchFactura,
                f.Total as TotalFactura,
                -- Rendicion info
                r.Fecha as FchRendicion,
                r.TotalGastado as TotalRendicion,
                r.UuidLink as RendicionUuid,
                r.NroRendicionVal as NroRendicion,
                r.CodAux as RendicionCodUsuario,
                r.NomAux as RendicionUsuario,
                r.CodAux as RendicionRuc,
                -- Almacen info
                ISNULL((SELECT SUM(CanDes) FROM CmpROcom rc WHERE RTRIM(rc.NroDoc) = RTRIM(d.NroOrdenCompra) AND RTRIM(rc.CodCia) = RTRIM(d.CodCiaOc)), 0) as CantPedida,
                ISNULL((SELECT SUM(candes) FROM AlmRMovm a WHERE RTRIM(a.ordcmp) = RTRIM(d.NroOrdenCompra) AND RTRIM(a.CodCia) = RTRIM(d.CodCiaOc)), 0) as CantRecibida
            FROM CntCargosDetalle d
            INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id
            -- OC join (solo para tipo OC)
            OUTER APPLY (
                SELECT TOP 1 o2.NomAux, o2.Fchdoc, o2.ImpTot, o2.TipoOc
                FROM CmpVOcom o2
                WHERE RTRIM(o2.NroDoc) = RTRIM(d.NroOrdenCompra)
                  AND RTRIM(o2.CodCia) = RTRIM(d.CodCiaOc)
                  AND RTRIM(o2.Anos) = RTRIM(d.AnosOc)
                  AND (RTRIM(d.TipoOc) NOT IN ('M','S','T') OR RTRIM(o2.TipoOc) = RTRIM(d.TipoOc))
            ) o
            -- Factura join
            OUTER APPLY (
                SELECT TOP 1 f2.Uuid, f2.FecEmision, f2.Total
                FROM CntFacturaCab f2
                WHERE RTRIM(f2.Serie) + '-' + RTRIM(f2.Numero) = RTRIM(d.NroFactura)
                  AND f2.Estado != 'Anulada'
            ) f
            -- Rendicion join (por NroOrdenCompra o buscar la más reciente si está vacío)
            OUTER APPLY (
                SELECT TOP 1 r2.Fecha, r2.TotalGastado, r2.UuidLink, RTRIM(r2.NroRendicion) as NroRendicionVal, RTRIM(r2.CodAux) as CodAux, RTRIM(r2.NomAux) as NomAux
                FROM FinRendicionGastosCab r2
                WHERE (RTRIM(r2.NroRendicion) = RTRIM(d.NroOrdenCompra) AND RTRIM(d.NroOrdenCompra) != '')
                   OR (RTRIM(d.NroOrdenCompra) = '' AND RTRIM(d.TipoOc) = 'REND' 
                       AND NOT EXISTS (SELECT 1 FROM CntCargosDetalle d2 
                                       INNER JOIN CntCargosDocumentales c2 ON d2.CargoId = c2.Id 
                                       WHERE RTRIM(d2.NroOrdenCompra) = RTRIM(r2.NroRendicion) 
                                       AND c2.Estado != 'ANULADO' AND d2.TipoOc = 'REND'
                                       AND d2.Id != d.Id)
                       AND r2.Fecha >= DATEADD(month, -3, GETDATE()))
                ORDER BY r2.Fecha DESC
            ) r
            WHERE c.TipoCargo = 'LOG_A_CONT'
              AND c.Estado != 'ANULADO'
              AND d.EstadoContable = 'ACEPTADO'
              AND RTRIM(c.CodCia) = RTRIM(?)
              -- No debe estar ya en un cargo CONT_A_TES (aceptado o pendiente)
              AND NOT EXISTS (
                  SELECT 1 FROM CntCargosDetalle d2
                  INNER JOIN CntCargosDocumentales c2 ON d2.CargoId = c2.Id
                  WHERE (RTRIM(d2.NroOrdenCompra) = RTRIM(d.NroOrdenCompra) OR RTRIM(d2.NroFactura) = RTRIM(d.NroFactura))
                    AND d2.TipoOc = d.TipoOc
                    AND c2.TipoCargo = 'CONT_A_TES'
                    AND c2.Estado != 'ANULADO'
                    AND ISNULL(d2.EstadoContable, 'PENDIENTE') != 'RECHAZADO'
              )
            ORDER BY c.FechaCargo DESC, d.TipoOc
        """
        cursor.execute(query, (codcia,))
        columns = [col[0] for col in cursor.description]
        results = []
        for row in cursor.fetchall():
            d = dict(zip(columns, row))
            if d.get('FechaCargo'):
                d['FechaCargo'] = d['FechaCargo'].strftime("%Y-%m-%d %H:%M")
            if d.get('FchOc'):
                d['FchOc'] = d['FchOc'].strftime("%Y-%m-%d")
            if d.get('FchFactura'):
                d['FchFactura'] = d['FchFactura'].strftime("%Y-%m-%d")
            if d.get('FchRendicion'):
                d['FchRendicion'] = d['FchRendicion'].strftime("%Y-%m-%d")
            results.append(d)
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

        # Detail - Ahora incluye fechas de emisión/vencimiento, URLs públicas y totales
        cursor.execute("""
            SELECT d.Id, RTRIM(d.NroOrdenCompra) as NroOrdenCompra, RTRIM(d.TipoOc) as TipoOc,
                   RTRIM(d.CodCiaOc) as CodCiaOc, RTRIM(d.AnosOc) as AnosOc,
                   RTRIM(d.NroFactura) as NroFactura, d.MontoOC, d.MontoFactura,
                   RTRIM(d.Proveedor) as Proveedor, RTRIM(d.RucProveedor) as RucProveedor,
                   RTRIM(d.EstadoContable) as EstadoContable, ISNULL(RTRIM(d.Moneda), 'PEN') as Moneda,
                   -- Factura info
                   f.Uuid as FacturaUuid,
                   f.FecEmision as fch_factura,
                   f.FecVencimiento as fch_venc_factura,
                   f.Total as total_factura,
                   f.CreditoFecPlazo as credito_plazo,
                   -- OC info
                   o.Fchdoc as fch_oc,
                   o.ImpTot as total_oc,
                   RTRIM(o.RucAux) as ruc_proveedor_oc,
                   o.TipoOcReal as tipo_oc_real,
                   -- Rendicion info
                   r.Fecha as fch_rendicion,
                   r.TotalGastado as total_rendicion,
                   r.UuidLink as RendicionUuid,
                   r.NroRendicionVal as nro_rendicion,
                   r.CodAux as rendicion_codusuario,
                   r.NomAux as rendicion_usuario,
                   r.CodAux as rendicion_ruc,
                   -- Almacen info
                   ISNULL((SELECT SUM(CanDes) FROM CmpROcom rc WHERE RTRIM(rc.NroDoc) = RTRIM(d.NroOrdenCompra) AND RTRIM(rc.CodCia) = RTRIM(d.CodCiaOc)), 0) as cant_pedida,
                   ISNULL((SELECT SUM(candes) FROM AlmRMovm a WHERE RTRIM(a.ordcmp) = RTRIM(d.NroOrdenCompra) AND RTRIM(a.CodCia) = RTRIM(d.CodCiaOc)), 0) as cant_recibida,
                   (
                       SELECT TOP 1 a.fchdoc
                       FROM AlmRMovm a
                       WHERE RTRIM(a.ordcmp) = RTRIM(d.NroOrdenCompra)
                         AND RTRIM(a.CodCia) = RTRIM(d.CodCiaOc)
                       ORDER BY a.fchdoc DESC
                   ) as fch_almacen,
                   STUFF((
                       SELECT ', ' + RTRIM(rm.DesMat)
                       FROM CmpROcom rm
                       WHERE RTRIM(rm.NroDoc) = RTRIM(d.NroOrdenCompra) AND RTRIM(rm.CodCia) = RTRIM(d.CodCiaOc)
                       FOR XML PATH('')
                   ), 1, 2, '') as OCItems
            FROM CntCargosDetalle d
            -- OC join
            OUTER APPLY (
                SELECT TOP 1 o2.Fchdoc, o2.ImpTot, RTRIM(o2.RucAux) as RucAux, RTRIM(o2.TipoOc) as TipoOcReal
                FROM CmpVOcom o2
                WHERE RTRIM(o2.NroDoc) = RTRIM(d.NroOrdenCompra)
                  AND RTRIM(o2.CodCia) = RTRIM(d.CodCiaOc)
                  AND RTRIM(o2.Anos) = RTRIM(d.AnosOc)
                  AND (
                    RTRIM(d.TipoOc) IN ('FACT','REND','OC')
                    OR RTRIM(o2.TipoOc) = RTRIM(d.TipoOc)
                  )
            ) o
            -- Factura join (busca por Serie-Numero para todas las facturas incluidas)
            OUTER APPLY (
                SELECT TOP 1 f2.Uuid, f2.FecEmision, f2.FecVencimiento, f2.Serie, f2.Numero, f2.Total, f2.CreditoFecPlazo
                FROM CntFacturaCab f2
                WHERE RTRIM(f2.Serie) + '-' + RTRIM(f2.Numero) = RTRIM(d.NroFactura)
                  AND f2.Estado != 'Anulada'
            ) f
            -- Rendicion join (por NroOrdenCompra que guarda el NroRendicion, o buscar la más reciente si está vacío)
            OUTER APPLY (
                SELECT TOP 1 r2.Fecha, r2.TotalGastado, r2.UuidLink, RTRIM(r2.CodAux) as CodAux, RTRIM(r2.NroRendicion) as NroRendicionVal, RTRIM(r2.NomAux) as NomAux
                FROM FinRendicionGastosCab r2
                WHERE (RTRIM(r2.NroRendicion) = RTRIM(d.NroOrdenCompra) AND RTRIM(d.NroOrdenCompra) != '')
                   OR (RTRIM(d.NroOrdenCompra) = '' AND RTRIM(d.TipoOc) = 'REND' 
                       AND NOT EXISTS (SELECT 1 FROM CntCargosDetalle d2 
                                       INNER JOIN CntCargosDocumentales c2 ON d2.CargoId = c2.Id 
                                       WHERE RTRIM(d2.NroOrdenCompra) = RTRIM(r2.NroRendicion) 
                                       AND c2.Estado != 'ANULADO' AND d2.TipoOc = 'REND'
                                       AND d2.Id != d.Id)
                       AND r2.Fecha >= DATEADD(month, -3, GETDATE()))
                ORDER BY r2.Fecha DESC
            ) r
            WHERE d.CargoId = ?
        """, (cargo_id,))
        dcols = [c[0] for c in cursor.description]
        detail = []
        rows = cursor.fetchall()
        for r in rows:
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

            # Fecha de vencimiento de factura
            if row_dict.get('fch_venc_factura'):
                row_dict['fch_venc_factura'] = row_dict['fch_venc_factura'].strftime("%Y-%m-%d")
            else:
                row_dict['fch_venc_factura'] = '-'

            # Fecha de rendición
            if row_dict.get('fch_rendicion'):
                row_dict['fch_rendicion'] = row_dict['fch_rendicion'].strftime("%Y-%m-%d")
            else:
                row_dict['fch_rendicion'] = '-'

            # Formatear totales
            if row_dict.get('total_factura') is not None:
                row_dict['total_factura'] = float(row_dict['total_factura'])
            if row_dict.get('total_oc') is not None:
                row_dict['total_oc'] = float(row_dict['total_oc'])
            if row_dict.get('total_rendicion') is not None:
                row_dict['total_rendicion'] = float(row_dict['total_rendicion'])

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

    # Usar directorio configurado (servidor de red o local)
    global PAGOS_UPLOAD_DIR
    os.makedirs(PAGOS_UPLOAD_DIR, exist_ok=True)

    # Log para debugging
    print(f"[PAGOS] Usando directorio de adjuntos: {PAGOS_UPLOAD_DIR}")
    print(f"[PAGOS] Servidor de archivos: {FILE_SERVER or 'No configurado (usando local)'}")

    try:
        cursor = conn.cursor()

        # 1. Obtener Info de OC para FinPagos
        cursor.execute("SELECT CargoId, CodCiaOc, NroOrdenCompra, TipoDocumento FROM CntCargosDetalle WHERE Id = ?", (detalle_id,))
        detRow = cursor.fetchone()
        if not detRow:
            raise HTTPException(status_code=404, detail="Detalle no encontrado")
        cargo_id, codcia, nrodoc, tipo_documento = detRow

        # 2. Registrar en FinPagos (con TipoDocumento)
        cursor.execute("""
            INSERT INTO FinPagos
            (CodCia, NroOrdenCompra, DetalleId, MontoPago, FechaPago, BancoPago, Moneda, TipoPago, NroOperacion, Notas, UsuarioRegistro, TipoDocumento)
            OUTPUT INSERTED.Id
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (codcia, nrodoc, detalle_id, monto, fecha, banco, moneda, tipo, nro_operacion, notas, usuario, tipo_documento or 'OC'))

        pago_id = cursor.fetchone()[0]

        # 3. Guardar Archivos Físicos y referenciar en FinPagosAdjuntos
        for file in archivos:
            if file.filename:
                timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                sys_filename = f"pago_{pago_id}_{timestamp}_{file.filename}"
                file_path = os.path.join(PAGOS_UPLOAD_DIR, sys_filename)

                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)

                file_size = os.path.getsize(file_path)
                cursor.execute("""
                    INSERT INTO FinPagosAdjuntos
                    (PagoId, ArchivoNombre, ArchivoRuta, TipoMime, TamanoBytes)
                    VALUES (?, ?, ?, ?, ?)
                """, (pago_id, sys_filename, file_path, file.content_type, file_size))
                print(f"[PAGOS] Archivo guardado: {file_path} ({file_size} bytes)")
        
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


