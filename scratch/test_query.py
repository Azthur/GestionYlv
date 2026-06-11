import os
from dotenv import load_dotenv
import pyodbc

load_dotenv()
DB_SERVER = os.getenv("DB_SERVER", "localhost")
DB_NAME = os.getenv("DB_NAME", "Yelave")
DB_USER = os.getenv("DB_USER", "sa")
DB_PASSWORD = os.getenv("DB_PASSWORD", "secret")
conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={DB_SERVER};DATABASE={DB_NAME};UID={DB_USER};PWD={DB_PASSWORD}"

try:
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    codcias = ['007']
    login = '71941916JL'
    placeholders = ",".join("?" for _ in codcias)
    
    # query 1
    cursor.execute(
        f"SELECT RTRIM(codcia) as codcia, RTRIM(codigo) AS codigo, RTRIM(nombre) AS nombre FROM VtaTabla WHERE RTRIM(codcia) IN ({placeholders}) AND RTRIM(tabla) = '0009' ORDER BY codcia, codigo",
        codcias
    )
    res = cursor.fetchall()
    print("Q1 OK")

    # query 2
    cursor.execute(
        f"SELECT RTRIM(codcia) as codcia, RTRIM(codigo) AS codigo, RTRIM(nombre) AS nombre FROM VtaTabla WHERE RTRIM(codcia) IN ({placeholders}) AND RTRIM(tabla) = '0019' ORDER BY codcia, codigo",
        codcias
    )
    res = cursor.fetchall()
    print("Q2 OK")

except Exception as e:
    import traceback
    traceback.print_exc()
