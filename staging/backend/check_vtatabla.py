import os
from database import get_db_connection

def inspect_vtatabla():
    conn = get_db_connection()
    if not conn:
        print("No db connection")
        return
    
    cursor = conn.cursor()
    # Check what columns VtaTabla has:
    try:
        cursor.execute("SELECT TOP 1 * FROM VtaTabla")
        cols = [column[0] for column in cursor.description]
        print("VtaTabla Columns:", cols)
        
        # Look at CA00 (Movilidades)
        cursor.execute("SELECT TOP 5 * FROM VtaTabla WHERE RTRIM(Tabla) = 'CA00'")
        print("\nCA00 (Movilidades) Sample:")
        for row in cursor.fetchall():
            print(dict(zip(cols, row)))

        # Look at CHOO (Choferes)
        cursor.execute("SELECT TOP 5 * FROM VtaTabla WHERE RTRIM(Tabla) = 'CHOO'")
        print("\nCHOO (Choferes) Sample:")
        for row in cursor.fetchall():
            print(dict(zip(cols, row)))
            
    except Exception as e:
        print("Error VtaTabla:", e)

    # Check if there are tables for Reparto
    try:
        cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Reparto%' OR TABLE_NAME LIKE '%Recojo%' OR TABLE_NAME LIKE '%Ruta%'")
        print("\nRelated Tables:")
        for row in cursor.fetchall():
            print(row.TABLE_NAME)
    except Exception as e:
        pass

    conn.close()

if __name__ == '__main__':
    inspect_vtatabla()
