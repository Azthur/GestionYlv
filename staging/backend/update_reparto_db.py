import pyodbc
from database import get_db_connection

alter_scripts = [
    "ALTER TABLE LogSolicitudesRecojo ADD proveedor_nombre VARCHAR(150) NULL;",
    "ALTER TABLE LogSolicitudesRecojo ADD celular_contacto VARCHAR(50) NULL;",
    "ALTER TABLE LogSolicitudesRecojo ADD observaciones TEXT NULL;",
    "ALTER TABLE LogSolicitudesRecojo ADD url_maps VARCHAR(600) NULL;",
]

def update_db():
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            for script in alter_scripts:
                try:
                    cursor.execute(script)
                    conn.commit()
                except pyodbc.Error as e:
                    print(f"Ignorando error (posible columna existente): {e}")
            print("Tablas actualizadas con nuevos campos.")
            conn.close()
        except Exception as e:
            print(f"Error general: {e}")
            conn.rollback()

if __name__ == "__main__":
    update_db()
