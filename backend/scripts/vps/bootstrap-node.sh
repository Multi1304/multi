#!/bin/bash
# CamelFarm VPS Exit Bootstrap v1.0
# Installs Wireguard, Tinyproxy, and configures UFW firewall.

set -e

echo "--- 🛡️ CamelFarm VPS Exit Node Bootstrap starting ---"

# 1. Update and Install Dependencies
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y wireguard tinyproxy ufw curl qrencode

# 2. Configure Tinyproxy (Egress Proxy)
cat <<EOF > /etc/tinyproxy/tinyproxy.conf
User tinyproxy
Group tinyproxy
Port 8888
Timeout 600
MaxClients 100
MinSpareServers 5
MaxSpareServers 20
StartServers 10
MaxRequestsPerChild 0
Allow 127.0.0.1
# Traffic from Wireguard Interface
Allow 10.0.0.0/24
ViaProxyName "camelfarm-vps-exit"
EOF

systemctl restart tinyproxy
systemctl enable tinyproxy

# 3. Configure Wireguard
umask 077
wg genkey | tee privatekey | wg pubkey > publickey
PRIV_KEY=$(cat privatekey)
PUB_KEY=$(cat publickey)

cat <<EOF > /etc/wireguard/wg0.conf
[Interface]
PrivateKey = $PRIV_KEY
Address = 10.0.0.1/24
ListenPort = 51820

# Forwarding for Tinyproxy
PostUp = ufw route allow in on wg0 out on eth0
PostUp = iptables -t nat -I POSTROUTING -o eth0 -j MASQUERADE
PostDown = ufw route delete allow in on wg0 out on eth0
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
EOF

systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# 4. Configure Firewall
ufw allow 51820/udp
ufw allow 8888/tcp
ufw allow OpenSSH
echo "y" | ufw enable

echo "--- ✅ Bootstrap Complete ---"
echo "Public Key: $PUB_KEY"
echo "Tinyproxy Port: 8888"
