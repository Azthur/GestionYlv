"""
Módulo de Configuración de Base de Datos
Permite ver, editar y verificar la conexión a la base de datos
desde la interfaz web, útil cuando la contraseña expira.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import pyodbc
from dotenv import load_dotenv, set_key, find_dotenv

router = APIRouter(prefix="/api/config", tags=["Configuración"])


class DBConfigUpdate(BaseModel):
    db_server: Optional[str] = None
    db_name: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None
    file_server: Optional[str] = None
    file_user: Optional[str] = None
    file_password: Optional[str] = None


class DBTestRequest(BaseModel):
    db_server: str
    db_name: str
    db_user: str
    db_password: str


class FileConfigUpdate(BaseModel):
    file_server: Optional[str] = None
    file_user: Optional[str] = None
    file_password: Optional[str] = None


class FileTestRequest(BaseModel):
    file_server: str
    file_user: str
    file_password: str


@router.get("/db")
def get_db_config():
    """Retorna la configuración actual de la base de datos (sin la contraseña completa)."""
    load_dotenv(override=True)
    password = os.getenv("DB_PASSWORD", "")
    masked = password[:2] + "*" * max(0, len(password) - 4) + password[-2:] if len(password) > 4 else "****"

    file_password = os.getenv("FILE_PASSWORD", "")
    file_masked = file_password[:2] + "*" * max(0, len(file_password) - 4) + file_password[-2:] if len(file_password) > 4 else "****"

    return {
        "db_server": os.getenv("DB_SERVER", ""),
        "db_name": os.getenv("DB_NAME", ""),
        "db_user": os.getenv("DB_USER", ""),
        "db_password_masked": masked,
        "db_port": os.getenv("DB_PORT", "1433"),
        "file_server": os.getenv("FILE_SERVER", ""),
        "file_user": os.getenv("FILE_USER", ""),
        "file_password_masked": file_masked
    }


@router.post("/db")
def update_db_config(config: DBConfigUpdate):
    """Actualiza la configuración de la base de datos y archivos en el archivo .env."""
    try:
        env_path = find_dotenv()
        if not env_path:
            env_path = os.path.join(os.path.dirname(__file__), ".env")

        if config.db_server is not None:
            set_key(env_path, "DB_SERVER", config.db_server)
        if config.db_name is not None:
            set_key(env_path, "DB_NAME", config.db_name)
        if config.db_user is not None:
            set_key(env_path, "DB_USER", config.db_user)
        if config.db_password is not None:
            set_key(env_path, "DB_PASSWORD", config.db_password)
        if config.file_server is not None:
            set_key(env_path, "FILE_SERVER", config.file_server)
        if config.file_user is not None:
            set_key(env_path, "FILE_USER", config.file_user)
        if config.file_password is not None:
            set_key(env_path, "FILE_PASSWORD", config.file_password)

        # Reload env vars in memory
        load_dotenv(override=True)

        return {"status": "success", "message": "Configuración actualizada exitosamente."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar configuración: {str(e)}")


@router.post("/db/test")
def test_db_connection(config: DBTestRequest):
    """Prueba la conexión a la base de datos con las credenciales proporcionadas."""
    try:
        odbc_driver = os.getenv("ODBC_DRIVER", "{SQL Server}")
        conn_str = (
            f"DRIVER={odbc_driver};"
            f"SERVER={config.db_server};"
            f"DATABASE={config.db_name};"
            f"UID={config.db_user};"
            f"PWD={config.db_password};"
            "TrustServerCertificate=yes;"
        )
        conn = pyodbc.connect(conn_str, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT @@VERSION")
        version = cursor.fetchone()[0]

        # Get some additional info
        cursor.execute("SELECT DB_NAME()")
        db_name = cursor.fetchone()[0]

        cursor.execute("SELECT SUSER_SNAME()")
        current_user = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'")
        table_count = cursor.fetchone()[0]

        conn.close()

        return {
            "status": "success",
            "message": "Conexión exitosa",
            "details": {
                "version": version.split('\n')[0],
                "database": db_name,
                "user": current_user,
                "tables": table_count
            }
        }
    except pyodbc.Error as e:
        error_msg = str(e)
        # Parse common error codes
        if "18487" in error_msg or "expir" in error_msg.lower():
            hint = "La contraseña de la cuenta ha expirado. Ingrese una nueva contraseña."
        elif "18456" in error_msg:
            hint = "Usuario o contraseña incorrectos."
        elif "08001" in error_msg or "connection" in error_msg.lower():
            hint = "No se puede conectar al servidor. Verifique la dirección y puerto."
        else:
            hint = "Error de conexión. Verifique los datos."

        return {
            "status": "error",
            "message": hint,
            "detail": error_msg
        }
    except Exception as e:
        return {
            "status": "error",
            "message": "Error inesperado",
            "detail": str(e)
        }


@router.get("/db/status")
def db_status():
    """Verifica el estado actual de la conexión con la configuración del .env."""
    load_dotenv(override=True)
    try:
        odbc_driver = os.getenv("ODBC_DRIVER", "{SQL Server}")
        conn_str = (
            f"DRIVER={odbc_driver};"
            f"SERVER={os.getenv('DB_SERVER')};"
            f"DATABASE={os.getenv('DB_NAME')};"
            f"UID={os.getenv('DB_USER')};"
            f"PWD={os.getenv('DB_PASSWORD')};"
            "TrustServerCertificate=yes;"
        )
        conn = pyodbc.connect(conn_str, timeout=5)
        conn.close()
        return {"connected": True, "message": "Conexión activa"}
    except Exception as e:
        error_msg = str(e)
        if "18487" in error_msg or "expir" in error_msg.lower():
            return {"connected": False, "message": "Contraseña expirada", "error_type": "password_expired"}
        elif "18456" in error_msg:
            return {"connected": False, "message": "Credenciales inválidas", "error_type": "auth_failed"}
        else:
            return {"connected": False, "message": "Sin conexión", "error_type": "connection_failed", "detail": error_msg}


@router.post("/files/test")
def test_file_connection(config: FileTestRequest):
    """Prueba la conexión al servidor de archivos con las credenciales proporcionadas."""
    try:
        import subprocess
        import tempfile

        # Convertir ruta Windows SMB a formato Linux
        # \\192.168.1.200\gestion-ylv -> //192.168.1.200/gestion-ylv
        smb_path = config.file_server.replace("\\", "//")

        # Crear archivo de credenciales temporal
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.credentials') as cred_file:
            cred_file.write(f"username={config.file_user}\n")
            cred_file.write(f"password={config.file_password}\n")
            cred_file.write(f"domain=WORKGROUP\n")
            cred_path = cred_file.name

        try:
            # Intentar montar el recurso SMB temporalmente
            mount_point = tempfile.mkdtemp()
            mount_cmd = [
                'mount',
                '-t', 'cifs',
                smb_path,
                mount_point,
                '-o', f'credentials={cred_path},uid=1000,gid=1000,iocharset=utf8,vers=3.0'
            ]

            result = subprocess.run(mount_cmd, capture_output=True, text=True, timeout=10)

            if result.returncode == 0:
                # Montaje exitoso, desmontar
                subprocess.run(['umount', mount_point], timeout=5)
                return {
                    "status": "success",
                    "message": "Conexión al servidor de archivos exitosa",
                    "details": {
                        "server": smb_path,
                        "user": config.file_user,
                        "mount_point": mount_point
                    }
                }
            else:
                error_msg = result.stderr or result.stdout
                return {
                    "status": "error",
                    "message": "Error al conectar al servidor de archivos",
                    "detail": error_msg
                }
        finally:
            # Limpiar archivos temporales
            import os
            try:
                os.unlink(cred_path)
                os.rmdir(mount_point)
            except:
                pass

    except subprocess.TimeoutExpired:
        return {
            "status": "error",
            "message": "Timeout al intentar conectar al servidor de archivos",
            "detail": "La conexión tardó demasiado tiempo"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": "Error inesperado al probar conexión",
            "detail": str(e)
        }
