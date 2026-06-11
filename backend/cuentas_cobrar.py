"""
Módulo de Cuentas por Cobrar — Reportes de Saldos Pendientes
Migración de reporte FoxPro "Saldos por Cobrar" a web.
Soporta filtros por empresa/fecha, agrupación dinámica,
y datos agregados para gráficos.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/api/cuentas-cobrar", tags=["Cuentas por Cobrar"])

from database import get_db_connection
from auth import get_current_user



def _row_to_dict(cursor, row):
    """Convert a pyodbc row to a dict, trimming strings and formatting dates."""
    columns = [col[0] for col in cursor.description]
    result = {}
    for col, val in zip(columns, row):
        if isinstance(val, datetime):
            result[col] = val.strftime("%Y-%m-%d")
        elif val is None:
            result[col] = None
        elif isinstance(val, str):
            result[col] = val.strip()
        else:
            result[col] = val
    return result


# ─── Endpoints ────────────────────────────────────────────────────

@router.get("/empresas")
def get_empresas():
    """Lista las empresas registradas en AdmMcias."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT codcia, nomcia, ruccia FROM AdmMcias ORDER BY codcia"
        )
        return [_row_to_dict(cursor, r) for r in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/vendedores")
def get_vendedores(codcia: str = Query(...), current_user: dict = Depends(get_current_user)):
    """
    Lista los vendedores permitidos para el usuario actual en las empresas especificadas.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        login = current_user["login"]
        
        # Split codcia
        codcias = [c.strip() for c in codcia.split(",") if c.strip()]
        if not codcias:
            return []
            
        placeholders = ",".join("?" for _ in codcias)
        
        # 1. Verificar si el usuario PuedeVerTodo
        login = current_user.get("login", "")
        rol = current_user.get("rol", "USER")
        cursor.execute("SELECT rol, ISNULL(PuedeVerTodo, 0) FROM WebUsers WHERE login = ?", (login,))
        row = cursor.fetchone()
        db_rol = row[0].strip() if row and row[0] else rol
        db_puede_ver_todo = row[1] if row else False
        
        is_admin = login.strip().upper() == "71941916JL" or db_rol.upper() == "ADMIN"
        puede_ver_todo = is_admin or db_puede_ver_todo
        
        if puede_ver_todo:
            # Traer todos los vendedores de las empresas
            cursor.execute(
                f"SELECT RTRIM(codcia) as codcia, RTRIM(codigo) AS codigo, RTRIM(nombre) AS nombre FROM VtaTabla WHERE RTRIM(codcia) IN ({placeholders}) AND RTRIM(tabla) = '0009' ORDER BY codcia, codigo",
                codcias
            )
            vendedores = [{"codcia": r[0], "codigo": f"V_{r[1]}", "nombre": f"[Vendedor] {r[2]}"} for r in cursor.fetchall()]
            
            # Traer todas las tiendas
            cursor.execute(
                f"SELECT RTRIM(codcia) as codcia, RTRIM(codigo) AS codigo, RTRIM(nombre) AS nombre FROM VtaTabla WHERE RTRIM(codcia) IN ({placeholders}) AND RTRIM(tabla) = 'CLIE' ORDER BY codcia, codigo",
                codcias
            )
            tiendas = [{"codcia": r[0], "codigo": f"T_{r[1]}", "nombre": f"[Tienda] {r[2]}"} for r in cursor.fetchall()]
            vendedores.extend(tiendas)
        else:
            # Traer vendedores asignados
            cursor.execute(
                f"SELECT RTRIM(codven) FROM WebUserVendors WHERE RTRIM(login) = ? AND RTRIM(codcia) IN ({placeholders})",
                (login.strip(), *codcias)
            )
            allowed_vendedores = [r[0].strip() for r in cursor.fetchall()]
            
            # Traer tiendas asignadas
            cursor.execute(
                f"SELECT RTRIM(codsol) FROM WebUserTiendas WHERE RTRIM(login) = ? AND RTRIM(codcia) IN ({placeholders})",
                (login.strip(), *codcias)
            )
            allowed_tiendas = [r[0].strip() for r in cursor.fetchall()]
            
            # Auto-traducir códigos de vendedor Yxx a códigos de tienda 0xx
            for v in list(allowed_vendedores):
                if v.startswith("Y") and len(v) == 3:
                    allowed_tiendas.append("0" + v[1:])
            
            vendedores = []
            tiendas = []
            
            if allowed_vendedores:
                placeholders_v = ",".join("?" for _ in allowed_vendedores)
                cursor.execute(
                    f"SELECT RTRIM(codcia) as codcia, RTRIM(codigo) AS codigo, RTRIM(nombre) AS nombre FROM VtaTabla WHERE RTRIM(codcia) IN ({placeholders}) AND RTRIM(tabla) = '0009' AND RTRIM(codigo) IN ({placeholders_v}) ORDER BY codcia, codigo",
                    (*codcias, *allowed_vendedores)
                )
                vendedores = [{"codcia": r[0], "codigo": f"V_{r[1]}", "nombre": f"[Vendedor] {r[2]}"} for r in cursor.fetchall()]
                
            if allowed_tiendas:
                placeholders_t = ",".join("?" for _ in allowed_tiendas)
                cursor.execute(
                    f"SELECT RTRIM(codcia) as codcia, RTRIM(codigo) AS codigo, RTRIM(nombre) AS nombre FROM VtaTabla WHERE RTRIM(codcia) IN ({placeholders}) AND RTRIM(tabla) = 'CLIE' AND RTRIM(codigo) IN ({placeholders_t}) ORDER BY codcia, codigo",
                    (*codcias, *allowed_tiendas)
                )
                tiendas = [{"codcia": r[0], "codigo": f"T_{r[1]}", "nombre": f"[Tienda] {r[2]}"} for r in cursor.fetchall()]
                
            vendedores.extend(tiendas)
            
        return vendedores
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/report")
def get_report(
    codcia: str = Query(..., description="Códigos de empresa (separados por coma, ej: 001,002)"),
    fecha_inicio: str = Query(..., description="Fecha inicio YYYY-MM-DD"),
    fecha_fin: str = Query(..., description="Fecha fin YYYY-MM-DD"),
    vendedor: Optional[str] = Query(None, description="Filtros por código de vendedor (separados por coma)"),
    current_user: dict = Depends(get_current_user),
):
    """
    Reporte principal de Saldos por Cobrar.
    Soporta multiempresa mediante un string separado por comas.
    Enriquece con VND_GRUPO para tienda/grupo.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    try:
        cursor = conn.cursor()
        
        # Procesar lista de empresas
        codcias = [c.strip() for c in codcia.split(",") if c.strip()]
        if not codcias:
            raise HTTPException(status_code=400, detail="Debe especificar al menos una empresa.")
            
        placeholders = ",".join("?" for _ in codcias)

        # ── Verificar visibilidad del usuario ──
        login = current_user["login"]
        rol = current_user.get("rol", "USER")
        cursor.execute("SELECT rol, ISNULL(PuedeVerTodo, 0) FROM WebUsers WHERE login = ?", (login,))
        row = cursor.fetchone()
        db_rol = row[0].strip() if row and row[0] else rol
        db_puede_ver_todo = row[1] if row else False
        
        is_admin = login.strip().upper() == "71941916JL" or db_rol.upper() == "ADMIN"
        puede_ver_todo = is_admin or db_puede_ver_todo

        allowed_vendedores = []
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

            # Auto-traducir códigos de vendedor Yxx a códigos de tienda 0xx
            for v in list(allowed_vendedores):
                if v.startswith("Y") and len(v) == 3:
                    allowed_tiendas.append("0" + v[1:])
                    allowed_vendedores.remove(v)

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
        req_tiendas = []
        if vendedor:
            for v in vendedor.split(","):
                v = v.strip()
                if v.startswith("V_"):
                    code = v[2:]
                    if code.startswith("Y") and len(code) == 3:
                        req_tiendas.append("0" + code[1:])
                    else:
                        req_vendedores.append(code)
                elif v.startswith("T_"):
                    req_tiendas.append(v[2:])
                elif v:
                    if v.startswith("Y") and len(v) == 3:
                        req_tiendas.append("0" + v[1:])
                    else:
                        req_vendedores.append(v)

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
                if req_tiendas:
                    filter_tiendas = list(set(req_tiendas) & set(allowed_tiendas))
                    if not filter_tiendas: filter_tiendas = ["__NONE__"]
                else:
                    filter_tiendas = allowed_tiendas
        else:
            if req_vendedores:
                apply_vendor_filter = True
                filter_vendedores = req_vendedores
            if req_tiendas:
                apply_tienda_filter = True
                filter_tiendas = req_tiendas

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
            tienda_filter_clause_c = f"AND RTRIM(C.codsol) IN ({placeholders_tiendas})" 

        # ── Main UNION query (replica FoxPro logic) ──
        query = f"""
        SELECT c.codcia, c.fchdoc, c.coddoc, c.serie, c.nrodoc, c.codaux, c.nomaux,
               CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -1 ELSE 1 END * 
                 (CASE WHEN c.CODMON = 1 THEN c.imptot ELSE c.imptot * c.TPOCMB END) AS imptot,
               CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -1 ELSE 1 END * 
                 (CASE WHEN c.CODMON = 1 THEN c.acta  ELSE (c.imptot * c.TPOCMB) - (c.saldo * c.TPOCMB) END) AS acta,
               CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -1 ELSE 1 END * 
                 (CASE WHEN c.CODMON = 1 THEN c.saldo ELSE c.saldo * c.TPOCMB END) AS saldo,
               CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -c.imptot ELSE c.imptot END AS imptot_orig,
               CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -c.acta ELSE c.acta END AS acta_orig,
               CASE WHEN RTRIM(c.coddoc) IN ('N/A', 'N/C', 'N/CR') THEN -c.saldo ELSE c.saldo END AS saldo_orig,
               c.nomven, c.nompgo, c.nomsol, c.CODMON, c.TPOCMB
        FROM (
            -- UNION 1: Documents with matching VtaVPedi (NomSol not null)
            SELECT A.codcia, A.coddoc,
                   LEFT(A.nrodoc, 3) AS serie,
                   A.nrodoc,
                   A.fchdoc,
                   A.codaux,
                   A.nomaux,
                   A.imptoT AS imptot,
                   A.imptot - A.sdodoc AS acta,
                   A.sdodoc AS saldo,
                   A.nomven,
                   A.nompgo,
                   B.NomSol AS nomsol, B.codsol AS codsol_col,
                   A.CODMON,
                   A.TPOCMB
            FROM CcbRGdoc A
            LEFT OUTER JOIN VtaVPedi B
                ON A.NROPED = B.NRODOC
               AND A.codcia = B.codcia
               AND LEFT(A.nrodoc, 3) = B.ptovta
               AND A.codaux = B.codaux
            WHERE A.codcia IN ({placeholders})
              AND NOT (B.NomSol IS NULL)
              AND RTRIM(A.coddoc) IN ('FACT', 'BOLE', 'N/A', 'N/C', 'N/CR')
              AND A.fchdoc >= CONVERT(datetime, ?, 120)
              AND A.fchdoc <= CONVERT(datetime, ?, 120)
              AND A.flgest <> 'E'
              AND A.sdodoc > 0
              {vendor_filter_clause} {tienda_filter_clause_b}

            UNION ALL

            -- UNION 2: Documents without VtaVPedi match and no NROREF
            SELECT A.codcia, A.coddoc,
                   LEFT(A.nrodoc, 3) AS serie,
                   A.nrodoc,
                   A.fchdoc,
                   A.codaux,
                   A.nomaux,
                   A.imptoT AS imptot,
                   A.imptot - A.sdodoc AS acta,
                   A.sdodoc AS saldo,
                   A.nomven,
                   A.nompgo,
                   '' AS nomsol, '' AS codsol_col,
                   A.CODMON,
                   A.TPOCMB
            FROM CcbRGdoc A
            LEFT OUTER JOIN VtaVPedi B
                ON A.NROPED = B.NRODOC
               AND A.codcia = B.codcia
               AND LEFT(A.nrodoc, 3) = B.ptovta
               AND A.codaux = B.codaux
            WHERE A.codcia IN ({placeholders})
              AND (B.NomSol IS NULL)
              AND RTRIM(A.coddoc) IN ('FACT', 'BOLE', 'N/A', 'N/C', 'N/CR')
              AND (A.nroref = '' OR A.nroref IS NULL)
              AND A.fchdoc >= CONVERT(datetime, ?, 120)
              AND A.fchdoc <= CONVERT(datetime, ?, 120)
              AND A.flgest <> 'E'
              AND A.sdodoc > 0
              {vendor_filter_clause}
              {'' if not apply_tienda_filter else 'AND 1=0'}

            UNION ALL

            -- UNION 3: Documents with NROREF via VtaVGuia -> VtaVPedi
            SELECT A.codcia, A.coddoc,
                   LEFT(A.nrodoc, 3) AS serie,
                   A.nrodoc,
                   A.fchdoc,
                   A.codaux,
                   A.nomaux,
                   A.imptot,
                   A.imptot - A.sdodoc AS acta,
                   A.sdodoc AS saldo,
                   A.nomven,
                   A.nompgo,
                   ISNULL(C.NomSol, '') AS nomsol, ISNULL(C.codsol, '') AS codsol_col,
                   A.CODMON,
                   A.TPOCMB
            FROM CcbRGdoc A
            LEFT OUTER JOIN VtaVGuia B
                ON A.nroref = B.NRODOC
               AND A.codcia = B.codcia
               AND A.codaux = B.codaux
            LEFT OUTER JOIN VtaVPedi C
                ON B.nroped = C.nrodoc
               AND B.codcia = C.codcia
               AND B.ptovta = C.ptovta
               AND B.codaux = C.codaux
            WHERE A.codcia IN ({placeholders})
              AND A.nroref <> ''
              AND RTRIM(A.coddoc) IN ('FACT', 'BOLE', 'N/A', 'N/C', 'N/CR')
              AND A.fchdoc >= CONVERT(datetime, ?, 120)
              AND A.fchdoc <= CONVERT(datetime, ?, 120)
              AND A.flgest <> 'E'
              AND A.sdodoc > 0
              {vendor_filter_clause}
              {tienda_filter_clause_c}
        ) c
        WHERE c.saldo > 0
        ORDER BY c.codcia, c.coddoc, c.serie, c.nrodoc, c.fchdoc
        """

        # Parametros de fecha y vendedor intercalados con los placeholders
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
        if apply_tienda_filter: params.extend(filter_tiendas)

        cursor.execute(query, params)
        rows = [_row_to_dict(cursor, r) for r in cursor.fetchall()]

        # ── Enrich with VND_GRUPO data ──
        cursor.execute("SELECT nomven, nomgru, TIENDA FROM VND_GRUPO")
        grupo_map = {}
        for r in cursor.fetchall():
            key = (r[0] or "").strip()
            grupo_map[key] = {
                "nomgru": (r[1] or "").strip(),
                "tienda": (r[2] or "").strip(),
            }

        # ── Get empresa names for all requested codcias ──
        cursor.execute(
            f"SELECT codcia, nomcia, ruccia FROM AdmMcias WHERE codcia IN ({placeholders})",
            codcias,
        )
        emp_rows = cursor.fetchall()
        
        empresa_text = "Varias Empresas"
        if len(emp_rows) == 1:
            empresa_text = (emp_rows[0][1] or "").strip()
        elif len(emp_rows) > 1:
            empresa_text = f"Múltiples Empresas ({len(emp_rows)})"

        empresa_info = {
            "codcia": codcia, # String con las solicitadas originarias
            "nomcia": empresa_text,
            "empresas": [{"codcia": (e[0] or "").strip(), "nomcia": (e[1] or "").strip(), "ruccia": (e[2] or "").strip()} for e in emp_rows]
        }

        for row in rows:
            vendedor = row.get("nomven", "") or ""
            g = grupo_map.get(vendedor, {})
            row["nomgru"] = g.get("nomgru", "")
            row["tienda"] = g.get("tienda", "")
            codsol = row.get("codsol_col", "").strip()
            row["codsol"] = codsol
            nomsol = row.get("nomsol", "")
            if nomsol and isinstance(nomsol, str):
                nomsol = nomsol.strip()
                if nomsol and codsol:
                    row["nomsol"] = f"{codsol} - {nomsol}"
            
            # Round monetary values
            for field in ("imptot", "acta", "saldo", "imptot_orig", "acta_orig", "saldo_orig"):
                if row.get(field) is not None:
                    row[field] = round(float(row[field]), 2)

        return {
            "empresa": empresa_info,
            "fecha_inicio": fecha_inicio,
            "fecha_fin": fecha_fin,
            "total_registros": len(rows),
            "data": rows,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/summary")
def get_summary(
    codcia: str = Query(...),
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    vendedor: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Datos agregados para KPIs y gráficos.
    Re-usa la query del reporte principal y agrega en Python.
    """
    # Re-use report endpoint for data
    report = get_report(codcia, fecha_inicio, fecha_fin, vendedor, current_user)
    data = report["data"]

    if not data:
        return {
            "total_saldo": 0,
            "total_importe": 0,
            "total_acta": 0,
            "total_docs": 0,
            "by_vendedor": [],
            "by_forma_pago": [],
            "by_tienda": [],
            "by_tipo_doc": [],
            "top_clientes": [],
            "by_mes": [],
        }

    total_saldo = sum(r.get("saldo", 0) or 0 for r in data)
    total_importe = sum(r.get("imptot", 0) or 0 for r in data)
    total_acta = sum(r.get("acta", 0) or 0 for r in data)

    # ── Currency breakdown ──
    # CODMON = 1 -> PEN, else -> USD
    # imptot/acta/saldo = converted to PEN; imptot_orig/acta_orig/saldo_orig = original currency
    saldo_pen = 0
    saldo_usd = 0  # Original USD amounts from DB
    importe_pen = 0
    importe_usd = 0
    acta_pen = 0
    acta_usd = 0
    docs_pen = 0
    docs_usd = 0
    for r in data:
        codmon = r.get("CODMON", 1) or 1
        if codmon == 1:
            saldo_pen += r.get("saldo", 0) or 0
            importe_pen += r.get("imptot", 0) or 0
            acta_pen += r.get("acta", 0) or 0
            docs_pen += 1
        else:
            # Use original amounts directly (no division)
            saldo_usd += r.get("saldo_orig", 0) or 0
            importe_usd += r.get("imptot_orig", 0) or 0
            acta_usd += r.get("acta_orig", 0) or 0
            docs_usd += 1

    # ── Group helpers ──
    def group_sum(key_field):
        groups = {}
        for r in data:
            k = r.get(key_field, "") or "(Sin datos)"
            k = k.strip() or "(Sin datos)"
            if k not in groups:
                groups[k] = {"label": k, "saldo": 0, "importe": 0, "count": 0,
                             "saldo_pen": 0, "saldo_usd": 0, "importe_pen": 0, "importe_usd": 0}
            codmon = r.get("CODMON", 1) or 1
            groups[k]["saldo"] += r.get("saldo", 0) or 0
            groups[k]["importe"] += r.get("imptot", 0) or 0
            groups[k]["count"] += 1
            if codmon == 1:
                groups[k]["saldo_pen"] += r.get("saldo", 0) or 0
                groups[k]["importe_pen"] += r.get("imptot", 0) or 0
            else:
                groups[k]["saldo_usd"] += r.get("saldo_orig", 0) or 0
                groups[k]["importe_usd"] += r.get("imptot_orig", 0) or 0
        result = sorted(groups.values(), key=lambda x: -x["saldo"])
        for g in result:
            g["saldo"] = round(g["saldo"], 2)
            g["importe"] = round(g["importe"], 2)
            g["saldo_pen"] = round(g["saldo_pen"], 2)
            g["saldo_usd"] = round(g["saldo_usd"], 2)
            g["importe_pen"] = round(g["importe_pen"], 2)
            g["importe_usd"] = round(g["importe_usd"], 2)
        return result

    by_vendedor = group_sum("nomven")
    by_forma_pago = group_sum("nompgo")
    by_tienda = group_sum("tienda")
    by_tipo_doc = group_sum("coddoc")

    # Top clientes
    clients = {}
    for r in data:
        k = r.get("codaux", "")
        name = r.get("nomaux", "")
        if k not in clients:
            clients[k] = {"codaux": k, "nomaux": name, "saldo": 0, "count": 0,
                          "saldo_pen": 0, "saldo_usd": 0}
        codmon = r.get("CODMON", 1) or 1
        clients[k]["saldo"] += r.get("saldo", 0) or 0
        clients[k]["count"] += 1
        if codmon == 1:
            clients[k]["saldo_pen"] += r.get("saldo", 0) or 0
        else:
            clients[k]["saldo_usd"] += r.get("saldo_orig", 0) or 0
    top_clientes = sorted(clients.values(), key=lambda x: -x["saldo"])[:15]
    for c in top_clientes:
        c["saldo"] = round(c["saldo"], 2)
        c["saldo_pen"] = round(c["saldo_pen"], 2)
        c["saldo_usd"] = round(c["saldo_usd"], 2)

    # By month
    months = {}
    for r in data:
        fch = r.get("fchdoc", "")
        if fch and len(fch) >= 7:
            mes = fch[:7]  # YYYY-MM
        else:
            mes = "Sin fecha"
        if mes not in months:
            months[mes] = {"mes": mes, "saldo": 0, "count": 0,
                           "saldo_pen": 0, "saldo_usd": 0}
        codmon = r.get("CODMON", 1) or 1
        months[mes]["saldo"] += r.get("saldo", 0) or 0
        months[mes]["count"] += 1
        if codmon == 1:
            months[mes]["saldo_pen"] += r.get("saldo", 0) or 0
        else:
            months[mes]["saldo_usd"] += r.get("saldo_orig", 0) or 0
    by_mes = sorted(months.values(), key=lambda x: x["mes"])
    for m in by_mes:
        m["saldo"] = round(m["saldo"], 2)
        m["saldo_pen"] = round(m["saldo_pen"], 2)
        m["saldo_usd"] = round(m["saldo_usd"], 2)

    return {
        "total_saldo": round(total_saldo, 2),
        "total_importe": round(total_importe, 2),
        "total_acta": round(total_acta, 2),
        "total_docs": len(data),
        # Multi-currency breakdown
        "saldo_pen": round(saldo_pen, 2),
        "saldo_usd": round(saldo_usd, 2),
        "importe_pen": round(importe_pen, 2),
        "importe_usd": round(importe_usd, 2),
        "acta_pen": round(acta_pen, 2),
        "acta_usd": round(acta_usd, 2),
        "docs_pen": docs_pen,
        "docs_usd": docs_usd,
        # Grouped data
        "by_vendedor": by_vendedor,
        "by_forma_pago": by_forma_pago,
        "by_tienda": by_tienda,
        "by_tipo_doc": by_tipo_doc,
        "top_clientes": top_clientes,
        "by_mes": by_mes,
    }

