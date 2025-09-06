#!/bin/bash

echo "Installing CV Builder dependencies..."

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Detected Linux - Installing dependencies for Puppeteer..."
    
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y \
            gconf-service \
            libasound2 \
            libatk1.0-0 \
            libatk-bridge2.0-0 \
            libc6 \
            libcairo2 \
            libcups2 \
            libdbus-1-3 \
            libexpat1 \
            libfontconfig1 \
            libgcc1 \
            libgconf-2-4 \
            libgdk-pixbuf2.0-0 \
            libglib2.0-0 \
            libgtk-3-0 \
            libnspr4 \
            libpango-1.0-0 \
            libpangocairo-1.0-0 \
            libstdc++6 \
            libx11-6 \
            libx11-xcb1 \
            libxcb1 \
            libxcomposite1 \
            libxcursor1 \
            libxdamage1 \
            libxext6 \
            libxfixes3 \
            libxi6 \
            libxrandr2 \
            libxrender1 \
            libxss1 \
            libxtst6 \
            ca-certificates \
            fonts-liberation \
            libappindicator1 \
            libnss3 \
            lsb-release \
            xdg-utils \
            wget
    elif command -v yum &> /dev/null; then
        sudo yum install -y \
            alsa-lib \
            atk \
            cups-libs \
            gtk3 \
            ipa-gothic-fonts \
            libdrm \
            libX11 \
            libXcomposite \
            libXcursor \
            libXdamage \
            libXext \
            libXi \
            libXrandr \
            libXScrnSaver \
            libXtst \
            pango \
            xorg-x11-fonts-100dpi \
            xorg-x11-fonts-75dpi \
            xorg-x11-fonts-cyrillic \
            xorg-x11-fonts-misc \
            xorg-x11-fonts-Type1 \
            xorg-x11-utils
    fi
    
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Detected macOS - Puppeteer should work out of the box"
    
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    echo "Detected Windows - Puppeteer should work out of the box"
    
else
    echo "Unknown OS - Puppeteer may need additional configuration"
fi

echo "Installing Node.js dependencies..."
npm install

echo "CV Builder dependencies installation complete!"