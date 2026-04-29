"""
YELAVE ERP — Sistema de Permisos y Roles Dinámico
Tablas: WebModulos, WebPermisos, WebUsuarioEmpresa, WebRoles
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_connection
from auth import get_current_user, get_current_active_admin

router = APIRouter(prefix="/api", tags=["Permisos"])

# ══════════════════════════════════════════════════════
#  SETUP: Crear tablas si no existen
# ══════════════════════════════════════════════════════

def setup_permisos_tables():
    """Crea las tablas de permisos si no existen."""
    conn = get_db_connection()
    if not conn:
        print("⚠ No se pudo conectar a BD para crear tablas de permisos")
        return
    try:
        cursor = conn.cursor()

        # Tabla de roles dinámicos
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WebRoles' AND xtype='U')
            CREATE TABLE WebRoles (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                Codigo VARCHAR(50) UNIQUE NOT NULL,
                Nombre VARCHAR(100) NOT NULL,
                Descripcion VARCHAR(255),
                Activo BIT DEFAULT 1,
                CreadoEn DATETIME DEFAULT GETDATE()
            )
        """)
        conn.commit()

        # Tabla de módulos
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WebModulos' AND xtype='U')
            BEGIN
                CREATE TABLE WebModulos (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Codigo VARCHAR(50) UNIQUE NOT NULL,
                    Nombre VARCHAR(100) NOT NULL,
                    RutaHtml VARCHAR(200),
                    Seccion VARCHAR(50),
                    Icono TEXT,
                    Orden INT DEFAULT 0,
                    Activo BIT DEFAULT 1,
                    ParentId INT NULL,
                    CONSTRAINT FK_Modulos_Parent FOREIGN KEY (ParentId) REFERENCES WebModulos(Id)
                )
            END
            ELSE
            BEGIN
                -- Migración: Agregar ParentId si no existe
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('WebModulos') AND name = 'ParentId')
                BEGIN
                    ALTER TABLE WebModulos ADD ParentId INT NULL;
                    ALTER TABLE WebModulos ADD CONSTRAINT FK_Modulos_Parent FOREIGN KEY (ParentId) REFERENCES WebModulos(Id);
                END
            END
        """)
        conn.commit()

        # Tabla de permisos por rol y módulo
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WebPermisos' AND xtype='U')
            CREATE TABLE WebPermisos (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                Rol VARCHAR(50) NOT NULL,
                ModuloId INT NOT NULL,
                PuedeVer BIT DEFAULT 0,
                PuedeEditar BIT DEFAULT 0,
                PuedeEliminar BIT DEFAULT 0,
                PuedeAprobar BIT DEFAULT 0,
                CONSTRAINT FK_Permisos_Modulo FOREIGN KEY (ModuloId) REFERENCES WebModulos(Id),
                CONSTRAINT UQ_Rol_Modulo UNIQUE (Rol, ModuloId)
            )
        """)
        conn.commit()

        # Tabla de empresas por usuario
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WebUsuarioEmpresa' AND xtype='U')
            CREATE TABLE WebUsuarioEmpresa (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                Login VARCHAR(50) NOT NULL,
                CodCia CHAR(3) NOT NULL,
                CONSTRAINT UQ_User_Empresa UNIQUE (Login, CodCia)
            )
        """)
        conn.commit()

        # Tabla de tipos de OC por usuario
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WebUsuarioTipoOc' AND xtype='U')
            CREATE TABLE WebUsuarioTipoOc (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                Login VARCHAR(50) NOT NULL,
                TipoOc VARCHAR(5) NOT NULL,
                CONSTRAINT UQ_User_TipoOc UNIQUE (Login, TipoOc)
            )
        """)
        conn.commit()

        # Modificar WebUsers si no tiene PuedeVerTodo
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('WebUsers') AND name = 'PuedeVerTodo')
            BEGIN
                ALTER TABLE WebUsers ADD PuedeVerTodo BIT DEFAULT 0;
            END
        """)
        conn.commit()

        print("[OK] Tablas de permisos y configuraciones verificadas/creadas")
        _seed_initial_data(cursor, conn)

    except Exception as e:
        print(f"[WARN] Error setup permisos: {e}")
    finally:
        conn.close()


def _seed_initial_data(cursor, conn):
    """Inserta datos iniciales si las tablas están vacías."""

    # ── Seed Roles ──
    cursor.execute("SELECT COUNT(*) FROM WebRoles")
    if cursor.fetchone()[0] == 0:
        roles = [
            ('ADMIN', 'Administrador', 'Acceso total al sistema'),
            ('LOGISTICA', 'Logística', 'Gestión de compras y almacén'),
            ('CONTABILIDAD', 'Contabilidad', 'Registros contables y facturación'),
            ('CONTROL_INTERNO', 'Control Interno', 'Auditoría y conciliación'),
            ('COMERCIAL', 'Comercial', 'Ventas y cuentas por cobrar'),
            ('TESORERIA', 'Tesorería', 'Pagos y finanzas'),
            ('FINANZAS', 'Finanzas', 'Gastos, rendiciones y movilidad'),
            ('GERENCIA', 'Gerencia', 'Visión ejecutiva'),
            ('USER', 'Usuario Estándar', 'Acceso básico'),
        ]
        for r in roles:
            cursor.execute("INSERT INTO WebRoles (Codigo, Nombre, Descripcion) VALUES (?,?,?)", r)
        conn.commit()
        print("  → Roles iniciales insertados")

    # ── Seed Módulos ──
    modulos = [
        # (Codigo, Nombre, RutaHtml, Seccion, Orden, ParentCod)
        ('dashboard',           'Dashboard',            '/index.html',              'Principal',      1,  None),
        ('logistics',           'Centro Logístico',     '/logistics.html',          'Logística',      10, None),
        ('orders',              'Compras (OC)',         '/orders.html',             'Logística',      11, None),
        ('inventario',          'Saldos Inventario',    '/inventario.html',         'Logística',      12, None),
        
        # Sub-permisos de Inventario
        ('inv_tab_prod',        '    [Sub] Pestaña: Por Producto',  None,                   'Logística',      1,  'inventario'),
        ('inv_tab_alm',         '    [Sub] Pestaña: Por Almacén',   None,                   'Logística',      2,  'inventario'),
        ('inv_tab_lote',        '    [Sub] Pestaña: Por Lote',      None,                   'Logística',      3,  'inventario'),
        ('inv_btn_exc',         '    [Btn] Acción: Exportar Excel', None,                   'Logística',      4,  'inventario'),

        ('contabilidad',        'Contabilidad',         '/contabilidad.html',       'Contabilidad',   20, None),
        ('cargos_documentales', 'Cargos Documentales',  '/cargos_documentales.html','Contabilidad',   21, None),
        
        # Sub-permisos de Cargos Documentales
        ('cargo_area_log',      '    [Sub] Área: Logística',        None,                   'Contabilidad',   1,  'cargos_documentales'),
        ('cargo_area_cont',     '    [Sub] Área: Contabilidad',     None,                   'Contabilidad',   2,  'cargos_documentales'),
        ('cargo_area_tes',      '    [Sub] Área: Tesorería',        None,                   'Contabilidad',   3,  'cargos_documentales'),

        ('registro_facturas',   'Registro Facturas',    '/registro_facturas.html',  'Contabilidad',   22, None),
        ('conciliacion',        'Conciliación Bancaria','/conciliacion.html',       'Finanzas',       30, None),
        ('cuentas_cobrar',      'Cuentas por Cobrar',   '/cuentas-cobrar.html',     'Finanzas',       31, None),
        ('pagos_tesoreria',     'Pagos Tesorería',      '/pagos_tesoreria.html',    'Finanzas',       32, None),
        ('planilla_movilidad',  'Planilla Movilidad',   '/planilla_movilidad.html', 'Gastos y Movilidad', 40, None),
        ('historial_planillas', 'Historial Planillas',  '/historial_planillas.html','Gastos y Movilidad', 41, None),
        ('rendicion_gastos',    'Rendición de Gastos',  '/rendicion_gastos.html',   'Gastos y Movilidad', 42, None),
        ('historial_rendiciones','Historial Rendiciones','/historial_rendiciones.html','Gastos y Movilidad', 43, None),
        ('revision_rendiciones','Revisión Rendiciones', '/revision_rendiciones.html','Gastos y Movilidad', 44, None),
        ('production',          'Producción y Costos',  '/production.html',         'Producción',     50, None),
        ('kardex',              'Reportes Kardex',      '/kardex.html',             'Producción',     51, None),
        ('reparto',             'Reparto y Rutas',      '/reparto.html',            'Distribución',   60, None),
        ('users',               'Gestión de Usuarios',  '/users.html',              'Sistema',        90, None),
        ('db_config',           'Mantenimiento BD',     '/db-config.html',          'Sistema',        91, None),
        ('profile',             'Mi Perfil',            '/profile.html',            'Sistema',        92, None),
    ]

    for m in modulos:
        cursor.execute("SELECT Id FROM WebModulos WHERE Codigo = ?", (m[0],))
        row = cursor.fetchone()
        if not row:
            # Obtener ID del padre si lo tiene
            parent_id = None
            if m[5]:
                cursor.execute("SELECT Id FROM WebModulos WHERE Codigo = ?", (m[5],))
                prow = cursor.fetchone()
                if prow: parent_id = prow[0]

            cursor.execute("""
                INSERT INTO WebModulos (Codigo, Nombre, RutaHtml, Seccion, Orden, ParentId)
                VALUES (?,?,?,?,?,?)
            """, (m[0], m[1], m[2], m[3], m[4], parent_id))
            print(f"  → Módulo {m[0]} insertado")
            conn.commit()

    # ── Seed Permisos por rol ──
    cursor.execute("SELECT COUNT(*) FROM WebPermisos")
    if cursor.fetchone()[0] == 0:
        # Obtener todos los módulos
        cursor.execute("SELECT Id, Codigo FROM WebModulos")
        modulos_map = {row[1]: row[0] for row in cursor.fetchall()}

        # ADMIN: acceso total a todo
        for mid in modulos_map.values():
            cursor.execute("""
                INSERT INTO WebPermisos (Rol, ModuloId, PuedeVer, PuedeEditar, PuedeEliminar, PuedeAprobar)
                VALUES ('ADMIN', ?, 1, 1, 1, 1)
            """, (mid,))

        # Definir permisos por rol
        role_perms = {
            'LOGISTICA': ['logistics', 'orders', 'contabilidad', 'cargos_documentales', 'registro_facturas'],
            'CONTABILIDAD': ['orders', 'contabilidad', 'cargos_documentales', 'registro_facturas', 'conciliacion', 'cuentas_cobrar'],
            'CONTROL_INTERNO': ['conciliacion', 'cuentas_cobrar'],
            'COMERCIAL': ['conciliacion', 'cuentas_cobrar'],
            'TESORERIA': ['cargos_documentales', 'pagos_tesoreria', 'conciliacion'],
            'FINANZAS': ['planilla_movilidad', 'historial_planillas', 'rendicion_gastos', 'historial_rendiciones', 'revision_rendiciones', 'conciliacion', 'pagos_tesoreria'],
            'GERENCIA': list(modulos_map.keys()),  # Todo visible
            'USER': [],  # Solo dashboard y perfil
        }

        # Todos los roles siempre ven dashboard y profile
        always_visible = ['dashboard', 'profile']

        for rol, codigos in role_perms.items():
            all_codigos = set(codigos + always_visible)
            for codigo in all_codigos:
                if codigo in modulos_map:
                    cursor.execute("""
                        INSERT INTO WebPermisos (Rol, ModuloId, PuedeVer, PuedeEditar, PuedeEliminar, PuedeAprobar)
                        VALUES (?, ?, 1, 1, 0, 0)
                    """, (rol, modulos_map[codigo]))

        conn.commit()
        print("  → Permisos iniciales insertados")


# ══════════════════════════════════════════════════════
#  ENDPOINTS PARA EL USUARIO LOGUEADO
# ══════════════════════════════════════════════════════

@router.get("/permisos/me")
def get_my_permissions(current_user: dict = Depends(get_current_user)):
    """Devuelve los módulos y acciones permitidas del usuario logueado."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        login = current_user["login"]
        rol = current_user.get("rol", "USER")
        
        # Superuser override
        is_super = login.strip().upper() == "71941916JL"
        
        if is_super or rol == "ADMIN":
            # Admin ve todo
            cursor.execute("""
                SELECT m.Id, m.Codigo, m.Nombre, m.RutaHtml, m.Seccion, m.Orden, m.ParentId,
                       1 as PuedeVer, 1 as PuedeEditar, 1 as PuedeEliminar, 1 as PuedeAprobar
                FROM WebModulos m
                WHERE m.Activo = 1
                ORDER BY COALESCE(m.ParentId, m.Id), CASE WHEN m.ParentId IS NULL THEN 0 ELSE 1 END, m.Orden
            """)
        else:
            cursor.execute("""
                SELECT m.Id, m.Codigo, m.Nombre, m.RutaHtml, m.Seccion, m.Orden, m.ParentId,
                       p.PuedeVer, p.PuedeEditar, p.PuedeEliminar, p.PuedeAprobar
                FROM WebModulos m
                INNER JOIN WebPermisos p ON p.ModuloId = m.Id
                WHERE p.Rol = ? AND m.Activo = 1 AND p.PuedeVer = 1
                ORDER BY COALESCE(m.ParentId, m.Id), CASE WHEN m.ParentId IS NULL THEN 0 ELSE 1 END, m.Orden
            """, (rol,))
        
        cols = [c[0] for c in cursor.description]
        modulos = [dict(zip(cols, row)) for row in cursor.fetchall()]
        
        # Obtenemos configuraciones extras del usuario (PuedeVerTodo y Tipos de OC)
        puede_ver_todo = False
        tipos_oc_permitidos = []
        if is_super or rol == "ADMIN":
            puede_ver_todo = True
            tipos_oc_permitidos = ["M", "S", "T"]
        else:
            cursor.execute("SELECT ISNULL(PuedeVerTodo, 0) FROM WebUsers WHERE login = ?", (login,))
            r = cursor.fetchone()
            if r: puede_ver_todo = bool(r[0])
            
            cursor.execute("SELECT TipoOc FROM WebUsuarioTipoOc WHERE Login = ?", (login,))
            tipos_oc_permitidos = [row[0].strip() for row in cursor.fetchall()]

        return {
            "login": login, 
            "rol": rol, 
            "isAdmin": is_super or rol == "ADMIN", 
            "puede_ver_todo": puede_ver_todo,
            "tipos_oc_permitidos": tipos_oc_permitidos,
            "modulos": modulos
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/permisos/empresas/me")
def get_my_empresas(current_user: dict = Depends(get_current_user)):
    """Devuelve las empresas asignadas al usuario logueado."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        login = current_user["login"]
        rol = current_user.get("rol", "USER")
        is_super = login.strip().upper() == "71941916JL"

        if is_super or rol == "ADMIN":
            # Admin ve todas las empresas
            cursor.execute("SELECT RTRIM(codcia) as codcia, RTRIM(nomcia) as nomcia FROM AdmMcias ORDER BY codcia")
        else:
            # Verificar si tiene empresas asignadas
            cursor.execute("SELECT COUNT(*) FROM WebUsuarioEmpresa WHERE Login = ?", (login,))
            count = cursor.fetchone()[0]
            
            if count == 0:
                # Si no tiene asignación, no mostrar nada (Restricción estricta)
                return []
            else:
                cursor.execute("""
                    SELECT RTRIM(e.codcia) as codcia, RTRIM(e.nomcia) as nomcia
                    FROM AdmMcias e
                    INNER JOIN WebUsuarioEmpresa ue ON RTRIM(e.codcia) = RTRIM(ue.CodCia)
                    WHERE ue.Login = ?
                    ORDER BY e.codcia
                """, (login,))
        
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/permisos/empresas/all")
def get_all_empresas():
    """Devuelve todas las empresas (sin auth). Usado por dashboard gerencial público."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT RTRIM(codcia) as codcia, RTRIM(nomcia) as nomcia FROM AdmMcias ORDER BY codcia")
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ══════════════════════════════════════════════════════
#  ADMIN: CRUD de Roles
# ══════════════════════════════════════════════════════

