import pyodbc
from database import get_db_connection

# Script para inicializar las tablas necesarias de YELAVE ERP

creation_scripts = [
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RawMaterial_Batches' and xtype='U')
    CREATE TABLE RawMaterial_Batches (
        id INT IDENTITY(1,1) PRIMARY KEY,
        raw_material_id INT,
        batch_number VARCHAR(50) NOT NULL,
        expiry_date DATE NOT NULL,
        received_quantity DECIMAL(10,2),
        current_quantity DECIMAL(10,2),
        digemid_approval BIT DEFAULT 0,
        created_at DATETIME DEFAULT GETDATE()
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Production_Orders' and xtype='U')
    CREATE TABLE Production_Orders (
        id INT IDENTITY(1,1) PRIMARY KEY,
        product_base_id INT,
        final_batch_number VARCHAR(50) NOT NULL,
        sanitary_registry VARCHAR(100) NOT NULL,
        technical_director VARCHAR(150) NOT NULL,
        planned_quantity DECIMAL(10,2),
        produced_quantity DECIMAL(10,2) NULL,
        status VARCHAR(50) DEFAULT 'Planificada',
        start_date DATETIME,
        end_date DATETIME NULL,
        created_at DATETIME DEFAULT GETDATE(),
        product_name VARCHAR(255) NULL
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Purchase_Orders' and xtype='U')
    CREATE TABLE Purchase_Orders (
        id INT IDENTITY(1,1) PRIMARY KEY,
        production_order_id INT NULL,
        supplier_id INT,
        status VARCHAR(20) DEFAULT 'Pendiente',
        total_amount DECIMAL(12,2),
        created_at DATETIME DEFAULT GETDATE()
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Traceability_Log' and xtype='U')
    CREATE TABLE Traceability_Log (
        id INT IDENTITY(1,1) PRIMARY KEY,
        production_order_id INT FOREIGN KEY REFERENCES Production_Orders(id),
        raw_material_batch_id INT FOREIGN KEY REFERENCES RawMaterial_Batches(id),
        quantity_used DECIMAL(10,2),
        registered_at DATETIME DEFAULT GETDATE()
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Inventory_Movements' and xtype='U')
    CREATE TABLE Inventory_Movements (
        id INT IDENTITY(1,1) PRIMARY KEY,
        item_type VARCHAR(20),
        item_id INT,
        batch_number VARCHAR(50),
        warehouse_id INT,
        quantity DECIMAL(10,2),
        movement_type VARCHAR(10),
        reason VARCHAR(50),
        movement_date DATETIME DEFAULT GETDATE()
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Sales_Goals' and xtype='U')
    CREATE TABLE Sales_Goals (
        id INT IDENTITY(1,1) PRIMARY KEY,
        salesperson_id INT, 
        target_amount DECIMAL(12,2),
        achieved_amount DECIMAL(12,2) DEFAULT 0,
        commission_rate DECIMAL(5,2),
        goal_month INT,
        goal_year INT
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Expense_Reports' and xtype='U')
    CREATE TABLE Expense_Reports (
        id INT IDENTITY(1,1) PRIMARY KEY,
        employee_id INT,
        total_amount DECIMAL(10,2),
        digital_receipt_url VARCHAR(255),
        status VARCHAR(20) DEFAULT 'En Revision', 
        created_at DATETIME DEFAULT GETDATE()
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Deliveries' and xtype='U')
    CREATE TABLE Deliveries (
        id INT IDENTITY(1,1) PRIMARY KEY,
        sale_order_id INT, 
        driver_id INT,
        vehicle_type VARCHAR(20),
        vehicle_plate VARCHAR(20),
        delivery_status VARCHAR(50) DEFAULT 'En Ruta', 
        last_location_lat DECIMAL(10,8) NULL,
        last_location_lon DECIMAL(11,8) NULL,
        updated_at DATETIME DEFAULT GETDATE()
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='BankMovements' and xtype='U')
    CREATE TABLE BankMovements (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CodCia CHAR(3) NOT NULL,
        BankCode CHAR(4) NOT NULL,
        Fecha DATE NOT NULL,
        Descripcion VARCHAR(200),
        Monto DECIMAL(12,2),
        Saldo DECIMAL(12,2),
        Sucursal VARCHAR(50),
        OperacionNumero VARCHAR(30),
        OperacionHora VARCHAR(10),
        Referencia VARCHAR(50),
        OpManual VARCHAR(30),
        OpCancelacion VARCHAR(30),
        DescripcionFinal VARCHAR(200),
        Estado VARCHAR(20) DEFAULT 'Pendiente',
        ReconciliationDetailId INT NULL,
        ImportBatchId VARCHAR(36),
        ImportedAt DATETIME DEFAULT GETDATE(),
        ImportedBy VARCHAR(30)
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='BankReconciliation' and xtype='U')
    CREATE TABLE BankReconciliation (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CodCia CHAR(3) NOT NULL,
        BankCode CHAR(4) NOT NULL,
        PeriodYear CHAR(4),
        PeriodMonth CHAR(2),
        Status VARCHAR(20) DEFAULT 'En Proceso',
        TotalBankMov INT DEFAULT 0,
        TotalMatched INT DEFAULT 0,
        TotalUnmatched INT DEFAULT 0,
        CreatedAt DATETIME DEFAULT GETDATE(),
        CreatedBy VARCHAR(30)
    );
    """,
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ReconciliationDetail' and xtype='U')
    CREATE TABLE ReconciliationDetail (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ReconciliationId INT NULL,
        BankMovementId INT NOT NULL,
        MatchCodCia CHAR(3),
        MatchCoddoc CHAR(4),
        MatchNrodoc CHAR(10),
        MatchNroitm CHAR(10),
        MatchType VARCHAR(20),
        MatchedAt DATETIME DEFAULT GETDATE(),
        MatchedBy VARCHAR(30)
    );
    """
]

dummy_data_scripts = [
    """
    IF NOT EXISTS (SELECT 1 FROM Production_Orders)
    BEGIN
        INSERT INTO Production_Orders (product_base_id, final_batch_number, sanitary_registry, technical_director, planned_quantity, status, product_name)
        VALUES 
        (1, 'L-HDF2301', 'NSOC12345-21PE', 'Dra. Elena Silva (CQ-1234)', 5000, 'En Control de Calidad', 'Crema Hidratante Facial 50ml'),
        (2, 'L-SVC2302', 'NSOC54321-21PE', 'Dra. Elena Silva (CQ-1234)', 2000, 'En Proceso', 'Serum Vitamina C 30ml'),
        (3, 'L-AMC2303', 'NSOC98765-22PE', 'Dr. Carlos Mendoza (CQ-5678)', 3500, 'Planificada', 'Agua Micelar Piel Sensible 200ml');
    END
    """
]

def init_db():
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            for script in creation_scripts:
                cursor.execute(script)
                conn.commit()
            print("Tablas creadas exitosamente.")
            
            for script in dummy_data_scripts:
                cursor.execute(script)
                conn.commit()
            print("Datos de prueba insertados exitosamente.")
                
            conn.close()
        except pyodbc.Error as e:
            print(f"Database setup error: {e}")
            conn.rollback()
    else:
        print("Failed to connect to database.")

if __name__ == "__main__":
    init_db()
