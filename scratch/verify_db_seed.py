import sys
sys.path.append('.')
from backend.database import get_db_connection

def main():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect")
        return
    cursor = conn.cursor()
    
    print("Checking module 'auditoria_comprobantes' in WebModulos...")
    cursor.execute("SELECT * FROM WebModulos WHERE Codigo = 'auditoria_comprobantes'")
    row = cursor.fetchone()
    if row:
        columns = [col[0] for col in cursor.description]
        print("Module found:", dict(zip(columns, row)))
        
        mid = row[0]
        print("\nChecking permissions in WebPermisos for ModuloId:", mid)
        cursor.execute("SELECT * FROM WebPermisos WHERE ModuloId = ?", (mid,))
        perms = cursor.fetchall()
        pcolumns = [col[0] for col in cursor.description]
        for p in perms:
            print("Permission:", dict(zip(pcolumns, p)))
    else:
        print("Module 'auditoria_comprobantes' NOT found in WebModulos!")

    conn.close()

if __name__ == '__main__':
    main()
