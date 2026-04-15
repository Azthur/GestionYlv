from database import get_db_connection

def fix_sidebar():
    conn = get_db_connection()
    if not conn:
        print("Error: No connection")
        return
    
    cursor = conn.cursor()
    try:
        # 1. Asegurar que el modulo 'inventario' existe
        cursor.execute("SELECT Id FROM WebModulos WHERE Codigo = 'inventario'")
        row = cursor.fetchone()
        if not row:
            print("Instalando modulo 'inventario' en WebModulos...")
            cursor.execute("""
                INSERT INTO WebModulos (Codigo, Nombre, RutaHtml, Seccion, Orden)
                VALUES ('inventario', 'Saldos Inventario', '/inventario.html', 'Logística', 12)
            """)
            cursor.execute("SELECT Id FROM WebModulos WHERE Codigo = 'inventario'")
            mod_id = cursor.fetchone()[0]
        else:
            mod_id = row[0]
            print(f"Modulo 'inventario' ya existe con Id {mod_id}")

        # 2. Asegurar que el rol ADMIN tiene permiso para verlo
        cursor.execute("SELECT Id FROM WebPermisos WHERE Rol = 'ADMIN' AND ModuloId = ?", (mod_id,))
        if not cursor.fetchone():
            print("Otorgando permisos de 'inventario' al rol ADMIN...")
            cursor.execute("""
                INSERT INTO WebPermisos (Rol, ModuloId, PuedeVer, PuedeEditar, PuedeEliminar, PuedeAprobar)
                VALUES ('ADMIN', ?, 1, 1, 1, 1)
            """, (mod_id,))
        else:
            print("El rol ADMIN ya tiene permisos para 'inventario'")

        # 3. Verificar el usuario administrador especifico
        cursor.execute("SELECT login, rol FROM WebUsers WHERE login = '71941916JL'")
        user = cursor.fetchone()
        if user:
            print(f"Usuario {user.login} verificado con rol {user.rol}")
        else:
            print("Advertencia: Usuario 71941916JL no encontrado en WebUsers")

        conn.commit()
        print("Sincronización completada exitosamente.")
        
    except Exception as e:
        print(f"Error durante la sincronizacion: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    fix_sidebar()
