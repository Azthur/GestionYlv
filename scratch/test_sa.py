import sys
import pyodbc

# Test credentials
server = '192.168.1.17\\SQL2022'
db = 'yelave22'
user = 'sa'
passwords = ['sql2014', 'PasswordSeguro123!', 'Y123456789y', 'A123456789a', 'master']

for pwd in passwords:
    try:
        conn = pyodbc.connect(
            f'Driver={{SQL Server}};'
            f'Server={server};'
            f'Database={db};'
            f'UID={user};'
            f'PWD={pwd};'
            'TrustServerCertificate=yes;'
        )
        print(f"Connection SUCCESSFUL with sa / {pwd}")
        
        # Test if we can update CcbICaja with this connection
        cursor = conn.cursor()
        cursor.execute("UPDATE CcbICaja SET flgest = 'P' WHERE 1=0")
        print("UPDATE test successful with sa!")
        conn.close()
        break
    except Exception as e:
        print(f"Failed with sa / {pwd}: {e}")
