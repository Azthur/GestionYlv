"""Inspect sales/orders/guides tables for dashboard development."""
import json
from database import get_db_connection

tables = ['CCBRGDOC', 'VTARITEM', 'VTAVPEDI', 'VTARPEDI', 'VTAVGUIA', 'VTARGUIA']

conn = get_db_connection()
if not conn:
    print("ERROR: No DB connection")
    exit(1)

cursor = conn.cursor()

for tbl in tables:
    print(f"\n{'='*60}")
    print(f"TABLE: {tbl}")
    print('='*60)
    try:
        cursor.execute(f"""
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
        """, (tbl,))
        cols = cursor.fetchall()
        if not cols:
            print("  >>> TABLE NOT FOUND")
            continue
        for c in cols:
            size = f"({c[2]})" if c[2] else ""
            print(f"  {c[0]:30s} {c[1]:12s}{size:8s} {'NULL' if c[3]=='YES' else 'NOT NULL'}")
        
        # Row count
        cursor.execute(f"SELECT COUNT(*) FROM {tbl}")
        cnt = cursor.fetchone()[0]
        print(f"  --- ROW COUNT: {cnt:,}")
        
        # Sample 3 rows
        cursor.execute(f"SELECT TOP 3 * FROM {tbl}")
        sample_cols = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
        print(f"  --- SAMPLE ({len(rows)} rows):")
        for row in rows:
            d = {}
            for i, v in enumerate(row):
                val = str(v).strip() if v is not None else None
                if val and len(val) > 60:
                    val = val[:60] + '...'
                d[sample_cols[i]] = val
            print(f"    {json.dumps(d, ensure_ascii=False, default=str)}")
    except Exception as e:
        print(f"  ERROR: {e}")

conn.close()
print("\nDone.")
