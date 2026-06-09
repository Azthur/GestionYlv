import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from database import get_db_connection

def inspect():
    conn = get_db_connection()
    if not conn:
        print("Could not connect to database")
        return
    
    cursor = conn.cursor()
    
    # Query invoice details by Uuid
    uuid = "a1ac4640-370b-4a2a-b753-bd0598295597"
    cursor.execute("""
        SELECT fd.* 
        FROM CntFacturaDet fd
        INNER JOIN CntFacturaCab fc ON fd.FacturaCabId = fc.Id
        WHERE fc.Uuid = ?
    """, (uuid,))
    
    cols = [c[0] for c in cursor.description]
    for row in cursor.fetchall():
        d = dict(zip(cols, row))
        print("Detail row:")
        for k, v in d.items():
            print(f"  {k}: {repr(v)} (type: {type(v)})")
            
    conn.close()

if __name__ == '__main__':
    inspect()
