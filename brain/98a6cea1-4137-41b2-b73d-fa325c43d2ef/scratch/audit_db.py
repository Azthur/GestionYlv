import sys
sys.path.append('c:/SistemaGestionyelave/backend')
from database import get_db_connection

def audit_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Check all tables with relevant prefixes
    prefixes = ['Log', 'Adm', 'Cnt', 'Vta']
    all_relevant_tables = []
    for p in prefixes:
        cursor.execute(f"SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '{p}%' ORDER BY TABLE_NAME")
        all_relevant_tables.extend([r[0] for r in cursor.fetchall()])
    
    print("RELEVANT TABLES FOUND:")
    for t in all_relevant_tables:
        print(f"  - {t}")

    # 2. Check for recent modifications if possible (sys.objects)
    print("\nRECENTLY CREATED/MODIFIED OBJECTS (sys.objects):")
    try:
        cursor.execute("SELECT name, create_date, modify_date FROM sys.objects WHERE type = 'U' AND (name LIKE 'Log%' OR name LIKE 'Adm%' OR name LIKE 'Cnt%') ORDER BY modify_date DESC")
        for row in cursor.fetchall():
            print(f"  {row[0]}: Created={row[1]}, Modified={row[2]}")
    except:
        print("  Could not query sys.objects directly.")

if __name__ == "__main__":
    audit_db()
