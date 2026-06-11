import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from database import get_db_connection

def main():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect to database")
        return
    
    cursor = conn.cursor()
    try:
        print("=== Checking Y31 in VtaTabla ===")
        cursor.execute("SELECT RTRIM(codcia) as codcia, RTRIM(tabla) as tabla, RTRIM(codigo) as codigo, RTRIM(nombre) as nombre FROM VtaTabla WHERE RTRIM(codigo) = 'Y31'")
        rows = cursor.fetchall()
        for r in rows:
            print(f"codcia={r.codcia}, tabla={r.tabla}, codigo={r.codigo}, nombre={r.nombre}")
        
        login = '71941916'
        codcia = '007'
        
        # Check salesperson codes starting with Y
        cursor.execute("SELECT RTRIM(codigo) as codigo, RTRIM(nombre) as nombre FROM VtaTabla WHERE codcia = '007' AND tabla = '0009' AND codigo LIKE 'Y%'")
        print("Salesperson codes starting with Y:")
        for r in cursor.fetchall():
            print(f"  {r.codigo} - {r.nombre}")
            
    except Exception as e:
        print("Error:", e)
    finally:
        conn.close()

if __name__ == '__main__':
    main()
