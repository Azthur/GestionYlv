import sys
sys.path.append(r"c:\SistemaGestionyelave\backend")
from database import get_db_connection

try:
    conn = get_db_connection()
    if conn:
        cursor = conn.cursor()
        
        # Insert module if not exists
        cursor.execute("SELECT Id FROM WebModulos WHERE Codigo = 'trazabilidad_global'")
        row = cursor.fetchone()
        
        if not row:
            cursor.execute("INSERT INTO WebModulos (Codigo, Nombre, RutaHtml, Seccion, Orden) VALUES ('trazabilidad_global', 'Trazabilidad Global', '/trazabilidad_global.html', 'Contabilidad', 23)")
            conn.commit()
            cursor.execute("SELECT Id FROM WebModulos WHERE Codigo = 'trazabilidad_global'")
            row = cursor.fetchone()
            
        modulo_id = row[0]
        
        # Assign to ADMIN directly, and also CONTABILIDAD, LOGISTICA
        for r in ['ADMIN', 'LOGISTICA', 'CONTABILIDAD', 'GERENCIA']:
            cursor.execute("SELECT Id FROM WebPermisos WHERE Rol = ? AND ModuloId = ?", (r, modulo_id))
            if not cursor.fetchone():
                cursor.execute("INSERT INTO WebPermisos (Rol, ModuloId, PuedeVer, PuedeEditar, PuedeEliminar, PuedeAprobar) VALUES (?, ?, 1, 1, 1, 1)", (r, modulo_id))
        conn.commit()
        print("DB Seed successful")
        conn.close()
    else:
        print("Failed to get db connection")
        
except Exception as e:
    print("DB error:", e)
