@echo off
echo === Démarrage de l'application Job Search Tool ===

:: Installer les dépendances si nécessaire
if not exist node_modules (
  echo Installation des dépendances...
  call npm install
)

:: Démarrer l'application
echo Démarrage du serveur...
node server.js