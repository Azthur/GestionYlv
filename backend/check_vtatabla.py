import os
from database import get_db_connection

def inspect_vtatabla():
    conn = get_db_connection()
    if not conn:
        print("No db connection")
        return
    
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT TOP 1 * FROM VtaTabla")
        cols = [column[0] for column in cursor.description]
        print("VtaTabla Columns:", cols)
        
        # Look at '0009' (Salespeople)
        cursor.execute("SELECT TOP 10 * FROM VtaTabla WHERE RTRIM(Tabla) = '0009'")
        print("\n0009 (Salespeople) Sample:")
        for row in cursor.fetchall():
            print({col: str(val).strip() if isinstance(val, str) else val for col, val in zip(cols, row)})
            
    except Exception as e:
        print("Error VtaTabla:", e)

    conn.close()

if __name__ == '__main__':
    inspect_vtatabla()
