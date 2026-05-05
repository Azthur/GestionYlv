"""
Módulo Contable - Backend API
Endpoints para: Tokens, Sincronización de Compras, Registro de Facturas, Trazabilidad
"""
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator
from typing import List, Optional
from datetime import datetime, date
import requests
import json
import uuid
import os
import shutil
from database import get_db_connection
from auth import get_current_user
router = APIRouter(prefix="/api/contabilidad", tags=["Contabilidad"])


def _safe_date(val):
    """Normaliza un valor de fecha a formato YYYY-MM-DD compatible con SQL Server.
    Maneja formatos: DD/MM/YYYY, YYYY-MM-DD, cadenas vacías, None.
    Si el día excede el máximo del mes (ej: 31/04), se ajusta al último día válido.
    Retorna None si no se puede parsear."""
    import calendar
    if val is None:
        return None
    s = str(val).strip()
    if not s or s.lower() in ('none', 'null', 'undefined', 'nan'):
        return None

    def _clamp_date(year, month, day):
        """Ajusta el día al máximo válido del mes si es necesario."""
        try:
            y, m, d = int(year), int(month), int(day)
            max_day = calendar.monthrange(y, m)[1]
            if d > max_day:
                d = max_day
            return date(y, m, d).strftime('%Y-%m-%d')
        except (ValueError, TypeError):
            return None

    # Ya está en formato YYYY-MM-DD (from HTML date input)
    if len(s) >= 10 and s[4] == '-' and s[7] == '-':
        try:
            datetime.strptime(s[:10], '%Y-%m-%d')
            return s[:10]
        except ValueError:
            # Intentar corregir día inválido (ej: 2026-04-31)
            parts = s[:10].split('-')
            if len(parts) == 3:
                result = _clamp_date(parts[0], parts[1], parts[2])
                if result:
                    return result
    # Formato DD/MM/YYYY (from SUNAT CPE data)
    if '/' in s:
        parts = s.split('/')
        if len(parts) == 3:
            try:
                datetime.strptime(s, '%d/%m/%Y')
                return f"{parts[2]}-{parts[1]}-{parts[0]}"
            except ValueError:
                # Intentar corregir día inválido (ej: 31/04/2026)
                result = _clamp_date(parts[2], parts[1], parts[0])
                if result:
                    return result
    # Formato DD-MM-YYYY
    if len(s) >= 10 and s[2] == '-' and s[5] == '-':
        try:
            datetime.strptime(s[:10], '%d-%m-%Y')
            return f"{s[6:10]}-{s[3:5]}-{s[0:2]}"
        except ValueError:
            result = _clamp_date(s[6:10], s[3:5], s[0:2])
            if result:
                return result
    # Si nada funciona, retornar None en vez de dejar que SQL Server falle
    print(f"WARNING _safe_date: No se pudo parsear fecha '{val}', retornando None")
    return None


# ════════════════════════════════════════════════════════════
#  MODELOS PYDANTIC
# ════════════════════════════════════════════════════════════

class TokenCreate(BaseModel):
    codcia: str
    nom_empresa: str
    num_ruc: str
    token_mis_compras: Optional[str] = None
    token_datos_cpe: Optional[str] = None
    token_corpo: Optional[str] = None
    activo: Optional[bool] = True

class ComprasSyncRequest(BaseModel):
    codcia: str
    num_ruc: str
    periodo: str  # "202509"
    pagina: Optional[int] = 1

class BuscarCpeRequest(BaseModel):
    codcia: str
    proveedor: str  # RUC
    cod_comp: str   # "01"
    serie: str      # "F001"
    numero: str     # "181"

class FacturaDetItem(BaseModel):
    nro_item: int
    cod_material: Optional[str] = None
    cod_proveedor: Optional[str] = None
    descripcion: Optional[str] = None
    unidad_medida: Optional[str] = None
    des_unidad_medida: Optional[str] = None
    cantidad: Optional[float] = 0
    precio_unitario: Optional[float] = 0
    descuento: Optional[float] = 0
    sub_total: Optional[float] = 0
    igv: Optional[float] = 0
    icbper: Optional[float] = 0
    mto_icbper_item: Optional[float] = 0
    mto_descuento: Optional[float] = 0
    total: Optional[float] = 0
    cantidad_oc: Optional[float] = None
    cantidad_almacen: Optional[float] = None
    extra_data: Optional[dict] = None

class FacturaCreate(BaseModel):
    id: Optional[int] = None
    codcia: str
    num_ruc_proveedor: Optional[str] = None
    nom_proveedor: Optional[str] = None
    cod_tipo_doc: Optional[str] = "01"
    serie: Optional[str] = None
    numero: Optional[str] = None
    fec_emision: Optional[str] = None
    fec_vencimiento: Optional[str] = None
    cod_moneda: Optional[str] = "1"

    @field_validator('cod_moneda', mode='before')
    @classmethod
    def normalize_moneda(cls, v):
        """Normaliza moneda a '1' (Soles) o '2' (Dólares)"""
        if v is None:
            return '1'
        raw = str(v).strip().replace('.0', '').upper()
        if raw in ('2', 'USD', 'US$', 'ME', 'DOLARES'):
            return '2'
        return '1'
    tipo_cambio: Optional[float] = 1
    sub_total: Optional[float] = 0
    igv: Optional[float] = 0
    otros_tributos: Optional[float] = 0
    total: Optional[float] = 0
    # Campos contables SUNAT
    mto_gravado: Optional[float] = 0
    mto_exonerado: Optional[float] = 0
    mto_inafecto: Optional[float] = 0
    mto_gratuito: Optional[float] = 0
    mto_anticipos: Optional[float] = 0
    mto_isc: Optional[float] = 0
    mto_icbper: Optional[float] = 0
    mto_otros_cargos: Optional[float] = 0
    # Detracción
    det_leyenda: Optional[str] = None
    det_bien_servicio: Optional[str] = None
    det_medio_pago: Optional[str] = None
    det_nro_cuenta: Optional[str] = None
    det_porcentaje: Optional[float] = None
    det_monto: Optional[float] = None
    # Referencia OC
    nro_orden_compra: Optional[str] = None
    tipo_oc: Optional[str] = None
    anos_oc: Optional[str] = None
    codcia_oc: Optional[str] = None
    observaciones: Optional[str] = None
    modo_registro: Optional[str] = "MANUAL"
    id_compra_ref: Optional[int] = None
    dir_emisor: Optional[str] = None
    ubigeo_emisor: Optional[str] = None
    dir_receptor: Optional[str] = None
    mto_total_letras: Optional[str] = None
    nom_comercial_emisor: Optional[str] = None
    created_by: Optional[str] = None
    # Nuevos campos XML completo
    nom_comercial_prov: Optional[str] = None
    dir_proveedor: Optional[str] = None
    ubigeo_proveedor: Optional[str] = None
    dir_receptor_factura: Optional[str] = None
    cod_tip_transaccion: Optional[str] = None
    ind_estado_cpe: Optional[str] = None
    ind_procedencia: Optional[str] = None
    placa_vehicular: Optional[str] = None
    mto_exportacion: Optional[float] = 0
    mto_descuentos: Optional[float] = 0
    mto_redondeo: Optional[float] = 0
    # Nota de crédito / débito
    cod_tipo_nota: Optional[str] = None
    des_tipo_nota: Optional[str] = None
    des_motivo: Optional[str] = None
    doc_modifica_serie: Optional[str] = None
    doc_modifica_numero: Optional[str] = None
    doc_modifica_tipo: Optional[str] = None
    doc_modifica_fecha: Optional[str] = None
    # Créditos
    credito_mto_pendiente: Optional[float] = None
    credito_fec_plazo: Optional[str] = None
    credito_num_cuotas: Optional[int] = None
    credito_cuotas_json: Optional[str] = None
    # Docs relacionados y XML raw
    docs_relacionados_json: Optional[str] = None
    xml_data_json: Optional[str] = None
    items: List[FacturaDetItem] = []

class EnrichBatchRequest(BaseModel):
    codcia: str
    periodo: str


# ════════════════════════════════════════════════════════════
#  TOKENS ENDPOINTS
# ════════════════════════════════════════════════════════════

@router.get("/tokens")
def list_tokens():
    """Listar tokens de API por empresa"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT Id, RTRIM(CodCia) as CodCia, NomEmpresa, NumRuc,
                   TokenMisCompras, TokenDatosCpe, TokenCorpo,
                   Activo, CreatedAt, UpdatedAt, CreatedBy
            FROM CntTokensEmpresa
            ORDER BY CodCia
        """)
        cols = [c[0] for c in cursor.description]
        rows = []
        for r in cursor.fetchall():
            d = dict(zip(cols, r))
            d['Activo'] = bool(d['Activo'])
            if d['CreatedAt']:
                d['CreatedAt'] = d['CreatedAt'].strftime("%Y-%m-%d %H:%M")
            if d['UpdatedAt']:
                d['UpdatedAt'] = d['UpdatedAt'].strftime("%Y-%m-%d %H:%M")
            rows.append(d)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/tokens")
