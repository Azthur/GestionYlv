import sys
sys.path.append('.')
from backend.database import get_db_connection

def main():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect")
        return
    cursor = conn.cursor()
    
    # 1. Clean up duplicate WebPermisos
    print("Deleting duplicate WebPermisos rows for duplicate ModuloId values (108, 109)...")
    cursor.execute("DELETE FROM WebPermisos WHERE ModuloId IN (108, 109)")
    print(f"WebPermisos rows deleted: {cursor.rowcount}")
    
    # 2. Clean up duplicate WebModulos
    print("Deleting duplicate WebModulos rows (108, 109)...")
    cursor.execute("DELETE FROM WebModulos WHERE Id IN (108, 109)")
    print(f"WebModulos rows deleted: {cursor.rowcount}")
    
    conn.commit()
    conn.close()
    print("Database cleanup completed!")

if __name__ == '__main__':
    main()
