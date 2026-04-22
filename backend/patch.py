import sys

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'r', encoding='utf-8') as f:
    content = f.read()

# ── 1. Reemplazar get_cargos_detallado ──
old_detallado = """@router.get("/detallado/lista")
def get_cargos_detallado(
    codcia: str = Query(...),
    area_destino: str = Query(None),
    estado: str = Query(None)
):
    \"\"\"Obtener tabla plana (1 fila = 1 OC) cruzada con su Cargo Documental.\"\"\"
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de DB")
    try:
        cursor = conn.cursor()
        query = \"\"\"
            SELECT 
                c.Id as CargoId, RTRIM(c.NroCargo) as NroCargo, RTRIM(c.TipoCargo) as TipoCargo, 
                c.FechaCargo, c.FechaRecepcion, RTRIM(c.AreaOrigen) as AreaOrigen, RTRIM(c.AreaDestino) as AreaDestino, 
                RTRIM(c.Estado) as EstadoCargo,
                d.Id as DetalleId, RTRIM(d.NroOrdenCompra) as NroOrdenCompra, RTRIM(d.TipoOc) as TipoOc,
                RTRIM(d.NroFactura) as NroFactura, RTRIM(d.Proveedor) as Proveedor, d.MontoOC, d.MontoFactura,
                RTRIM(d.EstadoContable) as EstadoContable,
                RTRIM(d.CodCiaOc) as CodCiaOc,
                f.Uuid as FacturaUuid,
                ISNULL((SELECT SUM(CanDes) FROM CmpROcom r WHERE RTRIM(r.NroDoc) = RTRIM(d.NroOrdenCompra) AND RTRIM(r.CodCia) = RTRIM(d.CodCiaOc)), 0) as cant_pedida,
                ISNULL((SELECT SUM(candes) FROM AlmRMovm a WHERE RTRIM(a.ordcmp) = RTRIM(d.NroOrdenCompra) AND RTRIM(a.CodCia) = RTRIM(d.CodCiaOc)), 0) as cant_recibida
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            OUTER APPLY (
                SELECT TOP 1 f2.Uuid
                FROM CntFacturaCab f2
                WHERE RTRIM(f2.NroOrdenCompra) = RTRIM(d.NroOrdenCompra)
                  AND RTRIM(f2.Serie) + '-' + RTRIM(f2.Numero) = RTRIM(d.NroFactura)
                  AND f2.Estado != 'Anulada'
            ) f
            WHERE RTRIM(c.CodCia) = ?
        \"\"\"
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
        results = []
        for r in cursor.fetchall():
            row = dict(zip(cols, r))
            if row['FechaCargo']: row['FechaCargo'] = row['FechaCargo'].strftime("%Y-%m-%d %H:%M")
            if row['FechaRecepcion']: row['FechaRecepcion'] = row['FechaRecepcion'].strftime("%Y-%m-%d %H:%M")
            # Estado Almacen
            pedida = float(row.get('cant_pedida') or 0)
            recibida = float(row.get('cant_recibida') or 0)
            if pedida == 0 and recibida == 0: row['EstadoAlmacen'] = 'SIN INGRESO'
            elif recibida >= pedida: row['EstadoAlmacen'] = 'COMPLETO'
            elif recibida > 0: row['EstadoAlmacen'] = 'PARCIAL'
            else: row['EstadoAlmacen'] = 'SIN INGRESO'
            results.append(row)
            
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()"""

