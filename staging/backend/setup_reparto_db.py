import pyodbc
from database import get_db_connection

creation_scripts = [
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LogSolicitudesRecojo' and xtype='U')
    CREATE TABLE LogSolicitudesRecojo (
        id INT IDENTITY(1,1) PRIMARY KEY,
        tipo VARCHAR(20) DEFAULT 'OC',
        codcia CHAR(3) NOT NULL,
        nro_oc VARCHAR(20) NULL,
        fecha_recojo DATE NOT NULL,
        hora_recojo VARCHAR(10) NULL,
        origen VARCHAR(255) NULL,
        destino VARCHAR(255) NULL,
        contacto VARCHAR(150) NULL,
        responsable VARCHAR(150) NULL,
        estado VARCHAR(20) DEFAULT 'Pendiente',
        created_at DATETIME DEFAULT GETDATE(),
        created_by VARCHAR(50) NULL
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LogSolicitudesRecojoDet' and xtype='U')
    CREATE TABLE LogSolicitudesRecojoDet (
        id INT IDENTITY(1,1) PRIMARY KEY,
        solicitud_id INT FOREIGN KEY REFERENCES LogSolicitudesRecojo(id),
        codmat VARCHAR(20) NULL,
        descripcion VARCHAR(200) NULL,
        cantidad DECIMAL(10,2) NULL,
        unidad VARCHAR(10) NULL
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LogHojasRuta' and xtype='U')
    CREATE TABLE LogHojasRuta (
        id INT IDENTITY(1,1) PRIMARY KEY,
        codcia CHAR(3) NOT NULL,
        cod_chofer VARCHAR(20) NOT NULL,
        cod_movilidad VARCHAR(20) NOT NULL,
        fecha_ruta DATE NOT NULL,
        estado VARCHAR(20) DEFAULT 'Generada',
        created_at DATETIME DEFAULT GETDATE(),
        created_by VARCHAR(50) NULL
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LogHojasRutaDet' and xtype='U')
    CREATE TABLE LogHojasRutaDet (
        id INT IDENTITY(1,1) PRIMARY KEY,
        hoja_ruta_id INT FOREIGN KEY REFERENCES LogHojasRuta(id),
        solicitud_id INT FOREIGN KEY REFERENCES LogSolicitudesRecojo(id),
        orden INT DEFAULT 0,
        estado VARCHAR(20) DEFAULT 'Asignado'
    );
    """
]

def setup_reparto_db():
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            for script in creation_scripts:
                cursor.execute(script)
                conn.commit()
            print("Tablas de Reparto creadas exitosamente.")
            conn.close()
        except pyodbc.Error as e:
            print(f"Database setup error: {e}")
            conn.rollback()
    else:
        print("Failed to connect to database.")

if __name__ == "__main__":
    setup_reparto_db()
