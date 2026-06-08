import sys
sys.path.append('.')
from backend.database import get_db_connection

def main():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect")
        return
    cursor = conn.cursor()
    
    print("--- Searching codes in AlmTabla ---")
    query = """
        SELECT DISTINCT tabla, codigo, nombre 
        FROM AlmTabla 
        WHERE RTRIM(codigo) IN ('1', '2', '3', '4', '5', 'A', 'B', 'C', 'D', 'E', 'M', 'R', 'V', 'Z')
    """
    cursor.execute(query)
    for r in cursor.fetchall():
        print(f"tabla: {repr(r[0])} | codigo: {repr(r[1])} | nombre: {repr(r[2])}")
        
    conn.close()

if __name__ == '__main__':
    main()
