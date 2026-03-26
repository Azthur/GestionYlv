import os
import pyodbc
import json

def get_schema():
    odbc_driver = "{SQL Server}"
    db_server = r"192.168.1.17\SQL2022"
    db_name = "BK030226"
    db_user = "developer1"
    db_password = "Y123456789y"
    
    conn_str = (
        f"DRIVER={odbc_driver};"
        f"SERVER={db_server};"
        f"DATABASE={db_name};"
        f"UID={db_user};"
        f"PWD={db_password};"
        "TrustServerCertificate=yes;"
    )
    
    try:
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        tables = ['AlmVMovm', 'AlmVMovd', 'AlmRMovm', 'AlmRMovd', 'almTmovm', 'CbdMauxi', 'AlmTabla', 'AlmmMatg', 'AlmmMate']
        res = {}
        for t in tables:
            try:
                cursor.execute(f"SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='{t}'")
                cols = cursor.fetchall()
                if not cols:
                    res[t] = "No columns found"
                else:
                    res[t] = [{'column': c[0], 'type': c[1], 'length': c[2]} for c in cols]
            except Exception as e:
                res[t] = str(e)
                
        with open('kardex_schema.json', 'w', encoding='utf-8') as f:
            json.dump(res, f, indent=2)
        print("Schema saved to kardex_schema.json")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    get_schema()