class RolCreate(BaseModel):
    codigo: str
    nombre: str
    descripcion: Optional[str] = ""

@router.get("/admin/roles")
def get_roles(admin: dict = Depends(get_current_active_admin)):
    conn = get_db_connection()
    if not conn: raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT Id, Codigo, Nombre, Descripcion, Activo FROM WebRoles ORDER BY Codigo")
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    finally:
        conn.close()

@router.post("/admin/roles")
def create_role(params: RolCreate, admin: dict = Depends(get_current_active_admin)):
    conn = get_db_connection()
    if not conn: raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO WebRoles (Codigo, Nombre, Descripcion) VALUES (?, ?, ?)
        """, (params.codigo.upper(), params.nombre, params.descripcion))
        conn.commit()
        return {"status": "success", "message": f"Rol '{params.codigo}' creado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()

class RolUpdate(BaseModel):
    nombre: str
    descripcion: Optional[str] = ""

@router.put("/admin/roles/{codigo}")
def update_role(codigo: str, params: RolUpdate, admin: dict = Depends(get_current_active_admin)):
    conn = get_db_connection()
    if not conn: raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT Id FROM WebRoles WHERE Codigo = ?", (codigo.upper(),))
        if not cursor.fetchone():
            raise HTTPException(404, "Rol no encontrado")
            
        cursor.execute("""
            UPDATE WebRoles
            SET Nombre = ?, Descripcion = ?
            WHERE Codigo = ?
        """, (params.nombre, params.descripcion, codigo.upper()))
        conn.commit()
        return {"status": "success", "message": f"Rol '{codigo}' actualizado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ══════════════════════════════════════════════════════
#  ADMIN: CRUD de Módulos
# ══════════════════════════════════════════════════════

@router.get("/admin/modulos")
def get_modulos(admin: dict = Depends(get_current_active_admin)):
    conn = get_db_connection()
    if not conn: raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT Id, Codigo, Nombre, RutaHtml, Seccion, Orden, Activo FROM WebModulos ORDER BY Orden")
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════
#  ADMIN: Permisos por Rol
# ══════════════════════════════════════════════════════

class PermisoItem(BaseModel):
    moduloId: int
    puedeVer: bool = False
    puedeEditar: bool = False
    puedeEliminar: bool = False
    puedeAprobar: bool = False

class PermisosRolSave(BaseModel):
    rol: str
    permisos: List[PermisoItem]

@router.get("/admin/permisos")
def get_permisos_by_rol(rol: str = Query(...), admin: dict = Depends(get_current_active_admin)):
    """Obtiene todos los permisos de un rol específico."""
    conn = get_db_connection()
    if not conn: raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.Id as ModuloId, m.Codigo, m.Nombre, m.Seccion, m.ParentId,
                   ISNULL(p.PuedeVer, 0) as PuedeVer,
                   ISNULL(p.PuedeEditar, 0) as PuedeEditar,
                   ISNULL(p.PuedeEliminar, 0) as PuedeEliminar,
                   ISNULL(p.PuedeAprobar, 0) as PuedeAprobar
            FROM WebModulos m
            LEFT JOIN WebPermisos p ON p.ModuloId = m.Id AND p.Rol = ?
            WHERE m.Activo = 1
            ORDER BY COALESCE(m.ParentId, m.Id), CASE WHEN m.ParentId IS NULL THEN 0 ELSE 1 END, m.Orden
        """, (rol,))
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    finally:
        conn.close()

