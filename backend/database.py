import os
import time
import pyodbc
from dotenv import load_dotenv

load_dotenv()

import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine
import urllib.parse

load_dotenv(override=True)

# Singleton SQLAlchemy Engine
engine = None

def init_db_engine():
    global engine
    if engine is not None:
        return engine
        
    db_server = os.getenv("DB_SERVER", "sistemamigconta-db")
    db_name = os.getenv("DB_NAME", "master")
    db_user = os.getenv("DB_USER", "sa")
    db_password = os.getenv("DB_PASSWORD", "")
    
    default_driver = "{SQL Server}" if sys.platform == "win32" else "ODBC Driver 18 for SQL Server"
    odbc_driver = os.getenv("ODBC_DRIVER", default_driver)
    if sys.platform != "win32" and "ODBC Driver" not in odbc_driver:
        odbc_driver = "ODBC Driver 18 for SQL Server"
        
    connection_string = (
        f"Driver={odbc_driver};"
        f"Server={db_server};"
        f"Database={db_name};"
        f"UID={db_user};"
        f"PWD={db_password};"
        "TrustServerCertificate=yes;"
        "Encrypt=no;"
    )
    
    params = urllib.parse.quote_plus(connection_string)
    engine = create_engine(
        f"mssql+pyodbc:///?odbc_connect={params}",
        pool_size=50,
        max_overflow=20,
        pool_pre_ping=True
    )
    return engine

def get_db_connection():
    eng = init_db_engine()
    try:
        # Get a DBAPI connection mapped closely to pyodbc from the SQLAlchemy Pool
        return eng.raw_connection()
    except Exception as e:
        print(f"Error getting pooled DB connection: {e}")
        return None

