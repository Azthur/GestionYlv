from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile, Form
from fastapi.responses import FileResponse
import os
import shutil
from typing import List, Optional
from database import get_db_connection
from auth import get_current_user

router = APIRouter(prefix="/api/logistics", tags=["Logística y Compras"])

@router.get("/companies")
def get_companies():
    """Obtener lista de empresas para filtrar"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT RTRIM(codcia) as codcia, RTRIM(nomcia) as nomcia FROM AdmMcias ORDER BY codcia")
        
        companies = []
        for row in cursor.fetchall():
            companies.append({"codcia": row.codcia, "nomcia": row.nomcia})
            
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
    tipo_oc: Optional[str] = Query(None, description="Tipo de OC (TipoOc)")
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
                RTRIM(Usuario) as usuario
            FROM CmpVOcom 
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
            
        query += " ORDER BY Fchdoc DESC, NroDoc DESC"
        
        cursor.execute(query, tuple(params))
        
        orders = []
        columns = [column[0] for column in cursor.description]
        for row in cursor.fetchall():
            order_dict = dict(zip(columns, row))
            # Format date strings for JSON
            if order_dict['fchdoc']:
                order_dict['fchdoc'] = order_dict['fchdoc'].strftime("%Y-%m-%d")
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
        
        # 3. Detalle de ítems (CmpROcom) con ingresos a almacén (AlmRMovm) agregados
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
                      -- AND RTRIM(a.tipmov) = 'I' -- Only counting inputs, but assuming all are inputs here
                ), 0) as cant_ingresada
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
        
        for row in cursor.fetchall():
            # Skip items flagged as eliminated
            if row.flgest and row.flgest.strip():
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
            
            total_requested += req_qty
            total_received += rec_qty
            
            # Line item status
            line_status = "Pendiente"
            if rec_qty >= req_qty and req_qty > 0:
                line_status = "Completo"
            elif rec_qty > 0:
                line_status = "Parcial"
                
            items.append({
                "nroitm": int(row.nroitm) if row.nroitm else 0,
                "item_display": item_counter,
                "codmat": row.codmat or "",
                "desmat": row.desmat or "",
                "undstk": row.undstk or "",
                "candes": req_qty,
                "cant_ingresada": rec_qty,
                "estado_ingreso": line_status,
                "preuni": float(row.preuni) if row.preuni else 0,
                "impigv": float(row.impigv) if row.impigv else 0,
                "imptot": float(row.imptot) if row.imptot else 0,
                "notas": notes,
            })
            
        # Overall order receive status
        order_receive_status = "Pendiente"
        if total_requested > 0:
            if total_received >= total_requested:
                order_receive_status = "Completo (Cerrada)"
            elif total_received > 0:
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
    """Obtener ingresos a almacén (AlmRMovm) asociados a una Orden de Compra"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        
        # ordcmp stores the original PO number.
        query = """
            SELECT 
                RTRIM(nrodoc) as nro_ingreso,
                fchdoc as fecha_ingreso,
                RTRIM(almcen) as almacen,
                RTRIM(tipmov) as tipo_movimiento,
                RTRIM(codmat) as codigo_material,
                RTRIM(desmat) as descripcion,
                candes as cantidad_ingresada
            FROM AlmRMovm 
            WHERE RTRIM(CodCia) = ? AND RTRIM(ordcmp) = ?
            ORDER BY fchdoc DESC, nrodoc DESC
        """
        params = (codcia, nrodoc)
        
        cursor.execute(query, params)
        entries = []
        columns = [column[0] for column in cursor.description]
        for row in cursor.fetchall():
            entry_dict = dict(zip(columns, row))
            if entry_dict['fecha_ingreso']:
                entry_dict['fecha_ingreso'] = entry_dict['fecha_ingreso'].strftime("%Y-%m-%d")
            # Clean up floats
            entry_dict['cantidad_ingresada'] = float(entry_dict['cantidad_ingresada']) if entry_dict['cantidad_ingresada'] is not None else 0
            entries.append(entry_dict)
            
        return entries
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ─── Attachments System ─────────────────────────
ATTACHMENTS_ROOT = os.getenv("ATTACHMENTS_ROOT", r"\\192.168.1.200\gestion-ylv")

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
        
        return FileResponse(path=file_path, filename=fn)
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))
