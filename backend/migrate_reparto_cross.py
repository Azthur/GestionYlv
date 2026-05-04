import pyodbc
from database import get_db_connection

def migrate():
    conn = get_db_connection()
    if not conn:
        print("No se pudo conectar a la DB")
        return
    
    try:
        cursor = conn.cursor()
        
        print("Añadiendo columnas de compañía origen a LogHojasRuta...")
        
        cols_to_add = [
            ("codcia_chofer", "CHAR(3)"),
            ("codcia_movilidad", "CHAR(3)")
        ]
        
        for col_name, col_type in cols_to_add:
            try:
                cursor.execute(f"ALTER TABLE LogHojasRuta ADD {col_name} {col_type} NULL")
                conn.commit()
                print(f"Columna '{col_name}' añadida.")
            except Exception as e:
                if "already exists" in str(e) or "2705" in str(e):
                    print(f"Columna '{col_name}' ya existe.")
                else:
                    print(f"Error al añadir {col_name}: {e}")

        # Update existing records to use the HR's codcia as fallback
        cursor.execute("UPDATE LogHojasRuta SET codcia_chofer = codcia WHERE codcia_chofer IS NULL AND codcia != 'ALL'")
        cursor.execute("UPDATE LogHojasRuta SET codcia_movilidad = codcia WHERE codcia_movilidad IS NULL AND codcia != 'ALL'")
        conn.commit()
        print("Registros existentes actualizados con codcia.")

        print("Migración completada exitosamente.")
        
    except Exception as e:
        print(f"Error durante la migración: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
