import pyodbc
from dotenv import load_dotenv
import os

load_dotenv()
DB_SERVER = os.getenv("DB_SERVER", "localhost")
DB_NAME = os.getenv("DB_NAME", "YELAVE22")
DB_USER = os.getenv("DB_USER", "sa")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Alondra_2022")

conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={DB_SERVER};DATABASE={DB_NAME};UID={DB_USER};PWD={DB_PASSWORD}"
try:
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    cursor.execute("SELECT TOP 5 NroOrdenCompra, NumRucProveedor, Serie, Numero FROM CntFacturaCab WHERE NroOrdenCompra = '00000158'")
    rows = cursor.fetchall()
    print("CntFacturaCab:", rows)
    
    cursor.execute("SELECT TOP 5 NroDoc, TipoOc, RucAux, NomAux FROM CmpVOcom WHERE NroDoc = '00000158'")
    rows2 = cursor.fetchall()
    print("CmpVOcom:", rows2)
    
except Exception as e:
    print("Error:", e)
