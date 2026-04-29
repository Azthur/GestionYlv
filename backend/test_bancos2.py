from database import get_db_connection
try:
    conn = get_db_connection()
    c = conn.cursor()
    
    # Check all CcbTabla table codes
    c.execute("SELECT DISTINCT RTRIM(Tabla) FROM CcbTabla ORDER BY 1")
    print("=== CcbTabla distinct Tabla codes ===")
    for row in c.fetchall():
        print(f"  [{row[0]}]")
    
    # Check what's in the bank selector in the frontend
    c.execute("SELECT TOP 20 RTRIM(Codigo), RTRIM(Nombre) FROM CcbTabla WHERE Tabla = '0005'")
    print("\n=== CcbTabla 0005 ===")
    for row in c.fetchall():
        print(f"  {row[0]} -> {row[1]}")
    
    # Check CcbVplan for bank info
    c.execute("SELECT TOP 5 * FROM CcbVplan")
    cols = [c[0] for c in c.description]
    print(f"\n=== CcbVplan columns: {cols} ===")
    for row in c.fetchall():
        print(f"  {dict(zip(cols, row))}")

except Exception as e:
    print("Error:", e)
