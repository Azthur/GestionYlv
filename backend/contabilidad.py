"""
Módulo Contable - Backend API
Endpoints para: Tokens, Sincronización de Compras, Registro de Facturas, Trazabilidad
"""
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date
import requests
import json
import uuid
import os
import shutil

from database import get_db_connection

router = APIRouter(prefix="/api/contabilidad", tags=["Contabilidad"])


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
    cod_moneda: Optional[str] = "PEN"
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
            SELECT Id, RTRIM(CodCia) as CodCia, NumRuc, NomRazonSocial,
                   CodTipoCDP, DesTipoCDP, NumSerieCDP, NumCDP,
                   FecEmision, FecVencPag,
                   NumDocIdProveedor, NomRazonSocialProveedor,
                   CodMoneda, CodEstadoComprobante, DesEstadoComprobante,
                   PerTributario, PorTasaIGV,
                   MtoBIGravadaDG, MtoIgvIpmDG, MtoValorAdqNG,
                   MtoTotalCp, MtoTipoCambio,
                   IdApiOrg, SyncedAt
            FROM CntCompras
            WHERE RTRIM(CodCia) = ?
        """
        params = [codcia.strip()]

        if periodo:
            query += " AND PerTributario = ?"
            params.append(periodo)
        if proveedor:
            query += " AND (NumDocIdProveedor LIKE ? OR NomRazonSocialProveedor LIKE ?)"
            params.extend([f"%{proveedor}%", f"%{proveedor}%"])

        query += " ORDER BY FecEmision DESC, NumSerieCDP, NumCDP"

        cursor.execute(query, tuple(params))
        cols = [c[0] for c in cursor.description]
        rows = []
        for r in cursor.fetchall():
            d = dict(zip(cols, r))
            if d.get('FecEmision'):
                d['FecEmision'] = d['FecEmision'].strftime("%Y-%m-%d")
            if d.get('FecVencPag'):
                d['FecVencPag'] = d['FecVencPag'].strftime("%Y-%m-%d")
            if d.get('SyncedAt'):
                d['SyncedAt'] = d['SyncedAt'].strftime("%Y-%m-%d %H:%M")
            for k in ['MtoBIGravadaDG','MtoIgvIpmDG','MtoValorAdqNG','MtoTotalCp','MtoTipoCambio','PorTasaIGV']:
                if d.get(k) is not None:
                    d[k] = float(d[k])
            rows.append(d)

        # Count total
        count_query = "SELECT COUNT(*) FROM CntCompras WHERE RTRIM(CodCia) = ?"
        count_params = [codcia.strip()]
        if periodo:
            count_query += " AND PerTributario = ?"
            count_params.append(periodo)
        if proveedor:
            count_query += " AND (NumDocIdProveedor LIKE ? OR NomRazonSocialProveedor LIKE ?)"
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
            except Exception:
                pass
        _new_det_cols = {
            'CodProveedor': 'varchar(50)', 'DesUnidadMedida': 'varchar(100)',
            'MtoICBPERItem': 'decimal(18,2)', 'MtoDescuento': 'decimal(18,2)'
        }
        for col, dtype in _new_det_cols.items():
            try:
                cursor.execute(f"IF COL_LENGTH('CntFacturaDet','{col}') IS NULL ALTER TABLE CntFacturaDet ADD [{col}] {dtype}")
            except Exception:
                pass
        conn.commit()


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
                data.fec_emision, data.fec_vencimiento, data.cod_moneda, data.tipo_cambio,
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
                data.doc_modifica_serie, data.doc_modifica_numero, data.doc_modifica_tipo, data.doc_modifica_fecha,
                data.credito_mto_pendiente, data.credito_fec_plazo, data.credito_num_cuotas, data.credito_cuotas_json,
                data.docs_relacionados_json, data.xml_data_json,
                data.id
            ))
            factura_id = data.id
            cursor.execute("DELETE FROM CntFacturaDet WHERE FacturaCabId=?", (factura_id,))
        else:
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
                VALUES (?,?,?,?,?,?,?,?,GETDATE(),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
                        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                data.codcia.strip(), data.num_ruc_proveedor, data.nom_proveedor, data.cod_tipo_doc, data.serie, data.numero,
                data.fec_emision, data.fec_vencimiento, data.cod_moneda, data.tipo_cambio,
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
                data.doc_modifica_serie, data.doc_modifica_numero, data.doc_modifica_tipo, data.doc_modifica_fecha,
                data.credito_mto_pendiente, data.credito_fec_plazo, data.credito_num_cuotas, data.credito_cuotas_json,
                data.docs_relacionados_json, data.xml_data_json
            ))
            factura_id = int(cursor.fetchone()[0])


        # Insert details
        for item in data.items:
            cursor.execute("""
                INSERT INTO CntFacturaDet (
                    FacturaCabId, NroItem, CodMaterial, CodProveedor, Descripcion,
                    UnidadMedida, DesUnidadMedida, Cantidad, PrecioUnitario, Descuento,
                    SubTotal, IGV, ICBPER, MtoICBPERItem, MtoDescuento, Total,
                    CantidadOC, CantidadAlmacen
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
                item.icbper,
                item.mto_icbper_item,
                item.mto_descuento,
                item.total,
                item.cantidad_oc,
                item.cantidad_almacen
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
                   Estado, ModoRegistro, CreatedAt, CreatedBy
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
        cursor.execute("""
            SELECT * FROM CntFacturaCab WHERE Id = ?
        """, (factura_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Factura no encontrada")

        cols = [c[0] for c in cursor.description]
        cab = dict(zip(cols, row))
        # Format dates
        for k in ['FecEmision','FecVencimiento','FecRegistro']:
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

        # Get details
        cursor.execute("""
            SELECT Id, NroItem, CodMaterial, Descripcion, UnidadMedida,
                   Cantidad, PrecioUnitario, Descuento, SubTotal, IGV, ICBPER, Total,
                   CantidadOC, CantidadAlmacen
            FROM CntFacturaDet WHERE FacturaCabId = ? ORDER BY NroItem
        """, (factura_id,))
        det_cols = [c[0] for c in cursor.description]
        items = []
        for r in cursor.fetchall():
            d = dict(zip(det_cols, r))
            for k in ['Cantidad','PrecioUnitario','Descuento','SubTotal','IGV','ICBPER','Total','CantidadOC','CantidadAlmacen']:
                if d.get(k) is not None:
                    d[k] = float(d[k])
            items.append(d)

        return {"cabecera": cab, "items": items}

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
        
        target_dir = os.path.join(UPLOAD_DIR, str(factura_id))
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir, ignore_errors=True)
            
        cursor.execute("SET ARITHABORT ON")
        cursor.execute("DELETE FROM CntFacturaArchivos WHERE FacturaCabId=?", (factura_id,))
        cursor.execute("DELETE FROM CntFacturaDet WHERE FacturaCabId=?", (factura_id,))
        cursor.execute("DELETE FROM CntFacturaCab WHERE Id=?", (factura_id,))
        conn.commit()
        return {"status": "success", "message": "Factura eliminada permanentemente"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════
#  TRAZABILIDAD OC → ALMACEN → FACTURA
# ════════════════════════════════════════════════════════════

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

        # 2. Detalles de ingresos a almacén (documentos específicos)
        movimientos_almacen = []
        cursor.execute("""
            SELECT 
                RTRIM(almcen) as almcen, RTRIM(tipmov) as tipmov, 
                RTRIM(codmov) as codmov, RTRIM(nrodoc) as nrodoc,
                fchdoc, RTRIM(codmat) as codmat, candes
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
            movimientos_almacen.append(d)
            
            # Map for item aggregation
            m = d['codmat'].strip()
            almacen_by_mat[m] = almacen_by_mat.get(m, 0) + d['candes']

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

        # 4. Detalle facturado por material
        facturado_by_mat = {}
        factura_ids = [f['Id'] for f in facturas]
        if factura_ids:
            placeholders = ",".join(["?" for _ in factura_ids])
            cursor.execute(f"""
                SELECT CodMaterial, SUM(Cantidad) as total_facturado
                FROM CntFacturaDet
                WHERE FacturaCabId IN ({placeholders})
                GROUP BY CodMaterial
            """, tuple(factura_ids))
            for row in cursor.fetchall():
                if row.CodMaterial:
                    facturado_by_mat[row.CodMaterial.strip()] = float(row.total_facturado) if row.total_facturado else 0

        # 5. Build response
        trazabilidad_items = []
        for it in oc_items:
            cod = it["codmat"]
            cant_oc = it["candes"]
            cant_almacen = almacen_by_mat.get(cod, 0)
            cant_facturada = facturado_by_mat.get(cod, 0)

            pct_almacen = (cant_almacen / cant_oc * 100) if cant_oc > 0 else 0
            pct_facturado = (cant_facturada / cant_oc * 100) if cant_oc > 0 else 0

            trazabilidad_items.append({
                **it,
                "cant_oc": cant_oc,
                "cant_almacen": cant_almacen,
                "cant_facturada": cant_facturada,
                "pct_almacen": round(pct_almacen, 1),
                "pct_facturado": round(pct_facturado, 1),
                "estado_almacen": "Completo" if pct_almacen >= 100 else ("Parcial" if pct_almacen > 0 else "Pendiente"),
                "estado_factura": "Completo" if pct_facturado >= 100 else ("Parcial" if pct_facturado > 0 else "Pendiente"),
            })

        return {
            "nrodoc": nrodoc,
            "codcia": codcia,
            "items": trazabilidad_items,
            "facturas": facturas,
            "movimientos_almacen": movimientos_almacen,
            "resumen": {
                "total_items_oc": len(trazabilidad_items),
                "total_facturas": len(facturas),
                "total_oc": sum(it["candes"] for it in trazabilidad_items),
                "total_almacen": sum(it["cant_almacen"] for it in trazabilidad_items),
                "total_facturado": sum(it["cant_facturada"] for it in trazabilidad_items),
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

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads", "facturas")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/facturas/{factura_id}/archivos")
async def upload_archivo(factura_id: int, archivo: UploadFile = File(...), tipo_doc: str = Form("PDF"), created_by: str = Form("")):
    """Subir archivo adjunto a una factura"""
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
        os.makedirs(factura_dir, exist_ok=True)
        safe_name = archivo.filename.replace(" ", "_")
        file_path = os.path.join(factura_dir, safe_name)

        with open(file_path, "wb") as f:
            content = await archivo.read()
            f.write(content)

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
        for k in ['SubTotal','IGV','OtrosTributos','Total','TipoCambio']:
            if cab.get(k) is not None:
                cab[k] = float(cab[k])

        factura_id = cab['Id']

        # Detalle
        cursor.execute("""
            SELECT NroItem, CodMaterial, Descripcion, UnidadMedida,
                   Cantidad, PrecioUnitario, Descuento, SubTotal, IGV, ICBPER, Total,
                   CantidadOC, CantidadAlmacen
            FROM CntFacturaDet WHERE FacturaCabId=? ORDER BY NroItem
        """, (factura_id,))
        det_cols = [c[0] for c in cursor.description]
        items = []
        for r in cursor.fetchall():
            d = dict(zip(det_cols, r))
            for k in ['Cantidad','PrecioUnitario','Descuento','SubTotal','IGV','ICBPER','Total','CantidadOC','CantidadAlmacen']:
                if d.get(k) is not None:
                    d[k] = float(d[k])
            items.append(d)

        # Archivos
        archivos = []
        try:
            cursor.execute("SELECT Id, NombreArchivo, TipoDocumento, TamanioBytes FROM CntFacturaArchivos WHERE FacturaCabId=?", (factura_id,))
            arc_cols = [c[0] for c in cursor.description]
            archivos = [dict(zip(arc_cols, r)) for r in cursor.fetchall()]
        except Exception:
            pass

        cab['items'] = items
        cab['archivos'] = archivos
        return cab

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
