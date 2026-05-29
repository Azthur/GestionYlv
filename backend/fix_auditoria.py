import sys
import os
sys.path.append(r'c:\SistemaGestionyelave\backend')
from database import get_db_connection

def insert_modulo():
    conn = get_db_connection()
    if not conn:
        print("Error al conectar con la base de datos.")
        return
    
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT Id FROM WebModulos WHERE Codigo = 'auditoria_facturas'")
        row = cursor.fetchone()
        if not row:
            cursor.execute("INSERT INTO WebModulos (Codigo, Nombre, RutaHtml, Seccion, Orden) VALUES ('auditoria_facturas', 'Auditoría Facturas', '/auditoria_facturas.html', 'Contabilidad', 90)")
            conn.commit()
            print("Módulo 'auditoria_facturas' insertado exitosamente.")
        else:
            print("Módulo 'auditoria_facturas' ya existe.")
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == '__main__':
    insert_modulo()
