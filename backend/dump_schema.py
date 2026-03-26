from database import get_db_connection
import pyodbc
from dotenv import load_dotenv
import os
import json

def get_schema():
    load_dotenv(override=True)
    conn_str = (
        f"DRIVER={{SQL Server}};"
        f"SERVER={os.getenv('DB_SERVER')};"
        f"DATABASE={os.getenv('DB_NAME')};"
        f"UID={os.getenv('DB_USER')};"
        f"PWD={os.getenv('DB_PASSWORD')};"
    )
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    
    # explicitly requested tables
    tables = ['AlmmMatg', 'AlmmMate', 'AlmAcmLt']
    
    schema = {}
    
    for table in tables:
        cursor.execute(f"""
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = '{table}' 
            ORDER BY ORDINAL_POSITION
        """)
        cols = cursor.fetchall()
        if cols:
            schema[table] = [{"column": row[0], "type": row[1], "length": row[2]} for row in cols]
        else:
            schema[table] = "NOT_FOUND"
            
    # relevant tables based on module names
    keywords = ['kard', 'req', 'form', 'compra', 'almacen', 'calid', 'aprob', 'lote', 'logis', 'cmp', 'cotiz', 'orden', 'ped', 'oc']
    found_tables = []
    
    cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'")
    all_tables = [row[0] for row in cursor.fetchall()]
    
    for table in all_tables:
        t_lower = table.lower()
        if any(kw == t_lower or kw in t_lower for kw in keywords) and table not in tables:
            found_tables.append(table)
            
    for table in found_tables:
        cursor.execute(f"""
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = '{table}' 
            ORDER BY ORDINAL_POSITION
        """)
        cols = cursor.fetchall()
        schema[table] = [{"column": row[0], "type": row[1], "length": row[2]} for row in cols]

    with open('schema_dump.json', 'w', encoding='utf-8') as f:
        json.dump(schema, f, indent=4)

    conn.close()
    print("Schema dumped to schema_dump.json")
    print(f"Explicit tables checked: {tables}")
    print(f"Found {len(found_tables)} other relevant tables: {found_tables}")

if __name__ == '__main__':
    get_schema()
