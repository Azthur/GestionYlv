import sys
sys.path.append('c:/SistemaGestionyelave/backend')
from database import get_db_connection
conn = get_db_connection()
if conn:
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM CntCargosDetalle WHERE CargoId = 17')
    print("Details for 17:", c.fetchone()[0])
    
    # Check if there is ANY Cargo 17 in the Bandeja endpoint
    c.execute("SET ANSI_NULLS, ANSI_PADDING, ANSI_WARNINGS, ARITHABORT, CONCAT_NULL_YIELDS_NULL, QUOTED_IDENTIFIER ON;")
    q = '''
            SELECT c.Id, RTRIM(c.Estado)
            FROM CntCargosDocumentales c
            INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
            WHERE c.Id = 17
    '''
    c.execute(q)
    print("Bandeja match for 17:", c.fetchall())
