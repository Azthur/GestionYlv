"""
YELAVE ERP — Módulo de Chat Interno
Tablas: WebChatMensajes
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from database import get_db_connection
from auth import get_current_user

router = APIRouter(prefix="/api/chat", tags=["Chat"])


# ══════════════════════════════════════════════════════
#  SETUP: Crear tabla de mensajes si no existe
# ══════════════════════════════════════════════════════

def setup_chat_tables():
    conn = get_db_connection()
    if not conn:
        print("⚠ No se pudo conectar a BD para crear tablas de chat")
        return
    try:
        cursor = conn.cursor()
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WebChatMensajes' AND xtype='U')
            CREATE TABLE WebChatMensajes (
                Id          INT IDENTITY(1,1) PRIMARY KEY,
                DeLogin     VARCHAR(50) NOT NULL,
                ParaLogin   VARCHAR(50) NOT NULL,
                Mensaje     NVARCHAR(2000) NOT NULL,
                Leido       BIT DEFAULT 0,
                FechaEnvio  DATETIME DEFAULT GETDATE()
            )
        """)
        conn.commit()

        # Indices para performance
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Chat_DeLogin' AND object_id = OBJECT_ID('WebChatMensajes'))
                CREATE INDEX IX_Chat_DeLogin ON WebChatMensajes (DeLogin)
        """)
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Chat_ParaLogin' AND object_id = OBJECT_ID('WebChatMensajes'))
                CREATE INDEX IX_Chat_ParaLogin ON WebChatMensajes (ParaLogin)
        """)
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Chat_Fecha' AND object_id = OBJECT_ID('WebChatMensajes'))
                CREATE INDEX IX_Chat_Fecha ON WebChatMensajes (FechaEnvio DESC)
        """)
        conn.commit()
        print("[OK] Tabla WebChatMensajes verificada/creada")
    except Exception as e:
        print(f"[WARN] Error setup chat: {e}")
    finally:
        conn.close()


# ══════════════════════════════════════════════════════
#  MODELOS
# ══════════════════════════════════════════════════════

class ChatSendMessage(BaseModel):
    para: str
    mensaje: str


# ══════════════════════════════════════════════════════
#  ENDPOINTS
# ══════════════════════════════════════════════════════

@router.get("/contacts")
def get_chat_contacts(current_user: dict = Depends(get_current_user)):
    """Lista de usuarios del sistema con info de contacto, rol, último mensaje y no leídos."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        my_login = current_user["login"]

        cursor.execute("""
            SELECT
                w.login,
                w.nombre,
                w.correo,
                w.celular,
                w.rol,
                ISNULL(r.Nombre, w.rol) AS rol_nombre,
                ISNULL(r.Descripcion, '') AS rol_descripcion,
                w.activo,
                (SELECT COUNT(*) FROM WebChatMensajes m
                 WHERE m.DeLogin = w.login AND m.ParaLogin = ? AND m.Leido = 0) AS no_leidos,
                (SELECT TOP 1 m2.Mensaje FROM WebChatMensajes m2
                 WHERE (m2.DeLogin = w.login AND m2.ParaLogin = ?)
                    OR (m2.DeLogin = ? AND m2.ParaLogin = w.login)
                 ORDER BY m2.FechaEnvio DESC) AS ultimo_mensaje,
                (SELECT TOP 1 m3.FechaEnvio FROM WebChatMensajes m3
                 WHERE (m3.DeLogin = w.login AND m3.ParaLogin = ?)
                    OR (m3.DeLogin = ? AND m3.ParaLogin = w.login)
                 ORDER BY m3.FechaEnvio DESC) AS ultima_fecha
            FROM WebUsers w
            LEFT JOIN WebRoles r ON r.Codigo = w.rol
            WHERE w.login != ? AND ISNULL(w.activo, 1) = 1
            ORDER BY ultima_fecha DESC, w.nombre
        """, (my_login, my_login, my_login, my_login, my_login, my_login))

        cols = [c[0] for c in cursor.description]
        contacts = []
        for row in cursor.fetchall():
            d = dict(zip(cols, row))
            # Truncar último mensaje para la preview
            if d.get("ultimo_mensaje"):
                d["ultimo_mensaje"] = d["ultimo_mensaje"][:80]
            # Formatear fecha
            if d.get("ultima_fecha"):
                d["ultima_fecha"] = d["ultima_fecha"].strftime("%Y-%m-%d %H:%M")
            contacts.append(d)

        return contacts
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/messages/{login}")
def get_chat_messages(
    login: str,
    page: int = Query(1, ge=1),
    current_user: dict = Depends(get_current_user)
):
    """Historial de conversación con un usuario. Marca como leídos los recibidos."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        my_login = current_user["login"]

        # Required for SQL Server indexed views / computed columns
        cursor.execute("SET ARITHABORT ON")

        # Marcar como leídos los mensajes que me enviaron
        cursor.execute("""
            UPDATE WebChatMensajes
            SET Leido = 1
            WHERE DeLogin = ? AND ParaLogin = ? AND Leido = 0
        """, (login, my_login))
        conn.commit()

        # Obtener últimos 200 mensajes (sin paginación compleja)
        cursor.execute("""
            SELECT TOP 200 Id, DeLogin, ParaLogin, Mensaje, Leido, FechaEnvio
            FROM WebChatMensajes
            WHERE (DeLogin = ? AND ParaLogin = ?)
               OR (DeLogin = ? AND ParaLogin = ?)
            ORDER BY FechaEnvio ASC
        """, (my_login, login, login, my_login))

        cols = [c[0] for c in cursor.description]
        messages = []
        for row in cursor.fetchall():
            d = dict(zip(cols, row))
            if d.get("FechaEnvio"):
                d["FechaEnvio"] = d["FechaEnvio"].strftime("%Y-%m-%d %H:%M:%S")
            messages.append(d)

        return {"messages": messages, "total": len(messages), "page": 1, "page_size": 200}
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/send")
def send_chat_message(params: ChatSendMessage, current_user: dict = Depends(get_current_user)):
    """Enviar un mensaje a otro usuario."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        my_login = current_user["login"]
        msg = params.mensaje.strip()

        if not msg:
            raise HTTPException(400, "El mensaje no puede estar vacío")
        if len(msg) > 2000:
            raise HTTPException(400, "El mensaje excede 2000 caracteres")
        if params.para.strip().upper() == my_login.upper():
            raise HTTPException(400, "No puedes enviarte mensajes a ti mismo")

        # Verificar que el destinatario exista
        cursor.execute("SELECT login FROM WebUsers WHERE login = ?", (params.para,))
        if not cursor.fetchone():
            raise HTTPException(404, "Usuario destinatario no encontrado")

        cursor.execute("""
            INSERT INTO WebChatMensajes (DeLogin, ParaLogin, Mensaje)
            VALUES (?, ?, ?)
        """, (my_login, params.para, msg))
        conn.commit()

        return {"status": "success", "message": "Mensaje enviado"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/unread-count")
def get_unread_count(current_user: dict = Depends(get_current_user)):
    """Cuenta total de mensajes no leídos para el usuario logueado."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(500, "Error DB")
    try:
        cursor = conn.cursor()
        my_login = current_user["login"]
        cursor.execute(
            "SELECT COUNT(*) FROM WebChatMensajes WHERE ParaLogin = ? AND Leido = 0",
            (my_login,)
        )
        count = cursor.fetchone()[0]
        return {"unread": count}
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        conn.close()
