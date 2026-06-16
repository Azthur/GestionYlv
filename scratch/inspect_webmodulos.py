import sys
import os
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend'))
from database import get_db_connection

conn = get_db_connection()
if not conn:
    print("Could not connect")
    sys.exit(1)

try:
    cursor = conn.cursor()
    cursor.execute("SELECT Id, Codigo, Nombre, RutaHtml, Seccion, Orden FROM WebModulos WHERE Nombre LIKE '%Movimiento%' OR Codigo LIKE '%movimiento%' OR RutaHtml LIKE '%movimiento%'")
    print("Matching modules:")
    for r in cursor.fetchall():
        print(f"  Id: {r[0]}, Codigo: {r[1]}, Nombre: {r[2]}, RutaHtml: {r[3]}, Seccion: {r[4]}, Orden: {r[5]}")

    cursor.execute("SELECT * FROM WebPermisos WHERE ModuloId IN (SELECT Id FROM WebModulos WHERE Nombre LIKE '%Movimiento%' OR Codigo LIKE '%movimiento%' OR RutaHtml LIKE '%movimiento%')")
    print("\nMatching permissions:")
    for r in cursor.fetchall():
        print(f"  Rol: {r[1]}, ModuloId: {r[2]}, PuedeVer: {r[3]}, PuedeEditar: {r[4]}")
        
except Exception as e:
    print("Error:", e)
finally:
    conn.close()
