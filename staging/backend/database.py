import os
import time
import pyodbc
from dotenv import load_dotenv

load_dotenv()

# Enable connection pooling
pyodbc.pooling = True

def get_db_connection(retries=3, delay=1):
    for attempt in range(retries):
        try:
            # Re-read from the .env file each time so dynamic updates from UI
            # take effect across all workers immediately.
            load_dotenv(override=True)
            db_server = os.getenv("DB_SERVER")
            db_name = os.getenv("DB_NAME")
            db_user = os.getenv("DB_USER")
            db_password = os.getenv("DB_PASSWORD")
            odbc_driver = os.getenv("ODBC_DRIVER", "{SQL Server}")
            
            conn_str = (
                f"DRIVER={odbc_driver};"
                f"SERVER={db_server};"
                f"DATABASE={db_name};"
                f"UID={db_user};"
                f"PWD={db_password};"
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

