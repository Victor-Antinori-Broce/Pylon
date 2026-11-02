#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# Copia del volumen de MEDIOS (/app/data de la API) con rotación
#
# `scripts/backup.ts` solo hace `pg_dump`: la base guarda las DIRECCIONES de
# las imágenes, no las imágenes. Perder el volumen `kitsuden_uploads_prod`
# (≈3,5 GB: 33.617 cartas, 13.000+ ficheros de juegos, vídeos) dejaba una base
# restaurable y una web sin una sola imagen.
#
# Lo llama el bucle de `kitsuden_backup` (docker-compose.yml) después de cada
# volcado, y él decide si toca: copia completa cada BACKUP_MEDIA_DIAS días
# (7 por defecto) y se conservan las BACKUP_MEDIA_KEEP últimas (2). Los medios
# casi no cambian (claves por hash, solo se añaden), así que una copia
# semanal completa basta y no hace falta nada incremental.
#
# Formato: tar SIN comprimir. Son WebP y MP4, ya comprimidos: gzip tardaría
# minutos para ganar un 1-2 %.
#
# Se escribe en `<nombre>.tar.parcial` y se renombra solo si la verificación
# pasa: una copia a medias (disco lleno, contenedor parado) nunca se confunde
# con una buena, y la rotación nunca borra la última buena por una mala.
#
# Variables: MEDIA_DIR (/medios), BACKUP_DIR (/backups), BACKUP_MEDIA_DIAS,
# BACKUP_MEDIA_KEEP. `--forzar` copia aunque no toque.
#
# Restaurar: ver docs/instalacion/copias.md.
# ═══════════════════════════════════════════════════════════════════════════
set -eu

MEDIA_DIR="${MEDIA_DIR:-/medios}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DIAS="${BACKUP_MEDIA_DIAS:-7}"
KEEP="${BACKUP_MEDIA_KEEP:-2}"
MARCA="$BACKUP_DIR/.medios-ultimo-ok"

if [ ! -d "$MEDIA_DIR" ]; then
  echo "medios: $MEDIA_DIR no está montado; no hay nada que copiar" >&2
  exit 1
fi

ahora=$(date -u +%s)
if [ "${1:-}" != "--forzar" ] && [ -f "$MARCA" ]; then
  ultimo=$(cat "$MARCA")
  if [ $((ahora - ultimo)) -lt $((DIAS * 86400)) ]; then
    echo "medios: copia de hace $(((ahora - ultimo) / 3600)) h; la siguiente a los $DIAS días"
    exit 0
  fi
fi

nombre="medios-$(date -u +%Y-%m-%dT%H-%M-%S).tar"
destino="$BACKUP_DIR/$nombre"
parcial="$destino.parcial"
rm -f "$BACKUP_DIR"/medios-*.tar.parcial

# ¿Cabe? Lo que ocupan los medios más un 10 %. Mejor no empezar que llenar el
# disco donde también vive la base.
necesita_kb=$(du -sk "$MEDIA_DIR" | awk '{print int($1 * 1.1)}')
libre_kb=$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print $4}')
if [ "$libre_kb" -lt "$necesita_kb" ]; then
  echo "medios: NO hay sitio (hacen falta ${necesita_kb} KB, hay ${libre_kb} KB libres)" >&2
  exit 1
fi

echo "medios: copiando $MEDIA_DIR → $nombre"
inicio=$(date -u +%s)
tar -cf "$parcial" -C "$MEDIA_DIR" .

# Verificación: el tar se lee entero y tiene tantos ficheros como el origen.
en_origen=$(find "$MEDIA_DIR" -type f | wc -l | tr -d ' ')
en_copia=$(tar -tf "$parcial" | grep -vc '/$' || true)
if [ "$en_copia" -lt "$en_origen" ]; then
  echo "medios: copia INCOMPLETA ($en_copia de $en_origen ficheros); se descarta" >&2
  rm -f "$parcial"
  exit 1
fi
mv "$parcial" "$destino"
echo "$ahora" > "$MARCA"
echo "medios: ok, $en_copia ficheros, $(du -h "$destino" | cut -f1), $(( $(date -u +%s) - inicio )) s"

# Rotación: se quedan las KEEP más recientes (el nombre lleva la fecha, así
# que el orden alfabético es el cronológico).
ls -1 "$BACKUP_DIR"/medios-*.tar 2>/dev/null | sort -r | tail -n +$((KEEP + 1)) | while read -r viejo; do
  echo "medios: rotación, se borra $(basename "$viejo")"
  rm -f "$viejo"
done
