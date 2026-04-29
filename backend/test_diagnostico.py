from database import get_db_connection
try:
    conn = get_db_connection()
    c = conn.cursor()
    # Check FinPagos schema
    c.execute("""
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'FinPagos' 
        ORDER BY ORDINAL_POSITION
    """)
    print("=== FinPagos Schema ===")
    for row in c.fetchall():
        print(f"  {row[0]}: {row[1]}({row[2]})")
    
    # Check AlmTabla 0006 sample
    c.execute("SELECT TOP 10 RTRIM(Codigo), RTRIM(Nombre) FROM AlmTabla WHERE Tabla = '0006'")
    print("\n=== AlmTabla 0006 ===")
    for row in c.fetchall():
        print(f"  Code={row[0]} -> Name={row[1]}")
    
    # Check what TipoComprobante values exist in FinPagos
    c.execute("SELECT TipoComprobante, COUNT(*) FROM FinPagos GROUP BY TipoComprobante")
    print("\n=== FinPagos TipoComprobante values ===")
    for row in c.fetchall():
        print(f"  [{row[0]}] count={row[1]}")
    
    # Check what TipoComprobante values exist in CntCargosDetalle
    c.execute("SELECT TipoComprobante, COUNT(*) FROM CntCargosDetalle GROUP BY TipoComprobante")
    print("\n=== CntCargosDetalle TipoComprobante values ===")
    for row in c.fetchall():
        print(f"  [{row[0]}] count={row[1]}")
    
    # Check BancoPago values
    c.execute("SELECT DISTINCT BancoPago FROM FinPagos")
    print("\n=== FinPagos BancoPago values ===")
    for row in c.fetchall():
        print(f"  [{row[0]}]")
        
    # Check bank table
    c.execute("SELECT TOP 10 CodBanco, NomBanco FROM CcbBanco")
    print("\n=== CcbBanco ===")
    for row in c.fetchall():
        print(f"  {row[0]} -> {row[1]}")

except Exception as e:
    import traceback
    traceback.print_exc()