new_detallado = """@router.get("/detallado/lista")
def get_cargos_detallado(
    codcia: str = Query(...),
    area_destino: str = Query(None),
    estado: str = Query(None)
):
    \"\"\"Obtener tabla plana (1 fila = 1 OC) cruzada con su Cargo Documental.\"\"\"
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de DB")
    try:
        cursor = conn.cursor()
        query = \"\"\"
            SELECT 
                c.Id as CargoId, RTRIM(c.NroCargo) as NroCargo, RTRIM(c.TipoCargo) as TipoCargo, 
                c.FechaCargo, c.FechaRecepcion, RTRIM(c.AreaOrigen) as AreaOrigen, RTRIM(c.AreaDestino) as AreaDestino, 
                RTRIM(c.Estado) as EstadoCargo,
                d.Id as DetalleId, RTRIM(d.NroOrdenCompra) as NroOrdenCompra, RTRIM(d.TipoOc) as TipoOc,
                RTRIM(d.NroFactura) as NroFactura, RTRIM(d.Proveedor) as Proveedor, d.MontoOC, d.MontoFactura,
                RTRIM(d.EstadoContable) as EstadoContable,
                RTRIM(d.CodCiaOc) as CodCiaOc
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            WHERE RTRIM(c.CodCia) = ?
        \"\"\"
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

        def chunked(lst, n):
            for i in range(0, len(lst), n):
                yield lst[i:i + n]

        nrodocs = list(set(r['NroOrdenCompra'].strip() for r in base_results if r.get('NroOrdenCompra')))
        CHUNK = 1000

        # ── MAPEOS POR LOTES ──
        factura_map = {}
        pedida_map = {}
        recibida_map = {}

        for chunk in chunked(nrodocs, CHUNK):
            ph = ",".join(["?"] * len(chunk))
            # Facturas
            try:
                cursor.execute(f\"\"\"
                    SELECT RTRIM(NroOrdenCompra), RTRIM(Serie)+'-'+RTRIM(Numero), RTRIM(Uuid)
                    FROM CntFacturaCab
                    WHERE RTRIM(NroOrdenCompra) IN ({ph}) AND Estado != 'Anulada'
                \"\"\", tuple(chunk))
                for row in cursor.fetchall():
                    factura_map[(row[0], row[1])] = row[2]
            except Exception as e:
                print(f"[WARN] Error factorias chunk: {e}")

            # CmpROcom (Cantidad Pedida)
            try:
                cursor.execute(f\"\"\"
                    SELECT RTRIM(NroDoc), SUM(CanDes)
                    FROM CmpROcom
                    WHERE NroDoc IN ({ph}) AND CodCia = ?
                    GROUP BY NroDoc
                \"\"\", tuple(chunk) + (codcia,))
                for row in cursor.fetchall():
                    pedida_map[row[0].strip()] = float(row[1] or 0)
            except Exception as e:
                print(f"[WARN] Error pedida chunk: {e}")

            # AlmRMovm (Cantidad Recibida)
            try:
                cursor.execute(f\"\"\"
                    SELECT RTRIM(ordcmp), SUM(candes)
                    FROM AlmRMovm WITH (INDEX(PK_AlmRmovm))
                    WHERE CodCia = ? AND ordcmp IN ({ph})
                    GROUP BY ordcmp
                \"\"\", (codcia,) + tuple(chunk))
                for row in cursor.fetchall():
                    recibida_map[row[0].strip()] = float(row[1] or 0)
            except Exception as e:
                print(f"[WARN] Error recibida chunk: {e}")

        # ── ENSAMBLAJE FINAL ──
        results = []
        for row in base_results:
            if row['FechaCargo'] and hasattr(row['FechaCargo'], 'strftime'):
                row['FechaCargo'] = row['FechaCargo'].strftime("%Y-%m-%d %H:%M")
            if row['FechaRecepcion'] and hasattr(row['FechaRecepcion'], 'strftime'):
                row['FechaRecepcion'] = row['FechaRecepcion'].strftime("%Y-%m-%d %H:%M")
            
            nro_oc = (row['NroOrdenCompra'] or '').strip()
            nro_fac = (row['NroFactura'] or '').strip()

            row['FacturaUuid'] = factura_map.get((nro_oc, nro_fac), None)
            pedida = pedida_map.get(nro_oc, 0.0)
            recibida = recibida_map.get(nro_oc, 0.0)

            if pedida == 0 and recibida == 0: row['EstadoAlmacen'] = 'SIN INGRESO'
            elif recibida >= pedida: row['EstadoAlmacen'] = 'COMPLETO'
            elif recibida > 0: row['EstadoAlmacen'] = 'PARCIAL'
            else: row['EstadoAlmacen'] = 'SIN INGRESO'
            results.append(row)
            
        return results
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()"""


# ── 2. Reemplazar get_pagos_pendientes ──
old_pagos = """@router.get("/pagos/pendientes")
def get_pagos_pendientes(codcia: str = Query(...)):
    \"\"\"Listar todas las OCs aceptadas en Tesorería que NO han sido pagadas.\"\"\"
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute(\"\"\"
            SELECT 
                d.Id as DetalleId,
                c.Id as CargoId,
                RTRIM(c.NroCargo) as NroCargo,
                c.FechaCargo,
                RTRIM(d.NroOrdenCompra) as NroOrdenCompra,
                RTRIM(d.TipoOc) as TipoOc,
                RTRIM(d.CodCiaOc) as CodCiaOc,
                RTRIM(d.NroFactura) as NroFactura,
                RTRIM(d.Proveedor) as Proveedor,
                RTRIM(d.RucProveedor) as RucProveedor,
                d.MontoOC,
                d.MontoFactura,
                RTRIM(d.EstadoContable) as EstadoContable,
                f.Uuid as FacturaUuid,
                o.Fchdoc as FechaOC,
                o.CodMon as Moneda
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            OUTER APPLY (
                SELECT TOP 1 f2.Uuid FROM CntFacturaCab f2
                WHERE RTRIM(f2.NroOrdenCompra) = RTRIM(d.NroOrdenCompra)
                  AND RTRIM(f2.Serie) + '-' + RTRIM(f2.Numero) = RTRIM(d.NroFactura)
                  AND f2.Estado != 'Anulada'
            ) f
            OUTER APPLY (
                SELECT TOP 1 o2.Fchdoc, o2.CodMon FROM CmpVOcom o2
                WHERE RTRIM(o2.NroDoc) = RTRIM(d.NroOrdenCompra)
                  AND RTRIM(o2.CodCia) = RTRIM(d.CodCiaOc)
                  AND RTRIM(o2.TipoOc) = RTRIM(d.TipoOc)
            ) o
            WHERE RTRIM(c.CodCia) = ?
              AND RTRIM(c.TipoCargo) = 'CONT_A_TES'
              AND c.Estado IN ('RECIBIDO', 'PENDIENTE')
              AND ISNULL(RTRIM(d.EstadoContable), 'PENDIENTE') NOT IN ('PAGADO', 'RECHAZADO')
            ORDER BY c.FechaCargo DESC
        \"\"\", (codcia.strip(),))
        cols = [col[0] for col in cursor.description]
        results = []
        for r in cursor.fetchall():
            row = dict(zip(cols, r))
            if row.get('FechaCargo') and hasattr(row['FechaCargo'], 'strftime'):
                row['FechaCargo'] = row['FechaCargo'].strftime("%Y-%m-%d %H:%M")
            if row.get('FechaOC') and hasattr(row['FechaOC'], 'strftime'):
                row['FechaOC'] = row['FechaOC'].strftime("%Y-%m-%d")
            results.append(row)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()"""


