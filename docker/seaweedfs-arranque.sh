#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# Arranque de SeaweedFS (perfiles s3/full/dev de docker-compose.yml)
#
# Sustituye a MinIO, cuya edición libre dejó de mantenerse: sin imágenes
# oficiales desde octubre de 2025 y con el repositorio archivado en abril de
# 2026. `minio/minio:latest` seguía arrancando, pero ya no iba a recibir
# parches de seguridad.
#
# ── POR QUÉ HAY UN SCRIPT Y NO SOLO UN `command:` ─────────────────────────
#
# SeaweedFS sin identidades configuradas arranca en «Allow-All»: cualquiera
# que llegue al puerto S3 lee, escribe y borra sin credenciales. Hay que darle
# un fichero de identidades, y ese fichero lleva las claves. Escribirlo aquí,
# a partir del entorno, evita dos cosas:
#
#   · un fichero con secretos en el repositorio;
#   · las claves en la línea de órdenes, donde las enseña cualquier `ps`.
#
# Se regenera en cada arranque: rotar las claves es cambiar `.env` y
# reiniciar el contenedor.
#
# ── LAS DOS IDENTIDADES ────────────────────────────────────────────────────
#
#   kitsuden   — la de la API (S3_ACCESS_KEY / S3_SECRET_KEY), todo permitido.
#   anonymous  — SOLO lectura del bucket de medios. Las URLs públicas que
#                guarda la API (`S3_PUBLIC_URL/<bucket>/<clave>`) las pide el
#                navegador sin firmar; sin esto darían 403. No puede listar el
#                bucket ni escribir, y otros buckets no los ve.
# ═══════════════════════════════════════════════════════════════════════════
set -eu

: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required - set it in .env}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required - set it in .env}"
BUCKET="${S3_BUCKET:-kitsuden-media}"

# Van dentro de un JSON: unas comillas o una barra invertida lo romperían y
# SeaweedFS arrancaría con una configuración que no es la que se escribió
case "$S3_ACCESS_KEY$S3_SECRET_KEY$BUCKET" in
  *'"'* | *'\'*)
    echo "S3_ACCESS_KEY, S3_SECRET_KEY y S3_BUCKET no pueden llevar comillas dobles ni barras invertidas" >&2
    exit 1
    ;;
esac

mkdir -p /etc/seaweedfs
cat > /etc/seaweedfs/s3.json <<JSON
{
  "identities": [
    {
      "name": "kitsuden",
      "credentials": [{ "accessKey": "$S3_ACCESS_KEY", "secretKey": "$S3_SECRET_KEY" }],
      "actions": ["Admin", "Read", "List", "Tagging", "Write"]
    },
    { "name": "anonymous", "actions": ["Read:$BUCKET"] }
  ]
}
JSON
# El proceso corre como `seaweed` (el entrypoint de la imagen suelta los
# privilegios): tiene que poder leerlo, y nadie más
chown seaweed:seaweed /etc/seaweedfs/s3.json
chmod 600 /etc/seaweedfs/s3.json

# `mini`: maestro, volumen, filer, S3 y panel en un solo proceso, que es lo
# que corresponde a una sola máquina. Por el entrypoint de la imagen, que
# ajusta los permisos de /data y deja de ser root.
#
#   -bucket                  crea el bucket si no existe (lo que hacía
#                            `minio/mc mb` en un contenedor aparte)
#   -master.telemetry=false  por defecto manda estadísticas a seaweedfs.com
#
# El panel pide usuario y contraseña; SIN contraseña quedaría abierto. Son
# las mismas claves, como en la consola de MinIO, y van por entorno
# (`WEED_ADMIN_*`) y no como `-admin.password`, que saldría en `ps`.
export WEED_ADMIN_USER="$S3_ACCESS_KEY"
export WEED_ADMIN_PASSWORD="$S3_SECRET_KEY"
exec /entrypoint.sh mini \
  -dir=/data \
  -bucket="$BUCKET" \
  -s3.config=/etc/seaweedfs/s3.json \
  -master.telemetry=false
