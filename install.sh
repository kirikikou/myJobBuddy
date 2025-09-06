#!/bin/bash

# Script d'installation pour Job Search Tool avec fonctionnalités étendues
echo "=== Installation de Job Search Tool - Version Étendue ==="

# Vérifier si Node.js est installé
if ! command -v node &> /dev/null; then
    echo "Node.js n'est pas installé. Veuillez installer Node.js avant de continuer."
    exit 1
fi

# Vérifier la version de Node.js
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "Node.js v14 ou supérieur est requis. Version actuelle: $(node -v)"
    exit 1
fi

# Créer la structure de dossiers
echo "Création de la structure de dossiers..."
mkdir -p public debug cache

# Vérifier et installer les dépendances de Playwright
echo "Installation des dépendances de système nécessaires pour Playwright..."
if command -v apt-get &> /dev/null; then
    # Pour les systèmes basés sur Debian/Ubuntu
    sudo apt-get update
    sudo apt-get install -y \
        libxkbcommon0 \
        libx11-xcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxi6 \
        libxtst6 \
        libnss3 \
        libcups2 \
        libxss1 \
        libxrandr2 \
        libasound2 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libpangocairo-1.0-0 \
        libgtk-3-0 \
        libgbm1
elif command -v yum &> /dev/null; then
    # Pour les systèmes basés sur RHEL/CentOS/Fedora
    sudo yum install -y \
        libX11-xcb \
        libxcb \
        libxkbcommon \
        libXcomposite \
        libXdamage \
        libXi \
        libXtst \
        nss \
        cups-libs \
        libXScrnSaver \
        libXrandr \
        alsa-lib \
        atk \
        at-spi2-atk \
        pango \
        gtk3 \
        mesa-libgbm
fi

# Installer les dépendances
echo "Installation des dépendances Node.js..."
npm install

# Installation des navigateurs pour Playwright
echo "Installation des navigateurs pour Playwright..."
npx playwright install-deps chromium
npx playwright install chromium

# Récupérer le chemin du dossier cache
CACHE_DIR="$PWD/cache"
echo "Création du dossier cache dans: $CACHE_DIR"
chmod 777 "$CACHE_DIR"

# Copier l'index.html s'il existe dans le répertoire courant
if [ -f "index.html" ]; then
    echo "Copie de index.html dans le dossier public..."
    cp index.html public/
else
    echo "Attention: index.html non trouvé. Veuillez le placer dans le dossier 'public' manuellement."
fi

# Installation de nouvelles dépendances
echo "Installation des dépendances supplémentaires pour le scraping discret..."
npm install axios cheerio

# Vérifier si l'installation a réussi
if [ $? -eq 0 ]; then
    echo ""
    echo "=== Installation terminée avec succès ! ==="
    echo ""
    echo "Pour démarrer le serveur, exécutez :"
    echo "npm start     # Mode production"
    echo "npm run dev   # Mode développement avec redémarrage automatique"
    echo ""
    echo "Accédez à l'application dans votre navigateur: http://localhost:3000"
    echo "URL de débogage: http://localhost:3000/debug/search"
    echo ""
    echo "Nouvelles fonctionnalités installées:"
    echo "- Recherche sur des pages carrière personnalisées"
    echo "- Système de mise en cache des résultats (24h)"
    echo "- Scraping discret avec Axios/Fetch et fallback Playwright"
else
    echo "Une erreur s'est produite lors de l'installation."
    exit 1
fi