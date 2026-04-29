from database import get_db_connection

try:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("ALTER TABLE CntCargosDetalle ALTER COLUMN TipoDocumento VARCHAR(20)")
    conn.commit()
    print("Altered CntCargosDetalle.TipoDocumento successfully")
except Exception as e:
    print("Error:", e)
