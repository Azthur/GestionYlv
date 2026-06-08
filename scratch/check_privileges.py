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
    # Check current user and roles
    cursor.execute("SELECT CURRENT_USER, SYSTEM_USER")
    print("User info:", cursor.fetchone())
    
    # Query permissions on CcbICaja for the current user
    cursor.execute("""
        SELECT HAS_PERMS_BY_NAME('CcbICaja', 'OBJECT', 'UPDATE') as CanUpdate,
               HAS_PERMS_BY_NAME('CcbICaja', 'OBJECT', 'SELECT') as CanSelect,
               HAS_PERMS_BY_NAME('CcbICaja', 'OBJECT', 'INSERT') as CanInsert,
               HAS_PERMS_BY_NAME('CcbICaja', 'OBJECT', 'DELETE') as CanDelete
    """)
    print("Permissions on CcbICaja:", cursor.fetchone())
    
    # Check if we can find any user who has UPDATE permission or see who has UPDATE permission
    cursor.execute("""
        SELECT 
            class_desc, 
            OBJECT_NAME(major_id) as ObjectName, 
            USER_NAME(grantee_principal_id) as Grantee, 
            permission_name, 
            state_desc 
        FROM sys.database_permissions 
        WHERE major_id = OBJECT_ID('CcbICaja')
    """)
    rows = cursor.fetchall()
    print("Database permissions on CcbICaja:")
    for r in rows:
        print(r)
        
except Exception as e:
    print("Error:", e)
finally:
    conn.close()
