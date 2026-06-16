import sys
import os
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend'))
from database import get_db_connection

conn = get_db_connection()
if not conn:
    print("Could not connect")
    sys.exit(1)

try:
    cursor = conn.cursor()
    # Find all ids
    cursor.execute("SELECT Id FROM WebModulos WHERE Codigo = 'movimientos_almacen' ORDER BY Id")
    ids = [r[0] for r in cursor.fetchall()]
    print(f"Found WebModulos ids: {ids}")
    
    if len(ids) > 1:
        keep_id = ids[0]
        delete_ids = ids[1:]
        print(f"Keeping Id: {keep_id}, deleting Ids: {delete_ids}")
        
        # Move any permissions from deleted ids to keep_id if they don't already exist
        for d_id in delete_ids:
            cursor.execute("SELECT Rol, PuedeVer, PuedeEditar, PuedeEliminar, PuedeAprobar FROM WebPermisos WHERE ModuloId = ?", (d_id,))
            perms = cursor.fetchall()
            for p in perms:
                rol, ver, edit, elim, ap = p
                # Check if it exists for keep_id
                cursor.execute("SELECT Id FROM WebPermisos WHERE Rol = ? AND ModuloId = ?", (rol, keep_id))
                if not cursor.fetchone():
                    cursor.execute("""
                        INSERT INTO WebPermisos (Rol, ModuloId, PuedeVer, PuedeEditar, PuedeEliminar, PuedeAprobar)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (rol, keep_id, ver, edit, elim, ap))
            
            # Delete permissions for the deleted id
            cursor.execute("DELETE FROM WebPermisos WHERE ModuloId = ?", (d_id,))
            # Delete the module itself
            cursor.execute("DELETE FROM WebModulos WHERE Id = ?", (d_id,))
            
        conn.commit()
        print("Cleanup completed successfully!")
    else:
        print("No duplicates found.")
        
except Exception as e:
    conn.rollback()
    print("Error during cleanup:", e)
finally:
    conn.close()
