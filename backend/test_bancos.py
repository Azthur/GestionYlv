from database import get_db_connection
try:
    conn = get_db_connection()
    c = conn.cursor()
    
    # Find bank tables
    c.execute("""
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME LIKE '%anco%' OR TABLE_NAME LIKE '%bank%' OR TABLE_NAME LIKE '%Ccb%'
        ORDER BY TABLE_NAME
    """)
    print("=== Tables with bank-like names ===")
    for row in c.fetchall():
        print(f"  {row[0]}")
    
    # Check CcbTabla for bank codes
    c.execute("SELECT TOP 20 RTRIM(Codigo), RTRIM(Nombre) FROM CcbTabla WHERE Tabla = '0003'")
    print("\n=== CcbTabla 0003 (bancos?) ===")
    for row in c.fetchall():
        print(f"  {row[0]} -> {row[1]}")

except Exception as e:
    print("Error:", e)
    try:
        # Try alternative
        c.execute("SELECT DISTINCT Tabla FROM CcbTabla")
        print("\n=== CcbTabla tables ===")
        for row in c.fetchall():
            print(f"  {row[0]}")
    except Exception as e2:
        print("Error2:", e2)
