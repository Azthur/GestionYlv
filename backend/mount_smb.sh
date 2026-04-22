#!/bin/bash
# Script de montaje de recurso SMB para archivos adjuntos
# Se ejecuta al inicio del contenedor

set -e

echo "=== Montando recurso SMB ==="

# Verificar variables de entorno
if [ -z "$FILE_SERVER" ]; then
    echo "FILE_SERVER no está configurado, usando valor por defecto"
    FILE_SERVER="//192.168.1.200/gestion-ylv"
fi

if [ -z "$FILE_USER" ]; then
    echo "FILE_USER no está configurado, usando valor por defecto"
    FILE_USER="juber_doc"
fi

if [ -z "$FILE_PASSWORD" ]; then
    echo "WARNING: FILE_PASSWORD no está configurada"
    echo "El montaje SMB fallará sin contraseña"
    exit 0
fi

# Convertir ruta Windows a formato Linux si es necesario
SMB_PATH=$(echo "$FILE_SERVER" | sed 's/\\/\//g')

echo "Servidor SMB: $SMB_PATH"
echo "Usuario: $FILE_USER"

# Crear archivo de credenciales
CRED_FILE="/tmp/.smbcredentials"
cat > "$CRED_FILE" <<EOF
username=$FILE_USER
password=$FILE_PASSWORD
domain=WORKGROUP
EOF
chmod 600 "$CRED_FILE"

# Crear punto de montaje
MOUNT_POINT="/app/gestion-ylv"
mkdir -p "$MOUNT_POINT"

# Intentar montar
echo "Intentando montar $SMB_PATH en $MOUNT_POINT"
if mount -t cifs "$SMB_PATH" "$MOUNT_POINT" \
    -o "credentials=$CRED_FILE,uid=1000,gid=1000,iocharset=utf8,vers=3.0"; then
    echo "=== Montaje SMB exitoso ==="
    # Mostrar espacio disponible
    df -h "$MOUNT_POINT"
else
    echo "=== ERROR: Montaje SMB falló ==="
    echo "Los archivos adjuntos no estarán disponibles"
    # No fallar el inicio del contenedor por esto
fi

# Limpiar archivo de credenciales
rm -f "$CRED_FILE"

echo "=== Iniciando aplicación ==="