@router.post("/admin/permisos")
def save_permisos_rol(params: PermisosRolSave, admin: dict = Depends(get_current_active_admin)):
    """Guarda la matriz de permisos para un rol (reemplaza todo)."""
    conn = get_db_connection()
    if not conn: raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        # Borrar permisos previos del rol
        cursor.execute("DELETE FROM WebPermisos WHERE Rol = ?", (params.rol,))
        # Insertar nuevos
        for p in params.permisos:
            if p.puedeVer or p.puedeEditar or p.puedeEliminar or p.puedeAprobar:
                cursor.execute("""
                    INSERT INTO WebPermisos (Rol, ModuloId, PuedeVer, PuedeEditar, PuedeEliminar, PuedeAprobar)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (params.rol, p.moduloId,
                      1 if p.puedeVer else 0,
                      1 if p.puedeEditar else 0,
                      1 if p.puedeEliminar else 0,
                      1 if p.puedeAprobar else 0))
        conn.commit()
        return {"status": "success", "message": f"Permisos del rol '{params.rol}' guardados"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ══════════════════════════════════════════════════════
#  ADMIN: Empresas por Usuario
# ══════════════════════════════════════════════════════

class EmpresasUsuarioSave(BaseModel):
    empresas: List[str]  # Lista de CodCia

@router.get("/admin/usuario-empresas/{login}")
def get_user_empresas(login: str, admin: dict = Depends(get_current_active_admin)):
    conn = get_db_connection()
    if not conn: raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT CodCia FROM WebUsuarioEmpresa WHERE Login = ?", (login,))
        return [row[0].strip() for row in cursor.fetchall()]
    finally:
        conn.close()

@router.post("/admin/usuario-empresas/{login}")
def save_user_empresas(login: str, params: EmpresasUsuarioSave, admin: dict = Depends(get_current_active_admin)):
    conn = get_db_connection()
    if not conn: raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM WebUsuarioEmpresa WHERE Login = ?", (login,))
        for cia in params.empresas:
            cursor.execute("INSERT INTO WebUsuarioEmpresa (Login, CodCia) VALUES (?, ?)", (login, cia))
        conn.commit()
        return {"status": "success", "message": f"Empresas de '{login}' actualizadas"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ══════════════════════════════════════════════════════
#  ADMIN: Tipos de OC por Usuario
# ══════════════════════════════════════════════════════

class TiposOcUsuarioSave(BaseModel):
    tipos_oc: List[str]  # Lista de M, S, T

@router.get("/admin/usuario-tipooc/{login}")
def get_user_tipooc(login: str, admin: dict = Depends(get_current_active_admin)):
    conn = get_db_connection()
    if not conn: raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT TipoOc FROM WebUsuarioTipoOc WHERE Login = ?", (login,))
        return [row[0].strip() for row in cursor.fetchall()]
    finally:
        conn.close()

@router.post("/admin/usuario-tipooc/{login}")
def save_user_tipooc(login: str, params: TiposOcUsuarioSave, admin: dict = Depends(get_current_active_admin)):
    conn = get_db_connection()
    if not conn: raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM WebUsuarioTipoOc WHERE Login = ?", (login,))
        for tipo in params.tipos_oc:
            cursor.execute("INSERT INTO WebUsuarioTipoOc (Login, TipoOc) VALUES (?, ?)", (login, tipo))
        conn.commit()
        return {"status": "success", "message": f"Tipos de OC de '{login}' actualizados"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()
# ══════════════════════════════════════════════════════

@router.get("/auth/verify")
def verify_token(current_user: dict = Depends(get_current_user)):
    """Verifica que el JWT es válido y devuelve info del usuario."""
    conn = get_db_connection()
    if not conn:
        return {"valid": True, "login": current_user["login"], "rol": current_user.get("rol", "USER")}
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT nombre, rol, activo FROM WebUsers WHERE login = ?", (current_user["login"],))
        row = cursor.fetchone()
        if row and not row[2]:
            raise HTTPException(status_code=403, detail="Cuenta deshabilitada")
        return {
            "valid": True,
            "login": current_user["login"],
            "rol": row[1] if row else current_user.get("rol", "USER"),
            "nombre": row[0] if row else current_user["login"]
        }
    finally:
        conn.close()
