import os
import time
import pyodbc
from dotenv import load_dotenv

load_dotenv()

DB_SERVER = os.getenv("DB_SERVER")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
ODBC_DRIVER = os.getenv("ODBC_DRIVER", "{SQL Server}")

# Enable connection pooling
pyodbc.pooling = True

def get_db_connection(retries=3, delay=1):
    for attempt in range(retries):
        try:
            conn_str = (
                f"DRIVER={ODBC_DRIVER};"
                f"SERVER={DB_SERVER};"
                f"DATABASE={DB_NAME};"
                f"UID={DB_USER};"
                f"PWD={DB_PASSWORD};"
                "TrustServerCertificate=yes;"
                "Encrypt=no;"
                "Connection Timeout=15;"
            )
            conn = pyodbc.connect(conn_str, timeout=15)
            conn.timeout = 30  # query timeout
            return conn
        except Exception as e:
            print(f"DB connection attempt {attempt+1}/{retries} failed: {e}")
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                print(f"Error conectando a la base de datos tras {retries} intentos: {e}")
                return None

