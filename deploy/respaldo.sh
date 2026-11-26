#!/bin/sh
# Copia diaria de la base de MACHOBOL (esquema public de Supabase) en formato custom de pg_dump.
# Guarda 14 días. Para restaurar en una base vacía:
#   pg_restore --no-owner --no-privileges --dbname "<url de destino>" machobol-AAAAMMDD-HHMM.dump
# (El aviso 'schema "public" already exists' es esperado y no afecta: se restauran datos, funciones y triggers.)
set -u
DIAS=14

while true; do
  archivo="/respaldos/machobol-$(date -u +%Y%m%d-%H%M).dump"
  if pg_dump --format=custom --schema=public --no-owner --no-privileges --file="$archivo" "$DATABASE_URL"; then
    echo "$(date -u +%FT%TZ) Respaldo listo: $archivo ($(du -h "$archivo" | cut -f1))"
  else
    echo "$(date -u +%FT%TZ) ERROR: falló el respaldo de la base" >&2
    rm -f "$archivo"
  fi
  find /respaldos -name 'machobol-*.dump' -mtime +$DIAS -delete
  sleep 86400
done
