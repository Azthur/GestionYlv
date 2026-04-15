from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile, Form
from fastapi.responses import FileResponse
import os
import shutil
import mimetypes
from typing import List, Optional
from database import get_db_connection
from auth import get_current_user

ATTACHMENTS_ROOT = os.getenv("ATTACHMENTS_ROOT", r"\\192.168.1.200\gestion-ylv")

router = APIRouter(prefix="/api/logistics", tags=["Logística y Compras"])

import time

import json

# Global cache for companies: (expiry_timestamp, data)
_COMPANIES_CACHE = (0, [])

@router.get("/companies")
def get_companies():
    """Obtener lista de empresas con caché en memoria (TTL: 60s)"""
    global _COMPANIES_CACHE
    now = time.time()
    
    # Return from cache if valid
    if now < _COMPANIES_CACHE[0] and _COMPANIES_CACHE[1]:
        return _COMPANIES_CACHE[1]
        
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT RTRIM(codcia) as codcia, RTRIM(nomcia) as nomcia FROM AdmMcias ORDER BY codcia")
        
        companies = []
        for row in cursor.fetchall():
            companies.append({"codcia": row.codcia, "nomcia": row.nomcia})
        
        # Save to cache with 60s Time-To-Live
        _COMPANIES_CACHE = (now + 60, companies)
        
        return companies
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/orders")
def get_purchase_orders(
    codcia: str = Query(..., description="Código de la empresa (Ej. 01)"),
    year: Optional[str] = Query(None, description="Año (Anos)"),
    period: Optional[int] = Query(None, description="Mes / Periodo (1-12)"),
    tipo_oc: Optional[str] = Query(None, description="Tipo de OC (TipoOc)"),
    proveedor: Optional[str] = Query(None, description="RUC o Nombre de proveedor")
):
    """Obtener cabeceras de Órdenes de Compra (CmpVOcom)"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        
        query = """
            SELECT 
                RTRIM(CodCia) as codcia, 
                RTRIM(Anos) as anos, 
                RTRIM(NroDoc) as nrodoc, 
                RTRIM(TipoOc) as tipooc, 
                Fchdoc as fchdoc,
                RTRIM(RucAux) as ruc,
                RTRIM(NomAux) as proveedor,
                CodMon as moneda,
                ImpTot as total,
                RTRIM(FlgEst) as estado,
                RTRIM(LugEnt) as lugent,
                RTRIM(Entrega) as entrega,
                RTRIM(Contacto) as contacto,
                RTRIM(TlfAux) as tlfaux,
                RTRIM(NomDep) as nomdep,
                RTRIM(NomCom) as nomcom,
                RTRIM(Usuario) as usuario,
                CASE WHEN EXISTS (SELECT 1 FROM LogSolicitudesRecojo sr WHERE sr.nro_oc = o.NroDoc AND sr.codcia = o.codcia AND sr.estado != 'Completada' AND sr.estado != 'Cancelada') THEN 1 ELSE 0 END as has_recojo
            FROM CmpVOcom o 
            WHERE RTRIM(CodCia) = ?
        """
        params = [codcia]
        
        if year:
            query += " AND RTRIM(Anos) = ?"
            params.append(year)
            
        if period:
            query += " AND MONTH(Fchdoc) = ?"
            params.append(period)
            
        if tipo_oc:
            query += " AND RTRIM(TipoOc) = ?"
            params.append(tipo_oc)
            
        if proveedor:
            query += " AND (RTRIM(RucAux) LIKE ? OR RTRIM(NomAux) LIKE ?)"
            params.append(f"%{proveedor}%")
            params.append(f"%{proveedor}%")
            
        query += " ORDER BY Fchdoc DESC, NroDoc DESC"
        
        cursor.execute(query, tuple(params))
        
        orders = []
        columns = [column[0] for column in cursor.description]
        for row in cursor.fetchall():
            order_dict = dict(zip(columns, row))
            # Format date strings for JSON
            if order_dict['fchdoc']:
                order_dict['fchdoc'] = order_dict['fchdoc'].strftime("%Y-%m-%d")
                
            # Check attachments presence
            c = str(order_dict['codcia']).strip()
            t = str(order_dict['tipooc']).strip() if order_dict['tipooc'] else ''
            n = str(order_dict['nrodoc']).strip()
            
            sig_dir = os.path.join(ATTACHMENTS_ROOT, c, t, n, 'signed_order')
            vou_dir = os.path.join(ATTACHMENTS_ROOT, c, t, n, 'voucher')
            
            order_dict['has_signed_order'] = os.path.exists(sig_dir) and len(os.listdir(sig_dir)) > 0
            order_dict['has_voucher'] = os.path.exists(vou_dir) and len(os.listdir(vou_dir)) > 0
            
            # Recojo Check
            order_dict['has_recojo'] = bool(order_dict.get('has_recojo', 0))
            
            orders.append(order_dict)
            
        return orders
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/orders/{nrodoc}/details")
def get_purchase_order_details(
    nrodoc: str,
    codcia: str = Query(..., description="Código de la empresa"),
    tipo_oc: str = Query(..., description="Tipo de OC"),
    year: str = Query(..., description="Año de la orden")
):
    """Obtener detalles de una Orden de Compra (CmpROcom)"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        
        query = """
            SELECT 
                RTRIM(NroItm) as item,
                RTRIM(CodMat) as codigo_material,
                RTRIM(DesMat) as descripcion,
                RTRIM(UndStk) as unidad,
                CanDes as cantidad,
                PreUni as precio_unitario,
                ImpTot as total
            FROM CmpROcom 
            WHERE RTRIM(CodCia) = ? AND RTRIM(NroDoc) = ? AND RTRIM(TipoOc) = ? AND RTRIM(Anos) = ?
            ORDER BY NroItm ASC
        """
        params = (codcia, nrodoc, tipo_oc, year)
        
        cursor.execute(query, params)
        
        details = []
        columns = [column[0] for column in cursor.description]
        for row in cursor.fetchall():
            details.append(dict(zip(columns, row)))
            
        return details
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/orders/{nrodoc}/report")
def get_purchase_order_report(
    nrodoc: str,
    codcia: str = Query(..., description="Código de la empresa"),
    tipo_oc: str = Query(..., description="Tipo de OC"),
    year: str = Query(None, description="Año de la orden")
):
    """Obtener reporte completo de una Orden de Compra estilo Crystal Report.
    Incluye datos de empresa, proveedor, ítems con notas, y totales."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        t_oc = str(tipo_oc).strip().upper()
        
        # 0. Título dinámico
        report_title = "ORDEN DE COMPRA"
        if t_oc == 'S': report_title = "ORDEN DE SERVICIO"
        elif t_oc == 'T': report_title = "ORDEN CONTABLE"

        # 1. Datos de la empresa
        cursor.execute("""
            SELECT RTRIM(CodCia) as codcia, RTRIM(NomCia) as nomcia, 
                   RTRIM(DirCia) as dircia, RTRIM(RucCia) as ruccia
            FROM AdmMcias WHERE RTRIM(CodCia) = ?
        """, (codcia,))
        cia_row = cursor.fetchone()
        company = {}
        if cia_row:
            company = {
                "codcia": cia_row.codcia,
                "nomcia": cia_row.nomcia,
                "dircia": cia_row.dircia,
                "ruccia": cia_row.ruccia
            }
        
        # 2. Cabecera de la OC (CmpVOcom)
        header_query = """
            SELECT 
                RTRIM(NroDoc) as nrodoc, FchDoc as fchdoc,
                RTRIM(Usuario) as usuario, RTRIM(TipoOc) as tipooc,
                CodMon as codmon, RTRIM(CodAux) as codaux,
                RTRIM(NomAux) as nomaux, RTRIM(DirAux) as diraux,
                RTRIM(TlfAux) as tlfaux, RTRIM(RucAux) as rucaux,
                RTRIM(Fax) as fax, RTRIM(Contacto) as contacto,
                RTRIM(NomCom) as nomcom, RTRIM(GloDoc) as glodoc,
                RTRIM(TmpEnt) as tmpent, RTRIM(Entrega) as entrega,
                RTRIM(LugEnt) as lugent, RTRIM(DesPag) as despag,
                RTRIM(NroReq) as nroreq,
                PorIgv as porigv, ImpNet as impnet, 
                ImpIgv as impigv, ImpTot as imptot,
                RTRIM(FlgEst) as flgest
            FROM CmpVOcom 
            WHERE RTRIM(CodCia) = ? AND RTRIM(NroDoc) = ?
        """
        h_params = [codcia, nrodoc]
        if tipo_oc:
            header_query += " AND RTRIM(TipoOc) = ?"
            h_params.append(tipo_oc)
        if year:
            header_query += " AND RTRIM(Anos) = ?"
            h_params.append(year)
            
        cursor.execute(header_query, tuple(h_params))
        h_row = cursor.fetchone()
        
        if not h_row:
            raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
        
        header = {
            "nrodoc": h_row.nrodoc,
            "fchdoc": h_row.fchdoc.strftime("%d/%m/%Y") if h_row.fchdoc else "",
            "usuario": h_row.usuario or "",
            "tipooc": h_row.tipooc or "",
            "title": report_title,
            "codmon": "S/" if str(h_row.codmon).strip() in ("1", "1.0") else "USD",
            "codaux": h_row.codaux or "",
            "nomaux": h_row.nomaux or "",
            "diraux": h_row.diraux or "",
            "tlfaux": h_row.tlfaux or "",
            "rucaux": h_row.rucaux or "",
            "fax": h_row.fax or "",
            "contacto": h_row.contacto or "",
            "nomcom": h_row.nomcom or "",
            "glodoc": h_row.glodoc or "",
            "tmpent": h_row.tmpent or "",
            "entrega": h_row.entrega or "",
            "lugent": h_row.lugent or "",
            "despag": h_row.despag or "",
            "nroreq": h_row.nroreq or "",
            "porigv": float(h_row.porigv) if h_row.porigv else 0,
            "impnet": float(h_row.impnet) if h_row.impnet else 0,
            "impigv": float(h_row.impigv) if h_row.impigv else 0,
            "imptot": float(h_row.imptot) if h_row.imptot else 0,
            "flgest": h_row.flgest or "",
        }
        
        # 3. Detalle de ítems (CmpROcom) con ingresos a almacén y facturado agregados
        detail_query = """
            SELECT 
                r.NroItm as nroitm,
                RTRIM(r.CodMat) as codmat,
                RTRIM(r.DesMat) as desmat,
                RTRIM(r.UndStk) as undstk,
                r.CanDes as candes,
                r.PreUni as preuni,
                r.ImpIgv as impigv,
                r.ImpTot as imptot,
                RTRIM(r.FlgEst) as flgest,
                RTRIM(r.Nota01) as nota01,
                RTRIM(r.Nota02) as nota02,
                RTRIM(r.Nota03) as nota03,
                RTRIM(r.Nota04) as nota04,
                RTRIM(r.Nota05) as nota05,
                RTRIM(r.Nota06) as nota06,
                RTRIM(r.Nota07) as nota07,
                RTRIM(r.Nota08) as nota08,
                COALESCE((
                    SELECT SUM(a.candes) 
                    FROM AlmRMovm a 
                    WHERE RTRIM(a.CodCia) = RTRIM(r.CodCia) 
                      AND RTRIM(a.ordcmp) = RTRIM(r.NroDoc) 
                      AND RTRIM(a.codmat) = RTRIM(r.CodMat)
                ), 0) as cant_ingresada,
                COALESCE((
                    SELECT SUM(fd.Cantidad)
                    FROM CntFacturaDet fd
                    INNER JOIN CntFacturaCab fc ON fd.FacturaCabId = fc.Id
                    WHERE RTRIM(fc.CodCia) = RTRIM(r.CodCia)
                      AND RTRIM(fc.NroOrdenCompra) = RTRIM(r.NroDoc)
                      AND RTRIM(fd.CodMaterial) = RTRIM(r.CodMat)
                      AND fc.Estado != 'Anulada'
                ), 0) as cant_facturada
            FROM CmpROcom r
            WHERE RTRIM(r.CodCia) = ? AND RTRIM(r.NroDoc) = ?
        """
        d_params = [codcia, nrodoc]
        if tipo_oc:
            detail_query += " AND RTRIM(r.TipoOc) = ?"
            d_params.append(tipo_oc)
        if year:
            detail_query += " AND RTRIM(r.Anos) = ?"
            d_params.append(year)
        detail_query += " ORDER BY r.NroItm ASC"
        
        cursor.execute(detail_query, tuple(d_params))
        
        items = []
        item_counter = 0
        total_requested = 0
        total_received = 0
        total_invoiced = 0
        
        for row in cursor.fetchall():
            # Skip items flagged as eliminated (flgest = '*')
            if row.flgest and row.flgest.strip() == '*':
                continue
            item_counter += 1
            
            # Collect non-empty notes
            notes = []
            for i in range(1, 9):
                nota = getattr(row, f'nota0{i}', None)
                if nota and nota.strip():
                    notes.append(nota.strip())
            
            req_qty = float(row.candes) if row.candes else 0
            rec_qty = float(row.cant_ingresada) if row.cant_ingresada else 0
            invoiced_qty = float(row.cant_facturada) if row.cant_facturada else 0
            
            total_requested += req_qty
            total_received += rec_qty
            total_invoiced += invoiced_qty
            
            # Line item status
            line_status = "Pendiente"
            # Decide base for "status" based on type
            compare_qty = rec_qty if t_oc == 'M' else invoiced_qty
            if compare_qty >= req_qty and req_qty > 0:
                line_status = "Completo"
            elif compare_qty > 0:
                line_status = "Parcial"
                
            items.append({
                "nroitm": int(row.nroitm) if row.nroitm else 0,
                "item_display": item_counter,
                "codmat": row.codmat or "",
                "desmat": row.desmat or "",
                "undstk": row.undstk or "",
                "candes": req_qty,
                "cant_ingresada": rec_qty,
                "cant_facturada": invoiced_qty,
                "estado_ingreso": line_status,
                "preuni": float(row.preuni) if row.preuni else 0,
                "impigv": float(row.impigv) if row.impigv else 0,
                "imptot": float(row.imptot) if row.imptot else 0,
                "notas": notes,
            })
            
        # Overall order receive status
        order_receive_status = "Pendiente"
        if total_requested > 0:
            compare_total = total_received if t_oc == 'M' else total_invoiced
            if compare_total >= total_requested:
                order_receive_status = "Completo (Cerrada)"
            elif compare_total > 0:
                order_receive_status = "Parcial"
        else:
            order_receive_status = "Sin Ítems"
            
        header["estado_ingreso"] = order_receive_status
        
        return {
            "company": company,
            "header": header,
            "items": items,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()



@router.get("/orders/{nrodoc}/warehouse-entry")
def get_warehouse_entry(
    nrodoc: str,
    codcia: str = Query(..., description="Código de la empresa")
):
    """Obtener ingresos a almacén (AlmVMovm + AlmRMovm) asociados a una Orden de Compra.
    Devuelve vouchers agrupados por documento con cabecera y detalle tipo Crystal Report."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        codcia_s = codcia.strip()
        nrodoc_s = nrodoc.strip()
        
        # 1. Datos de la empresa
        cursor.execute("""
            SELECT RTRIM(NomCia) as nomcia, RTRIM(DirCia) as dircia, RTRIM(RucCia) as ruccia
            FROM AdmMcias WHERE RTRIM(CodCia) = ?
        """, (codcia_s,))
        cia_row = cursor.fetchone()
        company = {
            "nomcia": cia_row.nomcia if cia_row else "",
            "dircia": cia_row.dircia if cia_row else "",
            "ruccia": cia_row.ruccia if cia_row else ""
        }
        
        # 2. Encontrar documentos de almacén vinculados a esta OC (via ordcmp en AlmRMovm)
        cursor.execute("""
            SELECT DISTINCT 
                RTRIM(r.almcen) as almcen, RTRIM(r.tipmov) as tipmov, 
                RTRIM(r.codmov) as codmov, RTRIM(r.nrodoc) as nrodoc
            FROM AlmRMovm r
            WHERE RTRIM(r.CodCia) = ? AND LTRIM(RTRIM(r.ordcmp)) = ?
            ORDER BY r.nrodoc
        """, (codcia_s, nrodoc_s))
        
        doc_keys = []
        for row in cursor.fetchall():
            doc_keys.append({
                "almcen": row.almcen, "tipmov": row.tipmov,
                "codmov": row.codmov, "nrodoc": row.nrodoc
            })
        
        if not doc_keys:
            return {"company": company, "vouchers": []}
        
        vouchers = []
        for dk in doc_keys:
            # 3. Cabecera del voucher (AlmVMovm)
            cursor.execute("""
                SELECT 
                    fchdoc, codmon, tpocmb, tpocmbe,
                    RTRIM(codpro) as codpro, RTRIM(codcli) as codcli,
                    RTRIM(ordtra) as ordtra, RTRIM(codcos) as codcos,
                    RTRIM(glodoc) as glodoc, RTRIM(usuario) as usuario,
                    RTRIM(nroref1) as nroref1, RTRIM(nroref2) as nroref2, RTRIM(nroref3) as nroref3,
                    RTRIM(flgest) as flgest
                FROM AlmVMovm 
                WHERE RTRIM(codcia) = ? AND RTRIM(almcen) = ? 
                  AND RTRIM(tipmov) = ? AND RTRIM(codmov) = ? AND RTRIM(nrodoc) = ?
            """, (codcia_s, dk["almcen"], dk["tipmov"], dk["codmov"], dk["nrodoc"]))
            
            h_row = cursor.fetchone()
            
            # Descripción del almacén
            cursor.execute("""
                SELECT RTRIM(nombre) as nombre FROM AlmTabla 
                WHERE RTRIM(codcia) = ? AND RTRIM(tabla) = 'ALMC' AND RTRIM(codigo) = ?
            """, (codcia_s, dk["almcen"]))
            alm_row = cursor.fetchone()
            des_almacen = alm_row.nombre if alm_row else ""
            
            # Descripción del tipo de movimiento
            cursor.execute("""
                SELECT RTRIM(desmov) as desmov,
                       RTRIM(gloref1) as gloref1, RTRIM(gloref2) as gloref2, RTRIM(gloref3) as gloref3
                FROM almTmovm 
                WHERE RTRIM(codcia) = ? AND RTRIM(tipmov) = ? AND RTRIM(codmov) = ?
            """, (codcia_s, dk["tipmov"], dk["codmov"]))
            mov_row = cursor.fetchone()
            des_movimiento = mov_row.desmov if mov_row else ""
            
            # Nombre del proveedor (si aplica)
            nom_proveedor = ""
            ruc_proveedor = ""
            if h_row and h_row.codpro and h_row.codpro.strip():
                cursor.execute("""
                    SELECT RTRIM(nomaux) as nomaux, RTRIM(codaux) as codaux 
                    FROM CbdMauxi 
                    WHERE RTRIM(codcia) = ? AND RTRIM(codaux) = ?
                """, (codcia_s, h_row.codpro.strip()))
                prov_row = cursor.fetchone()
                if prov_row:
                    nom_proveedor = prov_row.nomaux or ""
                    ruc_proveedor = prov_row.codaux or ""
            
            # Moneda
            moneda_str = "S/."
            if h_row:
                cod_mon = str(h_row.codmon).strip() if h_row.codmon else "1"
                if cod_mon == "2":
                    moneda_str = "US$"
                elif cod_mon == "3":
                    moneda_str = "Eu$"
            
            # Formato de referencias
            refs = []
            if mov_row and h_row:
                for i in range(1, 4):
                    glo = getattr(mov_row, f'gloref{i}', None)
                    nro = getattr(h_row, f'nroref{i}', None)
                    if glo and glo.strip() and nro and nro.strip():
                        refs.append(f"{glo.strip()} - {nro.strip()}")
            
            header = {
                "almacen": dk["almcen"],
                "des_almacen": des_almacen,
                "tipmov": dk["tipmov"],
                "codmov": dk["codmov"],
                "des_movimiento": des_movimiento,
                "nrodoc": dk["nrodoc"],
                "fchdoc": h_row.fchdoc.strftime("%d/%m/%Y") if h_row and h_row.fchdoc else "",
                "moneda": moneda_str,
                "tipo_cambio": float(h_row.tpocmb) if h_row and h_row.tpocmb else 0,
                "proveedor": nom_proveedor,
                "ruc_proveedor": ruc_proveedor,
                "observacion": h_row.glodoc if h_row and h_row.glodoc else "",
                "usuario": h_row.usuario if h_row and h_row.usuario else "",
                "ordcmp": nrodoc_s,
                "referencias": refs,
                "estado": h_row.flgest if h_row and h_row.flgest else ""
            }
            
            # 4. Items del voucher (AlmRMovm)
            cursor.execute("""
                SELECT 
                    nroitm, RTRIM(codmat) as codmat, RTRIM(desmat) as desmat,
                    RTRIM(undstk) as undstk, facequ, candes, preuni, impcto,
                    RTRIM(nrolote) as nrolote, fchlote
                FROM AlmRMovm 
                WHERE RTRIM(codcia) = ? AND RTRIM(almcen) = ? 
                  AND RTRIM(tipmov) = ? AND RTRIM(codmov) = ? AND RTRIM(nrodoc) = ?
                ORDER BY nroitm
            """, (codcia_s, dk["almcen"], dk["tipmov"], dk["codmov"], dk["nrodoc"]))
            
            items = []
            total_cantidad = 0
            total_precio = 0
            total_importe = 0
            
            for it in cursor.fetchall():
                cant = float(it.candes) if it.candes else 0
                precio = float(it.preuni) if it.preuni else 0
                importe = float(it.impcto) if it.impcto else cant * precio
                
                total_cantidad += cant
                total_precio += precio
                total_importe += importe
                
                items.append({
                    "nroitm": int(it.nroitm) if it.nroitm else 0,
                    "codmat": it.codmat or "",
                    "desmat": it.desmat or "",
                    "undstk": it.undstk or "",
                    "nrolote": it.nrolote or "",
                    "fchlote": it.fchlote.strftime("%d/%m/%Y") if it.fchlote else "",
                    "candes": cant,
                    "preuni": precio,
                    "impcto": importe
                })
            
            header["total_cantidad"] = total_cantidad
            header["total_precio"] = total_precio
            header["total_importe"] = total_importe
            
            vouchers.append({"header": header, "items": items})
        
        return {"company": company, "vouchers": vouchers}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ─── Attachments System ─────────────────────────

