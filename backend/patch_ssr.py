import re

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'r', encoding='utf-8') as f:
    text = f.read()

ssr_func = """
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
            exclusion_joins = "LEFT JOIN CntCargosDetalle dlog ON RTRIM(dlog.NroOrdenCompra) = RTRIM(o.NroDoc) LEFT JOIN CntCargosDocumentales clog ON clog.Id = dlog.CargoId AND RTRIM(clog.CodCia) = RTRIM(o.CodCia) AND clog.TipoCargo = 'LOG_A_CONT' AND clog.Estado != 'ANULADO'"
            exclusion_where = " AND (clog.Id IS NULL OR ISNULL(dlog.EstadoContable, 'PENDIENTE') = 'RECHAZADO')"
            
        elif tipo_cargo == 'CONT_A_TES':
            # Needs to know if it's already in TES
            exclusion_joins = ""
            # Because SQL 2008 left joins with complex ORs can be slow, we will use NOT EXISTS for TES
            exclusion_where = " AND NOT EXISTS (SELECT 1 FROM CntCargosDetalle dt INNER JOIN CntCargosDocumentales ct ON dt.CargoId = ct.Id WHERE RTRIM(dt.NroOrdenCompra) = RTRIM(o.NroDoc) AND RTRIM(ct.CodCia) = RTRIM(o.CodCia) AND ct.TipoCargo = 'CONT_A_TES' AND ct.Estado != 'ANULADO' AND ISNULL(dt.EstadoContable, 'PENDIENTE') != 'RECHAZADO')"
            
            # Now, for logistica normal vs directa:
            if is_directas:
                # Include ONLY if never touched by logistica AND not rejected
                # A direct OC is one where it NOT EXISTS in any LOG_A_CONT
                exclusion_where += " AND NOT EXISTS (SELECT 1 FROM CntCargosDetalle dl INNER JOIN CntCargosDocumentales cl ON dl.CargoId = cl.Id WHERE RTRIM(dl.NroOrdenCompra) = RTRIM(o.NroDoc) AND RTRIM(cl.CodCia) = RTRIM(o.CodCia) AND cl.TipoCargo = 'LOG_A_CONT' AND cl.Estado != 'ANULADO')"
            else:
                # Normal path: MUST BE accepted by Logistica
                exclusion_where += " AND EXISTS (SELECT 1 FROM CntCargosDetalle dl INNER JOIN CntCargosDocumentales cl ON dl.CargoId = cl.Id WHERE RTRIM(dl.NroOrdenCompra) = RTRIM(o.NroDoc) AND RTRIM(cl.CodCia) = RTRIM(o.CodCia) AND cl.TipoCargo = 'LOG_A_CONT' AND cl.Estado != 'ANULADO' AND dl.EstadoContable = 'ACEPTADO')"
        
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
            SELECT RTRIM(NroOrdenCompra), RTRIM(MIN(Serie)) + '-' + RTRIM(MIN(Numero)), SUM(Total), MAX(FecEmision), MIN(Uuid), MIN(Id)
            FROM CntFacturaCab f INNER JOIN #TempOcs t ON RTRIM(f.NroOrdenCompra)=t.nrodoc 
            WHERE f.Estado != 'Anulada' GROUP BY NroOrdenCompra
        ''')
        factura_map = {}
        for r in cursor.fetchall():
            factura_map[r[0].strip()] = {'factura': r[1], 'total_factura': r[2], 'fec_factura': r[3], 'factura_uuid': r[4], 'fac_id': r[5]}

        cursor.execute('''SELECT RTRIM(NroDoc), SUM(CanDes) FROM CmpROcom r INNER JOIN #TempOcs t ON RTRIM(r.NroDoc)=t.nrodoc WHERE RTRIM(CodCia)=? GROUP BY NroDoc''', (codcia.strip(),))
        pedida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}

        cursor.execute('''SELECT RTRIM(ordcmp), SUM(candes) FROM AlmRMovm m WITH(INDEX(PK_AlmRmovm)) INNER JOIN #TempOcs t ON RTRIM(m.ordcmp)=t.nrodoc WHERE RTRIM(CodCia)=? GROUP BY ordcmp''', (codcia.strip(),))
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
                'observacion_rechazo': '' # Can fetch if needed but not strictly required
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

"""

if 'def get_ocs_disponibles_ssr(' not in text:
    text = text.replace('router = APIRouter(prefix="/api/cargos", tags=["Cargos Documentales"])', 'router = APIRouter(prefix="/api/cargos", tags=["Cargos Documentales"])' + ssr_func)

    with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Injected SSR endpoint")
else:
    print("SSR endpoint already exists")

