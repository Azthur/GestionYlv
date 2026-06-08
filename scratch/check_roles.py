import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from database import get_db_connection

conn = get_db_connection()
if not conn:
    print("Could not connect")
    sys.exit(1)

try:
    cursor = conn.cursor()
    # Get roles of current user
    cursor.execute("""
        SELECT dp.name AS PrincipalName, dp2.name AS RoleName
        FROM sys.database_role_members drm
        JOIN sys.database_principals dp ON drm.member_principal_id = dp.principal_id
        JOIN sys.database_principals dp2 ON drm.role_principal_id = dp2.principal_id
        WHERE dp.name = 'JUBER2' OR dp.name = USER_NAME()
    """)
    rows = cursor.fetchall()
    print("User roles:")
    for r in rows:
        print(r)
        
    # Check db_owner members
    cursor.execute("""
        SELECT dp.name AS MemberName
        FROM sys.database_role_members drm
        JOIN sys.database_principals dp ON drm.member_principal_id = dp.principal_id
        JOIN sys.database_principals dp2 ON drm.role_principal_id = dp2.principal_id
        WHERE dp2.name = 'db_owner'
    """)
    rows = cursor.fetchall()
    print("db_owner members:")
    for r in rows:
        print(r)
        
except Exception as e:
    print("Error:", e)
finally:
    conn.close()
