import os
import jwt
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from database import get_db_connection

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])

SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-yelave-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

class LoginRequest(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

def encrypt_foxpro(password: str) -> str:
    """Implementa la encriptación de FoxPro para comparar con la BD."""
    salida = ""
    for char in password:
        salida += chr(255 - ord(char))
    return salida

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@router.post("/login", response_model=Token)
def login(req: LoginRequest):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos.")
    
    try:
        cursor = conn.cursor()
        
        # 1. Buscar el usuario en la tabla de FoxPro (AdmMUser)
        upper_username = req.username.upper().strip()
        cursor.execute("SELECT login, password, atributo, acceso FROM AdmMUser WHERE RTRIM(login) = ?", (upper_username,))
        user_row = cursor.fetchone()
        
        if not user_row:
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
            
        # 2. Validar contraseña
        foxpro_password = user_row.password.rstrip()
        encrypted_input = encrypt_foxpro(req.password)
        
        if encrypted_input != foxpro_password:
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
            
        # 3. Buscar o crear en WebUsers
        cursor.execute("SELECT id, nombre, correo, celular, rol, activo FROM WebUsers WHERE login = ?", (upper_username,))
        web_user = cursor.fetchone()
        
        user_data = {
            "login": upper_username,
            "atributo": user_row.atributo,
            "acceso": user_row.acceso,
            "rol": "USER",
            "nombre": upper_username,
            "activo": True
        }
        
        if web_user:
            if not web_user.activo:
                raise HTTPException(status_code=403, detail="Cuenta deshabilitada para acceso web.")
            user_data["rol"] = web_user.rol
            user_data["nombre"] = web_user.nombre if web_user.nombre else upper_username
            user_data["correo"] = web_user.correo
            user_data["celular"] = web_user.celular
        else:
            # Crear el registro en WebUsers por defecto si no existe pero sí en FoxPro
            cursor.execute("""
                INSERT INTO WebUsers (login, nombre, rol, activo)
                VALUES (?, ?, 'USER', 1)
            """, (upper_username, upper_username))
            conn.commit()
        
        # 4. Generar Token JWT
        access_token = create_access_token(data={"sub": upper_username, "rol": user_data["rol"]})
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        rol: str = payload.get("rol")
        if username is None:
            raise credentials_exception
        
        # We could query DB here to ensure user is still active, 
        # but for performance we'll trust the valid JWT
        return {"login": username, "rol": rol}
        
    except jwt.PyJWTError:
        raise credentials_exception

async def get_current_active_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("rol") != "ADMIN":
        raise HTTPException(status_code=403, detail="Privilegios de administrador requeridos")
    return current_user
