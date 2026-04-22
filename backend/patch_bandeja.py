import re

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'r', encoding='utf-8') as f:
    text = f.read()

bandeja_func = """@router.get("/bandeja")
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
                RTRIM(d.EstadoContable) as EstadoContable, RTRIM(d.CodCiaOc) as CodCiaOc
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            WHERE RTRIM(c.CodCia) = ?
        '''
        
        if current_area == 'CONTABILIDAD':
            query += " AND ((RTRIM(c.AreaDestino) = 'CONTABILIDAD' AND c.Estado = 'PENDIENTE') OR (RTRIM(c.TipoCargo) = 'CONT_A_TES' AND RTRIM(d.EstadoContable) = 'RECHAZADO'))"
        elif current_area == 'TESORERIA':
            query += " AND (RTRIM(c.AreaDestino) = 'TESORERIA' AND c.Estado IN ('PENDIENTE', 'RECIBIDO'))"
        
        query += " ORDER BY c.FechaCargo DESC"
        cursor.execute(query, (codcia,))
        cols = [col[0] for col in cursor.description]
        base_results = [dict(zip(cols, r)) for r in cursor.fetchall()]

        if not base_results: return []

        cursor.execute('''
            IF OBJECT_ID('tempdb..#TempOcs') IS NOT NULL DROP TABLE #TempOcs;
            CREATE TABLE #TempOcs (nrodoc VARCHAR(20) PRIMARY KEY)
        ''')
        nrodocs_set = list(set(r['NroOrdenCompra'].strip() for r in base_results if r.get('NroOrdenCompra')))
        if hasattr(cursor, 'fast_executemany'): cursor.fast_executemany = True
        vals = [(d,) for d in nrodocs_set]
        cursor.executemany("INSERT INTO #TempOcs (nrodoc) VALUES (?)", vals)

        cursor.execute('''SELECT RTRIM(NroOrdenCompra), RTRIM(MIN(Serie)) + '-' + RTRIM(MIN(Numero)), MIN(Uuid) FROM CntFacturaCab f INNER JOIN #TempOcs t ON RTRIM(f.NroOrdenCompra)=t.nrodoc WHERE f.Estado != 'Anulada' GROUP BY NroOrdenCompra''')
        factura_map = {r[0].strip(): {'factura': r[1], 'uuid': r[2]} for r in cursor.fetchall()}

        cursor.execute('''SELECT RTRIM(NroDoc), SUM(CanDes) FROM CmpROcom r INNER JOIN #TempOcs t ON RTRIM(r.NroDoc)=t.nrodoc WHERE RTRIM(CodCia)=? GROUP BY NroDoc''', (codcia.strip(),))
        pedida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}

        cursor.execute('''SELECT RTRIM(ordcmp), SUM(candes) FROM AlmRMovm m WITH(INDEX(PK_AlmRmovm)) INNER JOIN #TempOcs t ON RTRIM(m.ordcmp)=t.nrodoc WHERE RTRIM(CodCia)=? GROUP BY ordcmp''', (codcia.strip(),))
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
"""

text = text.replace('router = APIRouter(prefix="/api/cargos", tags=["Cargos Documentales"])', 'router = APIRouter(prefix="/api/cargos", tags=["Cargos Documentales"])' + '\n\n' + bandeja_func)

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'w', encoding='utf-8') as f:
    f.write(text)

# Also update Javascript to use the new endpoint
with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'r', encoding='utf-8') as f:
    js_text = f.read()

# Replace endpoint and remove filter
new_bandeja_logic = """
        const res = await axios.get(`/api/cargos/bandeja?codcia=${encodeURIComponent(codcia)}&current_area=${currentArea}`);
        const allItems = res.data;
        let pending = allItems;
"""

js_text = re.sub(
    r'const res = await axios\.get\(`/api/cargos/detallado/lista\?codcia=\$\{encodeURIComponent\(codcia\)\}`\);\s*const allItems = res\.data;\s*let pending = \[\];\s*if \(currentArea === \'CONTABILIDAD\'\) \{.*?(?=tbody\.innerHTML = \'\';)',
    new_bandeja_logic,
    js_text,
    flags=re.DOTALL
)

with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'w', encoding='utf-8') as f:
    f.write(js_text)

print("Bandeja logic patched")
