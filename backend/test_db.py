from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

# Get bank movements
cursor.execute("SELECT Id, ReconciliationDetailId, Estado FROM BankMovements WHERE Id IN (1300, 1330)")
for row in cursor.fetchall():
    print(f"Bank Movement: Id={row[0]}, DetailId={row[1]}, Estado='{row[2]}'")

# Get reconciliation details
cursor.execute("SELECT Id, BankMovementId FROM ReconciliationDetail WHERE BankMovementId IN (1300, 1330) OR Id IN (1300, 1330)")
for row in cursor.fetchall():
    print(f"Reconciliation Detail: Id={row[0]}, BankMovementId={row[1]}")

conn.close()
