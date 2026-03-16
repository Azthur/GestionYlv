from database import get_db_connection
conn = get_db_connection()
cursor = conn.cursor()

# Check if RD records exist for 0000000253
cursor.execute("""
    SELECT Id, BankMovementId, MatchCodCia, MatchCoddoc, MatchNrodoc, MatchNroitm
    FROM ReconciliationDetail 
    WHERE MatchNrodoc = '0000000253'
""")
cols = [c[0] for c in cursor.description]
rows = cursor.fetchall()
print(f"ReconciliationDetail rows for 0000000253: {len(rows)}")
for row in rows:
    print(' ', dict(zip(cols, row)))

# Check total RD count
cursor.execute("SELECT COUNT(*) FROM ReconciliationDetail")
print(f"\nTotal ReconciliationDetail records: {cursor.fetchone()[0]}")

# Check tbl_Conciliados
cursor.execute("SELECT COUNT(*) FROM tbl_Conciliados")
print(f"Total tbl_Conciliados records: {cursor.fetchone()[0]}")

# Check conciliated bank movements
cursor.execute("SELECT COUNT(*) FROM BankMovements WHERE Estado = 'Conciliado'")
print(f"Bank movements conciliated: {cursor.fetchone()[0]}")

# Now check the cobranzas-todas query output for 0000000253 IsConciliado
cursor.execute("""
    SELECT TOP 3 m.nroitm, rd.Id as MatchId,
        CASE WHEN (rd.Id IS NOT NULL OR m.FlgEst = 'C') THEN 1 ELSE 0 END as IsConciliado
    FROM CcbMVtos m
    LEFT JOIN ReconciliationDetail rd ON rd.MatchCodCia = m.CodCia 
        AND rd.MatchCoddoc = m.coddoc 
        AND rd.MatchNrodoc = m.nrodoc 
        AND rd.MatchNroitm = m.nroitm
    WHERE m.CodCia = '005' AND m.coddoc = 'CJ01' AND m.nrodoc = '0000000253'
    AND rd.Id IS NOT NULL
""")
cols2 = [c[0] for c in cursor.description]
rows2 = cursor.fetchall()
print(f"\nConciliated items for 0000000253: {len(rows2)}")
for row in rows2:
    print(' ', dict(zip(cols2, row)))

conn.close()
