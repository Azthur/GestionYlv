import pyodbc
import os

def generate_full_migration():
    # Dev DB Connection (from env vars in container)
    dev_server = os.getenv('DB_SERVER', '192.168.1.17\\SQL2022')
    dev_name = 'BK030226'
    dev_user = os.getenv('DB_USER', 'developer1')
    dev_pass = os.getenv('DB_PASSWORD', 'Y123456789y')
    
    # Prod DB Connection (from user request)
    prod_server = '192.168.1.17\\SQL2022'
    prod_name = 'yelave22'
    prod_user = 'JUBER2'
    prod_pass = 'PasswordSeguro123!'
    
    driver = "{ODBC Driver 18 for SQL Server}"
    
    def get_tables(server, db, user, pwd):
        conn_str = f"Driver={driver};Server={server};Database={db};UID={user};PWD={pwd};TrustServerCertificate=yes;Encrypt=no;"
        try:
            conn = pyodbc.connect(conn_str, timeout=5)
            cursor = conn.cursor()
            cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'")
            tables = set(r[0] for r in cursor.fetchall())
            conn.close()
            return tables
        except Exception as e:
            return None

    dev_tables = get_tables(dev_server, dev_name, dev_user, dev_pass)
    prod_tables = get_tables(prod_server, prod_name, prod_user, prod_pass)
    
    if dev_tables is None or prod_tables is None:
        print("Connection error.")
        return

    missing_in_prod = sorted(list(dev_tables - prod_tables))
    missing_in_prod = [t for t in missing_in_prod if t.lower() != 'sysdiagrams']

    conn_str = f"Driver={driver};Server={dev_server};Database={dev_name};UID={dev_user};PWD={dev_pass};TrustServerCertificate=yes;Encrypt=no;"
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()

    full_sql = "-- SCRIPT DE MIGRACIÓN TOTAL 2026\n-- Base de Datos: " + prod_name + "\n\n"

    for table in missing_in_prod:
        full_sql += f"-- TABLA: {table}\n"
        full_sql += f"IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[{table}]') AND type in (N'U'))\nBEGIN\n"
        full_sql += f"    CREATE TABLE [dbo].[{table}](\n"
        
        cursor.execute(f"""
            SELECT 
                COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, 
                IS_NULLABLE, COLUMN_DEFAULT, 
                COLUMNPROPERTY(OBJECT_ID(TABLE_NAME), COLUMN_NAME, 'IsIdentity') as IsIdentity,
                NUMERIC_PRECISION, NUMERIC_SCALE
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = '{table}' 
            ORDER BY ORDINAL_POSITION
        """)
        
        cols = cursor.fetchall()
        col_definitions = []
        for col in cols:
            name, dtype, length, nullable, default, is_identity, precision, scale = col
            
            line = f"        [{name}] [{dtype}]"
            
            if dtype in ('varchar', 'nvarchar', 'char', 'nchar'):
                if length == -1:
                    line += "(max)"
                else:
                    line += f"({length})"
            elif dtype == 'decimal' or dtype == 'numeric':
                line += f"({precision}, {scale})"
            
            if is_identity:
                line += " IDENTITY(1,1)"
            
            if nullable == 'NO':
                line += " NOT NULL"
            else:
                line += " NULL"
                
            if default:
                # Basic cleanup of default values
                line += f" DEFAULT {default}"
                
            col_definitions.append(line)
            
        full_sql += ",\n".join(col_definitions)
        
        # Check for Primary Key
        cursor.execute(f"""
            SELECT ku.COLUMN_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
            JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = '{table}'
        """)
        pks = [r[0] for r in cursor.fetchall()]
        if pks:
            full_sql += f",\n        CONSTRAINT [PK_{table}] PRIMARY KEY CLUSTERED (" + ", ".join([f"[{pk}] ASC" for pk in pks]) + ")"
            
        full_sql += "\n    )\nEND\nGO\n\n"

    with open('full_migration_script.sql', 'w', encoding='utf-8') as f:
        f.write(full_sql)
    print("Script generated successfully.")

if __name__ == "__main__":
    generate_full_migration()