@router.post("/attachments/upload")
async def upload_order_attachment(
    codcia: str = Form(...),
    tipooc: str = Form(...),
    nrodoc: str = Form(...),
    doc_type: str = Form(...), # 'signed_order' or 'voucher'
    file: UploadFile = File(...)
):
    """Subir archivo adjunto (PDF/Imagen) para una OC"""
    try:
        c = str(codcia).strip()
        t = str(tipooc).strip()
        n = str(nrodoc).strip()
        dt = str(doc_type).strip()
        
        target_dir = os.path.join(ATTACHMENTS_ROOT, c, t, n, dt)
        os.makedirs(target_dir, exist_ok=True)
        
        file_path = os.path.join(target_dir, file.filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {"message": "Archivo subido exitosamente", "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir archivo: {str(e)}")

@router.get("/attachments/list")
def list_order_attachments(
    codcia: str = Query(...),
    tipooc: str = Query(...),
    nrodoc: str = Query(...),
    doc_type: str = Query(...)
):
    """Listar archivos adjuntos para una OC"""
    try:
        c = str(codcia).strip()
        t = str(tipooc).strip()
        n = str(nrodoc).strip()
        dt = str(doc_type).strip()
        
        target_dir = os.path.join(ATTACHMENTS_ROOT, c, t, n, dt)
        if not os.path.exists(target_dir):
            return []
        
        files = []
        for filename in os.listdir(target_dir):
            files.append({
                "filename": filename,
                "url": f"/api/logistics/attachments/download?codcia={c}&tipooc={t}&nrodoc={n}&doc_type={dt}&filename={filename}"
            })
        return files
    except Exception as e:
        return []

@router.get("/attachments/download")
def download_attachment(
    codcia: str = Query(...),
    tipooc: str = Query(...),
    nrodoc: str = Query(...),
    doc_type: str = Query(...),
    filename: str = Query(...)
):
    """Descargar/Visualizar un archivo adjunto"""
    try:
        c = str(codcia).strip()
        t = str(tipooc).strip()
        n = str(nrodoc).strip()
        dt = str(doc_type).strip()
        fn = str(filename).strip()
        
        file_path = os.path.join(ATTACHMENTS_ROOT, c, t, n, dt, fn)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        mt, _ = mimetypes.guess_type(fn)
        if not mt:
            mt = "application/octet-stream"
            
        # Use inline content disposition so the browser previews the file (PDF/Image) instead of forcing a download
        headers = {"Content-Disposition": f'inline; filename="{fn}"'}
        return FileResponse(path=file_path, headers=headers, media_type=mt)
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))
