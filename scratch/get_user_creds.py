import sys
sys.path.append('.')
from backend.database import get_db_connection

def decrypt_foxpro(encrypted_password: str) -> str:
    salida = ""
    for char in encrypted_password:
        salida += chr(255 - ord(char))
    return salida

def main():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect")
        return
    cursor = conn.cursor()
    cursor.execute("SELECT TOP 5 login, password FROM AdmMUser")
    rows = cursor.fetchall()
    print("Found users:")
    for row in rows:
        login = row[0].strip()
        pwd_enc = row[1].rstrip()
        pwd_dec = decrypt_foxpro(pwd_enc)
        print(f"  Username: {login} | Password: {pwd_dec}")
    conn.close()

if __name__ == '__main__':
    main()
