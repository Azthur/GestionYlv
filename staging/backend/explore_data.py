from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

# Sample data from each key table
tables_to_sample = ['AdmMcias', 'CcbICaja', 'CcbMVtos', 'POSTARJE', 'admcaja', 'CcbTabla']

for table in tables_to_sample:
    print(f"\n{'='*60}")
    print(f"=== SAMPLE DATA: {table} (top 5) ===")
    print(f"{'='*60}")
    try:
        cursor.execute(f"SELECT TOP 5 * FROM [{table}]")
        cols = [c[0] for c in cursor.description]
        print(" | ".join(cols))
        print("-" * 120)
        rows = cursor.fetchall()
        if not rows:
            print("  (no data)")
        for row in rows:
            print(" | ".join(str(v).strip() if v is not None else "NULL" for v in row))
    except Exception as e:
        print(f"  Error: {e}")

# Count rows in each table
print(f"\n{'='*60}")
print("=== ROW COUNTS ===")
print(f"{'='*60}")
for table in tables_to_sample:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM [{table}]")
        count = cursor.fetchone()[0]
        print(f"  {table:20s}: {count:>10,} rows")
    except Exception as e:
        print(f"  {table:20s}: Error - {e}")

# Check CcbTabla for bank-related codes
print(f"\n{'='*60}")
print("=== CcbTabla - all Tabla types ===")
print(f"{'='*60}")
try:
    cursor.execute("SELECT DISTINCT Tabla, COUNT(*) as cnt FROM CcbTabla GROUP BY Tabla ORDER BY Tabla")
    for r in cursor.fetchall():
        print(f"  Tabla={r[0].strip():5s}  Count={r[1]}")
except Exception as e:
    print(f"  Error: {e}")

# Check admcaja types
print(f"\n{'='*60}")
print("=== admcaja - all types ===")
print(f"{'='*60}")
try:
    cursor.execute("SELECT * FROM admcaja ORDER BY codcia, tipo, codigo")
    cols = [c[0] for c in cursor.description]
    print(" | ".join(cols))
    for r in cursor.fetchall():
        print(" | ".join(str(v).strip() if v is not None else "NULL" for v in r))
except Exception as e:
    print(f"  Error: {e}")

# Check NroDep values in CcbMVtos to understand the deposit/operation tracking
print(f"\n{'='*60}")
print("=== CcbMVtos - Sample with NroDep (deposit cross-ref) ===")
print(f"{'='*60}")
try:
    cursor.execute("SELECT TOP 10 CodCia, anos, mes, coddoc, nrodoc, nroitm, NroDep, codbco, import, glodoc FROM CcbMVtos WHERE NroDep IS NOT NULL AND NroDep <> '' ORDER BY anos DESC, mes DESC")
    cols = [c[0] for c in cursor.description]
    print(" | ".join(cols))
    print("-" * 120)
    rows = cursor.fetchall()
    if not rows:
        print("  (no data with NroDep)")
    for row in rows:
        print(" | ".join(str(v).strip() if v is not None else "NULL" for v in row))
except Exception as e:
    print(f"  Error: {e}")

conn.close()
