#!/usr/bin/env bash
# Prepara uma VM Ubuntu/Debian para receber o deploy (rodar UMA vez, como root ou com sudo).
#   curl -fsSL https://raw.githubusercontent.com/DrMetzger/ArVirtual/main/app/deploy/preparar-vm.sh | sudo bash -s -- deploy
set -euo pipefail
USUARIO="${1:-deploy}"

apt-get update -y
apt-get install -y ca-certificates curl rsync
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

id "$USUARIO" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$USUARIO"
usermod -aG docker "$USUARIO"
install -d -o "$USUARIO" -g "$USUARIO" /opt/arvirtual-app

# Firewall: SSH + HTTP/HTTPS (Caddy emite o certificado pela porta 80).
if command -v ufw >/dev/null; then
  ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
fi

echo
echo "Pronto. Agora adicione a CHAVE PÚBLICA do deploy em /home/$USUARIO/.ssh/authorized_keys"
echo "e cadastre a CHAVE PRIVADA no GitHub como secret VM_SSH_KEY."
