import sys
import os
from dotenv import load_dotenv
import pyodbc

# Initialize environment
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '..', '..', 'backend', '.env'))

db_server = "VMSISTEMAS\SQL2019"
db_name = "yelave_produccion"
db_user = "sa"
db_password = r"123456"

connection_string = (
    "Driver={SQL Server};"
    f"Server={db_server};"
    f"Database={db_name};"
    f"UID={db_user};"
    f"PWD={db_password};"
)

def setup_tables():
    print(f"Connecting to {db_server}...")
    conn = pyodbc.connect(connection_string, autocommit=True)
    cursor = conn.cursor()

    # Create FinPagos
    finpagos_sql = """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FinPagos' and xtype='U')
    BEGIN
        CREATE TABLE FinPagos (
            Id INT IDENTITY(1,1) PRIMARY KEY,
            CodCia VARCHAR(50) NOT NULL,
            NroOrdenCompra VARCHAR(50) NOT NULL,
            DetalleId INT NOT NULL, -- FK to CntCargosDetalle
            MontoPago DECIMAL(18,2) NOT NULL,
            FechaPago DATE NOT NULL,
            BancoPago VARCHAR(100),
            Moneda VARCHAR(20),
            TipoPago VARCHAR(50),
            NroOperacion VARCHAR(100),
            Notas NVARCHAR(MAX),
            UsuarioRegistro VARCHAR(100),
            FechaRegistro DATETIME DEFAULT GETDATE()
        )
        print 'Table FinPagos created'
    END
    ELSE
    BEGIN
        print 'Table FinPagos already exists'
    END
    """
    cursor.execute(finpagos_sql)

    finpagos_adjuntos_sql = """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FinPagosAdjuntos' and xtype='U')
    BEGIN
        CREATE TABLE FinPagosAdjuntos (
            Id INT IDENTITY(1,1) PRIMARY KEY,
            PagoId INT NOT NULL, -- FK to FinPagos
            ArchivoNombre VARCHAR(255) NOT NULL,
            ArchivoRuta VARCHAR(500) NOT NULL,
            TipoMime VARCHAR(100),
            TamanoBytes BIGINT,
            FechaCarga DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_FinPagosAdjuntos_Pago FOREIGN KEY (PagoId) REFERENCES FinPagos(Id) ON DELETE CASCADE
        )
        print 'Table FinPagosAdjuntos created'
    END
    ELSE
    BEGIN
        print 'Table FinPagosAdjuntos already exists'
    END
    """
    cursor.execute(finpagos_adjuntos_sql)

    conn.close()
    print("Done")

if __name__ == "__main__":
    setup_tables()
