import os
import pyodbc
from dotenv import load_dotenv

load_dotenv()

def setup_production_db():
    conn_str = (
        f"DRIVER={{SQL Server}};"
        f"SERVER={os.getenv('DB_SERVER')};"
        f"DATABASE={os.getenv('DB_NAME')};"
        f"UID={os.getenv('DB_USER')};"
        f"PWD={os.getenv('DB_PASSWORD')};"
        "TrustServerCertificate=yes;"
        "Encrypt=no;"
    )
    
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()

    try:
        print("Checking/Creating Log_Prod_Orden...")
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Log_Prod_Orden' AND xtype='U')
            BEGIN
                CREATE TABLE Log_Prod_Orden (
                    IdOrden INT IDENTITY(1,1) PRIMARY KEY,
                    NroOrden VARCHAR(20) NOT NULL,
                    Cliente VARCHAR(100),
                    FchInicio DATE,
                    FchFin DATE,
                    FchEntrega DATE,
                    Almacen VARCHAR(50),
                    LotePT VARCHAR(50),
                    CodProducto VARCHAR(50),
                    ProductoDesc VARCHAR(150),
                    Presentacion VARCHAR(100),
                    CantPlanificada DECIMAL(12,4),
                    CantProducida DECIMAL(12,4),
                    CantMuestras DECIMAL(12,4),
                    CantEntregada DECIMAL(12,4),
                    Estado VARCHAR(20) DEFAULT 'EN PROCESO',
                    UsuarioCrea VARCHAR(50),
                    FchRegistro DATETIME DEFAULT GETDATE()
                )
            END
        """)

        print("Checking/Creating Log_Prod_Etapas...")
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Log_Prod_Etapas' AND xtype='U')
            BEGIN
                CREATE TABLE Log_Prod_Etapas (
                    IdEtapa INT IDENTITY(1,1) PRIMARY KEY,
                    IdOrden INT NOT NULL,
                    NombreEtapa VARCHAR(100) NOT NULL, /* Ej: Proceso I, Proceso II */
                    Descripcion VARCHAR(200),
                    OrdenSecuencia INT,
                    Estado VARCHAR(20) DEFAULT 'PENDIENTE',
                    CONSTRAINT FK_Prod_Etapas_Orden FOREIGN KEY (IdOrden) REFERENCES Log_Prod_Orden(IdOrden)
                )
            END
        """)

        print("Checking/Creating Log_Prod_Costos...")
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Log_Prod_Costos' AND xtype='U')
            BEGIN
                CREATE TABLE Log_Prod_Costos (
                    IdCosto INT IDENTITY(1,1) PRIMARY KEY,
                    IdOrden INT NOT NULL,
                    IdEtapa INT NULL,
                    TipoCosto VARCHAR(10) NOT NULL, /* MP, MOD, CIF, MEP, MAQ */
                    Fecha DATE NOT NULL,
                    Detalle VARCHAR(250) NOT NULL,
                    UnidadMedida VARCHAR(10) NULL,
                    Cantidad DECIMAL(12,4) NOT NULL DEFAULT 0,
                    CostoUnitario DECIMAL(12,4) NOT NULL DEFAULT 0,
                    CostoTotal DECIMAL(12,4) NOT NULL DEFAULT 0,
                    ComprobanteRef VARCHAR(50) NULL, /* Factura, Guia, etc. */
                    CONSTRAINT FK_Prod_Costos_Orden FOREIGN KEY (IdOrden) REFERENCES Log_Prod_Orden(IdOrden),
                    CONSTRAINT FK_Prod_Costos_Etapa FOREIGN KEY (IdEtapa) REFERENCES Log_Prod_Etapas(IdEtapa)
                )
            END
        """)

        conn.commit()
        print("Production tables checked and created successfully.")

    except Exception as e:
        conn.rollback()
        print(f"Error executing script: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    setup_production_db()
