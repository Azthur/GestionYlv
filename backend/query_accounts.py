import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection

def main():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT CodCia, Codigo, Nombre FROM CcbTabla WHERE Tabla='0001' AND RTRIM(Codigo) IN ('1100', '01', '03', '1118')")
        print('=== CcbTabla ===')
        for row in cursor.fetchall():
            print(row)

        cursor.execute("SELECT CODCIA, codtarj, DESTARJ FROM POSTARJE WHERE RTRIM(codtarj) IN ('1100', '01', '03', '1118')")
        print('=== POSTARJE ===')
        for row in cursor.fetchall():
            print(row)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()
