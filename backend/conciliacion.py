"""
Módulo de Conciliación Bancaria — Control Interno (Finanzas)
Maneja la importación de movimientos bancarios desde Excel,
conciliación automática y manual contra cobranzas del sistema (CcbMVtos).
Soporta conciliación cross-company.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date
import uuid
import io

router = APIRouter(prefix="/api/conciliacion", tags=["Conciliación Bancaria"])

from database import get_db_connection


# ─── Pydantic Models ─────────────────────────────────────────────

class ManualMatchRequest(BaseModel):
    bank_movement_id: int
    match_codcia: str
    match_coddoc: str
    match_nrodoc: str
    match_nroitm: str


class AutoMatchRequest(BaseModel):
    codcia: str
    bank_code: str
    period_year: Optional[str] = None
    period_month: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────

def row_to_dict(cursor, row):
    """Convert a pyodbc row to a dictionary using cursor.description."""
    columns = [col[0] for col in cursor.description]
    result = {}
    for col, val in zip(columns, row):
        if isinstance(val, datetime):
            result[col] = val.isoformat()
        elif val is None:
            result[col] = None
        else:
            s = str(val)
            result[col] = s.strip() if isinstance(val, str) else s
    return result


def rows_to_list(cursor):
    """Fetch all rows from cursor and return as list of dicts."""
    return [row_to_dict(cursor, row) for row in cursor.fetchall()]


# ─── Endpoints ────────────────────────────────────────────────────

@router.get("/empresas")
def get_empresas():
    """Lista las empresas registradas en AdmMcias."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT codcia, nomcia, ruccia FROM AdmMcias ORDER BY codcia")
        result = rows_to_list(cursor)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/bancos/{codcia}")
def get_bancos(codcia: str):
    """Lista los bancos configurados para una empresa (CcbTabla, Tabla=0001)."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT Codigo, Nombre, CtaNac, CtaUsa, CodMon
            FROM CcbTabla
            WHERE CodCia = ? AND Tabla = '0001'
            ORDER BY Codigo
        """, (codcia,))
        result = rows_to_list(cursor)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/upload-excel")
async def upload_excel(
    file: UploadFile = File(...),
    codcia: str = Query(...),
    bank_code: str = Query(...)
):
    """
    Importa movimientos bancarios desde un archivo Excel.
    Formato esperado (columnas):
      Fecha, Descripcion, Monto, Saldo, Sucursal, Operacion Numero,
      Operacion Hora, Referencia, Op Manual, OP Cancelacion,
      Descripcion Final, Estado
    """
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed")

    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")

    try:
        contents = await file.read()
        wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
        ws = wb.active

        batch_id = str(uuid.uuid4())
        rows_imported = 0
        cursor = conn.cursor()

        # Read header row to map columns
        headers = []
        for cell in next(ws.iter_rows(min_row=1, max_row=1)):
            headers.append(str(cell.value or "").strip().lower())

        # Column mapping (flexible matching)
        col_map = {}
        mapping_rules = {
            'fecha': ['fecha'],
            'descripcion': ['descripcion', 'descripción'],
            'monto': ['monto', 'importe'],
            'saldo': ['saldo'],
            'sucursal': ['sucursal'],
            'operacion_numero': ['operacion numero', 'operación numero', 'operacion_numero', 'nro operacion'],
            'operacion_hora': ['operacion hora', 'operación hora', 'operacion_hora', 'hora'],
            'referencia': ['referencia'],
            'op_manual': ['op manual', 'op_manual'],
            'op_cancelacion': ['op cancelacion', 'op cancelación', 'op_cancelacion'],
            'descripcion_final': ['descripcion final', 'descripción final', 'descripcion_final'],
            'estado': ['estado']
        }

        for key, aliases in mapping_rules.items():
            for i, h in enumerate(headers):
                if h in aliases:
                    col_map[key] = i
                    break

        for row in ws.iter_rows(min_row=2, values_only=True):
            if row is None or all(v is None for v in row):
                continue

            def get_val(key, default=None):
                idx = col_map.get(key)
                if idx is not None and idx < len(row):
                    v = row[idx]
                    return v if v is not None else default
                return default

            fecha = get_val('fecha')
            if fecha is None:
                continue  # Skip rows without date

            # Handle fecha - convert to string 'YYYY-MM-DD' for ODBC compatibility
            if isinstance(fecha, str):
                # Try common formats and convert to YYYY-MM-DD string
                parsed = False
                for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y', '%d-%m-%Y'):
                    try:
                        fecha = datetime.strptime(fecha, fmt).strftime('%Y-%m-%d')
                        parsed = True
                        break
                    except ValueError:
                        continue
                if not parsed:
                    continue  # Skip if we can't parse the date
            elif isinstance(fecha, datetime):
                fecha = fecha.strftime('%Y-%m-%d')
            elif isinstance(fecha, date):
                fecha = fecha.strftime('%Y-%m-%d')
            else:
                continue  # Skip unsupported date type

            monto = get_val('monto', 0)
            try:
                monto = float(str(monto).replace(',', ''))
            except (ValueError, TypeError):
                monto = 0

            saldo = get_val('saldo', 0)
            try:
                saldo = float(str(saldo).replace(',', ''))
            except (ValueError, TypeError):
                saldo = 0

            # Ensure all string values are clean (no None)
            def safe_str(val, max_len=200):
                if val is None:
                    return ''
                s = str(val).strip()
                return s[:max_len]

            cursor.execute("""
                INSERT INTO BankMovements
                (CodCia, BankCode, Fecha, Descripcion, Monto, Saldo, Sucursal,
                 OperacionNumero, OperacionHora, Referencia, OpManual, OpCancelacion,
                 DescripcionFinal, Estado, ImportBatchId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)
            """, (
                codcia, bank_code, fecha,
                safe_str(get_val('descripcion', ''), 200),
                monto, saldo,
                safe_str(get_val('sucursal', ''), 50),
                safe_str(get_val('operacion_numero', ''), 30),
                safe_str(get_val('operacion_hora', ''), 10),
                safe_str(get_val('referencia', ''), 50),
                safe_str(get_val('op_manual', ''), 30),
                safe_str(get_val('op_cancelacion', ''), 30),
                safe_str(get_val('descripcion_final', ''), 200),
                batch_id
            ))
            rows_imported += 1

        conn.commit()
        wb.close()

        return {
            "status": "success",
            "message": f"Se importaron {rows_imported} movimientos bancarios.",
            "batch_id": batch_id,
            "rows_imported": rows_imported
        }

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al importar Excel: {str(e)}")
    finally:
        conn.close()


