import sys
import pyodbc

# Test Windows Authentication connection to the SQL Server
server = '192.168.1.17\\SQL2022'
db = 'yelave22'

print("Attempting to connect using Windows Authentication (Trusted_Connection=yes)...")
try:
    conn = pyodbc.connect(
        f'Driver={{SQL Server}};'
        f'Server={server};'
        f'Database={db};'
        'Trusted_Connection=yes;'
    )
    print("Connection SUCCESSFUL using Windows Authentication!")
    
    # Check user and permissions
    cursor = conn.cursor()
    cursor.execute("SELECT CURRENT_USER, SYSTEM_USER, IS_SRVROLEMEMBER('sysadmin')")
    row = cursor.fetchone()
    print("User/Role info:", row)
    
    is_sysadmin = row[2] if len(row) > 2 else 0
    if is_sysadmin == 1:
        print("We are sysadmin! Attempting to fix permissions...")
        # Revoke DENY and Grant UPDATE on CcbICaja for JUBER2 and developer1
        cursor.execute("REVOKE UPDATE ON CcbICaja FROM JUBER2")
        cursor.execute("GRANT UPDATE ON CcbICaja TO JUBER2")
        
        cursor.execute("REVOKE UPDATE ON CcbICaja FROM developer1")
        cursor.execute("GRANT UPDATE ON CcbICaja TO developer1")
        
        conn.commit()
        print("Permissions successfully updated in SQL Server!")
    else:
        print("Connected but we are not sysadmin.")
    
    conn.close()
except Exception as e:
    print("Connection failed:", e)