def upsert_token(data: TokenCreate):
    """Crear o actualizar token de empresa"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        # Check if exists by CodCia + NumRuc
        cursor.execute(
            "SELECT Id FROM CntTokensEmpresa WHERE RTRIM(CodCia)=? AND NumRuc=?",
            (data.codcia.strip(), data.num_ruc.strip())
        )
        existing = cursor.fetchone()

        if existing:
            cursor.execute("""
                UPDATE CntTokensEmpresa SET
                    NomEmpresa=?, TokenMisCompras=?, TokenDatosCpe=?,
                    TokenCorpo=?, Activo=?, UpdatedAt=GETDATE()
                WHERE Id=?
            """, (
                data.nom_empresa, data.token_mis_compras, data.token_datos_cpe,
                data.token_corpo, 1 if data.activo else 0, existing.Id
            ))
            conn.commit()
            return {"status": "success", "message": "Token actualizado", "id": existing.Id}
        else:
            cursor.execute("""
                INSERT INTO CntTokensEmpresa
                (CodCia, NomEmpresa, NumRuc, TokenMisCompras, TokenDatosCpe, TokenCorpo, Activo, CreatedBy)
                OUTPUT INSERTED.Id
                VALUES (?,?,?,?,?,?,?,?)
            """, (
                data.codcia.strip(), data.nom_empresa, data.num_ruc.strip(),
                data.token_mis_compras, data.token_datos_cpe,
                data.token_corpo, 1 if data.activo else 0, data.codcia
            ))
            new_id = cursor.fetchone()[0]
            conn.commit()
            return {"status": "success", "message": "Token creado", "id": int(new_id)}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/tokens/{token_id}")
def delete_token(token_id: int):
    """Eliminar token de empresa"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM CntTokensEmpresa WHERE Id=?", (token_id,))
        conn.commit()
        return {"status": "success", "message": "Token eliminado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  COMPRAS / SINCRONIZACIÓN SUNAT
# ════════════════════════════════════════════════════════════

def _get_token_for_company(cursor, codcia: str, token_type: str = "miscompras"):
    """Obtiene el token correcto según empresa y tipo de servicio"""
    col = "TokenMisCompras" if token_type == "miscompras" else "TokenDatosCpe"
    cursor.execute(
        f"SELECT {col} FROM CntTokensEmpresa WHERE RTRIM(CodCia)=? AND Activo=1",
        (codcia.strip(),)
    )
    row = cursor.fetchone()
    if row and row[0]:
        return row[0].strip()
    return None


@router.post("/compras/sync")
def sync_compras(data: ComprasSyncRequest):
    """Sincronizar compras desde API miscompras (todas las páginas)"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")

    try:
        cursor = conn.cursor()
        token = _get_token_for_company(cursor, data.codcia, "miscompras")
        if not token:
            raise HTTPException(
                status_code=400,
                detail=f"No se encontro token 'MisCompras' activo para la empresa {data.codcia}. Configure un token primero."
            )

        url = "https://api.org.pe/v1/miscompras"
        
        inserted_total = 0
        skipped_total = 0
        total_api = 0
        pagina_actual = 1
        
        while True:
            payload = json.dumps({
                "numRuc": data.num_ruc,
                "periodo": data.periodo,
                "pagina": str(pagina_actual)
            })
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json'
            }

            resp = requests.post(url, headers=headers, data=payload, timeout=30)
            if resp.status_code != 200:
                if pagina_actual == 1:
                    raise HTTPException(status_code=502, detail=f"API externa error: {resp.status_code} - {resp.text[:200]}")
                break

            api_data = resp.json()
            if not api_data.get("success"):
                if pagina_actual == 1:
                    raise HTTPException(status_code=502, detail=f"API error: {api_data.get('message', 'Error desconocido')}")
                break

            documentos = api_data.get("data", {}).get("registros", [])
            if not documentos:
                documentos = api_data.get("data", {}).get("lisDocumentos", [])
            
            if not documentos or len(documentos) == 0:
                break

            for doc in documentos:
                id_api = doc.get("id", "")
                cursor.execute("SELECT Id FROM CntCompras WHERE IdApiOrg=?", (id_api,))
                if cursor.fetchone():
                    skipped_total += 1
                    continue

                montos = doc.get("montos", {})
                tc = doc.get("tipoCambio", {})
                auditoria = doc.get("auditoria", {})

                fec_emision = doc.get("fecEmision")[:10] if doc.get("fecEmision") else None
                fec_venc = doc.get("fecVencPag")[:10] if doc.get("fecVencPag") else None
                fec_regis = auditoria.get("fecRegis")[:19] if auditoria.get("fecRegis") else None
                fec_modif = auditoria.get("fecModif")[:19] if auditoria.get("fecModif") else None

                cursor.execute("""
                    INSERT INTO CntCompras (
                        CodCia, NumRuc, NomRazonSocial, CodCar, CodTipoCDP, DesTipoCDP,
                        NumSerieCDP, NumCDP, FecEmision, FecVencPag,
                        CodTipoDocIdProveedor, NumDocIdProveedor, NomRazonSocialProveedor,
                        CodTipoCarga, CodSituacion, CodMoneda,
                        CodEstadoComprobante, DesEstadoComprobante, IndOperGratuita,
                        CodTipoMotivoNota, DesTipoMotivoNota,
                        PerTributario, PorTasaIGV,
                        MtoBIGravadaDG, MtoIgvIpmDG, MtoBIGravadaDGNG, MtoIgvIpmDGNG,
                        MtoBIGravadaDNG, MtoIgvIpmDNG, MtoValorAdqNG,
                        MtoIcbp, MtoOtrosTrib, MtoTotalCp, MtoISC, MtoIMB,
                        IndCargaTipoCambio, MtoCambioMonedaExtranjera,
                        MtoCambioMonedaDolares, MtoTipoCambio,
                        CodUsuRegisApi, FecRegisApi, CodUsuModifApi, FecModifApi,
                        IdApiOrg, CodEstadoCpe, DesEstadoCpe,
                        IndFuenteCP, NumCorrelativo, IndIncluExcluCar,
                        SyncPeriodo, SyncPagina
                    ) VALUES (
                        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
                        ?,?,?,?,?,?,?,?,?,?,?,?
                    )
                """, (
                    data.codcia.strip(),
                    doc.get("numRuc"),
                    doc.get("nomRazonSocial"),
                    doc.get("codCar"),
                    doc.get("codTipoCDP"),
                    doc.get("desTipoCDP"),
                    doc.get("numSerieCDP"),
                    doc.get("numCDP"),
                    fec_emision,
                    fec_venc,
                    doc.get("codTipoDocIdentidadProveedor"),
                    doc.get("numDocIdentidadProveedor"),
                    doc.get("nomRazonSocialProveedor"),
                    doc.get("codTipoCarga"),
                    doc.get("codSituacion"),
                    doc.get("codMoneda"),
                    doc.get("codEstadoComprobante"),
                    doc.get("desEstadoComprobante"),
                    doc.get("indOperGratuita"),
                    doc.get("codTipoMotivoNota"),
                    doc.get("desTipoMotivoNota"),
                    doc.get("perTributario"),
                    doc.get("porTasaIGV"),
                    montos.get("mtoBIGravadaDG"),
                    montos.get("mtoIgvIpmDG"),
                    montos.get("mtoBIGravadaDGNG"),
                    montos.get("mtoIgvIpmDGNG"),
                    montos.get("mtoBIGravadaDNG"),
                    montos.get("mtoIgvIpmDNG"),
                    montos.get("mtoValorAdqNG"),
                    montos.get("mtoIcbp"),
                    montos.get("mtoOtrosTrib"),
                    montos.get("mtoTotalCp"),
                    montos.get("mtoISC"),
                    montos.get("mtoIMB"),
                    tc.get("indCargaTipoCambio"),
                    tc.get("mtoCambioMonedaExtranjera"),
                    tc.get("mtoCambioMonedaDolares"),
                    tc.get("mtoTipoCambio"),
                    auditoria.get("codUsuRegis"),
                    fec_regis,
                    auditoria.get("codUsuModif"),
                    fec_modif,
                    id_api,
                    doc.get("codEstadoComprobante"),
                    doc.get("desEstadoComprobante"),
                    doc.get("indFuenteCP"),
                    doc.get("numCorrelativo"),
                    doc.get("indIncluExcluCar"),
                    data.periodo,
                    pagina_actual
                ))
                inserted_total += 1

            conn.commit()

            totales = api_data.get("data", {}).get("totales", {})
            if "cntTotalDocumentos" in totales:
                total_api = totales["cntTotalDocumentos"]
            
            # Si descargamos menos de lo habitual por página (suele ser 100), o no hay más, rompemos
            if len(documentos) < 50: 
                break
                
            pagina_actual += 1

        if total_api == 0:
            total_api = inserted_total + skipped_total

        return {
            "status": "success",
            "message": f"Sincronizacion completada: {inserted_total} nuevos, {skipped_total} ya existentes",
            "inserted": inserted_total,
            "skipped": skipped_total,
            "total_api": total_api
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/compras")
def list_compras(
    codcia: str = Query(...),
    periodo: Optional[str] = Query(None),
    proveedor: Optional[str] = Query(None),
    pagina: Optional[int] = Query(1),
    limite: Optional[int] = Query(100)
):
    """Listar compras sincronizadas"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        query = """
            SELECT c.Id, RTRIM(c.CodCia) as CodCia, c.NumRuc, c.NomRazonSocial,
                   c.CodTipoCDP, c.DesTipoCDP, c.NumSerieCDP, c.NumCDP,
                   c.FecEmision, c.FecVencPag,
                   c.NumDocIdProveedor, c.NomRazonSocialProveedor,
                   c.CodMoneda, c.CodEstadoComprobante, c.DesEstadoComprobante,
                   c.PerTributario, c.PorTasaIGV,
                   c.MtoBIGravadaDG, c.MtoIgvIpmDG, c.MtoValorAdqNG,
                   c.MtoTotalCp, c.MtoTipoCambio,
                   c.IdApiOrg, c.SyncedAt,
                   CASE WHEN c.XmlDataJson IS NOT NULL AND LEN(c.XmlDataJson) > 10 THEN 1 ELSE 0 END as TieneXml,
                   (SELECT TOP 1 f.Id FROM CntFacturaCab f WHERE RTRIM(f.CodCia) = RTRIM(c.CodCia) AND f.NumRucProveedor = c.NumDocIdProveedor AND f.CodTipoDoc = c.CodTipoCDP AND f.Serie = c.NumSerieCDP AND f.Numero = c.NumCDP AND f.Estado != 'Anulada') as FacturaId,
                   (SELECT TOP 1 f.Uuid FROM CntFacturaCab f WHERE RTRIM(f.CodCia) = RTRIM(c.CodCia) AND f.NumRucProveedor = c.NumDocIdProveedor AND f.CodTipoDoc = c.CodTipoCDP AND f.Serie = c.NumSerieCDP AND f.Numero = c.NumCDP AND f.Estado != 'Anulada') as FacturaUuid,
                   (SELECT TOP 1 f.Estado FROM CntFacturaCab f WHERE RTRIM(f.CodCia) = RTRIM(c.CodCia) AND f.NumRucProveedor = c.NumDocIdProveedor AND f.CodTipoDoc = c.CodTipoCDP AND f.Serie = c.NumSerieCDP AND f.Numero = c.NumCDP AND f.Estado != 'Anulada') as FacturaEstado,
                   (SELECT TOP 1 RTRIM(f.NroOrdenCompra) FROM CntFacturaCab f WHERE RTRIM(f.CodCia) = RTRIM(c.CodCia) AND f.NumRucProveedor = c.NumDocIdProveedor AND f.CodTipoDoc = c.CodTipoCDP AND f.Serie = c.NumSerieCDP AND f.Numero = c.NumCDP AND f.Estado != 'Anulada') as NroOrdenCompra,
                   (SELECT TOP 1 RTRIM(f.TipoOc) FROM CntFacturaCab f WHERE RTRIM(f.CodCia) = RTRIM(c.CodCia) AND f.NumRucProveedor = c.NumDocIdProveedor AND f.CodTipoDoc = c.CodTipoCDP AND f.Serie = c.NumSerieCDP AND f.Numero = c.NumCDP AND f.Estado != 'Anulada') as TipoOc
            FROM CntCompras c
            WHERE RTRIM(c.CodCia) = ?
        """
        params = [codcia.strip()]

        if periodo:
            query += " AND c.PerTributario = ?"
            params.append(periodo)
        if proveedor:
            query += " AND (c.NumDocIdProveedor LIKE ? OR c.NomRazonSocialProveedor LIKE ?)"
            params.extend([f"%{proveedor}%", f"%{proveedor}%"])

        query += " ORDER BY c.FecEmision DESC, c.NumSerieCDP, c.NumCDP"

        cursor.execute(query, tuple(params))
        cols = [c[0] for c in cursor.description]
        rows = []
        for r in cursor.fetchall():
            d = dict(zip(cols, r))
            for k in ['FecEmision', 'FecVencPag', 'SyncedAt']:
                if d.get(k):
                    if hasattr(d[k], 'strftime'):
                        fmt = "%Y-%m-%d %H:%M" if k == 'SyncedAt' else "%Y-%m-%d"
                        d[k] = d[k].strftime(fmt)
                    elif isinstance(d[k], str) and k != 'SyncedAt':
                        d[k] = d[k][:10]   # Ensure it's truncated or passed forward
            for k in ['MtoBIGravadaDG','MtoIgvIpmDG','MtoValorAdqNG','MtoTotalCp','MtoTipoCambio','PorTasaIGV']:
                if d.get(k) is not None:
                    d[k] = float(d[k])
            rows.append(d)

        # Count total
        count_query = "SELECT COUNT(*) FROM CntCompras c WHERE RTRIM(c.CodCia) = ?"
        count_params = [codcia.strip()]
        if periodo:
            count_query += " AND c.PerTributario = ?"
            count_params.append(periodo)
        if proveedor:
            count_query += " AND (c.NumDocIdProveedor LIKE ? OR c.NomRazonSocialProveedor LIKE ?)"
            count_params.extend([f"%{proveedor}%", f"%{proveedor}%"])

        cursor.execute(count_query, tuple(count_params))
        total = cursor.fetchone()[0]

        return {"data": rows, "total": total, "pagina": pagina, "limite": limite}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/items/autocomplete")
def autocomplete_items(codcia: str, q: str = Query(..., min_length=2)):
    """Busca en tablas AlmmMatg, AlmTabla(0017) y CONGASTO simultáneamente"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection generic error")
    try:
        cursor = conn.cursor()
        results = []
        q_clean = f"%{q.strip()}%"
        
        # 1. AlmmMatg (Materiales / Productos)
        try:
            cursor.execute("SELECT TOP 15 RTRIM(codmat) as codigo, RTRIM(desmat) as descripcion FROM AlmmMatg WHERE RTRIM(codcia)=? AND (codmat LIKE ? OR desmat LIKE ?)", (codcia, q_clean, q_clean))
            for row in cursor.fetchall():
                results.append({"tipo": "Producto", "codigo": row.codigo, "descripcion": row.descripcion})
        except Exception: pass

        # 2. AlmTabla (Servicios)
        try:
            cursor.execute("SELECT TOP 15 RTRIM(codigo) as codigo, RTRIM(nombre) as descripcion FROM AlmTabla WHERE tabla='0017' AND (codigo LIKE ? OR nombre LIKE ?)", (q_clean, q_clean))
            for row in cursor.fetchall():
                results.append({"tipo": "Servicio", "codigo": row.codigo, "descripcion": row.descripcion})
        except Exception: pass

        # 3. CONGASTO (Gastos)
        try:
            cursor.execute("SELECT TOP 15 RTRIM(CODCGAS) as codigo, RTRIM(DESCGAS) as descripcion FROM CONGASTO WHERE RTRIM(codcia)=? AND (CODCGAS LIKE ? OR DESCGAS LIKE ?)", (codcia, q_clean, q_clean))
            for row in cursor.fetchall():
                results.append({"tipo": "Gasto", "codigo": row.codigo, "descripcion": row.descripcion})
        except Exception: pass

        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  FACTURAS
# ════════════════════════════════════════════════════════════

