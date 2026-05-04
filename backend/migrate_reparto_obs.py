import pyodbc
from database import get_db_connection

def migrate():
    conn = get_db_connection()
    if not conn:
        print("No se pudo conectar a la DB")
        return
    
    try:
        cursor = conn.cursor()
        
        print("Verificando columnas en LogHojasRutaDet...")
        
        # Agregar obs_chofer si no existe
        try:
            cursor.execute("ALTER TABLE LogHojasRutaDet ADD obs_chofer NVARCHAR(MAX) NULL")
            conn.commit()
            print("Columna 'obs_chofer' añadida.")
        except Exception as e:
            if "already exists" in str(e) or "2705" in str(e):
                print("Columna 'obs_chofer' ya existe.")
            else:
                print(f"Error al añadir obs_chofer: {e}")

        # Agregar evidencias si no existe
        try:
            cursor.execute("ALTER TABLE LogHojasRutaDet ADD evidencias NVARCHAR(MAX) NULL")
            conn.commit()
            print("Columna 'evidencias' añadida.")
        except Exception as e:
            if "already exists" in str(e) or "2705" in str(e):
                print("Columna 'evidencias' ya existe.")
            else:
                print(f"Error al añadir evidencias: {e}")

        # Agregar proveedor_nombre, celular_contacto, observaciones, url_maps a LogSolicitudesRecojo si faltan
        cols_to_add = [
            ("proveedor_nombre", "VARCHAR(255)"),
            ("celular_contacto", "VARCHAR(50)"),
            ("observaciones", "NVARCHAR(MAX)"),
            ("url_maps", "NVARCHAR(MAX)")
        ]
        
        for col_name, col_type in cols_to_add:
            try:
                cursor.execute(f"ALTER TABLE LogSolicitudesRecojo ADD {col_name} {col_type} NULL")
                conn.commit()
                print(f"Columna '{col_name}' añadida a LogSolicitudesRecojo.")
            except Exception as e:
                if "already exists" in str(e) or "2705" in str(e):
                    pass # Ya existe
                else:
                    print(f"Error al añadir {col_name}: {e}")

        print("Migración completada exitosamente.")
        
    except Exception as e:
        print(f"Error durante la migración: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
