import sys
sys.path.append('c:/SistemaGestionyelave/backend')
from database import get_db_connection

def get_schema():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    tables_to_check = ['LogSolicitudesRecojo', 'LogSolicitudesRecojoDet', 'LogHojasRuta', 'LogHojasRutaDet']
    schema_info = {}
    
    for table in tables_to_check:
        try:
            cursor.execute(f"SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{table}' ORDER BY ORDINAL_POSITION")
            columns = []
            for row in cursor.fetchall():
                col_info = f"{row[0]} {row[1]}"
                if row[2]:
                    col_info += f"({row[2]})"
                if row[3] == 'NO':
                    col_info += " NOT NULL"
                columns.append(col_info)
            schema_info[table] = columns
        except Exception as e:
            schema_info[table] = f"Error: {str(e)}"
            
    return schema_info

if __name__ == "__main__":
    schema = get_schema()
    for table, cols in schema.items():
        print(f"\nTable: {table}")
        for col in cols:
            print(f"  - {col}")
