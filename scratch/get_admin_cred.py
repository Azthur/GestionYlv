import sys
sys.path.append('.')
from backend.database import get_db_connection

def decrypt_foxpro(encrypted_password: str) -> str:
    return "".join(chr(255 - ord(c)) for c in encrypted_password)

def main():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect")
        return
    cursor = conn.cursor()
    cursor.execute("SELECT password FROM AdmMUser WHERE login = '71941916JL'")
    row = cursor.fetchone()
    if row:
        print("Admin Password:", decrypt_foxpro(row[0].rstrip()))
    else:
        print("Admin user 71941916JL not found in AdmMUser")
    conn.close()

if __name__ == '__main__':
    main()
