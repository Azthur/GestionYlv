import sys
sys.path.append('.')
from backend.database import get_db_connection

def main():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect")
        return
    cursor = conn.cursor()
    
    print("--- N/A or N/C documents with non-zero sdodoc ---")
    query = """
        SELECT TOP 10 codcia, coddoc, nrodoc, fchdoc, flgest, imptot, sdodoc, codmon
        FROM CcbRGdoc 
        WHERE RTRIM(coddoc) IN ('N/A', 'N/C', 'N/CR') AND sdodoc <> 0
    """
    cursor.execute(query)
    columns = [col[0] for col in cursor.description]
    for r in cursor.fetchall():
        print(dict(zip(columns, r)))
        
    print("\n--- Summary of sdodoc for N/A or N/C ---")
    query2 = """
        SELECT RTRIM(coddoc) as coddoc, count(*), sum(sdodoc)
        FROM CcbRGdoc 
        WHERE RTRIM(coddoc) IN ('N/A', 'N/C', 'N/CR') AND sdodoc <> 0
        GROUP BY coddoc
    """
    cursor.execute(query2)
    for r in cursor.fetchall():
        print(f"coddoc: {repr(r[0])} | Count: {r[1]} | Sum of sdodoc: {r[2]}")
        
    conn.close()

if __name__ == '__main__':
    main()
