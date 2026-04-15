import sys
from database import get_db_connection

def inspect():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("sp_columns 'AlmTsalm'")
    for row in c.fetchall():
        print(row.COLUMN_NAME)

inspect()
