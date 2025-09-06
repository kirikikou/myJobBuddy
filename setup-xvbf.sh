#!/bin/bash

# Script d'installation de Xvfb pour exécuter un navigateur GUI sur un serveur sans écran
echo "=== Installation de Xvfb pour Playwright en mode 'non-headless' sur serveur ==="

# Vérifier si on est sur un système basé sur Debian/Ubuntu
if command -v apt-get &> /dev/null; then
    echo "Système basé sur Debian/Ubuntu détecté"
    
    # Installer Xvfb et dépendances
    echo "Installation de Xvfb et des dépendances nécessaires..."
    sudo apt-get update
    sudo apt-get install -y xvfb x11-xserver-utils libxss1 libnss3 \
        libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
        libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
        libasound2 libpango-1.0-0 libpangocairo-1.0-0 libxtst6 libgtk-3-0
        
    echo "Installation de dépendances supplémentaires pour la police..."
    sudo apt-get install -y fonts-liberation fonts-noto-color-emoji \
        ttf-ubuntu-font-family fonts-noto-core
    
elif command -v yum &> /dev/null; then
    echo "Système basé sur RHEL/CentOS/Fedora détecté"
    
    # Installer Xvfb et dépendances
    echo "Installation de Xvfb et des dépendances nécessaires..."
    sudo yum install -y xorg-x11-server-Xvfb libXScrnSaver libXss \
        gtk3 dbus-glib nss alsa-lib libXcomposite libXcursor \
        libXdamage libXext libXi libXrandr libXtst cups-libs \
        libdrm libxkbcommon-x11 mesa-libgbm pango atk at-spi2-atk \
        libXfixes
    
    echo "Installation de dépendances supplémentaires pour la police..."
    sudo yum install -y google-noto-emoji-color-fonts ubuntu-fonts-family-core
else
    echo "Système non supporté. Veuillez installer manuellement Xvfb et les dépendances nécessaires."
    exit 1
fi

# Créer un script de démarrage Xvfb
echo "Création d'un script de démarrage pour Xvfb..."
cat > start-with-xvfb.sh << 'EOF'
#!/bin/bash

# Définir les variables d'environnement pour Playwright
export DISPLAY=:99
export PLAYWRIGHT_HEADLESS_MODE=false

# Démarrer Xvfb avec une résolution de 1920x1080x24
Xvfb :99 -screen 0 1920x1080x24 -ac &
XVFB_PID=$!

# Attendre que Xvfb soit prêt
echo "Démarrage de Xvfb..."
sleep 2

# Démarrer l'application Node.js
echo "Démarrage de l'application Node.js..."
node server.js

# Arrêter Xvfb lorsque l'application se termine
kill $XVFB_PID
EOF

chmod +x start-with-xvfb.sh

# Installer les dépendances Node.js
echo "Installation des dépendances Node.js..."
npm install express cors body-parser playwright

# Installer Playwright avec le navigateur Chromium
echo "Installation de Playwright et des navigateurs..."
npx playwright install chromium

echo ""
echo "=== Installation terminée ! ==="
echo ""
echo "Pour démarrer l'application avec Xvfb, exécutez :"
echo "./start-with-xvfb.sh"
echo ""
echo "Cette configuration permet d'exécuter Playwright en mode non-headless sur un serveur sans écran physique."
echo "Xvfb crée un écran virtuel que Playwright utilisera pour fonctionner comme si un écran réel était présent."
echo ""