new_pagos = """@router.get("/pagos/pendientes")
def get_pagos_pendientes(codcia: str = Query(...)):
    \"\"\"Listar todas las OCs aceptadas en Tesorería que NO han sido pagadas.\"\"\"
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute(\"\"\"
            SELECT 
                d.Id as DetalleId,
                c.Id as CargoId,
                RTRIM(c.NroCargo) as NroCargo,
                c.FechaCargo,
                RTRIM(d.NroOrdenCompra) as NroOrdenCompra,
                RTRIM(d.TipoOc) as TipoOc,
                RTRIM(d.CodCiaOc) as CodCiaOc,
                RTRIM(d.NroFactura) as NroFactura,
                RTRIM(d.Proveedor) as Proveedor,
                RTRIM(d.RucProveedor) as RucProveedor,
                d.MontoOC,
                d.MontoFactura,
                RTRIM(d.EstadoContable) as EstadoContable
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            WHERE RTRIM(c.CodCia) = ?
              AND RTRIM(c.TipoCargo) = 'CONT_A_TES'
              AND c.Estado IN ('RECIBIDO', 'PENDIENTE')
              AND ISNULL(RTRIM(d.EstadoContable), 'PENDIENTE') NOT IN ('PAGADO', 'RECHAZADO')
            ORDER BY c.FechaCargo DESC
        \"\"\", (codcia.strip(),))
        cols = [col[0] for col in cursor.description]
        base_results = [dict(zip(cols, r)) for r in cursor.fetchall()]

        if not base_results:
            return []

        def chunked(lst, n):
            for i in range(0, len(lst), n):
                yield lst[i:i + n]

        nrodocs = list(set(r['NroOrdenCompra'].strip() for r in base_results if r.get('NroOrdenCompra')))
        CHUNK = 1000

        factura_map = {}
        ocom_map = {}

        for chunk in chunked(nrodocs, CHUNK):
            ph = ",".join(["?"] * len(chunk))
            try:
                cursor.execute(f\"\"\"
                    SELECT RTRIM(NroOrdenCompra), RTRIM(Serie)+'-'+RTRIM(Numero), RTRIM(Uuid)
                    FROM CntFacturaCab
                    WHERE RTRIM(NroOrdenCompra) IN ({ph}) AND Estado != 'Anulada'
                \"\"\", tuple(chunk))
                for row in cursor.fetchall():
                    factura_map[(row[0], row[1])] = row[2]
            except:
                pass
            
            try:
                cursor.execute(f\"\"\"
                    SELECT RTRIM(NroDoc), Fchdoc, RTRIM(CodMon)
                    FROM CmpVOcom
                    WHERE RTRIM(NroDoc) IN ({ph})
                \"\"\", tuple(chunk))
                for row in cursor.fetchall():
                    ocom_map[row[0].strip()] = {'Fchdoc': row[1], 'CodMon': row[2]}
            except:
                pass

        results = []
        for r in base_results:
            if r.get('FechaCargo') and hasattr(r['FechaCargo'], 'strftime'):
                r['FechaCargo'] = r['FechaCargo'].strftime("%Y-%m-%d %H:%M")
                
            nro_oc = (r.get('NroOrdenCompra') or '').strip()
            nro_fac = (r.get('NroFactura') or '').strip()
            
            r['FacturaUuid'] = factura_map.get((nro_oc, nro_fac), None)
            
            ocom_data = ocom_map.get(nro_oc, {})
            fchdoc = ocom_data.get('Fchdoc')
            if fchdoc and hasattr(fchdoc, 'strftime'):
                r['FechaOC'] = fchdoc.strftime("%Y-%m-%d")
            else:
                r['FechaOC'] = None
            r['Moneda'] = ocom_data.get('CodMon', None)
                
            results.append(r)
            
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()"""


content = content.replace(old_detallado, new_detallado)
content = content.replace(old_pagos, new_pagos)

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Actualizado!")
