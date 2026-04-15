from database import get_db_connection

def inspect():
    conn = get_db_connection()
    if not conn:
        print("No DB connection")
        return
    cursor = conn.cursor()
    
    # Check AlmTabla
    print("--- AlmTabla (tabla='0017') ---")
    try:
        cursor.execute("SELECT TOP 5 * FROM AlmTabla WHERE tabla='0017'")
        columns = [column[0] for column in cursor.description]
        print(columns)
        for row in cursor.fetchall():
            print(row)
    except Exception as e:
        print("Error fetching AlmTabla:", e)

    # Check AlmmMatg
    print("--- AlmmMatg ---")
    try:
        cursor.execute("SELECT TOP 5 * FROM AlmmMatg")
        columns = [column[0] for column in cursor.description]
        print(columns)
        # for row in cursor.fetchall(): print(row)
    except Exception as e:
        print("Error fetching AlmmMatg:", e)
        
    # Check CONGASTO
    print("--- CONGASTO ---")
    try:
        cursor.execute("SELECT TOP 5 * FROM CONGASTO")
        columns = [column[0] for column in cursor.description]
        print(columns)
    except Exception as e:
        print("Error fetching CONGASTO:", e)

if __name__ == '__main__':
    inspect()
