import pyodbc
import os
from dotenv import load_dotenv

def list_tables():
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
    cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
    tables = [row[0] for row in cursor.fetchall()]
    
    with open('tables.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(tables))
        
    print(f"Listed {len(tables)} tables to tables.txt")

if __name__ == '__main__':
    list_tables()
