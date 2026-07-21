#!/usr/bin/env bash
# Bootstrap Ubuntu server for Raintech HRM production (run as ubuntu with sudo).
set -euo pipefail

echo "==> System packages"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq ca-certificates curl gnupg ufw fail2ban unattended-upgrades apt-listchanges

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker ubuntu
sudo systemctl enable docker
sudo systemctl start docker

echo "==> UFW firewall"
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp comment 'HTTP/LetsEncrypt'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw allow 7788/tcp comment 'Biometric iClock HTTP'
sudo ufw allow 5010/tcp comment 'BIO-PARK TCP'
sudo ufw --force enable
sudo ufw status verbose

echo "==> fail2ban (SSH)"
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

echo "==> SSH hardening"
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?X11Forwarding .*/X11Forwarding no/' /etc/ssh/sshd_config
sudo systemctl reload sshd || sudo systemctl reload ssh

echo "==> Unattended security upgrades"
sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

echo "==> App directory"
sudo mkdir -p /opt/hrm
sudo chown ubuntu:ubuntu /opt/hrm

echo "Bootstrap complete."
