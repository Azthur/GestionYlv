import pyodbc
import os

def audit():
    try:
        conn_str = (
            f"Driver={{ODBC Driver 18 for SQL Server}};"
            f"Server={os.getenv('DB_SERVER')};"
            f"Database={os.getenv('DB_NAME')};"
            f"UID={os.getenv('DB_USER')};"
            f"PWD={os.getenv('DB_PASSWORD')};"
            "TrustServerCertificate=yes;"
            "Encrypt=no;"
        )
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        
        print("--- TABLES IN DATABASE ---")
        cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME")
        all_tables = [r[0] for r in cursor.fetchall()]
        
        prefixes = ['Log', 'Adm', 'Cnt', 'Vta']
        relevant_tables = [t for t in all_tables if any(t.startswith(p) for p in prefixes)]
        
        for t in relevant_tables:
            print(f"  {t}")
            
        print("\n--- RECENTLY CREATED TABLES (sys.objects) ---")
        cursor.execute("SELECT name, create_date FROM sys.objects WHERE type = 'U' ORDER BY create_date DESC")
        for row in cursor.fetchall():
            if any(row[0].startswith(p) for p in prefixes):
                print(f"  {row[0]}: {row[1]}")
        
        print("\n--- SCHEMA OF NEWEST TABLES ---")
        log_tables = [t for t in relevant_tables if t.startswith('Log')]
        for t in log_tables:
            print(f"\nTABLE: {t}")
            cursor.execute(f"SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{t}' ORDER BY ORDINAL_POSITION")
            for r in cursor.fetchall():
                size = f"({r[2]})" if r[2] else ""
                print(f"  - {r[0]} {r[1]}{size}")
                
    except Exception as e:
        print(f"Error during audit: {e}")

if __name__ == "__main__":
    audit()
