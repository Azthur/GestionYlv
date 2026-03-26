import sys
sys.path.append('c:\\SistemaGestionyelave\\backend')
from database import get_db_connection

conn = get_db_connection()
c = conn.cursor()

# Insert POS bank for all existing CodCia
c.execute("SELECT DISTINCT CodCia FROM CcbTabla WHERE Tabla='0001'")
cias = [row[0] for row in c.fetchall()]

for cia in cias:
    c.execute(f"""
    IF NOT EXISTS (SELECT * FROM CcbTabla WHERE CodCia='{cia}' AND Tabla='0001' AND Codigo='POS')
    BEGIN
        INSERT INTO CcbTabla (CodCia, Tabla, Codigo, Nombre, CodMon)
        VALUES ('{cia}', '0001', 'POS', 'IZIPAY/POS', '1')
    END
    """)

conn.commit()
print('POS Bank setup complete.')

# Check for CleaningRules table
try:
    c.execute("SELECT * FROM CleaningRules")
    print("CleaningRules table exists.")
except Exception as e:
    print("CleaningRules DOES NOT exist. Creating it...")
    conn.rollback() # clear previous error state
    c.execute("""
    CREATE TABLE CleaningRules (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        RegexPattern NVARCHAR(255) NOT NULL,
        Replacement NVARCHAR(255) NOT NULL,
        Description NVARCHAR(255),
        IsActive BIT DEFAULT 1
    )
    """)
    c.execute("""
    INSERT INTO CleaningRules (RegexPattern, Replacement, Description) VALUES
    ('^0+', '', 'Quitar ceros a la izquierda'),
    ('^OP-\\s*', '', 'Quitar prefijo OP- y sus espacios')
    """)
    conn.commit()
    print("CleaningRules table created and populated with default rules.")
