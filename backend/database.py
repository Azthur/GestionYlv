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
        conn = eng.raw_connection()
        cursor = conn.cursor()
        cursor.execute("SET ARITHABORT ON")
        cursor.close()
        return conn
    except Exception as e:
        print(f"Error getting pooled DB connection: {e}")
        return None


def setup_periodos_contables_tables():
    conn = get_db_connection()
    if not conn:
        print("ERROR: Could not connect to DB to setup periodos_contables tables")
        return
    try:
        cursor = conn.cursor()
        
        # 1. Create table CntPeriodoContable
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CntPeriodoContable]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[CntPeriodoContable](
                    [Id] [int] IDENTITY(1,1) NOT NULL,
                    [CodCia] [varchar](10) NOT NULL,
                    [Ano] [int] NOT NULL,
                    [Mes] [int] NOT NULL,
                    [Estado] [varchar](10) NOT NULL DEFAULT 'ABIERTO',
                    CONSTRAINT [PK_CntPeriodoContable] PRIMARY KEY CLUSTERED ([Id] ASC),
                    CONSTRAINT [UQ_CntPeriodoContable] UNIQUE ([CodCia], [Ano], [Mes])
                )
                PRINT 'Tabla CntPeriodoContable creada'
            END
        """)
        
        # 2. Add FecPeriodoContable to CntFacturaCab
        cursor.execute("""
            IF COL_LENGTH('CntFacturaCab', 'FecPeriodoContable') IS NULL
            BEGIN
                ALTER TABLE CntFacturaCab ADD FecPeriodoContable DATE NULL;
                PRINT 'Columna FecPeriodoContable agregada a CntFacturaCab'
            END
        """)
        
        # 3. Add FecPeriodoContable to FinRendicionGastosCab
        cursor.execute("""
            IF COL_LENGTH('FinRendicionGastosCab', 'FecPeriodoContable') IS NULL
            BEGIN
                ALTER TABLE FinRendicionGastosCab ADD FecPeriodoContable DATE NULL;
                PRINT 'Columna FecPeriodoContable agregada a FinRendicionGastosCab'
            END
        """)
        
        # 4. Add FecPeriodoContable to FinPlanillaMovilidadCab
        cursor.execute("""
            IF COL_LENGTH('FinPlanillaMovilidadCab', 'FecPeriodoContable') IS NULL
            BEGIN
                ALTER TABLE FinPlanillaMovilidadCab ADD FecPeriodoContable DATE NULL;
                PRINT 'Columna FecPeriodoContable agregada a FinPlanillaMovilidadCab'
            END
        """)
        
        conn.commit()
    except Exception as e:
        print("Error setting up periodos contables tables:", e)
        try: conn.rollback()
        except: pass
    finally:
        conn.close()


def get_fec_periodo_contable(conn, codcia, fec_emision):
    from datetime import datetime
    if not fec_emision:
        return None
        
    # Standardize to datetime object
    if isinstance(fec_emision, str):
        try:
            dt = datetime.strptime(fec_emision[:10], '%Y-%m-%d')
        except Exception:
            return fec_emision
    elif hasattr(fec_emision, 'year'):
        dt = fec_emision
    else:
        return fec_emision
        
    try:
        cursor = conn.cursor()
        
        # 1. Check if the specific period (Ano, Mes) is explicitly CERRADO
        cursor.execute(
            "SELECT Estado FROM CntPeriodoContable WHERE RTRIM(CodCia) = ? AND Ano = ? AND Mes = ?",
            (codcia.strip(), dt.year, dt.month)
        )
        row = cursor.fetchone()
        
        if not row or row[0].strip().upper() != 'CERRADO':
            # It is open (either explicitly or implicitly), so return the original date
            return dt.strftime('%Y-%m-%d') if not isinstance(fec_emision, str) else fec_emision
            
        # 2. Period is closed, find the first ABIERTO period chronologically after this
        cursor.execute("""
            SELECT TOP 1 Ano, Mes FROM CntPeriodoContable 
            WHERE RTRIM(CodCia) = ? 
              AND (Ano > ? OR (Ano = ? AND Mes > ?)) 
              AND Estado = 'ABIERTO' 
            ORDER BY Ano ASC, Mes ASC
        """, (codcia.strip(), dt.year, dt.year, dt.month))
        row = cursor.fetchone()
        if row:
            return f"{row[0]}-{str(row[1]).rjust(2, '0')}-01"
            
        # 3. If no explicit open period exists after this in the database, 
        # scan consecutive months and find the first one that is NOT closed.
        curr_year = dt.year
        curr_month = dt.month
        for _ in range(120): # Safe limit of 10 years
            curr_month += 1
            if curr_month > 12:
                curr_month = 1
                curr_year += 1
                
            cursor.execute(
                "SELECT Estado FROM CntPeriodoContable WHERE RTRIM(CodCia) = ? AND Ano = ? AND Mes = ?",
                (codcia.strip(), curr_year, curr_month)
            )
            r = cursor.fetchone()
            if not r or r[0].strip().upper() != 'CERRADO':
                return f"{curr_year}-{str(curr_month).rjust(2, '0')}-01"
                
        return dt.strftime('%Y-%m-%d') if not isinstance(fec_emision, str) else fec_emision
    except Exception as e:
        print("Error checking FecPeriodoContable:", e)
        return dt.strftime('%Y-%m-%d') if not isinstance(fec_emision, str) else fec_emision


