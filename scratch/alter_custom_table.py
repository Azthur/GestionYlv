import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
import database

conn = database.get_db_connection()
cursor = conn.cursor()
try:
    cursor.execute("""
        IF COL_LENGTH('CntCuentasContablesCustom', 'Descripcion') IS NULL
        BEGIN
            ALTER TABLE CntCuentasContablesCustom ADD Descripcion varchar(250) NULL
            PRINT 'SUCCESS: Altered table!'
        END
        ELSE
        BEGIN
            PRINT 'ALREADY EXISTS: Descripcion column already exists'
        END
    """)
    conn.commit()
except Exception as e:
    print("FAILED to alter table:", e)
conn.close()
