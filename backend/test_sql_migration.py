import pyodbc
import os
from database import get_db_connection

def test_migration():
    conn = get_db_connection()
    if not conn:
        print("Error: No connection")
        return
    try:
        cursor = conn.cursor()
        print("Checking columns in CntFacturaDet...")
        
        _cols_to_check = {
            'Inci': 'varchar(50)', 'Fabricante': 'varchar(250)',
            'Obs1': 'varchar(500)', 'Obs2': 'varchar(500)', 'Obs3': 'varchar(500)', 'Obs4': 'varchar(500)',
            'ExtraDataJson': 'varchar(MAX)'
        }
        
        for col, dtype in _cols_to_check.items():
            print(f"Testing column: {col}")
            try:
                # Use a more explicit check
                cursor.execute(f"IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CntFacturaDet') AND name = '{col}') ALTER TABLE CntFacturaDet ADD [{col}] {dtype}")
                print(f"  Result: OK (or already existed)")
            except Exception as e:
                print(f"  Error adding column {col}: {str(e)}")
        
        conn.commit()
        print("Migration test finished.")
        
        # Now try the actual query that failed for the user
        try:
            print("Try fetching 1 row from CntFacturaDet with new columns...")
            cursor.execute("SELECT TOP 1 Inci, Fabricante, Obs1, ExtraDataJson FROM CntFacturaDet")
            row = cursor.fetchone()
            print(f"  Fetch Result: {'Found' if row else 'Empty but successful'}")
        except Exception as e:
            print(f"  Query still fails: {str(e)}")
            
    except Exception as e:
        print(f"Global Error: {str(e)}")
    finally:
        conn.close()

if __name__ == "__main__":
    test_migration()
