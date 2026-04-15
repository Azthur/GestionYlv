import os
from dotenv import load_dotenv
import pyodbc

load_dotenv(override=True)
db_server = os.getenv("DB_SERVER")
db_name = os.getenv("DB_NAME")
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
print("Connecting to:", db_server, db_name, db_user, db_password)

conn_str = f"DRIVER={{SQL Server}};SERVER={db_server};DATABASE={db_name};UID={db_user};PWD={db_password};TrustServerCertificate=yes;Encrypt=no;"
try:
    conn = pyodbc.connect(conn_str)
    print("SUCCESS")
except Exception as e:
    print("ERROR:", str(e))
