import sys

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_func_lines = """@router.get("/ocs-disponibles")
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
    \"\"\"
    Obtener OCs filtradas por año/mes, aplicando dependencias de flujo según el área.
    \"\"\"
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        login_clean = (login or '').strip().upper()
        puede_ver_todo = False
        allowed_types = []
        is_only_mine = (only_my_records.lower() == 'true')
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
            # Contabilidad aplica filtros básicos de tipo_oc y my_records sin chequear WebUsuarioTipoOc por BD obligatoriamente, se les asume admin_view o el que se requiera
            puede_ver_todo = True
            allowed_types = ['M', 'S', 'T']

        query = \"\"\"
            SELECT 
                RTRIM(o.NroDoc) as nrodoc, RTRIM(o.TipoOc) as tipooc, RTRIM(o.Anos) as anos,
                o.Fchdoc as fchdoc, RTRIM(o.NomAux) as proveedor, RTRIM(o.RucAux) as ruc,
                o.CodMon as moneda, o.ImpTot as total_oc
            FROM CmpVOcom o
            WHERE o.CodCia = ? AND o.Anos = ?
        \"\"\"
        params = [codcia, ano]

        if mes and int(mes) > 0:
            query += " AND MONTH(o.Fchdoc) = ?"
            params.append(int(mes))

        if login_clean:
            if is_only_mine or not puede_ver_todo:
                query += " AND o.Usuario = ?"
                params.append(login_clean)

            if tipo_oc != 'ALL':
                if tipo_oc in allowed_types or puede_ver_todo:
                    query += " AND o.TipoOc = ?"
                    params.append(tipo_oc)
                else:
                    return []
            else:
                if not puede_ver_todo and allowed_types:
                    ph = ",".join(["?"] * len(allowed_types))
                    query += f" AND o.TipoOc IN ({ph})"
                    params.extend(allowed_types)
                elif not puede_ver_todo and not allowed_types:
                    return []

        query += " ORDER BY o.Fchdoc DESC"
        cursor.execute(query, tuple(params))
        cols1 = [c[0] for c in cursor.description]
        ocs_raw = [dict(zip(cols1, row)) for row in cursor.fetchall()]

        if not ocs_raw: return []

        nrodocs = list(set(r['nrodoc'] for r in ocs_raw))
        CHUNK = 1000

        def chunked(lst, n):
            for i in range(0, len(lst), n): yield lst[i:i+n]

        factura_map = {}
        for chunk in chunked(nrodocs, CHUNK):
            ph = ",".join(["?"] * len(chunk))
            try:
                cursor.execute(f\"\"\"
                    SELECT RTRIM(NroOrdenCompra), RTRIM(Serie) + '-' + RTRIM(Numero), Total, FecEmision, Uuid, Id
                    FROM CntFacturaCab 
                    WHERE NroOrdenCompra IN ({ph}) AND Estado != 'Anulada'
                \"\"\", tuple(chunk))
                for row in cursor.fetchall():
                    factura_map[row[0].strip()] = {
                        'factura': row[1], 'total_factura': row[2], 'fec_factura': row[3], 'factura_uuid': row[4], 'fac_id': row[5]
                    }
            except: pass

        pedida_map = {}
        for chunk in chunked(nrodocs, CHUNK):
            ph = ",".join(["?"] * len(chunk))
            try:
                cursor.execute(f"SELECT RTRIM(NroDoc), SUM(CanDes) FROM CmpROcom WHERE NroDoc IN ({ph}) AND CodCia = ? GROUP BY NroDoc", tuple(chunk) + (codcia,))
                for row in cursor.fetchall(): pedida_map[row[0].strip()] = float(row[1] or 0)
            except: pass

        recibida_map = {}
        for chunk in chunked(nrodocs, CHUNK):
            ph = ",".join(["?"] * len(chunk))
            try:
                cursor.execute(f"SELECT RTRIM(ordcmp), SUM(candes) FROM AlmRMovm WHERE ordcmp IN ({ph}) AND CodCia = ? GROUP BY ordcmp", tuple(chunk) + (codcia,))
                for row in cursor.fetchall(): recibida_map[row[0].strip()] = float(row[1] or 0)
            except: pass

        rechazo_map = {}
        for chunk in chunked(nrodocs, CHUNK):
            ph = ",".join(["?"] * len(chunk))
            try:
                cursor.execute(f"SELECT RTRIM(d.NroOrdenCompra), RTRIM(d.ObservacionRechazo) FROM CntCargosDetalle d INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id WHERE d.NroOrdenCompra IN ({ph}) AND c.CodCia = ? AND d.EstadoContable = 'RECHAZADO' AND c.TipoCargo = ?", tuple(chunk) + (codcia, tipo_cargo))
                for row in cursor.fetchall(): rechazo_map[row[0].strip()] = row[1]
            except: pass

        cargos_existentes_log = set()
        aceptados = set()
        tes_existentes = set()

        if tipo_cargo == 'LOG_A_CONT':
            for chunk in chunked(nrodocs, CHUNK):
                ph = ",".join(["?"] * len(chunk))
                try:
                    cursor.execute(f"SELECT DISTINCT RTRIM(d.NroOrdenCompra) FROM CntCargosDetalle d INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id WHERE d.NroOrdenCompra IN ({ph}) AND c.CodCia = ? AND c.Estado != 'ANULADO' AND ISNULL(d.EstadoContable, 'PENDIENTE') != 'RECHAZADO' AND c.TipoCargo = 'LOG_A_CONT'", tuple(chunk) + (codcia,))
                    cargos_existentes_log.update(row[0].strip() for row in cursor.fetchall())
                except: pass

        elif tipo_cargo == 'CONT_A_TES':
            for chunk in chunked(nrodocs, CHUNK):
                ph = ",".join(["?"] * len(chunk))
                try:
                    cursor.execute(f"SELECT DISTINCT RTRIM(d.NroOrdenCompra) FROM CntCargosDetalle d INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id WHERE d.NroOrdenCompra IN ({ph}) AND c.CodCia = ? AND c.Estado != 'ANULADO' AND c.TipoCargo = 'LOG_A_CONT'", tuple(chunk) + (codcia,))
                    cargos_existentes_log.update(row[0].strip() for row in cursor.fetchall())
                except: pass
                
                try:
                    cursor.execute(f"SELECT DISTINCT RTRIM(d.NroOrdenCompra) FROM CntCargosDetalle d INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id WHERE d.NroOrdenCompra IN ({ph}) AND c.CodCia = ? AND c.Estado != 'ANULADO' AND c.TipoCargo = 'LOG_A_CONT' AND d.EstadoContable = 'ACEPTADO'", tuple(chunk) + (codcia,))
                    aceptados.update(row[0].strip() for row in cursor.fetchall())
                except: pass
                
                try:
                    cursor.execute(f"SELECT DISTINCT RTRIM(d.NroOrdenCompra) FROM CntCargosDetalle d INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id WHERE d.NroOrdenCompra IN ({ph}) AND c.CodCia = ? AND c.Estado != 'ANULADO' AND c.TipoCargo = 'CONT_A_TES' AND ISNULL(d.EstadoContable, 'PENDIENTE') != 'RECHAZADO'", tuple(chunk) + (codcia,))
                    tes_existentes.update(row[0].strip() for row in cursor.fetchall())
                except: pass

        results = []
        for d in ocs_raw:
            nro = d['nrodoc']

            if tipo_cargo == 'LOG_A_CONT':
                if nro in cargos_existentes_log: continue
            elif tipo_cargo == 'CONT_A_TES':
                if nro in tes_existentes: continue
                if nro in cargos_existentes_log and nro not in aceptados: continue
                if nro not in aceptados and not is_directas: continue

            fac_info = factura_map.get(nro)
            if fac_info: d.update(fac_info)
            else: d.update({'factura': None, 'total_factura': 0, 'fec_factura': None, 'factura_uuid': None})

            pedida = pedida_map.get(nro, 0.0)
            recibida = recibida_map.get(nro, 0.0)
            falta_recibir = pedida - recibida

            if d['tipooc'] == 'M':
                status_almt = "Pendiente Ingreso"
                if falta_recibir <= 0: status_almt = "Ingreso Total"
                elif recibida > 0: status_almt = "Ingreso Parcial"
            else: status_almt = "N/A"
            d['estado_almacen'] = status_almt

            d['observacion_rechazo'] = rechazo_map.get(nro)
            
            if getattr(d['fchdoc'], 'strftime', None): d['fchdoc'] = d['fchdoc'].strftime('%Y-%m-%d')
            if getattr(d['fec_factura'], 'strftime', None): d['fec_factura'] = d['fec_factura'].strftime('%Y-%m-%d')
                
            results.append(d)

        return results

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
"""

# Replace lines 287 to 563 (0-indexed 287 to 564)
lines = lines[:287] + [new_func_lines + '\n'] + lines[564:]

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)
