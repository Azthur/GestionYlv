import sys
sys.path.append('.')
from backend.database import get_db_connection

def main():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect")
        return
    cursor = conn.cursor()
    cursor.execute("SELECT Id, Codigo, Nombre, RutaHtml, Seccion, Orden, ParentId, Activo FROM WebModulos ORDER BY Id")
    rows = cursor.fetchall()
    columns = [col[0] for col in cursor.description]
    print("ALL MODULES IN WebModulos:")
    for row in rows:
        r_dict = dict(zip(columns, row))
        if 'auditoria' in str(r_dict.get('Codigo')).lower() or 'auditoria' in str(r_dict.get('RutaHtml')).lower() or 'auditoria' in str(r_dict.get('Nombre')).lower():
            print(f"--> {r_dict}")
        else:
            print(f"    {r_dict.get('Id')}: {r_dict.get('Codigo')} | {r_dict.get('Nombre')} | {r_dict.get('RutaHtml')}")
    conn.close()

if __name__ == '__main__':
    main()
