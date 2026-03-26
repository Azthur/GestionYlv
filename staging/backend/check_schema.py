import os
import pyodbc
from dotenv import load_dotenv

load_dotenv(r"c:\SistemaGestionyelave\staging\backend\.env")

conn_str = (
    f"DRIVER={{SQL Server}};"
    f"SERVER={os.getenv('DB_SERVER')};"
    f"DATABASE={os.getenv('DB_NAME')};"
    f"UID={os.getenv('DB_USER')};"
    f"PWD={os.getenv('DB_PASSWORD')};"
    "TrustServerCertificate=yes;"
    "Encrypt=no;"
)
try:
    conn = pyodbc.connect(conn_str, timeout=15)
    cursor = conn.cursor()
    tables = ['Production_Orders', 'ORDEN_LOTES', 'prod_crea']
    for t in tables:
        print(f"--- {t} ---")
        cursor.execute(f"""
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = '{t}'
            ORDER BY ORDINAL_POSITION
        """)
        for row in cursor.fetchall():
            print(f"  {row.COLUMN_NAME} ({row.DATA_TYPE})")
    conn.close()
except Exception as e:
    print(e)
