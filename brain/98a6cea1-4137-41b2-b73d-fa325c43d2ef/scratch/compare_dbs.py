import pyodbc
import os

def compare_dbs():
    # Dev DB Connection (from env vars in container)
    dev_server = os.getenv('DB_SERVER', '192.168.1.17\\SQL2022')
    dev_name = 'BK030226'
    dev_user = os.getenv('DB_USER', 'developer1')
    dev_pass = os.getenv('DB_PASSWORD', 'Y123456789y')
    
    # Prod DB Connection (from user request)
    prod_server = '192.168.1.17\\SQL2022'
    prod_name = 'yelave22'
    prod_user = 'JUBER2'
    prod_pass = 'PasswordSeguro123!'
    
    driver = "{ODBC Driver 18 for SQL Server}"
    
    def get_tables(server, db, user, pwd):
        conn_str = f"Driver={driver};Server={server};Database={db};UID={user};PWD={pwd};TrustServerCertificate=yes;Encrypt=no;"
        try:
            conn = pyodbc.connect(conn_str, timeout=5)
            cursor = conn.cursor()
            cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'")
            tables = set(r[0] for r in cursor.fetchall())
            conn.close()
            return tables
        except Exception as e:
            print(f"Error connecting to {db}: {e}")
            return None

    print(f"--- COMPARISON START ---")
    dev_tables = get_tables(dev_server, dev_name, dev_user, dev_pass)
    prod_tables = get_tables(prod_server, prod_name, prod_user, prod_pass)
    
    if dev_tables is None or prod_tables is None:
        print("Comparison failed due to connection error.")
        return

    missing_in_prod = sorted(list(dev_tables - prod_tables))
    
    print(f"\nTABLES TO CREATE IN PRODUCTION ({prod_name}):")
    for t in missing_in_prod:
        # Filter for relevant prefixes to avoid system/garbage tables
        if any(t.startswith(p) for p in ['Log', 'Cnt', 'Adm', 'Vta', 'Config']):
            print(f"  - {t}")

if __name__ == "__main__":
    compare_dbs()
