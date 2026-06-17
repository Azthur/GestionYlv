import sys
sys.path.append('.')
from backend.database import get_db_connection

def inspect():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect")
        return
    cursor = conn.cursor()
    
    # 1. List all tables
    cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
    tables = [r[0] for r in cursor.fetchall()]
    print("Tables in Database:")
    for t in tables:
        if 'periodo' in t.lower() or 'cnt' in t.lower() or 'fin' in t.lower():
            print(f" - {t}")
            
    # 2. Check columns of CntFacturaCab, FinRendicionGastosCab, FinPlanillaMovilidadCab
    for table in ['CntFacturaCab', 'FinRendicionGastosCab', 'FinPlanillaMovilidadCab']:
        print(f"\nColumns of {table}:")
        cursor.execute(f"SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='{table}' ORDER BY ORDINAL_POSITION")
        for r in cursor.fetchall():
            print(f"  {r[0]}: {r[1]}")
            
    conn.close()

if __name__ == '__main__':
    inspect()
