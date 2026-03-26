from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from database import get_db_connection
from auth import get_current_user, get_current_active_admin, encrypt_foxpro

router = APIRouter(prefix="/api/users", tags=["Usuarios"])

class UserUpdateParams(BaseModel):
    nombre: Optional[str] = None
    correo: Optional[str] = None
    celular: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None

class PasswordResetParams(BaseModel):
    new_password: str

class UserProfileUpdateParams(BaseModel):
    nombre: Optional[str] = None
    correo: Optional[str] = None
    celular: Optional[str] = None

class UserPasswordChangeParams(BaseModel):
    old_password: str
    new_password: str

@router.get("")
def get_all_users(admin_user: dict = Depends(get_current_active_admin)):
    """Obtener todos los usuarios combinando AdmMUser (FoxPro) y WebUsers"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    
    try:
        cursor = conn.cursor()
        
        # Sincronizar WebUsers con AdmMUser por si hay nuevos en FoxPro
        cursor.execute("""
            INSERT INTO WebUsers (login, nombre, rol, activo)
            SELECT RTRIM(login), RTRIM(login), 'USER', 1 
            FROM AdmMUser a
            WHERE NOT EXISTS (SELECT 1 FROM WebUsers w WHERE w.login = RTRIM(a.login))
        """)
        conn.commit()
        
        # Traer la lista combinada
        cursor.execute("""
            SELECT 
                RTRIM(a.login) as login,
                a.atributo,
                a.acceso,
                w.nombre,
                w.correo,
                w.celular,
                w.rol,
                w.activo
            FROM AdmMUser a
            LEFT JOIN WebUsers w ON RTRIM(a.login) = w.login
            ORDER BY a.login
        """)
        
        users = []
        columns = [column[0] for column in cursor.description]
        for row in cursor.fetchall():
            users.append(dict(zip(columns, row)))
            
        return users
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.put("/{login}")
def update_user_info(login: str, params: UserUpdateParams, admin_user: dict = Depends(get_current_active_admin)):
    """Actualizar informacion y roles (Solo Admins)"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        
        # Verificar si existe en WebUsers (por precaucion, ya lo sync arriba)
        cursor.execute("SELECT id FROM WebUsers WHERE login = ?", (login,))
        if not cursor.fetchone():
            cursor.execute("INSERT INTO WebUsers (login, nombre) VALUES (?, ?)", (login, login))
            
        # Actualizar los campos que vengan
        update_fields = []
        update_values = []
        
        if params.nombre is not None:
            update_fields.append("nombre = ?")
            update_values.append(params.nombre)
        if params.correo is not None:
            update_fields.append("correo = ?")
            update_values.append(params.correo)
        if params.celular is not None:
            update_fields.append("celular = ?")
            update_values.append(params.celular)
        if params.rol is not None:
            update_fields.append("rol = ?")
            update_values.append(params.rol)
        if params.activo is not None:
            update_fields.append("activo = ?")
            # Convert bool to 1/0 for SQL Server BIT
            update_values.append(1 if params.activo else 0)
            
        if not update_fields:
            return {"status": "success", "message": "Sin cambios a aplicar."}
            
        update_query = f"UPDATE WebUsers SET {', '.join(update_fields)} WHERE login = ?"
        update_values.append(login)
        
        cursor.execute(update_query, tuple(update_values))
        conn.commit()
        
        return {"status": "success", "message": "Usuario actualizado exitosamente."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/{login}/reset-password")
def reset_user_password(login: str, params: PasswordResetParams, admin_user: dict = Depends(get_current_active_admin)):
    """Resetear contrasena de un usuario en tabla FoxPro (Solo Admins)"""
    # IMPORTANTE: PADR es necesario en SQL si FoxPro espera 15 chars fijos, o rtrim al validar (lo hicimos con rstrip antes)
    # Sin embargo, como guardamos en char(15), sql server hara el padding auto.
    
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        encrypted = encrypt_foxpro(params.new_password)
        # Pad to 15 blanks if needed (to mimic FoxPro fixed char 15 length perfectly)
        encrypted_padded = encrypted.ljust(15, ' ')
        
        cursor = conn.cursor()
        cursor.execute("UPDATE AdmMUser SET password = ? WHERE RTRIM(login) = ?", (encrypted_padded, login))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Usuario no encontrado en la tabla principal (AdmMUser).")
            
        conn.commit()
        return {"status": "success", "message": "Contraseña restablecida exitosamente."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ---- ENDPOINTS PARA CADA USUARIO (Perfil propio) ----

@router.get("/me/profile")
def get_my_profile(current_user: dict = Depends(get_current_user)):
    """Obtener la inforamcion de perfil de uno mismo"""
    login = current_user["login"]
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT nombre, correo, celular, rol FROM WebUsers WHERE login = ?", (login,))
        row = cursor.fetchone()
        if not row:
            return {"login": login, "nombre": login, "correo": "", "celular": "", "rol": "USER"}
            
        return dict(zip([column[0] for column in cursor.description], row))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.put("/me/profile")
def update_my_profile(params: UserProfileUpdateParams, current_user: dict = Depends(get_current_user)):
    """Actualizar inforamcion de contacto web propia"""
    login = current_user["login"]
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        update_fields = []
        update_values = []
        
        if params.nombre is not None:
             update_fields.append("nombre = ?")
             update_values.append(params.nombre)
        if params.correo is not None:
             update_fields.append("correo = ?")
             update_values.append(params.correo)
        if params.celular is not None:
             update_fields.append("celular = ?")
             update_values.append(params.celular)
             
        if not update_fields:
            return {"status": "success", "message": "Sin cambios a aplicar."}
            
        update_query = f"UPDATE WebUsers SET {', '.join(update_fields)} WHERE login = ?"
        update_values.append(login)
        
        cursor.execute(update_query, tuple(update_values))
        conn.commit()
        
        return {"status": "success", "message": "Perfil actualizado."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.put("/me/password")
def change_my_password(params: UserPasswordChangeParams, current_user: dict = Depends(get_current_user)):
    """Cambiar contraseña propia, verificando contraseña antigua (Impacta AdmMUser)"""
    login = current_user["login"]
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
        
    try:
        cursor = conn.cursor()
        
        # Validate old password
        cursor.execute("SELECT password FROM AdmMUser WHERE RTRIM(login) = ?", (login,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")
            
        old_foxpro_pwd = row.password.rstrip()
        old_encrypted = encrypt_foxpro(params.old_password)
        
        if old_encrypted != old_foxpro_pwd:
             raise HTTPException(status_code=401, detail="La contraseña actual es incorrecta.")
             
        # Update to new password
        new_encrypted = encrypt_foxpro(params.new_password)
        new_encrypted_padded = new_encrypted.ljust(15, ' ')
        
        cursor.execute("UPDATE AdmMUser SET password = ? WHERE RTRIM(login) = ?", (new_encrypted_padded, login))
        conn.commit()
        
        return {"status": "success", "message": "Contraseña actualizada exitosamente."}
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
