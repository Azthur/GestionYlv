import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))
from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

# Find cargo CARGO-0034
print("--- CARGO-0034 Headers across all companies ---")
cursor.execute("SELECT * FROM CntCargosDocumentales WHERE NroCargo = 'CARGO-0034'")
cols = [col[0] for col in cursor.description]
rows = cursor.fetchall()
for row in rows:
    cargo_dict = dict(zip(cols, row))
    print(cargo_dict)
    cargo_id = cargo_dict['Id']
    codcia = cargo_dict['CodCia']
    
    print(f"\n--- Details for Cargo ID {cargo_id} (Cia {codcia}) ---")
    cursor.execute("SELECT * FROM CntCargosDetalle WHERE CargoId = ?", (cargo_id,))
    dcols = [col[0] for col in cursor.description]
    for drow in cursor.fetchall():
        print(dict(zip(dcols, drow)))

conn.close()