@router.get("/movimientos-banco")
def get_bank_movements(
    codcia: str = Query(...),
    bank_code: str = Query(...),
    year: Optional[str] = None,
    month: Optional[str] = None,
    estado: Optional[str] = None
):
    """Lista movimientos bancarios importados con filtros."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        query = """
            SELECT bm.Id, bm.CodCia, bm.BankCode, bm.Fecha, bm.Descripcion,
                   bm.Monto, bm.Saldo, bm.Sucursal, bm.OperacionNumero,
                   bm.OperacionHora, bm.Referencia, bm.OpManual, bm.OpCancelacion,
                   bm.DescripcionFinal, bm.Estado, bm.ReconciliationDetailId,
                   bm.ImportBatchId, bm.ImportedAt
            FROM BankMovements bm
            WHERE bm.CodCia = ? AND bm.BankCode = ?
        """
        params = [codcia, bank_code]

        if year:
            query += " AND YEAR(bm.Fecha) = ?"
            params.append(int(year))
        if month:
            query += " AND MONTH(bm.Fecha) = ?"
            params.append(int(month))
        if estado:
            query += " AND bm.Estado = ?"
            params.append(estado)

        query += " ORDER BY bm.Fecha DESC, bm.Id DESC"
        cursor.execute(query, params)
        result = rows_to_list(cursor)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/cobranzas")
def get_cobranzas(
    codcia: Optional[str] = None,
    year: str = Query(...),
    month: str = Query(...),
    solo_pendientes: bool = True
):
    """
    Lista cobranzas de CcbMVtos con datos de CcbICaja.
    Si solo_pendientes=True, excluye las ya conciliadas.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        query = """
            SELECT m.CodCia, m.anos, m.mes, m.coddoc, m.nrodoc, m.nroitm,
                   m.fchdoc, m.codaux, m.NomAux, m.codven, m.nomven,
                   m.import, m.NroDep, m.fchDep, m.glodoc, m.codbco,
                   m.tpopgo, m.Glosa, m.CodDep,
                   c.nombco, c.import as import_caja, c.sdodoc
            FROM CcbMVtos m
            LEFT JOIN CcbICaja c ON m.CodCia = c.codcia
                AND m.coddoc = c.coddoc AND m.nrodoc = c.nrodoc
            WHERE m.anos = ? AND m.mes = ?
        """
        params = [year, month.zfill(2)]

        if codcia:
            query += " AND m.CodCia = ?"
            params.append(codcia)

        if solo_pendientes:
            query += """
                AND NOT EXISTS (
                    SELECT 1 FROM ReconciliationDetail rd
                    WHERE rd.MatchCodCia = m.CodCia
                      AND rd.MatchCoddoc = m.coddoc
                      AND rd.MatchNrodoc = m.nrodoc
                      AND rd.MatchNroitm = m.nroitm
                )
            """

        query += " ORDER BY m.CodCia, m.fchdoc DESC, m.nrodoc"
        cursor.execute(query, params)
        result = rows_to_list(cursor)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/auto-match")
