import re

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'r', encoding='utf-8') as f:
    text = f.read()

new_func = """@router.get("/detallado/lista")
def get_cargos_detallado(
    codcia: str = Query(...),
    area_destino: str = Query(None),
    estado: str = Query(None)
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
                RTRIM(d.EstadoContable) as EstadoContable, RTRIM(d.CodCiaOc) as CodCiaOc
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            WHERE RTRIM(c.CodCia) = ?
        '''
        params = [codcia]
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
            CREATE TABLE #TempOcs (nrodoc VARCHAR(20) PRIMARY KEY)
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
            SELECT RTRIM(NroOrdenCompra), RTRIM(MIN(Serie)) + '-' + RTRIM(MIN(Numero)), MIN(Uuid), MIN(Id)
            FROM CntFacturaCab f INNER JOIN #TempOcs t ON RTRIM(f.NroOrdenCompra)=t.nrodoc 
            WHERE f.Estado != 'Anulada' GROUP BY NroOrdenCompra
        ''')
        factura_map = {r[0].strip(): {'factura': r[1], 'uuid': r[2], 'fac_id': r[3]} for r in cursor.fetchall()}

        cursor.execute('''SELECT RTRIM(NroDoc), SUM(CanDes) FROM CmpROcom r INNER JOIN #TempOcs t ON RTRIM(r.NroDoc)=t.nrodoc WHERE RTRIM(CodCia)=? GROUP BY NroDoc''', (codcia.strip(),))
        pedida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}

        cursor.execute('''SELECT RTRIM(ordcmp), SUM(candes) FROM AlmRMovm m WITH(INDEX(PK_AlmRmovm)) INNER JOIN #TempOcs t ON RTRIM(m.ordcmp)=t.nrodoc WHERE RTRIM(CodCia)=? GROUP BY ordcmp''', (codcia.strip(),))
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
"""

pattern = r'@router\.get\("/detallado/lista"\).*?def get_cargos_detallado.*?conn\.close\(\)\s*'
new_text = re.sub(pattern, new_func + '\n\n', text, flags=re.DOTALL)

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'w', encoding='utf-8') as f:
    f.write(new_text)
print("Patch detailed successful")
