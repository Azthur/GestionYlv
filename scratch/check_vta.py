import pyodbc
from dotenv import load_dotenv
import os

load_dotenv()
DB_SERVER = os.getenv("DB_SERVER", "localhost")
DB_NAME = os.getenv("DB_NAME", "Yelave")
DB_USER = os.getenv("DB_USER", "sa")
DB_PASSWORD = os.getenv("DB_PASSWORD", "secret")

conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={DB_SERVER};DATABASE={DB_NAME};UID={DB_USER};PWD={DB_PASSWORD}"
conn = pyodbc.connect(conn_str)
cursor = conn.cursor()

cursor.execute("SELECT tabla, codigo, nombre FROM VtaTabla WHERE RTRIM(codigo) = 'Y31' AND RTRIM(tabla) IN ('0009', '0019')")
for row in cursor.fetchall():
    print(row)