def auto_match(request: AutoMatchRequest):
    """
    Conciliación automática: busca en CcbMVtos (TODAS las empresas)
    donde NroDep = OpCancelacion del movimiento bancario.
    Esto resuelve el caso cross-company.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        matched_count = 0

        # Get all pending bank movements
        query = """
            SELECT Id, OpCancelacion, Monto, Fecha
            FROM BankMovements
            WHERE CodCia = ? AND BankCode = ? AND Estado = 'Pendiente'
              AND OpCancelacion IS NOT NULL AND LTRIM(RTRIM(OpCancelacion)) <> ''
        """
        params = [request.codcia, request.bank_code]

        if request.period_year:
            query += " AND YEAR(Fecha) = ?"
            params.append(int(request.period_year))
        if request.period_month:
            query += " AND MONTH(Fecha) = ?"
            params.append(int(request.period_month))

        cursor.execute(query, params)
        pending_movements = cursor.fetchall()

        for mov in pending_movements:
            mov_id = mov[0]
            op_cancel = str(mov[1]).strip()

            if not op_cancel:
                continue

            # Search in CcbMVtos across ALL companies (cross-company)
            cursor.execute("""
                SELECT TOP 1 CodCia, coddoc, nrodoc, nroitm
                FROM CcbMVtos
                WHERE LTRIM(RTRIM(NroDep)) = ?
                  AND NroDep IS NOT NULL AND LTRIM(RTRIM(NroDep)) <> ''
                  AND NOT EXISTS (
                      SELECT 1 FROM ReconciliationDetail rd
                      WHERE rd.MatchCodCia = CcbMVtos.CodCia
                        AND rd.MatchCoddoc = CcbMVtos.coddoc
                        AND rd.MatchNrodoc = CcbMVtos.nrodoc
                        AND rd.MatchNroitm = CcbMVtos.nroitm
                  )
            """, (op_cancel,))

            match = cursor.fetchone()
            if match:
                # Create reconciliation detail
                cursor.execute("""
                    INSERT INTO ReconciliationDetail
                    (BankMovementId, MatchCodCia, MatchCoddoc, MatchNrodoc, MatchNroitm, MatchType)
                    VALUES (?, ?, ?, ?, ?, 'AUTO_NRODEP')
                """, (mov_id, match[0], match[1], match[2], match[3]))

                # Get the detail ID
                cursor.execute("SELECT SCOPE_IDENTITY()")
                detail_id = int(cursor.fetchone()[0])

                # Update bank movement status
                cursor.execute("""
                    UPDATE BankMovements
                    SET Estado = 'Conciliado', ReconciliationDetailId = ?
                    WHERE Id = ?
                """, (detail_id, mov_id))

                matched_count += 1

        conn.commit()

        return {
            "status": "success",
            "message": f"Conciliación automática completada. {matched_count} movimientos conciliados.",
            "matched_count": matched_count,
            "total_processed": len(pending_movements)
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/manual-match")
def manual_match(request: ManualMatchRequest):
    """Conciliación manual: vincula un movimiento bancario con una cobranza específica."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()

        # Verify bank movement exists and is pending
        cursor.execute("""
            SELECT Id, Estado FROM BankMovements WHERE Id = ?
        """, (request.bank_movement_id,))
        mov = cursor.fetchone()
        if not mov:
            raise HTTPException(status_code=404, detail="Movimiento bancario no encontrado")
        if str(mov[1]).strip() == 'Conciliado':
            raise HTTPException(status_code=400, detail="El movimiento ya está conciliado")

        # Verify the cobranza exists
        cursor.execute("""
            SELECT CodCia FROM CcbMVtos
            WHERE CodCia = ? AND coddoc = ? AND nrodoc = ? AND nroitm = ?
        """, (request.match_codcia, request.match_coddoc, request.match_nrodoc, request.match_nroitm))
        cob = cursor.fetchone()
        if not cob:
            raise HTTPException(status_code=404, detail="Cobranza no encontrada")

        # Check if cobranza already matched
        cursor.execute("""
            SELECT Id FROM ReconciliationDetail
            WHERE MatchCodCia = ? AND MatchCoddoc = ? AND MatchNrodoc = ? AND MatchNroitm = ?
        """, (request.match_codcia, request.match_coddoc, request.match_nrodoc, request.match_nroitm))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Esta cobranza ya está conciliada")

        # Create match
        cursor.execute("""
            INSERT INTO ReconciliationDetail
            (BankMovementId, MatchCodCia, MatchCoddoc, MatchNrodoc, MatchNroitm, MatchType)
            VALUES (?, ?, ?, ?, ?, 'MANUAL')
        """, (request.bank_movement_id, request.match_codcia,
              request.match_coddoc, request.match_nrodoc, request.match_nroitm))

        cursor.execute("SELECT SCOPE_IDENTITY()")
        detail_id = int(cursor.fetchone()[0])

        cursor.execute("""
            UPDATE BankMovements
            SET Estado = 'Conciliado', ReconciliationDetailId = ?
            WHERE Id = ?
        """, (detail_id, request.bank_movement_id))

        conn.commit()

        return {
            "status": "success",
            "message": "Conciliación manual realizada exitosamente.",
            "detail_id": detail_id
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/unmatch/{detail_id}")
def unmatch(detail_id: int):
    """Deshace un match de conciliación."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()

        # Get the bank movement ID before deleting
        cursor.execute("""
            SELECT BankMovementId FROM ReconciliationDetail WHERE Id = ?
        """, (detail_id,))
        detail = cursor.fetchone()
        if not detail:
            raise HTTPException(status_code=404, detail="Match no encontrado")

        bank_mov_id = detail[0]

        # Delete the detail
        cursor.execute("DELETE FROM ReconciliationDetail WHERE Id = ?", (detail_id,))

        # Reset bank movement status
        cursor.execute("""
            UPDATE BankMovements
            SET Estado = 'Pendiente', ReconciliationDetailId = NULL
            WHERE Id = ?
        """, (bank_mov_id,))

        conn.commit()
        return {"status": "success", "message": "Match eliminado exitosamente."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/resumen")
def get_resumen(
    codcia: str = Query(...),
    bank_code: str = Query(...),
    year: Optional[str] = None,
    month: Optional[str] = None
):
    """Dashboard de conciliación: totales, % conciliado, montos."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()

        # Base filter
        base_filter = "WHERE CodCia = ? AND BankCode = ?"
        params = [codcia, bank_code]

        if year:
            base_filter += " AND YEAR(Fecha) = ?"
            params.append(int(year))
        if month:
            base_filter += " AND MONTH(Fecha) = ?"
            params.append(int(month))

        # Total movements
        cursor.execute(f"SELECT COUNT(*), ISNULL(SUM(Monto),0) FROM BankMovements {base_filter}", params)
        r = cursor.fetchone()
        total_mov = r[0]
        total_monto = float(r[1])

        # Matched
        cursor.execute(f"""
            SELECT COUNT(*), ISNULL(SUM(Monto),0)
            FROM BankMovements {base_filter} AND Estado = 'Conciliado'
        """, params)
        r = cursor.fetchone()
        matched = r[0]
        matched_monto = float(r[1])

        # Pending
        cursor.execute(f"""
            SELECT COUNT(*), ISNULL(SUM(Monto),0)
            FROM BankMovements {base_filter} AND Estado = 'Pendiente'
        """, params)
        r = cursor.fetchone()
        pending = r[0]
        pending_monto = float(r[1])

        pct = round((matched / total_mov * 100), 1) if total_mov > 0 else 0

        return {
            "total_movimientos": total_mov,
            "total_monto": total_monto,
            "conciliados": matched,
            "conciliados_monto": matched_monto,
            "pendientes": pending,
            "pendientes_monto": pending_monto,
            "porcentaje_conciliado": pct
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
