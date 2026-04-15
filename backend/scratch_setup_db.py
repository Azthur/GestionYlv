import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import get_db_connection

def setup():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect")
        return
    cursor = conn.cursor()
    cursor.execute("""
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FinPagos' and xtype='U')
    BEGIN
        CREATE TABLE FinPagos (
            Id INT IDENTITY(1,1) PRIMARY KEY,
            CodCia VARCHAR(50) NOT NULL,
            NroOrdenCompra VARCHAR(50) NOT NULL,
            DetalleId INT NOT NULL,
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
    """)
    
    cursor.execute("""
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FinPagosAdjuntos' and xtype='U')
    BEGIN
        CREATE TABLE FinPagosAdjuntos (
            Id INT IDENTITY(1,1) PRIMARY KEY,
            PagoId INT NOT NULL,
            ArchivoNombre VARCHAR(255) NOT NULL,
            ArchivoRuta VARCHAR(500) NOT NULL,
            TipoMime VARCHAR(100),
            TamanoBytes BIGINT,
            FechaCarga DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_FinPagosAdjuntos_Pago FOREIGN KEY (PagoId) REFERENCES FinPagos(Id) ON DELETE CASCADE
        )
        print 'Table FinPagosAdjuntos created'
    END
    """)
    conn.commit()
    conn.close()
    print("Success setup")

if __name__ == '__main__':
    setup()
