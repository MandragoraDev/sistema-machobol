#!/usr/bin/env bash
# Prepara un servidor Ubuntu 24.04 recién creado para MACHOBOL. Se ejecuta UNA vez, como el usuario con sudo:
#   ssh ubuntu@IP 'bash -s' < deploy/preparar-servidor.sh
# Instala Docker, crea memoria de intercambio (Rasa usa ~1,1 GB), activa las actualizaciones de seguridad automáticas
# y deja /opt/machobol listo para deploy/subir.sh.
set -euo pipefail

echo "== Actualizaciones de seguridad automáticas"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades ca-certificates curl
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Docker (repositorio oficial)"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "== Memoria de intercambio (2 GB)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-machobol.conf >/dev/null
  sudo sysctl -q --system
fi

echo "== Carpeta de la aplicación"
sudo mkdir -p /opt/machobol
sudo chown "$USER":"$USER" /opt/machobol

echo
echo "Listo. Docker $(docker --version | cut -d' ' -f3 | tr -d ,) instalado; memoria:"
free -h | head -2
echo "Cierra la sesión SSH y vuelve a entrar para usar docker sin sudo."
