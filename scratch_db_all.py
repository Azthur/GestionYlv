import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
import database

conn = database.get_db_connection()
cursor = conn.cursor()

# Check all Cnt tables
cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'Cnt%' ORDER BY TABLE_NAME")
print("=== Cnt Tables ===")
for row in cursor.fetchall():
    print(row[0])

# Check CntFacturaDet columns
print("\n=== CntFacturaDet ===")
cursor.execute("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CntFacturaDet'")
for row in cursor.fetchall():
    print(f"  {row[0]} ({row[1]} {row[2]})")

# Check CntFacturaArchivos columns
print("\n=== CntFacturaArchivos ===")
cursor.execute("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CntFacturaArchivos'")
for row in cursor.fetchall():
    print(f"  {row[0]} ({row[1]} {row[2]})")

conn.close()