@router.post("/facturas/buscar-cpe")
def buscar_cpe(data: BuscarCpeRequest):
    """Buscar datos completos de un CPE via API datoscperecibido.
    Primero revisa si ya existe el XML cacheado en CntCompras.XmlDataJson.
    Si no, llama a la API externa y cachea el resultado.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")

    try:
        cursor = conn.cursor()

        # 1. Intentar leer de cache local (CntCompras que ya fue enriquecida)
        try:
            cursor.execute("""
                SELECT TOP 1 XmlDataJson FROM CntCompras
                WHERE NumDocIdProveedor=? AND NumSerieCDP=? AND NumCDP=?
                AND XmlDataJson IS NOT NULL AND LEN(XmlDataJson) > 10
            """, (data.proveedor.strip(), data.serie.strip(), data.numero.strip()))
            cached = cursor.fetchone()
            if cached and cached[0]:
                return json.loads(cached[0])
        except Exception:
            pass  # La columna XmlDataJson puede no existir aún en CntCompras

        # 2. Si no hay cache, llamar a la API
        token = _get_token_for_company(cursor, data.codcia, "datoscpe")
        if not token:
            raise HTTPException(
                status_code=400,
                detail=f"No se encontro token 'DatosCPE' activo para la empresa {data.codcia}. Configure un token primero."
            )

        url = "https://api.org.pe/v1/datoscperecibido"
        payload = json.dumps({
            "proveedor": data.proveedor,
            "codComp": data.cod_comp,
            "serie": data.serie,
            "numero": data.numero
        })
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

        resp = requests.post(url, headers=headers, data=payload, timeout=30)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"API error: {resp.status_code}")

        api_data = resp.json()
        if not api_data.get("success"):
            raise HTTPException(status_code=404, detail=api_data.get("message", "Comprobante no encontrado"))

        cpe_data = api_data.get("data", {})

        # 3. Cachear en CntCompras si existe el registro
        try:
            cursor.execute("""
                UPDATE CntCompras SET XmlDataJson=?
                WHERE NumDocIdProveedor=? AND NumSerieCDP=? AND NumCDP=?
            """, (json.dumps(cpe_data, ensure_ascii=False), data.proveedor.strip(), data.serie.strip(), data.numero.strip()))
            conn.commit()
        except Exception:
            pass  # Si falla el cache, no es crítico

        return cpe_data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/compras/enrich-batch")
def enrich_batch(data: EnrichBatchRequest):
    """Enriquecer masivamente los registros de CntCompras de un periodo
    consultando datoscperecibido para cada uno y guardando el XML completo."""
    import time
    
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")

    try:
        cursor = conn.cursor()

        # Asegurar que la columna XmlDataJson existe en CntCompras
        try:
            cursor.execute("IF COL_LENGTH('CntCompras','XmlDataJson') IS NULL ALTER TABLE CntCompras ADD XmlDataJson varchar(MAX)")
            conn.commit()
        except Exception:
            pass

        token = _get_token_for_company(cursor, data.codcia, "datoscpe")
        if not token:
            raise HTTPException(status_code=400, detail=f"No se encontro token 'DatosCPE' para {data.codcia}")

        # Obtener registros sin XML cacheado
        cursor.execute("""
            SELECT Id, NumDocIdProveedor, CodTipoCDP, NumSerieCDP, NumCDP
            FROM CntCompras
            WHERE RTRIM(CodCia)=? AND PerTributario=?
            AND (XmlDataJson IS NULL OR LEN(XmlDataJson) < 10)
        """, (data.codcia.strip(), data.periodo))
        
        registros = cursor.fetchall()
        total = len(registros)
        enriched = 0
        errors = 0

        url = "https://api.org.pe/v1/datoscperecibido"

        for reg in registros:
            try:
                # Mapear codTipoCDP para la API (F7 -> 07, etc.)
                cod_comp = reg.CodTipoCDP or "01"
                
                payload = json.dumps({
                    "proveedor": (reg.NumDocIdProveedor or "").strip(),
                    "codComp": cod_comp,
                    "serie": (reg.NumSerieCDP or "").strip(),
                    "numero": (reg.NumCDP or "").strip()
                })
                headers = {
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json'
                }

                resp = requests.post(url, headers=headers, data=payload, timeout=30)
                if resp.status_code == 200:
                    api_data = resp.json()
                    if api_data.get("success"):
                        cpe_data = api_data.get("data", {})
                        cursor.execute(
                            "UPDATE CntCompras SET XmlDataJson=? WHERE Id=?",
                            (json.dumps(cpe_data, ensure_ascii=False), reg.Id)
                        )
                        conn.commit()
                        enriched += 1

                time.sleep(0.5)  # Rate limit: esperar 500ms entre llamadas
                        
            except Exception as e:
                errors += 1
                continue

        return {
            "status": "success",
            "message": f"Enriquecimiento completado: {enriched}/{total} registros procesados, {errors} errores",
            "total": total,
            "enriched": enriched,
            "errors": errors
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()



@router.post("/facturas")
def crear_factura(data: FacturaCreate):
    """Registrar factura (cabecera + detalle)"""
    print(f"DEBUG: crear_factura - credito_mto_pendiente: {data.credito_mto_pendiente}, credito_fec_plazo: {data.credito_fec_plazo}, credito_num_cuotas: {data.credito_num_cuotas}")
    print(f"DEBUG: crear_factura - items: {len(data.items)}")
    for i, item in enumerate(data.items):
        print(f"DEBUG: item {i} - extra_data: {item.extra_data}")
    
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")

    try:
        cursor = conn.cursor()

        # Auto-migrate: ensure all new columns exist
        _new_cab_cols = {
            'DetLeyenda': 'varchar(500)',
            'NomComercialProv': 'varchar(250)', 'DirProveedor': 'varchar(500)',
            'UbigeoProveedor': 'varchar(100)', 'DirReceptorFactura': 'varchar(500)',
            'CodTipTransaccion': 'varchar(20)', 'IndEstadoCpe': 'varchar(5)',
            'IndProcedencia': 'varchar(5)', 'PlacaVehicular': 'varchar(30)',
            'MtoExportacion': 'decimal(18,2)', 'MtoDescuentos': 'decimal(18,2)',
            'MtoRedondeo': 'decimal(18,2)',
            'CodTipoNota': 'varchar(10)', 'DesTipoNota': 'varchar(250)',
            'DesMotivo': 'varchar(500)',
            'DocModificaSerie': 'varchar(10)', 'DocModificaNumero': 'varchar(20)',
            'DocModificaTipo': 'varchar(10)', 'DocModificaFecha': 'varchar(20)',
            'CreditoMtoPendiente': 'decimal(18,2)', 'CreditoFecPlazo': 'varchar(20)',
            'CreditoNumCuotas': 'int', 'CreditoCuotasJson': 'varchar(MAX)',
            'DocsRelacionadosJson': 'varchar(MAX)', 'XmlDataJson': 'varchar(MAX)',
            'NomComercialEmisor': 'varchar(250)', 'MtoTotalLetras': 'varchar(500)',
            'DirEmisor': 'varchar(500)', 'UbigeoEmisor': 'varchar(100)',
            'DirReceptor': 'varchar(500)', 'Uuid': 'varchar(50)'
        }
        for col, dtype in _new_cab_cols.items():
            try:
                cursor.execute(f"IF COL_LENGTH('CntFacturaCab','{col}') IS NULL ALTER TABLE CntFacturaCab ADD [{col}] {dtype}")
                print(f"DEBUG: Columna {col} verificada/creada en CntFacturaCab")
            except Exception as e:
                print(f"DEBUG: Error al crear columna {col} en CntFacturaCab: {e}")
                pass
        _new_det_cols = {
            'CodProveedor': 'varchar(50)', 'DesUnidadMedida': 'varchar(100)',
            'MtoICBPERItem': 'decimal(18,2)', 'MtoDescuento': 'decimal(18,2)',
            'Inci': 'varchar(500)', 'Fabricante': 'varchar(250)',
            'Obs1': 'varchar(500)', 'Obs2': 'varchar(500)', 'Obs3': 'varchar(500)', 'Obs4': 'varchar(500)',
            'ExtraDataJson': 'varchar(MAX)'
        }
        for col, dtype in _new_det_cols.items():
            try:
                cursor.execute(f"IF COL_LENGTH('CntFacturaDet','{col}') IS NULL ALTER TABLE CntFacturaDet ADD [{col}] {dtype}")
            except Exception:
                pass
        
        # Modificar tamaño de columna INCI si ya existe pero es varchar(50)
        try:
            cursor.execute("""
                DECLARE @current_len int
                SELECT @current_len = CHARACTER_MAXIMUM_LENGTH 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'CntFacturaDet' AND COLUMN_NAME = 'Inci'
                
                IF @current_len = 50
                BEGIN
                    ALTER TABLE CntFacturaDet ALTER COLUMN Inci varchar(500)
                    PRINT 'Columna Inci modificada de varchar(50) a varchar(500)'
                END
            """)
            conn.commit()
        except Exception as e:
            print(f"DEBUG: Error al modificar columna Inci: {e}")
            pass
        
        # Crear tabla para archivos de items si no existe
        try:
            cursor.execute("""
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CntFacturaDetArchivos')
                BEGIN
                    CREATE TABLE CntFacturaDetArchivos (
                        Id INT IDENTITY(1,1) PRIMARY KEY,
                        FacturaCabId INT NOT NULL,
                        ItemIndex INT NOT NULL,
                        ObsField VARCHAR(50) NOT NULL,
                        NombreArchivo VARCHAR(255) NOT NULL,
                        RutaArchivo VARCHAR(500) NOT NULL,
                        TamanioBytes INT,
                        CreatedBy VARCHAR(50),
                        CreatedAt DATETIME DEFAULT GETDATE(),
                        FOREIGN KEY (FacturaCabId) REFERENCES CntFacturaCab(Id)
                    )
                    PRINT 'Tabla CntFacturaDetArchivos creada'
                END
            """)
            conn.commit()
        except Exception as e:
            print(f"DEBUG: Error al crear tabla CntFacturaDetArchivos: {e}")
            pass
        conn.commit()

        # Función de truncamiento preventivo para evitar error 22001
        def trunc(val, maxlen):
            if val is None:
                return None
            s = str(val)
            return s[:maxlen] if len(s) > maxlen else s

        # Truncar campos de texto a su tamaño máximo de columna
        data.nom_proveedor = trunc(data.nom_proveedor, 500)
        data.det_leyenda = trunc(data.det_leyenda, 1000)
        data.det_bien_servicio = trunc(data.det_bien_servicio, 500)
        data.det_medio_pago = trunc(data.det_medio_pago, 100)
        data.det_nro_cuenta = trunc(data.det_nro_cuenta, 50)
        data.observaciones = trunc(data.observaciones, 2000)
        data.dir_emisor = trunc(data.dir_emisor, 500)
        data.ubigeo_emisor = trunc(data.ubigeo_emisor, 100)
        data.dir_receptor = trunc(data.dir_receptor, 500)
        data.mto_total_letras = trunc(data.mto_total_letras, 500)
        data.nom_comercial_emisor = trunc(data.nom_comercial_emisor, 500)
        data.nom_comercial_prov = trunc(data.nom_comercial_prov, 500)
        data.dir_proveedor = trunc(data.dir_proveedor, 500)
        data.ubigeo_proveedor = trunc(data.ubigeo_proveedor, 100)
        data.dir_receptor_factura = trunc(data.dir_receptor_factura, 500)
        data.des_motivo = trunc(data.des_motivo, 1000)
        data.des_tipo_nota = trunc(data.des_tipo_nota, 500)
        data.modo_registro = trunc(data.modo_registro, 10)
        data.created_by = trunc(data.created_by, 50)
        data.placa_vehicular = trunc(data.placa_vehicular, 20)
        data.nro_orden_compra = trunc(data.nro_orden_compra, 20)


        # Check for duplicate
        if data.serie and data.numero and data.num_ruc_proveedor:
            cursor.execute("""
                SELECT Id FROM CntFacturaCab
                WHERE RTRIM(CodCia)=? AND Serie=? AND Numero=? AND NumRucProveedor=? AND Estado != 'Anulada'
            """, (data.codcia.strip(), data.serie, data.numero, data.num_ruc_proveedor))
            row = cursor.fetchone()
            if row and row.Id != data.id:
                raise HTTPException(status_code=409, detail="Ya existe una factura registrada con esa serie/numero/proveedor")

        # SET ARITHABORT ON is needed when inserting into tables with computed columns or indexed views
        cursor.execute("SET ARITHABORT ON")

        if data.id:
            # Bloqueo por estado CONTABILIZADO o CERRADO
            cursor.execute("SELECT Estado FROM CntFacturaCab WHERE Id = ?", (data.id,))
            current_status = cursor.fetchone()
            if current_status and current_status[0] in ['Cerrado', 'Contabilizado']:
                raise HTTPException(status_code=403, detail=f"No se puede modificar una factura en estado {current_status[0]}")

            # Si CreditoFecPlazo está presente, usarlo como FecVencimiento principal
            # Fallback: credito_fec_plazo -> fec_vencimiento -> fec_emision
            fec_vencimiento_val = _safe_date(data.credito_fec_plazo) or _safe_date(data.fec_vencimiento) or _safe_date(data.fec_emision)

            cursor.execute("""
                UPDATE CntFacturaCab SET
                    CodCia=?, NumRucProveedor=?, NomProveedor=?, CodTipoDoc=?, Serie=?, Numero=?,
                    FecEmision=?, FecVencimiento=?, CodMoneda=?, TipoCambio=?,
                    SubTotal=?, IGV=?, OtrosTributos=?, Total=?,
                    MtoGravado=?, MtoExonerado=?, MtoInafecto=?, MtoGratuito=?,
                    MtoAnticipos=?, MtoISC=?, MtoICBPER=?, MtoOtrosCargos=?,
                    DetLeyenda=?, DetBienServicio=?, DetMedioPago=?, DetNroCuenta=?, DetPorcentaje=?, DetMonto=?,
                    NroOrdenCompra=?, TipoOc=?, AnosOc=?, CodCiaOc=?,
                    Estado=?, Observaciones=?, ModoRegistro=?, IdCompraRef=?,
                    DirEmisor=?, UbigeoEmisor=?, DirReceptor=?, MtoTotalLetras=?,
                    NomComercialEmisor=?,
                    NomComercialProv=?, DirProveedor=?, UbigeoProveedor=?, DirReceptorFactura=?,
                    CodTipTransaccion=?, IndEstadoCpe=?, IndProcedencia=?, PlacaVehicular=?,
                    MtoExportacion=?, MtoDescuentos=?, MtoRedondeo=?,
                    CodTipoNota=?, DesTipoNota=?, DesMotivo=?,
                    DocModificaSerie=?, DocModificaNumero=?, DocModificaTipo=?, DocModificaFecha=?,
                    CreditoMtoPendiente=?, CreditoFecPlazo=?, CreditoNumCuotas=?, CreditoCuotasJson=?,
                    DocsRelacionadosJson=?, XmlDataJson=?,
                    UpdatedAt=GETDATE()
                WHERE Id=?
            """, (
                data.codcia.strip(), data.num_ruc_proveedor, data.nom_proveedor, data.cod_tipo_doc, data.serie, data.numero,
                _safe_date(data.fec_emision), fec_vencimiento_val, data.cod_moneda, data.tipo_cambio,
                data.sub_total, data.igv, data.otros_tributos, data.total,
                data.mto_gravado, data.mto_exonerado, data.mto_inafecto, data.mto_gratuito,
                data.mto_anticipos, data.mto_isc, data.mto_icbper, data.mto_otros_cargos,
                data.det_leyenda, data.det_bien_servicio, data.det_medio_pago, data.det_nro_cuenta, data.det_porcentaje, data.det_monto,
                data.nro_orden_compra, data.tipo_oc, data.anos_oc, data.codcia_oc,
                'Registrada', data.observaciones, data.modo_registro, data.id_compra_ref,
                data.dir_emisor, data.ubigeo_emisor, data.dir_receptor, data.mto_total_letras,
                data.nom_comercial_emisor,
                data.nom_comercial_prov, data.dir_proveedor, data.ubigeo_proveedor, data.dir_receptor_factura,
                data.cod_tip_transaccion, data.ind_estado_cpe, data.ind_procedencia, data.placa_vehicular,
                data.mto_exportacion, data.mto_descuentos, data.mto_redondeo,
                data.cod_tipo_nota, data.des_tipo_nota, data.des_motivo,
                data.doc_modifica_serie, data.doc_modifica_numero, data.doc_modifica_tipo, _safe_date(data.doc_modifica_fecha),
                data.credito_mto_pendiente, _safe_date(data.credito_fec_plazo), data.credito_num_cuotas, data.credito_cuotas_json,
                data.docs_relacionados_json, data.xml_data_json,
                data.id
            ))
            factura_id = data.id
            cursor.execute("DELETE FROM CntFacturaDet WHERE FacturaCabId=?", (factura_id,))
        else:
            # Si CreditoFecPlazo está presente, usarlo como FecVencimiento principal
            # Fallback: credito_fec_plazo -> fec_vencimiento -> fec_emision
            fec_vencimiento_val = _safe_date(data.credito_fec_plazo) or _safe_date(data.fec_vencimiento) or _safe_date(data.fec_emision)
            
            cursor.execute("""
                INSERT INTO CntFacturaCab (
                    CodCia, NumRucProveedor, NomProveedor, CodTipoDoc, Serie, Numero,
                    FecEmision, FecVencimiento, FecRegistro, CodMoneda, TipoCambio,
                    SubTotal, IGV, OtrosTributos, Total,
                    MtoGravado, MtoExonerado, MtoInafecto, MtoGratuito,
                    MtoAnticipos, MtoISC, MtoICBPER, MtoOtrosCargos,
                    DetLeyenda, DetBienServicio, DetMedioPago, DetNroCuenta, DetPorcentaje, DetMonto,
                    NroOrdenCompra, TipoOc, AnosOc, CodCiaOc,
                    Estado, Observaciones, ModoRegistro, IdCompraRef,
                    DirEmisor, UbigeoEmisor, DirReceptor, MtoTotalLetras,
                    NomComercialEmisor, CreatedBy,
                    NomComercialProv, DirProveedor, UbigeoProveedor, DirReceptorFactura,
                    CodTipTransaccion, IndEstadoCpe, IndProcedencia, PlacaVehicular,
                    MtoExportacion, MtoDescuentos, MtoRedondeo,
                    CodTipoNota, DesTipoNota, DesMotivo,
                    DocModificaSerie, DocModificaNumero, DocModificaTipo, DocModificaFecha,
                    CreditoMtoPendiente, CreditoFecPlazo, CreditoNumCuotas, CreditoCuotasJson,
                    DocsRelacionadosJson, XmlDataJson
                ) OUTPUT INSERTED.Id
                VALUES (?,?,?,?,?,?,?,?,GETDATE(),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                data.codcia.strip(), data.num_ruc_proveedor, data.nom_proveedor, data.cod_tipo_doc, data.serie, data.numero,
                _safe_date(data.fec_emision), fec_vencimiento_val, data.cod_moneda, data.tipo_cambio,
                data.sub_total, data.igv, data.otros_tributos, data.total,
                data.mto_gravado, data.mto_exonerado, data.mto_inafecto, data.mto_gratuito,
                data.mto_anticipos, data.mto_isc, data.mto_icbper, data.mto_otros_cargos,
                data.det_leyenda, data.det_bien_servicio, data.det_medio_pago, data.det_nro_cuenta, data.det_porcentaje, data.det_monto,
                data.nro_orden_compra, data.tipo_oc, data.anos_oc, data.codcia_oc,
                'Registrada', data.observaciones, data.modo_registro, data.id_compra_ref,
                data.dir_emisor, data.ubigeo_emisor, data.dir_receptor, data.mto_total_letras,
                data.nom_comercial_emisor, data.created_by,
                data.nom_comercial_prov, data.dir_proveedor, data.ubigeo_proveedor, data.dir_receptor_factura,
                data.cod_tip_transaccion, data.ind_estado_cpe, data.ind_procedencia, data.placa_vehicular,
                data.mto_exportacion, data.mto_descuentos, data.mto_redondeo,
                data.cod_tipo_nota, data.des_tipo_nota, data.des_motivo,
                data.doc_modifica_serie, data.doc_modifica_numero, data.doc_modifica_tipo, _safe_date(data.doc_modifica_fecha),
                data.credito_mto_pendiente, _safe_date(data.credito_fec_plazo), data.credito_num_cuotas, data.credito_cuotas_json,
                data.docs_relacionados_json, data.xml_data_json
            ))
            factura_id = int(cursor.fetchone()[0])


        # Insert details
        print(f"DEBUG: Iniciando inserción de {len(data.items)} items")
        for idx, item in enumerate(data.items):
            print(f"DEBUG: Procesando item {idx} - codigo: {item.cod_material}, cantidad: {item.cantidad}, precio: {item.precio_unitario}")
            # Truncar campos de texto para evitar error 22001
            extra_data = item.extra_data if item.extra_data else {}
            inci_val = trunc(extra_data.get('inci'), 500) if extra_data.get('inci') else None
            fabricante_val = trunc(extra_data.get('fabricante'), 250) if extra_data.get('fabricante') else None
            obs1_val = trunc(extra_data.get('obs1'), 500) if extra_data.get('obs1') else None
            obs2_val = trunc(extra_data.get('obs2'), 500) if extra_data.get('obs2') else None
            obs3_val = trunc(extra_data.get('obs3'), 500) if extra_data.get('obs3') else None
            obs4_val = trunc(extra_data.get('obs4'), 500) if extra_data.get('obs4') else None
            
            cursor.execute("""
                INSERT INTO CntFacturaDet (
                    FacturaCabId, NroItem, CodMaterial, CodProveedor, Descripcion,
                    UnidadMedida, DesUnidadMedida, Cantidad, PrecioUnitario, Descuento,
                    SubTotal, IGV, ICBPER, MtoICBPERItem, MtoDescuento, Total,
                    CantidadOC, CantidadAlmacen,
                    Inci, Fabricante, Obs1, Obs2, Obs3, Obs4, FechaVencimientoItem, ExtraDataJson
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                factura_id,
                item.nro_item,
                item.cod_material,
                item.cod_proveedor,
                item.descripcion,
                item.unidad_medida,
                item.des_unidad_medida,
                item.cantidad,
                item.precio_unitario,
                item.descuento,
                item.sub_total,
                item.igv,
                item.icbper or 0,
                item.mto_icbper_item or 0,
                item.mto_descuento or 0,
                item.total,
                item.cantidad_oc,
                None,
                inci_val,
                fabricante_val,
                obs1_val,
                obs2_val,
                obs3_val,
                obs4_val,
                _safe_date(extra_data.get('fecha_vencimiento')) if extra_data else None,
                json.dumps(extra_data) if extra_data else None
            ))

        conn.commit()

        # Generate unique UUID for this invoice
        factura_uuid = str(uuid.uuid4())
        try:
            cursor.execute("UPDATE CntFacturaCab SET Uuid=? WHERE Id=?", (factura_uuid, factura_id))
            conn.commit()
        except Exception:
            factura_uuid = None  # Column may not exist yet

        return {"status": "success", "message": "Factura registrada", "id": factura_id, "uuid": factura_uuid}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/facturas/columns")
def get_factura_columns():
    """Obtener columnas de la tabla CntFacturaCab"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'CntFacturaCab'
            ORDER BY ORDINAL_POSITION
        """)
        cols = [c[0] for c in cursor.description]
        rows = []
        for r in cursor.fetchall():
            d = dict(zip(cols, r))
            rows.append(d)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/facturas")
def list_facturas(
    codcia: str = Query(...),
    periodo: Optional[str] = Query(None),
    proveedor: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    nro_oc: Optional[str] = Query(None),
    created_by: Optional[str] = Query(None)
):
    """Listar facturas registradas"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        query = """
            SELECT Id, RTRIM(CodCia) as CodCia, NumRucProveedor, NomProveedor,
                   CodTipoDoc, Serie, Numero, FecEmision, FecVencimiento,
                   CodMoneda, TipoCambio, SubTotal, IGV, OtrosTributos, Total,
                   NroOrdenCompra, TipoOc, AnosOc,
                   Estado, ModoRegistro, CreatedAt, CreatedBy,
                   CreditoFecPlazo, CreditoNumCuotas, CreditoMtoPendiente
            FROM CntFacturaCab
            WHERE RTRIM(CodCia) = ?
        """
        params = [codcia.strip()]

        if periodo:
            query += " AND FORMAT(FecEmision, 'yyyyMM') = ?"
            params.append(periodo)
        if proveedor:
            query += " AND (NumRucProveedor LIKE ? OR NomProveedor LIKE ?)"
            params.extend([f"%{proveedor}%", f"%{proveedor}%"])
        if estado:
            query += " AND Estado = ?"
            params.append(estado)
        if nro_oc:
            query += " AND NroOrdenCompra = ?"
            params.append(nro_oc)
        if created_by:
            query += " AND CreatedBy = ?"
            params.append(created_by)

        query += " ORDER BY FecEmision DESC, CreatedAt DESC"
        cursor.execute(query, tuple(params))
        cols = [c[0] for c in cursor.description]
        rows = []
        for r in cursor.fetchall():
            d = dict(zip(cols, r))
            if d.get('FecEmision'):
                d['FecEmision'] = d['FecEmision'].strftime("%Y-%m-%d")
            if d.get('FecVencimiento'):
                d['FecVencimiento'] = d['FecVencimiento'].strftime("%Y-%m-%d")
            if d.get('CreatedAt'):
                d['CreatedAt'] = d['CreatedAt'].strftime("%Y-%m-%d %H:%M")
            for k in ['SubTotal','IGV','OtrosTributos','Total','TipoCambio']:
                if d.get(k) is not None:
                    d[k] = float(d[k])
            rows.append(d)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/facturas/{factura_id}")
def get_factura_detail(factura_id: int):
    """Detalle completo de factura con items"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        
        cursor = conn.cursor()
        
        # Auto-migración robusta: asegurar columnas en CntFacturaDet
        _cols_to_check = {
            'Inci': 'varchar(50)', 'Fabricante': 'varchar(250)',
            'Obs1': 'varchar(500)', 'Obs2': 'varchar(500)', 'Obs3': 'varchar(500)', 'Obs4': 'varchar(500)',
            'FechaVencimientoItem': 'date',
            'ExtraDataJson': 'varchar(MAX)'
        }
        for col, dtype in _cols_to_check.items():
            try:
                # Verificar existencia columna por columna y aplicar commit inmediatamente
                cursor.execute(f"SELECT COL_LENGTH('CntFacturaDet', '{col}')")
                if cursor.fetchone()[0] is None:
                    cursor.execute(f"ALTER TABLE CntFacturaDet ADD [{col}] {dtype}")
                    conn.commit()
            except Exception as e:
                print(f"DEBUG: Error migrando columna {col}: {e}")
                try: conn.rollback()
                except: pass

        cursor.execute("""
            SELECT * FROM CntFacturaCab WHERE Id = ?
        """, (factura_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Factura no encontrada")

        cols = [c[0] for c in cursor.description]
        cab = dict(zip(cols, row))
        # Format dates
        for k in ['FecEmision','FecVencimiento','FecRegistro','CreditoFecPlazo']:
            if cab.get(k):
                cab[k] = cab[k].strftime("%Y-%m-%d")
        if cab.get('CreatedAt'):
            cab['CreatedAt'] = cab['CreatedAt'].strftime("%Y-%m-%d %H:%M")
        if cab.get('UpdatedAt'):
            cab['UpdatedAt'] = cab['UpdatedAt'].strftime("%Y-%m-%d %H:%M")
        for k in ['SubTotal','IGV','OtrosTributos','Total','TipoCambio']:
            if cab.get(k) is not None:
                cab[k] = float(cab[k])
        cab['CodCia'] = cab['CodCia'].strip() if cab.get('CodCia') else ''

        # Obtener columnas reales de CntFacturaDet
        cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CntFacturaDet'")
        actual_cols = [row[0] for row in cursor.fetchall()]
        
        needed_cols = [
            'Id', 'NroItem', 'CodMaterial', 'Descripcion', 'UnidadMedida',
            'Cantidad', 'PrecioUnitario', 'Descuento', 'SubTotal', 'IGV', 'ICBPER', 'Total',
            'CantidadOC', 'CantidadAlmacen',
            'Inci', 'Fabricante', 'Obs1', 'Obs2', 'Obs3', 'Obs4', 'FechaVencimientoItem', 'ExtraDataJson'
        ]
        
        # Filtrar solo las que existen
        select_cols = [c for c in needed_cols if c in actual_cols]
        missing_cols = [c for c in needed_cols if c not in actual_cols]
        
        query_det = f"SELECT {', '.join(select_cols)} FROM CntFacturaDet WHERE FacturaCabId = ? ORDER BY NroItem"
        cursor.execute(query_det, (factura_id,))
        
        det_cols = [c[0] for c in cursor.description]
        items = []
        for r in cursor.fetchall():
            d = dict(zip(det_cols, r))
            
            # Rellenar columnas faltantes con None para mantener compatibilidad con el frontend
            for col in missing_cols:
                d[col] = None
                
            for k in ['Cantidad','PrecioUnitario','Descuento','SubTotal','IGV','ICBPER','Total','CantidadOC','CantidadAlmacen']:
                if d.get(k) is not None:
                    d[k] = float(d[k])
            
            if d.get('FechaVencimientoItem'):
                d['FechaVencimientoItem'] = d['FechaVencimientoItem'].strftime("%Y-%m-%d")
            
            # Parse extraData from ExtraDataJson
            if d.get('ExtraDataJson'):
                try:
                    d['extraData'] = json.loads(d['ExtraDataJson'])
                except:
                    d['extraData'] = None
            else:
                d['extraData'] = None
            items.append(d)

        # Get archivos
        archivos = []
        try:
            cursor.execute("SELECT Id, NombreArchivo, TipoDocumento, TamanioBytes FROM CntFacturaArchivos WHERE FacturaCabId=?", (factura_id,))
            arc_cols = [c[0] for c in cursor.description]
            archivos = [dict(zip(arc_cols, r)) for r in cursor.fetchall()]
        except Exception:
            pass

        # Get archivos de items
        item_archivos = []
        try:
            cursor.execute("""
                SELECT Id, ItemIndex, ObsField, NombreArchivo, RutaArchivo, TamanioBytes, CreatedAt
                FROM CntFacturaDetArchivos WHERE FacturaCabId=? ORDER BY ItemIndex, ObsField, CreatedAt DESC
            """, (factura_id,))
            ia_cols = [c[0] for c in cursor.description]
            for r in cursor.fetchall():
                d = dict(zip(ia_cols, r))
                if d.get('CreatedAt'):
                    d['CreatedAt'] = d['CreatedAt'].strftime("%Y-%m-%d %H:%M")
                item_archivos.append(d)
            print(f"DEBUG get_factura_detail: Archivos de items obtenidos: {len(item_archivos)} archivos para factura {factura_id}")
        except Exception as e:
            print(f"DEBUG get_factura_detail: Error al obtener archivos de items: {e}")
            pass

        # Agrupar archivos de items por item_index (convertir de 1-based a 0-based)
        item_archivos_dict = {}
        for ia in item_archivos:
            # ItemIndex en DB es 1-based, convertir a 0-based para consistencia con frontend
            idx = ia['ItemIndex'] - 1 if ia['ItemIndex'] is not None else None
            if idx is not None and idx not in item_archivos_dict:
                item_archivos_dict[idx] = []
            if idx is not None:
                item_archivos_dict[idx].append(ia)
        print(f"DEBUG get_factura_detail: Archivos agrupados por item_index (0-based): {item_archivos_dict}")

        # Agregar archivos a cada item usando item_index (0-based)
        for item in items:
            nro_item = item.get('NroItem')
            # Convertir NroItem (1-based) a item_index (0-based)
            item_index = nro_item - 1 if nro_item is not None else None
            print(f"DEBUG get_factura_detail: Item {item.get('CodMaterial')}, NroItem: {nro_item}, item_index: {item_index}, tiene archivos: {item_index in item_archivos_dict if item_index is not None else False}")
            if item_index is not None and item_index in item_archivos_dict:
                item['archivos'] = item_archivos_dict[item_index]
            else:
                item['archivos'] = []

        return {"cabecera": cab, "items": items, "archivos": archivos}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/facturas/{factura_id}")
def eliminar_factura(factura_id: int):
    """Eliminar factura (hard delete)"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        
        # Bloqueo por estado CONTABILIZADO o CERRADO
        cursor.execute("SELECT Estado FROM CntFacturaCab WHERE Id = ?", (factura_id,))
        current_status = cursor.fetchone()
        if current_status and current_status[0] in ['Cerrado', 'Contabilizado']:
            raise HTTPException(status_code=403, detail=f"No se puede eliminar una factura en estado {current_status[0]}")

        target_dir = os.path.join(UPLOAD_DIR, str(factura_id))
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir, ignore_errors=True)
            
        cursor.execute("SET ARITHABORT ON")
        # Eliminar en orden correcto respetando foreign keys
        for table in ['CntFacturaDetArchivos', 'CntFacturaArchivos', 'CntFacturaDet']:
            try:
                cursor.execute(f"DELETE FROM {table} WHERE FacturaCabId=?", (factura_id,))
            except Exception as e:
                print(f"DEBUG: Error al eliminar de {table} (puede no existir): {e}")
        cursor.execute("DELETE FROM CntFacturaCab WHERE Id=?", (factura_id,))
        conn.commit()
        return {"status": "success", "message": "Factura eliminada permanentemente"}
    except Exception as e:
        conn.rollback()
        print(f"DEBUG: Error al eliminar factura {factura_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  TRAZABILIDAD OC → ALMACEN → FACTURA
# ════════════════════════════════════════════════════════════

@router.get("/trazabilidad/global")
def get_trazabilidad_global(
    codcia: str = Query(..., description="Company code"),
    year: str = Query(..., description="Year"),
    period: str = Query(None, description="Month (1-12)"),
    tipo_oc: str = Query(None, description="Optional filter for OC type"),
    codmat_search: str = Query(None, description="Search by material code or description"),
    only_my_records: bool = Query(True, description="Filtrar por mis propios registros"),
    current_user: dict = Depends(get_current_user)
):
    """Devuelve listado masivo y aplanado de ítems de OC con su trazabilidad completa para revisión global"""
    conn = get_db_connection()
    if not conn: raise HTTPException(status_code=500, detail="Database connection error")
    
    try:
        cursor = conn.cursor()
        
        query = """
            SELECT 
                RTRIM(c.NroDoc) as nrodoc,
                c.Fchdoc as fchdoc,
                RTRIM(c.TipoOc) as tipooc,
                RTRIM(c.NomAux) as nom_proveedor,
                RTRIM(c.CodMon) as oc_moneda,
                RTRIM(c.Usuario) as usuario,
                RTRIM(r.CodMat) as codmat,
                RTRIM(r.DesMat) as desmat,
                r.CanDes as candes,
                r.PreUni as preuni
            FROM CmpVOcom c
            INNER JOIN CmpROcom r ON RTRIM(c.CodCia) = RTRIM(r.CodCia) AND RTRIM(c.NroDoc) = RTRIM(r.NroDoc) AND RTRIM(c.Anos) = RTRIM(r.Anos)
            WHERE RTRIM(c.CodCia) = ?
        """
        params = [codcia.strip()]
        
        if codmat_search:
            # Búsqueda de producto: historial completo, ignora año y periodo
            query += " AND (r.CodMat LIKE ? OR r.DesMat LIKE ?)"
            match_txt = f"%{codmat_search.strip()}%"
            params.extend([match_txt, match_txt])
        else:
            # Búsqueda normal: siempre filtra por año
            query += " AND RTRIM(c.Anos) = ?"
            params.append(year.strip())
            if period:
                query += " AND MONTH(c.Fchdoc) = ?"
                params.append(int(period))
            
        if tipo_oc:
            query += " AND RTRIM(c.TipoOc) = ?"
            params.append(tipo_oc.strip())
            
        # --- RLS Enforcement (Row-Level Security) ---
        login = current_user["login"]
        is_admin_or_super = current_user.get("rol") == "ADMIN" or login.strip().upper() == "71941916JL"
        
        puede_ver_todo = False
        allowed_types = []
        if is_admin_or_super:
            puede_ver_todo = True
            allowed_types = ['M', 'S', 'T']
        else:
            # Obtener bandera de ver_todo
            cursor.execute("SELECT ISNULL(PuedeVerTodo, 0) FROM WebUsers WHERE login = ?", (login,))
            r = cursor.fetchone()
            if r: puede_ver_todo = bool(r[0])
            
            # Obtener tipos de OC permitidos
            cursor.execute("SELECT RTRIM(TipoOc) FROM WebUsuarioTipoOc WHERE Login = ?", (login,))
            allowed_types = [row[0] for row in cursor.fetchall()]

        # 1. Filtro estricto por Usuario Logueado (Mis Registros)
        if only_my_records or not puede_ver_todo:
            # Forzamos que solo vea los suyos
            query += " AND RTRIM(c.Usuario) = ?"
            params.append(login.strip().upper())
            
        # 2. Filtro estricto de Tipo OC (si no tiene permisos, no ve nada o limitados)
        if not is_admin_or_super:
            if not allowed_types:
                # Si no tiene ningún tipo configurado, le bloqueamos la consulta
                query += " AND 1 = 0"
            else:
                placeholders = ','.join('?' * len(allowed_types))
                query += f" AND RTRIM(c.TipoOc) IN ({placeholders})"
                params.extend(allowed_types)
        # --- End RLS ---
            
        query += " ORDER BY c.Fchdoc DESC, c.NroDoc DESC"
        cursor.execute(query, tuple(params))
        oc_items = []
        nrodoc_set = set()
        
        for row in cursor.fetchall():
            oc_items.append({
                "nrodoc": row.nrodoc,
                "fchdoc": row.fchdoc.strftime("%Y-%m-%d") if row.fchdoc else "",
                "tipooc": row.tipooc,
                "proveedor": row.nom_proveedor,
                "usuario": row.usuario or "",
                "oc_moneda": "Soles" if str(row.oc_moneda).strip() in ("1", "1.0", "S/", "MN", "PEN") else "Dólares",
                "codmat": row.codmat,
                "desmat": row.desmat,
                "candes": float(row.candes) if row.candes else 0,
                "preuni": float(row.preuni) if row.preuni else 0
            })
            nrodoc_set.add(row.nrodoc)
            
        if not nrodoc_set:
            return []

        nrodocs_list = list(nrodoc_set)
        placeholders_oc = ",".join(["?" for _ in nrodocs_list])
        
        # ALMACEN
        alm_query = f"""
            SELECT RTRIM(ordcmp) as nrodoc, RTRIM(codmat) as codmat, candes, preuni, RTRIM(codmon) as codmon
            FROM AlmRMovm
            WHERE RTRIM(CodCia) = ? AND RTRIM(ordcmp) IN ({placeholders_oc})
        """
        cursor.execute(alm_query, tuple([codcia.strip()] + nrodocs_list))
        almacen_by_oc_mat = {}
        for row in cursor.fetchall():
            if not row.nrodoc or not row.codmat: continue
            key = f"{row.nrodoc}_{row.codmat}"
            if key not in almacen_by_oc_mat:
                almacen_by_oc_mat[key] = {"cant": 0, "preuni": 0, "cod_moneda": row.codmon if row.codmon else ""}
            almacen_by_oc_mat[key]["cant"] += (float(row.candes) if row.candes else 0)
            p = float(row.preuni) if row.preuni else 0
            if p > 0: almacen_by_oc_mat[key]["preuni"] = p
            if row.codmon and row.codmon.strip(): almacen_by_oc_mat[key]["cod_moneda"] = row.codmon

        # FACTURAS
        fac_query = f"""
            SELECT RTRIM(fc.NroOrdenCompra) as nrodoc, RTRIM(fd.CodMaterial) as codmat,
                   SUM(fd.Cantidad) as total_facturado, MAX(fd.PrecioUnitario) as p_unitario, MAX(fc.CodMoneda) as cod_moneda,
                   MAX(fd.Inci) as inci, MAX(fd.Fabricante) as fabricante, MAX(fd.FechaVencimientoItem) as fecha_vencimiento_item,
                   MAX(fd.Obs1) as obs1, MAX(fd.Obs2) as obs2, MAX(fd.Obs3) as obs3, MAX(fd.Obs4) as obs4,
                   MAX(fc.Id) as factura_cab_id, MAX(fd.NroItem) as item_index
            FROM CntFacturaDet fd
            INNER JOIN CntFacturaCab fc ON fd.FacturaCabId = fc.Id
            WHERE RTRIM(fc.CodCia) = ? AND RTRIM(fc.NroOrdenCompra) IN ({placeholders_oc}) AND fc.Estado != 'Anulada'
            GROUP BY RTRIM(fc.NroOrdenCompra), RTRIM(fd.CodMaterial)
        """
        cursor.execute(fac_query, tuple([codcia.strip()] + nrodocs_list))
        factura_by_oc_mat = {}
        for row in cursor.fetchall():
            if not row.nrodoc or not row.codmat: continue
            key = f"{row.nrodoc}_{row.codmat}"
            factura_by_oc_mat[key] = {
                "cant": float(row.total_facturado) if row.total_facturado else 0,
                "preuni": float(row.p_unitario) if row.p_unitario else 0,
                "cod_moneda": str(row.cod_moneda).strip() if row.cod_moneda else "",
                "inci": row.inci if row.inci else "",
                "fabricante": row.fabricante if row.fabricante else "",
                "fecha_vencimiento_item": row.fecha_vencimiento_item.strftime("%Y-%m-%d") if row.fecha_vencimiento_item else "",
                "obs1": row.obs1 if row.obs1 else "",
                "obs2": row.obs2 if row.obs2 else "",
                "obs3": row.obs3 if row.obs3 else "",
                "obs4": row.obs4 if row.obs4 else "",
                "factura_cab_id": row.factura_cab_id if row.factura_cab_id else None,
                "item_index": row.item_index if row.item_index else None
            }

        def map_moneda(cod):
            if not cod: return "-"
            c = str(cod).strip().upper()
            if c in ("1", "1.0", "S/", "MN", "PEN"): return "Soles"
            if c in ("2", "2.0", "US$", "USD", "ME", "US"): return "Dólares"
            return cod

        for it in oc_items:
            key = f"{it['nrodoc']}_{it['codmat']}"
            a_info = almacen_by_oc_mat.get(key, {})
            cant_almacen = a_info.get("cant", 0) if isinstance(a_info, dict) else 0
            
            f_info = factura_by_oc_mat.get(key, {})
            cant_facturada = f_info.get("cant", 0)

            warnings = []
            oc_m = it["oc_moneda"]
            fac_m = map_moneda(f_info.get("cod_moneda")) if f_info.get("cod_moneda") else oc_m
            alm_m = map_moneda(a_info.get("cod_moneda")) if isinstance(a_info, dict) and a_info.get("cod_moneda") else oc_m

            # Strict validations
            is_M = it["tipooc"] == "M"
            
            if is_M:
                if alm_m != oc_m and alm_m != "-" and alm_m != "Desconocida":
                    warnings.append(f"Moneda difiere: OC({oc_m}), Alm({alm_m})")
                
                alm_p = a_info.get("preuni", 0) if isinstance(a_info, dict) else 0
                if alm_p > 0 and abs(alm_p - it["preuni"]) > 0.05:
                    warnings.append(f"Precio difiere: OC({it['preuni']}), Alm({alm_p})")
                    
                if cant_almacen < it["candes"]:
                    warnings.append(f"Cant Alm incompleta: {cant_almacen} / {it['candes']}")

            # Always check facturas
            if fac_m != oc_m and fac_m != "-" and fac_m != "Desconocida":
                warnings.append(f"Moneda difiere: OC({oc_m}), Fac({fac_m})")
                
            fac_p = f_info.get("preuni", 0)
            if fac_p > 0 and abs(fac_p - it["preuni"]) > 0.05:
                warnings.append(f"Precio difiere: OC({it['preuni']}), Fac({fac_p})")
                
            if cant_facturada < it["candes"]:
                warnings.append(f"Cant Fac incompleta: {cant_facturada} / {it['candes']}")

            it["cant_almacen"] = cant_almacen
            it["cant_facturada"] = cant_facturada
            it["pct_almacen"] = round((cant_almacen / it["candes"] * 100), 1) if it["candes"] > 0 else 0
            it["pct_facturado"] = round((cant_facturada / it["candes"] * 100), 1) if it["candes"] > 0 else 0
            it["warnings"] = warnings
            it["inci"] = f_info.get("inci", "") if isinstance(f_info, dict) else ""
            it["fabricante"] = f_info.get("fabricante", "") if isinstance(f_info, dict) else ""
            it["fecha_vencimiento"] = f_info.get("fecha_vencimiento_item", "") if isinstance(f_info, dict) else ""
            it["obs1"] = f_info.get("obs1", "") if isinstance(f_info, dict) else ""
            it["obs2"] = f_info.get("obs2", "") if isinstance(f_info, dict) else ""
            it["obs3"] = f_info.get("obs3", "") if isinstance(f_info, dict) else ""
            it["obs4"] = f_info.get("obs4", "") if isinstance(f_info, dict) else ""
            it["factura_cab_id"] = f_info.get("factura_cab_id", None) if isinstance(f_info, dict) else None
            it["item_index"] = f_info.get("item_index", None) if isinstance(f_info, dict) else None

        return oc_items
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()



@router.get("/trazabilidad/{nrodoc}")
def get_trazabilidad(
    nrodoc: str,
    codcia: str = Query(...),
    tipo_oc: Optional[str] = Query(None),
    year: Optional[str] = Query(None)
):
    """Reporte trazabilidad: OC items + ingresos almacen + facturas vinculadas"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")

    try:
        cursor = conn.cursor()

        # 1. Items de la OC
        oc_query = """
            SELECT
                RTRIM(r.NroItm) as nroitm,
                RTRIM(r.CodMat) as codmat,
                RTRIM(r.DesMat) as desmat,
                RTRIM(r.UndStk) as undstk,
                r.CanDes as candes,
                r.PreUni as preuni,
                r.ImpTot as imptot,
                RTRIM(r.FlgEst) as flgest
            FROM CmpROcom r
            WHERE RTRIM(r.CodCia) = ? AND RTRIM(r.NroDoc) = ?
        """
        oc_params = [codcia.strip(), nrodoc.strip()]
        if tipo_oc:
            oc_query += " AND RTRIM(r.TipoOc) = ?"
            oc_params.append(tipo_oc)
        if year:
            oc_query += " AND RTRIM(r.Anos) = ?"
            oc_params.append(year)
        oc_query += " ORDER BY r.NroItm"

        cursor.execute(oc_query, tuple(oc_params))
        oc_items = []
        for row in cursor.fetchall():
            if row.flgest and row.flgest.strip():
                continue
            oc_items.append({
                "nroitm": int(row.nroitm) if row.nroitm else 0,
                "codmat": row.codmat or "",
                "desmat": row.desmat or "",
                "undstk": row.undstk or "",
                "candes": float(row.candes) if row.candes else 0,
                "preuni": float(row.preuni) if row.preuni else 0,
                "imptot": float(row.imptot) if row.imptot else 0,
            })

        def map_moneda(cod):
            if not cod: return "-"
            c = str(cod).strip().upper()
            if c in ("1", "1.0", "S/", "MN", "PEN"): return "Soles"
            if c in ("2", "2.0", "US$", "USD", "ME", "US"): return "Dólares"
            return cod

        # 2. Detalles de ingresos a almacén (documentos específicos)
        movimientos_almacen = []
        cursor.execute("""
            SELECT 
                RTRIM(almcen) as almcen, RTRIM(tipmov) as tipmov, 
                RTRIM(codmov) as codmov, RTRIM(nrodoc) as nrodoc,
                fchdoc, RTRIM(codmat) as codmat, candes,
                preuni, RTRIM(codmon) as codmon
            FROM AlmRMovm
            WHERE RTRIM(CodCia) = ? AND LTRIM(RTRIM(ordcmp)) = ?
            ORDER BY fchdoc, nrodoc
        """, (codcia.strip(), nrodoc.strip()))
        
        movs_cols = [c[0] for c in cursor.description]
        almacen_by_mat = {}
        for r in cursor.fetchall():
            d = dict(zip(movs_cols, r))
            if d.get('fchdoc'): d['fchdoc'] = d['fchdoc'].strftime("%Y-%m-%d")
            d['candes'] = float(d['candes']) if d.get('candes') else 0
            d['preuni'] = float(d['preuni']) if d.get('preuni') else 0
            d['codmon_desc'] = map_moneda(d.get('codmon'))
            movimientos_almacen.append(d)
            
            # Map for item aggregation
            m = d['codmat'].strip()
            if m not in almacen_by_mat:
                almacen_by_mat[m] = {"cant": 0, "preuni": 0, "cod_moneda": d.get('codmon', '')}
            almacen_by_mat[m]["cant"] += d['candes']
            if float(d['preuni']) > 0:
                almacen_by_mat[m]["preuni"] = float(d['preuni'])
            if d.get('codmon') and d.get('codmon').strip() != '':
                almacen_by_mat[m]["cod_moneda"] = d.get('codmon', '')

        # 3. Facturas vinculadas a esta OC
        facturas = []
        cursor.execute("""
            SELECT f.Id, f.Serie, f.Numero, f.NumRucProveedor, f.NomProveedor,
                   f.FecEmision, f.Total, f.Estado, f.CodMoneda, f.Uuid
            FROM CntFacturaCab f
            WHERE RTRIM(f.CodCia) = ? AND f.NroOrdenCompra = ? AND f.Estado != 'Anulada'
            ORDER BY f.FecEmision
        """, (codcia.strip(), nrodoc.strip()))
        fac_cols = [c[0] for c in cursor.description]
        for r in cursor.fetchall():
            d = dict(zip(fac_cols, r))
            if d.get('FecEmision'):
                d['FecEmision'] = d['FecEmision'].strftime("%Y-%m-%d")
            if d.get('Total') is not None:
                d['Total'] = float(d['Total'])
            facturas.append(d)

        # 4. Detalle facturado por material con validaciones
        # Obtenemos moneda y fecha de la orden
        q_oc = "SELECT CodMon, FchDoc FROM CmpVOcom WHERE RTRIM(CodCia)=? AND RTRIM(NroDoc)=?"
        p_oc = [codcia.strip(), nrodoc.strip()]
        if tipo_oc:
            q_oc += " AND RTRIM(TipoOc)=?"
            p_oc.append(tipo_oc.strip())
        if year:
            q_oc += " AND RTRIM(Anos)=?"
            p_oc.append(year.strip())
        cursor.execute(q_oc, tuple(p_oc))
        row_oc = cursor.fetchone()
        oc_moneda = "1" if row_oc and str(row_oc[0]).strip() in ("1", "1.0", "S/") else "2"
        fch_oc = row_oc[1].strftime("%Y-%m-%d") if row_oc and row_oc[1] else None

        facturado_by_mat = {}
        factura_ids = [f['Id'] for f in facturas]
        if factura_ids:
            placeholders = ",".join(["?" for _ in factura_ids])
            cursor.execute(f"""
                SELECT fd.CodMaterial, SUM(fd.Cantidad) as total_facturado, MAX(fd.PrecioUnitario) as p_unitario, MAX(fc.CodMoneda) as cod_moneda,
                       SUM(fd.Cantidad * fd.PrecioUnitario) as total_monto
                FROM CntFacturaDet fd
                INNER JOIN CntFacturaCab fc ON fd.FacturaCabId = fc.Id
                WHERE fd.FacturaCabId IN ({placeholders})
                GROUP BY fd.CodMaterial
            """, tuple(factura_ids))
            for row in cursor.fetchall():
                if row.CodMaterial:
                    facturado_by_mat[row.CodMaterial.strip()] = {
                        "cant": float(row.total_facturado) if row.total_facturado else 0,
                        "preuni": float(row.p_unitario) if row.p_unitario else 0,
                        "cod_moneda": str(row.cod_moneda).strip() if row.cod_moneda else "",
                        "monto": float(row.total_monto) if row.total_monto else 0
                    }

        # 5. Build response
        trazabilidad_items = []
        global_warnings = set()

        for it in oc_items:
            cod = it["codmat"]
            cant_oc = it["candes"]
            oc_preuni = it["preuni"]
            
            a_info = almacen_by_mat.get(cod, {})
            cant_almacen = a_info.get("cant", 0) if isinstance(a_info, dict) else a_info
            
            f_info = facturado_by_mat.get(cod, {})
            cant_facturada = f_info.get("cant", 0)
            
            # Validations
            warnings = []
            oc_m = map_moneda(oc_moneda)
            fac_m = map_moneda(f_info.get("cod_moneda")) if f_info.get("cod_moneda") else oc_m
            alm_m = map_moneda(a_info.get("cod_moneda")) if isinstance(a_info, dict) and a_info.get("cod_moneda") else oc_m

            # Crosscheck MONDEDA
            if (fac_m != oc_m) or (alm_m != oc_m and alm_m != "Desconocida"):
                w = f"Moneda difiere en {cod}: OC({oc_m})"
                if fac_m != oc_m: w += f", Fac({fac_m})"
                if alm_m != oc_m and alm_m != "Desconocida": w += f", Almacén({alm_m})"
                warnings.append(w)
                global_warnings.add(w)

            # Crosscheck PRICE
            fac_p = f_info.get("preuni", 0)
            alm_p = a_info.get("preuni", 0) if isinstance(a_info, dict) else 0

            # Para Servicios (S) o Contabilidad (T), el control es por MONTO, no por cantidad
            is_service = tipo_oc in ['S', 'T']
            monto_oc = cant_oc * oc_preuni
            monto_facturado = f_info.get("monto", 0)
            
            if not is_service:
                if (fac_p > 0 and abs(fac_p - oc_preuni) > 0.05) or (alm_p > 0 and abs(alm_p - oc_preuni) > 0.05):
                    w = f"Precio unitario difiere en {cod}: OC({oc_preuni})"
                    if fac_p > 0 and abs(fac_p - oc_preuni) > 0.05: w += f", Fac({fac_p})"
                    if alm_p > 0 and abs(alm_p - oc_preuni) > 0.05: w += f", Almacén({alm_p})"
                    warnings.append(w)
                    global_warnings.add(w)
            else:
                # Para servicios, alertar si el monto total facturado excede el de la OC
                if monto_facturado > monto_oc and abs(monto_facturado - monto_oc) > 0.05:
                    w = f"El monto facturado de {cod} excede la OC: OC({monto_oc}), Fac({monto_facturado})"
                    warnings.append(w)
                    global_warnings.add(w)

            pct_almacen = (cant_almacen / cant_oc * 100) if cant_oc > 0 else 0
            
            if is_service:
                pct_facturado = (monto_facturado / monto_oc * 100) if monto_oc > 0 else 0
            else:
                pct_facturado = (cant_facturada / cant_oc * 100) if cant_oc > 0 else 0

            trazabilidad_items.append({
                **it,
                "cant_oc": cant_oc,
                "cant_almacen": cant_almacen,
                "cant_facturada": cant_facturada,
                "monto_oc": monto_oc,
                "monto_facturado": monto_facturado,
                "pct_almacen": round(pct_almacen, 1),
                "pct_facturado": round(pct_facturado, 1),
                "estado_almacen": "Completo" if pct_almacen >= 100 else ("Parcial" if pct_almacen > 0 else "Pendiente"),
                "estado_factura": "Completo" if pct_facturado >= 100 else ("Parcial" if pct_facturado > 0 else "Pendiente"),
                "warnings": warnings,
            })

        # Fetch extra details for each invoice to display in the UI
        if factura_ids:
            placeholders = ",".join(["?" for _ in factura_ids])
            cursor.execute(f"""
                SELECT FacturaCabId, RTRIM(CodMaterial) as codmat, RTRIM(Descripcion) as desmat, Cantidad, PrecioUnitario 
                FROM CntFacturaDet 
                WHERE FacturaCabId IN ({placeholders})
            """, tuple(factura_ids))
            fac_dets = {}
            for row in cursor.fetchall():
                fid = row.FacturaCabId
                if fid not in fac_dets: fac_dets[fid] = []
                fac_dets[fid].append({
                    "codmat": row.codmat or "",
                    "desmat": row.desmat or "",
                    "cant": float(row.Cantidad) if row.Cantidad else 0,
                    "preuni": float(row.PrecioUnitario) if row.PrecioUnitario else 0
                })
            for f in facturas:
                f["codmon_desc"] = map_moneda(f.get('CodMoneda'))
                f["detalles"] = fac_dets.get(f['Id'], [])

        return {
            "nrodoc": nrodoc,
            "codcia": codcia,
            "fch_oc": fch_oc,
            "items": trazabilidad_items,
            "facturas": facturas,
            "movimientos_almacen": movimientos_almacen,
            "validaciones": list(global_warnings),
            "resumen": {
                "total_items_oc": len(trazabilidad_items),
                "total_facturas": len(facturas),
                "total_oc": sum(it["candes"] for it in trazabilidad_items),
                "total_almacen": sum(it["cant_almacen"] for it in trazabilidad_items),
                "total_facturado": sum(it["cant_facturada"] for it in trazabilidad_items),
                "monto_oc": sum(it["monto_oc"] for it in trazabilidad_items),
                "monto_facturado": sum(it["monto_facturado"] for it in trazabilidad_items),
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()



# ════════════════════════════════════════════════════════════
#  ARCHIVOS ADJUNTOS
# ════════════════════════════════════════════════════════════

from dotenv import load_dotenv
load_dotenv()

FILE_SERVER = os.getenv("FILE_SERVER", "")
FILE_USER = os.getenv("FILE_USER", "")
FILE_PASSWORD = os.getenv("FILE_PASSWORD", "")

# Si hay servidor de archivos configurado, usarlo; si no, usar ATTACHMENTS_ROOT local
if FILE_SERVER:
    # Convertir ruta Windows SMB a formato Linux: \\server\share -> //server/share
    SMB_PATH = FILE_SERVER.replace("\\", "//")
    UPLOAD_DIR = os.getenv("ATTACHMENTS_ROOT", f"/mnt/smb{SMB_PATH}")
else:
    UPLOAD_DIR = os.getenv("ATTACHMENTS_ROOT", "/app/gestion-ylv")

os.makedirs(UPLOAD_DIR, exist_ok=True)

def mount_file_server():
    """Montar servidor de archivos SMB si está configurado"""
    if not FILE_SERVER:
        return False
    
    try:
        import subprocess
        import tempfile
        
        # Convertir ruta Windows SMB a formato Linux
        smb_path = FILE_SERVER.replace("\\", "//")
        
        # Crear archivo de credenciales temporal
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.credentials') as cred_file:
            cred_file.write(f"username={FILE_USER}\n")
            cred_file.write(f"password={FILE_PASSWORD}\n")
            cred_file.write(f"domain=WORKGROUP\n")
            cred_path = cred_file.name
        
        try:
            # Crear punto de montaje
            mount_point = UPLOAD_DIR
            os.makedirs(mount_point, exist_ok=True)
            
            # Intentar montar
            mount_cmd = [
                'mount',
                '-t', 'cifs',
                smb_path,
                mount_point,
                '-o', f'credentials={cred_path},uid=1000,gid=1000,iocharset=utf8,vers=3.0'
            ]
            
            result = subprocess.run(mount_cmd, capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0:
                print(f"Servidor de archivos montado exitosamente en {mount_point}")
                return True
            else:
                print(f"Error al montar servidor de archivos: {result.stderr}")
                return False
        finally:
            # Limpiar archivo de credenciales temporal
            try:
                os.unlink(cred_path)
            except:
                pass
    except Exception as e:
        print(f"Error al montar servidor de archivos: {e}")
        return False

# Intentar montar servidor de archivos al iniciar
mount_file_server()

@router.post("/facturas/{factura_id}/archivos")
async def upload_archivo(factura_id: int, archivo: UploadFile = File(...), tipo_doc: str = Form("PDF"), created_by: str = Form("")):
    """Subir archivo adjunto a una factura"""
    print(f"DEBUG: upload_archivo - factura_id: {factura_id}, archivo: {archivo.filename}, tipo_doc: {tipo_doc}, UPLOAD_DIR: {UPLOAD_DIR}")
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        # Verify factura exists
        cursor.execute("SELECT Id FROM CntFacturaCab WHERE Id=?", (factura_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Factura no encontrada")

        # Save file to disk
        factura_dir = os.path.join(UPLOAD_DIR, str(factura_id))
        print(f"DEBUG: factura_dir: {factura_dir}")
        os.makedirs(factura_dir, exist_ok=True)
        safe_name = archivo.filename.replace(" ", "_")
        file_path = os.path.join(factura_dir, safe_name)
        print(f"DEBUG: file_path: {file_path}")

        with open(file_path, "wb") as f:
            content = await archivo.read()
            f.write(content)
        print(f"DEBUG: archivo guardado exitosamente, tamaño: {len(content)} bytes")

        # Save DB record
        cursor.execute("""
            INSERT INTO CntFacturaArchivos (FacturaCabId, NombreArchivo, RutaArchivo, TipoDocumento, TamanioBytes, CreatedBy)
            VALUES (?,?,?,?,?,?)
        """, (factura_id, safe_name, file_path, tipo_doc, len(content), created_by))
        conn.commit()

        return {"status": "success", "filename": safe_name, "size": len(content)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/facturas/{factura_id}/archivos")
def list_archivos(factura_id: int):
    """Listar archivos adjuntos de una factura"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT Id, NombreArchivo, TipoDocumento, TamanioBytes, CreatedAt
            FROM CntFacturaArchivos WHERE FacturaCabId=? ORDER BY CreatedAt DESC
        """, (factura_id,))
        cols = [c[0] for c in cursor.description]
        rows = []
        for r in cursor.fetchall():
            d = dict(zip(cols, r))
            if d.get('CreatedAt'):
                d['CreatedAt'] = d['CreatedAt'].strftime("%Y-%m-%d %H:%M")
            rows.append(d)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/archivos/{archivo_id}/descargar")
def descargar_archivo(archivo_id: int):
    """Descargar archivo adjunto"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT NombreArchivo, RutaArchivo FROM CntFacturaArchivos WHERE Id=?", (archivo_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        nombre, ruta = row
        if not os.path.exists(ruta):
            raise HTTPException(status_code=404, detail="El archivo no existe en el servidor")
            
        return FileResponse(path=ruta, filename=nombre, content_disposition_type="inline")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/facturas/{factura_id}/items/archivos/upload")
async def upload_item_archivo(
    factura_id: int,
    item_index: int = Form(...),
    obs_field: str = Form(...),
    archivo: UploadFile = File(...),
    created_by: str = Form("")
):
    """Subir archivo adjunto a un item de factura"""
    print(f"DEBUG: upload_item_archivo - factura_id: {factura_id}, item_index: {item_index}, obs_field: {obs_field}, archivo: {archivo.filename}")
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        
        # Verify factura exists
        cursor.execute("SELECT Id FROM CntFacturaCab WHERE Id=?", (int(factura_id),))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Factura no encontrada")
        
        # Save file to disk in ATTACHMENTS_ROOT
        item_dir = os.path.join(UPLOAD_DIR, "facturas", str(factura_id), "items", f"item_{item_index}", obs_field)
        print(f"DEBUG: item_dir: {item_dir}")
        os.makedirs(item_dir, exist_ok=True)
        safe_name = archivo.filename.replace(" ", "_")
        file_path = os.path.join(item_dir, safe_name)
        print(f"DEBUG: file_path: {file_path}")

        with open(file_path, "wb") as f:
            content = await archivo.read()
            f.write(content)
        print(f"DEBUG: archivo de item guardado, tamaño: {len(content)} bytes")
        
        # Save DB record - Convertir item_index (0-based) a NroItem (1-based)
        nro_item = item_index + 1
        cursor.execute("""
            INSERT INTO CntFacturaDetArchivos (FacturaCabId, ItemIndex, ObsField, NombreArchivo, RutaArchivo, TamanioBytes, CreatedBy)
            VALUES (?,?,?,?,?,?,?)
        """, (int(factura_id), nro_item, obs_field, safe_name, file_path, len(content), created_by))
        conn.commit()
        print(f"DEBUG: registro de archivo de item guardado en base de datos")

        return {"message": "Archivo de item subido exitosamente", "filename": safe_name, "path": file_path, "size": len(content)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Error en upload_item_archivo: {e}")
        raise HTTPException(status_code=500, detail=f"Error al subir archivo de item: {str(e)}")
    finally:
        conn.close()


@router.get("/facturas/{factura_id}/items/archivos")
def list_item_archivos(factura_id: int):
    """Listar archivos adjuntos de items de una factura"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT Id, ItemIndex, ObsField, NombreArchivo, RutaArchivo, TamanioBytes, CreatedAt
            FROM CntFacturaDetArchivos WHERE FacturaCabId=? ORDER BY ItemIndex, ObsField, CreatedAt DESC
        """, (factura_id,))
        cols = [c[0] for c in cursor.description]
        rows = []
        for r in cursor.fetchall():
            d = dict(zip(cols, r))
            if d.get('CreatedAt'):
                d['CreatedAt'] = d['CreatedAt'].strftime("%Y-%m-%d %H:%M")
            rows.append(d)
        return rows
    except Exception as e:
        print(f"DEBUG: Error en list_item_archivos: {e}")
        # Si la tabla no existe aún, retornar array vacío
        return []
    finally:
        conn.close()

@router.delete("/facturas/items/archivos/{archivo_id}")
def delete_item_archivo(archivo_id: int):
    """Eliminar archivo adjunto de item"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        
        # Obtener información del archivo
        cursor.execute("SELECT RutaArchivo FROM CntFacturaDetArchivos WHERE Id=?", (archivo_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        ruta_archivo = row[0]
        
        # Eliminar archivo del disco
        if ruta_archivo and os.path.exists(ruta_archivo):
            try:
                os.remove(ruta_archivo)
            except Exception as e:
                print(f"DEBUG: Error al eliminar archivo del disco: {e}")
        
        # Eliminar registro de la base de datos
        cursor.execute("DELETE FROM CntFacturaDetArchivos WHERE Id=?", (archivo_id,))
        conn.commit()
        
        return {"message": "Archivo eliminado exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Error en delete_item_archivo: {e}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar archivo: {str(e)}")
    finally:
        conn.close()

@router.get("/facturas/items/archivos/{archivo_id}/descargar")
def descargar_item_archivo(archivo_id: int):
    """Descargar archivo adjunto de item"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT NombreArchivo, RutaArchivo FROM CntFacturaDetArchivos WHERE Id=?", (archivo_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        nombre, ruta = row
        if not os.path.exists(ruta):
            raise HTTPException(status_code=404, detail="El archivo no existe en el servidor")
            
        return FileResponse(path=ruta, filename=nombre, content_disposition_type="inline")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/facturas/{factura_id}/items/{item_index}/archivos")
def list_item_archivos_by_index(factura_id: int, item_index: int):
    """Listar archivos adjuntos de un item específico de una factura"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT Id, ItemIndex, ObsField, NombreArchivo, RutaArchivo, TamanioBytes, CreatedAt
            FROM CntFacturaDetArchivos WHERE FacturaCabId=? AND ItemIndex=? ORDER BY ObsField, CreatedAt DESC
        """, (factura_id, item_index))
        cols = [c[0] for c in cursor.description]
        rows = []
        for r in cursor.fetchall():
            d = dict(zip(cols, r))
            if d.get('CreatedAt'):
                d['CreatedAt'] = d['CreatedAt'].strftime("%Y-%m-%d %H:%M")
            rows.append(d)
        return rows
    except Exception as e:
        print(f"DEBUG: Error en list_item_archivos_by_index: {e}")
        # Si la tabla no existe aún, retornar array vacío
        return []
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  ACTUALIZAR OBSERVACIONES
# ════════════════════════════════════════════════════════════

@router.put("/facturas/{factura_id}/observaciones")
def update_factura_observaciones(factura_id: int, body: dict):
    """Actualiza las observaciones de una factura existente"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE CntFacturaCab SET Observaciones=?, UpdatedAt=GETDATE() WHERE Id=?",
            (body.get("observaciones", ""), factura_id)
        )
        conn.commit()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  VISTA PÚBLICA VIA UUID
# ════════════════════════════════════════════════════════════

@router.get("/facturas/public/{factura_uuid}")
def get_factura_publica(factura_uuid: str):
    """Vista pública de factura por UUID - no requiere autenticación"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM CntFacturaCab WHERE Uuid=?
        """, (factura_uuid,))
        cols = [c[0] for c in cursor.description]
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Factura no encontrada")

        cab = dict(zip(cols, row))
        for k in ['FecEmision', 'FecVencimiento', 'FecRegistro']:
            if cab.get(k):
                cab[k] = cab[k].strftime("%Y-%m-%d")
        if cab.get('CreatedAt'):
            cab['CreatedAt'] = cab['CreatedAt'].strftime("%Y-%m-%d %H:%M")
        for k in ['Total', 'SubTotal', 'IGV', 'ICBPER', 'DescuentoGlobal']:
            if cab.get(k) is not None:
                cab[k] = float(cab[k])
        if cab.get('CreditoNumCuotas') is not None:
            cab['CreditoNumCuotas'] = int(cab['CreditoNumCuotas'])

        factura_id = cab['Id']

        # Detalle - consulta dinámica para evitar error por columnas faltantes
        cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CntFacturaDet'")
        actual_det_cols = [row[0] for row in cursor.fetchall()]
        
        needed_det = [
            'NroItem', 'CodMaterial', 'Descripcion', 'UnidadMedida',
            'Cantidad', 'PrecioUnitario', 'Descuento', 'SubTotal', 'IGV', 'ICBPER', 'Total',
            'CantidadOC', 'CantidadAlmacen',
            'Inci', 'Fabricante', 'Obs1', 'Obs2', 'Obs3', 'Obs4', 'FechaVencimientoItem', 'ExtraDataJson'
        ]
        select_det = [c for c in needed_det if c in actual_det_cols]
        missing_det = [c for c in needed_det if c not in actual_det_cols]

        cursor.execute(f"SELECT {', '.join(select_det)} FROM CntFacturaDet WHERE FacturaCabId=? ORDER BY NroItem", (factura_id,))
        det_cols = [c[0] for c in cursor.description]
        items = []
        for r in cursor.fetchall():
            d = dict(zip(det_cols, r))
            for col in missing_det:
                d[col] = None
            for k in ['Cantidad','PrecioUnitario','Descuento','SubTotal','IGV','ICBPER','Total','CantidadOC','CantidadAlmacen']:
                if d.get(k) is not None:
                    d[k] = float(d[k])
            if d.get('FechaVencimientoItem'):
                d['FechaVencimientoItem'] = d['FechaVencimientoItem'].strftime("%Y-%m-%d")
            if d.get('ExtraDataJson'):
                try:
                    d['extraData'] = json.loads(d['ExtraDataJson'])
                except:
                    d['extraData'] = None
            else:
                d['extraData'] = None
            items.append(d)

        # Archivos
        archivos = []
        try:
            cursor.execute("SELECT Id, NombreArchivo, TipoDocumento, TamanioBytes FROM CntFacturaArchivos WHERE FacturaCabId=?", (factura_id,))
            arc_cols = [c[0] for c in cursor.description]
            archivos = [dict(zip(arc_cols, r)) for r in cursor.fetchall()]
        except Exception:
            pass

        # Get archivos de items
        item_archivos = []
        try:
            cursor.execute("""
                SELECT Id, ItemIndex, ObsField, NombreArchivo, RutaArchivo, TamanioBytes, CreatedAt
                FROM CntFacturaDetArchivos WHERE FacturaCabId=? ORDER BY ItemIndex, ObsField, CreatedAt DESC
            """, (factura_id,))
            ia_cols = [c[0] for c in cursor.description]
            for r in cursor.fetchall():
                d = dict(zip(ia_cols, r))
                if d.get('CreatedAt'):
                    d['CreatedAt'] = d['CreatedAt'].strftime("%Y-%m-%d %H:%M")
                item_archivos.append(d)
        except Exception as e:
            print(f"DEBUG: Error al obtener archivos de items: {e}")
            pass

        # Agrupar archivos de items por item_index (convertir de 1-based a 0-based)
        item_archivos_dict = {}
        for ia in item_archivos:
            # ItemIndex en DB es 1-based, convertir a 0-based para consistencia con frontend
            idx = ia['ItemIndex'] - 1 if ia['ItemIndex'] is not None else None
            if idx is not None and idx not in item_archivos_dict:
                item_archivos_dict[idx] = []
            if idx is not None:
                item_archivos_dict[idx].append(ia)

        # Agregar archivos a cada item usando item_index (0-based)
        for item in items:
            nro_item = item.get('NroItem')
            # Convertir NroItem (1-based) a item_index (0-based)
            item_index = nro_item - 1 if nro_item is not None else None
            if item_index is not None and item_index in item_archivos_dict:
                item['archivos'] = item_archivos_dict[item_index]
            else:
                item['archivos'] = []

        cab['items'] = items
        cab['archivos'] = archivos
        return cab

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/facturas-sin-oc")
def get_facturas_sin_oc(
    codcia: str = Query(...),
    login: Optional[str] = Query(None),
    draw: int = Query(1),
    start: int = Query(0),
    length: int = Query(10),
    search_value: Optional[str] = Query(None, alias="search[value]"),
    ano: Optional[str] = Query("0"),
    mes: Optional[str] = Query("0")
):
    """Listar facturas sin orden de compra vinculada para enviar a Tesorería - EXCLUYE facturas ya en cargos"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()

        # Consulta base para facturas sin OC con ROW_NUMBER para paginación compatible
        # EXCLUYE facturas que ya están en CntCargosDetalle (NroFactura = Serie-Numero)
        base_query = """
            SELECT f.Id, RTRIM(f.CodCia) as CodCia,
                   RTRIM(f.CodTipoDoc) as CodTipoDoc, RTRIM(f.Serie) as Serie, RTRIM(f.Numero) as Numero,
                   f.FecEmision, f.FecVencimiento,
                   RTRIM(f.NomProveedor) as NomProveedor, RTRIM(f.NumRucProveedor) as NumRucProveedor,
                   RTRIM(f.CodMoneda) as CodMoneda, f.Total,
                   f.Estado, f.Uuid, f.CreatedAt, RTRIM(f.NroOrdenCompra) as NroOrdenCompra,
                   ISNULL(RTRIM(tbl.Nombre), RTRIM(f.CodTipoDoc)) as TipoCompDesc
            FROM CntFacturaCab f
            LEFT JOIN AlmTabla tbl ON tbl.CodCia = f.CodCia AND tbl.Tabla = '0006' AND tbl.Codigo = f.CodTipoDoc
            WHERE RTRIM(f.CodCia) = ?
              AND (
                  (f.NroOrdenCompra IS NULL OR RTRIM(f.NroOrdenCompra) = '' OR RTRIM(f.NroOrdenCompra) = '-')
                  OR
                  (
                      f.NroOrdenCompra IS NOT NULL AND RTRIM(f.NroOrdenCompra) != '' AND RTRIM(f.NroOrdenCompra) != '-'
                      AND EXISTS (
                          SELECT 1 FROM CntCargosDetalle d2 
                          INNER JOIN CntCargosDocumentales c2 ON d2.CargoId = c2.Id
                          WHERE RTRIM(d2.NroOrdenCompra) = RTRIM(f.NroOrdenCompra)
                            AND RTRIM(d2.CodCiaOc) = RTRIM(f.CodCia)
                            AND (d2.NroFactura IS NULL OR RTRIM(d2.NroFactura) = '' OR RTRIM(d2.NroFactura) = '-')
                            AND c2.TipoCargo = 'LOG_A_CONT'
                            AND c2.Estado != 'ANULADO'
                      )
                  )
              )
              AND f.Estado != 'Anulada'
              AND NOT EXISTS (
                  SELECT 1 FROM CntCargosDetalle d
                  WHERE RTRIM(d.NroFactura) = RTRIM(f.Serie) + '-' + RTRIM(f.Numero)
                    AND RTRIM(d.CodCiaOc) = RTRIM(f.CodCia)
                    AND RTRIM(d.RucProveedor) = RTRIM(f.NumRucProveedor)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM FinRendicionGastosDet rd
                  INNER JOIN FinRendicionGastosCab rc ON rd.RendicionId = rc.Id
                  WHERE rd.DocReferenciaId = f.Id
                    AND rc.FechaAprobacion IS NOT NULL
              )
        """
        params = [codcia.strip()]

        if ano and ano != "0":
            base_query += " AND YEAR(f.FecEmision) = ?"
            params.append(ano)
        if mes and str(mes) != "0" and str(mes) != "":
            base_query += " AND MONTH(f.FecEmision) = ?"
            params.append(int(mes))

        # Filtro por búsqueda
        if search_value:
            base_query += " AND (f.Serie LIKE ? OR f.Numero LIKE ? OR f.NomProveedor LIKE ?)"
            search_pattern = f"%{search_value}%"
            params.extend([search_pattern, search_pattern, search_pattern])

        # Total records
        cursor.execute(f"SELECT COUNT(*) FROM ({base_query}) as subq", tuple(params))
        total_records = cursor.fetchone()[0]

        # Paginación con ROW_NUMBER (compatible con SQL Server 2008+)
        paginated_query = f"""
            SELECT * FROM (
                SELECT *, ROW_NUMBER() OVER (ORDER BY FecEmision DESC) as rn
                FROM ({base_query}) as filtered
            ) as numbered
            WHERE rn > ? AND rn <= ?
        """
        params.extend([start, start + length])

        cursor.execute(paginated_query, tuple(params))
        cols = [c[0] for c in cursor.description]
        data = []
        for r in cursor.fetchall():
            d = dict(zip(cols, r))
            if d.get('FecEmision'):
                d['FecEmision'] = d['FecEmision'].strftime("%Y-%m-%d")
            if d.get('FecVencimiento'):
                d['FecVencimiento'] = d['FecVencimiento'].strftime("%Y-%m-%d")
            if d.get('CreatedAt'):
                d['CreatedAt'] = d['CreatedAt'].strftime("%Y-%m-%d %H:%M")
            if d.get('Total') is not None:
                d['Total'] = float(d['Total'])
            # Eliminar la columna rn del resultado
            if 'rn' in d:
                del d['rn']
            data.append(d)

        return {
            "draw": draw,
            "recordsTotal": total_records,
            "recordsFiltered": total_records,
            "data": data
        }
    except Exception as e:
        print(f"Error en facturas-sin-oc: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  TIPOS DE COMPROBANTE DESDE AlmTabla (tabla=0006)
# ════════════════════════════════════════════════════════════
@router.get("/tipos-comprobante")
def get_tipos_comprobante(codcia: str = Query(...)):
    """Obtiene los tipos de comprobante desde AlmTabla WHERE tabla='0006'"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT RTRIM(codigo) as codigo, RTRIM(nombre) as nombre
            FROM AlmTabla
            WHERE RTRIM(codcia) = ? AND tabla = '0006'
            ORDER BY codigo
        """, (codcia.strip(),))
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, r)) for r in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
