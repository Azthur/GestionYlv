import sys
import os
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend'))
from database import get_db_connection

conn = get_db_connection()
if not conn:
    print("Could not connect")
    sys.exit(1)

try:
    cursor = conn.cursor()
    # 1. Test get_warehouse_movements query with a JOIN to verify matching items exist
    print("Testing get_warehouse_movements query with items:")
    cursor.execute("""
        SELECT TOP 5
            RTRIM(av.codcia) as codcia,
            RTRIM(av.almcen) as almcen,
            RTRIM(av.tipmov) as tipmov,
            RTRIM(av.codmov) as codmov,
            RTRIM(av.nrodoc) as nrodoc,
            av.fchdoc as fchdoc,
            RTRIM(av.flgest) as flgest
        FROM AlmVMovm av
        WHERE EXISTS (
            SELECT 1 FROM AlmRMovm r 
            WHERE r.codcia = av.codcia AND r.almcen = av.almcen 
              AND r.tipmov = av.tipmov AND r.codmov = av.codmov AND r.nrodoc = av.nrodoc
        )
        ORDER BY av.fchdoc DESC
    """)
    rows = cursor.fetchall()
    print(f"  Found {len(rows)} movements with items:")
    for r in rows:
        print(f"    Doc: {r.nrodoc}, Date: {r.fchdoc}, Almacen: {r.almcen}, Tipo: {r.tipmov} {r.codmov}, Estado: {r.flgest}")

    if rows:
        sample = rows[0]
        # 2. Test get_warehouse_movement_voucher query
        print(f"\nTesting get_warehouse_movement_voucher query for Doc: {sample.nrodoc}:")
        cursor.execute("""
            SELECT 
                nroitm, RTRIM(codmat) as codmat, RTRIM(desmat) as desmat, candes, preuni, impcto
            FROM AlmRMovm 
            WHERE RTRIM(codcia) = ? AND RTRIM(almcen) = ? 
              AND RTRIM(tipmov) = ? AND RTRIM(codmov) = ? AND RTRIM(nrodoc) = ?
            ORDER BY nroitm
        """, (sample.codcia, sample.almcen, sample.tipmov, sample.codmov, sample.nrodoc))
        items = cursor.fetchall()
        print(f"  Found {len(items)} items in voucher:")
        for it in items:
            print(f"    Item {it.nroitm}: {it.codmat} - {it.desmat}, Cant: {it.candes}, Price: {it.preuni}, Total: {it.impcto}")
            
except Exception as e:
    print("Error:", e)
finally:
    conn.close()
