import pyodbc

try:
    conn = pyodbc.connect(
        'Driver={SQL Server};'
        'Server=192.168.1.17\SQL2022;'
        'Database=BK030226;'
        'UID=developer1;'
        'PWD=Y123456789y;'
        'TrustServerCertificate=yes;'
        'Encrypt=no;'
    )
except Exception as e:
    conn = pyodbc.connect('Driver={SQL Server};Server=localhost;Database=yelave;UID=sa;PWD=sql2014')

cursor = conn.cursor()

# Test 1: EXACT match for I010000098
cursor.execute("SELECT CodCia, coddoc, nrodoc, import FROM CcbMVtos WHERE CodCia='005' AND coddoc='N/A' AND nrodoc='I010000098'")
print("Exact Match for I010000098:")
for r in cursor.fetchall():
    print(r)

# Test 2: LIKE '%10000098'
cursor.execute("SELECT CodCia, coddoc, nrodoc, import FROM CcbMVtos WHERE CodCia='005' AND coddoc='N/A' AND nrodoc LIKE '%10000098'")
print("\nLIKE '%10000098' Match:")
for r in cursor.fetchall():
    print(r)

# Test 3: LIKE '%0000098'
cursor.execute("SELECT CodCia, coddoc, nrodoc, import FROM CcbMVtos WHERE CodCia='005' AND coddoc='N/A' AND nrodoc LIKE '%0000098'")
print("\nLIKE '%0000098' Match:")
for r in cursor.fetchall():
    print(r)

conn.close()
