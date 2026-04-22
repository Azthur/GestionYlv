import re

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'r', encoding='utf-8') as f:
    text = f.read()

new_func = """@router.get("/ocs-disponibles")
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
        cursor.execute('''SELECT RTRIM(NroDoc), SUM(CanDes) FROM CmpROcom r INNER JOIN #TempOcs t ON RTRIM(r.NroDoc)=t.nrodoc WHERE RTRIM(CodCia)=? GROUP BY NroDoc''', (codcia.strip(),))
        pedida_map = {r[0].strip(): float(r[1] or 0) for r in cursor.fetchall()}

        # Bulk Fetch Recibida
        cursor.execute('''SELECT RTRIM(ordcmp), SUM(candes) FROM AlmRMovm m WITH(INDEX(PK_AlmRmovm)) INNER JOIN #TempOcs t ON RTRIM(m.ordcmp)=t.nrodoc WHERE RTRIM(CodCia)=? GROUP BY ordcmp''', (codcia.strip(),))
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
"""

# Regex replacement
pattern = r'@router\.get\("/ocs-disponibles"\).*?def get_ocs_disponibles.*?conn\.close\(\)'
new_text = re.sub(pattern, new_func, text, flags=re.DOTALL)

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'w', encoding='utf-8') as f:
    f.write(new_text)

print("Patch applied to get_ocs_disponibles")
