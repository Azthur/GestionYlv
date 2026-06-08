import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from database import get_db_connection

conn = get_db_connection()
if not conn:
    print("Could not connect")
    sys.exit(1)

try:
    cursor = conn.cursor()
    
    # 1. Search for table names containing 'fam' or 'lin' or 'tab'
    cursor.execute("""
        SELECT name FROM sys.tables 
        WHERE name LIKE '%fam%' OR name LIKE '%mat%' OR name LIKE '%tabla%' OR name LIKE '%linea%'
    """)
    tables = [r[0] for r in cursor.fetchall()]
    print("Matching tables:", tables)
    
    # 2. Check if there is AlmFamil or similar
    # Let's see if we can find tables with a column 'codfam' and a column 'codcta'
    cursor.execute("""
        SELECT OBJECT_NAME(c.object_id) AS TableName, c.name AS ColumnName
        FROM sys.columns c
        JOIN sys.tables t ON c.object_id = t.object_id
        WHERE c.name = 'codfam'
    """)
    print("Tables with 'codfam' column:", cursor.fetchall())
    
    cursor.execute("""
        SELECT OBJECT_NAME(c.object_id) AS TableName, c.name AS ColumnName
        FROM sys.columns c
        JOIN sys.tables t ON c.object_id = t.object_id
        WHERE c.name = 'codcta'
    """)
    print("Tables with 'codcta' column:", cursor.fetchall())

except Exception as e:
    print("Error:", e)
finally:
    conn.close()
