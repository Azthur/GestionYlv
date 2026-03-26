import traceback
import pyodbc
from dotenv import load_dotenv
import os

def create_logistics_tables():
    load_dotenv(override=True)
    conn_str = (
        f"DRIVER={{SQL Server}};"
        f"SERVER={os.getenv('DB_SERVER')};"
        f"DATABASE={os.getenv('DB_NAME')};"
        f"UID={os.getenv('DB_USER')};"
        f"PWD={os.getenv('DB_PASSWORD')};"
    )
    conn = pyodbc.connect(conn_str)
    if not conn:
        print("Error connecting to DB")
        return

    cursor = conn.cursor()

    queries = [
        """
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Log_CmpVCoti' AND xtype='U')
        CREATE TABLE Log_CmpVCoti (
            IdCoti INT IDENTITY(1,1) PRIMARY KEY,
            CodCia CHAR(3) DEFAULT '01',
            NroDoc VARCHAR(20),
            NroReq VARCHAR(20),
            Prov_RUC VARCHAR(15),
            Prov_Nom VARCHAR(150),
            FchDoc DATETIME DEFAULT GETDATE(),
            FchValidez DATETIME,
            Estado VARCHAR(20) DEFAULT 'PENDIENTE',
            Moneda VARCHAR(3) DEFAULT 'PEN',
            TpoCmb NUMERIC(10,4),
            ImpNet NUMERIC(14,2),
            ImpIgv NUMERIC(14,2),
            ImpTot NUMERIC(14,2),
            Usuario VARCHAR(50),
            CondicionPago VARCHAR(100),
            TiempoEntrega VARCHAR(50)
        )
        """,
        """
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Log_CmpRCoti' AND xtype='U')
        CREATE TABLE Log_CmpRCoti (
            IdDetalle INT IDENTITY(1,1) PRIMARY KEY,
            IdCoti INT,
            NroItm INT,
            CodMat VARCHAR(18),
            DesMat VARCHAR(200),
            UndStk VARCHAR(5),
            Cantidad NUMERIC(14,4),
            PreUni NUMERIC(14,4),
            PorIgv NUMERIC(6,2),
            ImpIgv NUMERIC(14,2),
            ImpTot NUMERIC(14,2),
            FOREIGN KEY (IdCoti) REFERENCES Log_CmpVCoti(IdCoti) ON DELETE CASCADE
        )
        """,
        """
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Log_Aprobaciones' AND xtype='U')
        CREATE TABLE Log_Aprobaciones (
            IdAprob INT IDENTITY(1,1) PRIMARY KEY,
            DocTipo VARCHAR(20), -- 'COTI', 'REQ', 'OC'
            DocId VARCHAR(50), -- NroDoc o Id
            Nivel VARCHAR(50), -- 'JEFATURA', 'GERENCIA'
            Estado VARCHAR(20), -- 'APROBADO', 'RECHAZADO'
            Usuario VARCHAR(50),
            Fecha DATETIME DEFAULT GETDATE(),
            Comentario VARCHAR(500)
        )
        """,
        """
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Log_ControlCalidad' AND xtype='U')
        CREATE TABLE Log_ControlCalidad (
            IdCC INT IDENTITY(1,1) PRIMARY KEY,
            NroLote VARCHAR(50),
            CodMat VARCHAR(18),
            FechaEval DATETIME DEFAULT GETDATE(),
            Estado VARCHAR(20), -- 'APROBADO', 'RECHAZADO', 'OBSERVADO'
            Archivo_COA VARCHAR(255),
            Archivo_MSDS VARCHAR(255),
            Archivo_FT VARCHAR(255),
            Usuario VARCHAR(50),
            Comentario VARCHAR(500)
        )
        """
    ]

    try:
        for query in queries:
            cursor.execute(query)
        conn.commit()
        print("Logistics tables created successfully.")
    except Exception as e:
        conn.rollback()
        print(f"Error creating tables: {e}")
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == '__main__':
    create_logistics_tables()
