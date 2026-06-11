import re

with open('C:/SistemaGestionyelave/backend/cuentas_cobrar.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_filter_logic = """        allowed_vendedores = []
        allowed_tiendas = []
        if not puede_ver_todo:
            placeholders_cias_user = ",".join("?" for _ in codcias)
            
            # Vendedores permitidos
            cursor.execute(
                f"SELECT RTRIM(codven) FROM WebUserVendors WHERE RTRIM(login) = ? AND RTRIM(codcia) IN ({placeholders_cias_user})",
                (login.strip(), *codcias)
            )
            allowed_vendedores = [r[0].strip() for r in cursor.fetchall()]
            
            # Tiendas permitidas
            cursor.execute(
                f"SELECT RTRIM(codsol) FROM WebUserTiendas WHERE RTRIM(login) = ? AND RTRIM(codcia) IN ({placeholders_cias_user})",
                (login.strip(), *codcias)
            )
            allowed_tiendas = [r[0].strip() for r in cursor.fetchall()]

            if not allowed_vendedores and not allowed_tiendas:
                # Si el usuario restringido no tiene asignado ni vendedor ni tienda
                return {
                    "empresa": {
                        "codcia": codcia,
                        "nomcia": "Sin Acceso",
                        "empresas": []
                    },
                    "fecha_inicio": fecha_inicio,
                    "fecha_fin": fecha_fin,
                    "total_registros": 0,
                    "data": [],
                }

        # Parsear vendedores seleccionados en el filtro
        req_vendedores = []
        if vendedor:
            req_vendedores = [v.strip() for v in vendedor.split(",") if v.strip()]

        apply_vendor_filter = False
        apply_tienda_filter = False
        filter_vendedores = []
        filter_tiendas = []

        if not puede_ver_todo:
            if allowed_vendedores:
                apply_vendor_filter = True
                if req_vendedores:
                    filter_vendedores = list(set(req_vendedores) & set(allowed_vendedores))
                    if not filter_vendedores: filter_vendedores = ["__NONE__"]
                else:
                    filter_vendedores = allowed_vendedores
            elif allowed_tiendas:
                # Si no tiene vendedores pero si tiendas
                apply_tienda_filter = True
                filter_tiendas = allowed_tiendas
        else:
            if req_vendedores:
                apply_vendor_filter = True
                filter_vendedores = req_vendedores

        # Construir cláusula de filtro por vendedor y tienda
        vendor_filter_clause = ""
        tienda_filter_clause_b = ""
        tienda_filter_clause_c = ""
        
        if apply_vendor_filter:
            placeholders_vendedores = ",".join("?" for _ in filter_vendedores)
            vendor_filter_clause = f"AND RTRIM(A.codven) IN ({placeholders_vendedores})"
            
        if apply_tienda_filter:
            placeholders_tiendas = ",".join("?" for _ in filter_tiendas)
            tienda_filter_clause_b = f"AND RTRIM(B.codsol) IN ({placeholders_tiendas})"
            tienda_filter_clause_c = f"AND RTRIM(C.codsol) IN ({placeholders_tiendas})" """

old_filter_logic = """        allowed_vendedores = []
        if not puede_ver_todo:
            # Traer códigos de vendedor permitidos para este usuario en las empresas seleccionadas
            placeholders_cias_user = ",".join("?" for _ in codcias)
            cursor.execute(
                f"SELECT RTRIM(codven) FROM WebUserVendors WHERE RTRIM(login) = ? AND RTRIM(codcia) IN ({placeholders_cias_user})",
                (login.strip(), *codcias)
            )
            allowed_vendedores = [r[0].strip() for r in cursor.fetchall()]
            if not allowed_vendedores:
                # Si el usuario restringido no tiene vendedores asignados, retornar vacío de inmediato
                return {
                    "empresa": {
                        "codcia": codcia,
                        "nomcia": "Sin Acceso",
                        "empresas": []
                    },
                    "fecha_inicio": fecha_inicio,
                    "fecha_fin": fecha_fin,
                    "total_registros": 0,
                    "data": [],
                }

        # Parsear vendedores seleccionados en el filtro
        req_vendedores = []
        if vendedor:
            req_vendedores = [v.strip() for v in vendedor.split(",") if v.strip()]

        # Determinar qué vendedores se filtrarán en la BD
        filter_vendedores = []
        apply_vendor_filter = False

        if not puede_ver_todo:
            apply_vendor_filter = True
            if req_vendedores:
                # Intersectar solicitados con permitidos
                filter_vendedores = list(set(req_vendedores) & set(allowed_vendedores))
                if not filter_vendedores:
                    # Forzar a no devolver nada
                    filter_vendedores = ["__NONE__"]
            else:
                filter_vendedores = allowed_vendedores
        else:
            if req_vendedores:
                apply_vendor_filter = True
                filter_vendedores = req_vendedores

        # Construir cláusula de filtro por vendedor
        vendor_filter_clause = ""
        if apply_vendor_filter:
            placeholders_vendedores = ",".join("?" for _ in filter_vendedores)
            vendor_filter_clause = f"AND RTRIM(A.codven) IN ({placeholders_vendedores})\""""

content = content.replace(old_filter_logic, new_filter_logic)

content = content.replace("B.NomSol AS nomsol,", "B.NomSol AS nomsol, B.codsol AS codsol_col,")
content = content.replace("'' AS nomsol,", "'' AS nomsol, '' AS codsol_col,")
content = content.replace("ISNULL(C.NomSol, '') AS nomsol,", "ISNULL(C.NomSol, '') AS nomsol, ISNULL(C.codsol, '') AS codsol_col,")

content = content.replace("{vendor_filter_clause}", "{vendor_filter_clause} {tienda_filter_clause_b}", 1)

union2_search = """              AND A.sdodoc > 0
              {vendor_filter_clause}

            UNION ALL"""

union2_replace = """              AND A.sdodoc > 0
              {vendor_filter_clause}
              {'' if not apply_tienda_filter else 'AND 1=0'}

            UNION ALL"""

content = content.replace(union2_search, union2_replace, 1)

union3_search = """              AND A.sdodoc > 0
              {vendor_filter_clause}
        ) c"""

union3_replace = """              AND A.sdodoc > 0
              {vendor_filter_clause}
              {tienda_filter_clause_c}
        ) c"""
        
content = content.replace(union3_search, union3_replace, 1)

# we need to append the param for Tienda Rendición filter if needed
# The parameters logic is currently:
#         params = []
#         for _ in range(3):
#             params.extend(codcias)
#             params.extend([fecha_inicio, fecha_fin])
#             if apply_vendor_filter:
#                 params.extend(filter_vendedores)

params_logic_old = """        # Parametros de fecha y vendedor intercalados con los placeholders
        params = []
        for _ in range(3):
            params.extend(codcias)
            params.extend([fecha_inicio, fecha_fin])
            if apply_vendor_filter:
                params.extend(filter_vendedores)"""

params_logic_new = """        # Parametros de fecha y vendedor intercalados con los placeholders
        params = []
        # UNION 1 params
        params.extend(codcias)
        params.extend([fecha_inicio, fecha_fin])
        if apply_vendor_filter: params.extend(filter_vendedores)
        if apply_tienda_filter: params.extend(filter_tiendas)
        
        # UNION 2 params
        params.extend(codcias)
        params.extend([fecha_inicio, fecha_fin])
        if apply_vendor_filter: params.extend(filter_vendedores)
        # no tienda filter applied here (using 1=0)
        
        # UNION 3 params
        params.extend(codcias)
        params.extend([fecha_inicio, fecha_fin])
        if apply_vendor_filter: params.extend(filter_vendedores)
        if apply_tienda_filter: params.extend(filter_tiendas)"""
        
content = content.replace(params_logic_old, params_logic_new)

# Also adding codsol_col to row response
content = content.replace('row["tienda"] = g.get("tienda", "")', 'row["tienda"] = g.get("tienda", "")\n            row["codsol"] = row.get("codsol_col", "").strip()')

with open('C:/SistemaGestionyelave/backend/cuentas_cobrar.py', 'w', encoding='utf-8') as f:
    f.write(content)
