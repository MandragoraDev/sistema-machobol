#!/usr/bin/env bash
# Sube a producción la versión CONFIRMADA (el último commit) y el modelo de Rasa más reciente, y levanta los contenedores.
# Se ejecuta desde la raíz del repositorio (en Windows, con Git Bash):
#   deploy/subir.sh ubuntu@IP [ruta/a/la/llave.pem]
#
# En el servidor:
#   /opt/machobol/actual    versión en uso (con su deploy/.env de secretos, que se conserva entre versiones)
#   /opt/machobol/anterior  la versión previa, para volver atrás si algo falla
# Las migraciones de la base no se aplican aquí: se corren antes, con `npm run db:migrate` (ver README).
set -euo pipefail

destino=${1:?Uso: deploy/subir.sh usuario@servidor [llave.pem]}
opciones_ssh=(-o StrictHostKeyChecking=accept-new)
[ -n "${2:-}" ] && opciones_ssh+=(-i "$2")

cd "$(git rev-parse --show-toplevel)"
version=$(git rev-parse --short HEAD)
if [ -n "$(git status --porcelain)" ]; then
  echo "Aviso: hay cambios sin commit. Se sube solo lo confirmado ($version)."
fi
modelo=$(ls -t rasa_bot/models/*.tar.gz 2>/dev/null | head -1)
[ -n "$modelo" ] || { echo "No hay un modelo entrenado en rasa_bot/models (rasa train)."; exit 1; }

echo "== Subiendo la versión $version y el modelo $(basename "$modelo")"
ssh "${opciones_ssh[@]}" "$destino" 'rm -rf /opt/machobol/nueva && mkdir -p /opt/machobol/nueva/rasa_bot/models'
# Sin conversión de fin de línea: el servidor recibe los archivos tal como están en el repositorio (LF).
git -c core.autocrlf=false archive --format=tar HEAD | ssh "${opciones_ssh[@]}" "$destino" 'tar -x -C /opt/machobol/nueva'
scp "${opciones_ssh[@]}" -q "$modelo" "$destino:/opt/machobol/nueva/rasa_bot/models/"

echo "== Activando la versión y levantando los contenedores"
ssh "${opciones_ssh[@]}" "$destino" bash -s -- "$version" <<'REMOTO'
set -euo pipefail
cd /opt/machobol
if [ -f actual/deploy/.env ]; then
  cp actual/deploy/.env nueva/deploy/.env
elif [ ! -f nueva/deploy/.env ]; then
  echo "Falta /opt/machobol/actual/deploy/.env con los secretos de producción (ver deploy/.env.example)." >&2
  exit 1
fi
echo "$1" > nueva/VERSION
rm -rf anterior
[ -d actual ] && mv actual anterior
mv nueva actual
cd actual/deploy
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose ps
REMOTO

echo "Versión $version desplegada. Si algo falla: ssh $destino 'cd /opt/machobol && mv actual fallida && mv anterior actual && cd actual/deploy && docker compose up -d --build'"
