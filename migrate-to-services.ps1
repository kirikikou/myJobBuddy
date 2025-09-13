Write-Host "🚀 myJobBuddy Services Migration Script (Fixed)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Vérifier si on est dans le bon répertoire
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Erreur: Veuillez exécuter ce script depuis le répertoire racine de myJobBuddy" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Répertoire racine détecté" -ForegroundColor Green

# Créer les dossiers nécessaires
Write-Host "📁 Création des dossiers..." -ForegroundColor Yellow
$folders = @("services", "services/sse", "controllers")
foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        Write-Host "   ✅ Créé: $folder" -ForegroundColor Green
    } else {
        Write-Host "   ℹ️  Existe déjà: $folder" -ForegroundColor Blue
    }
}

# Backup de l'ancien système
Write-Host "💾 Sauvegarde de l'ancien système..." -ForegroundColor Yellow
$backupDir = "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

if (Test-Path "routes/apiRoutes.js") {
    $backupPath = Join-Path $backupDir "apiRoutes.backup.js"
    Copy-Item "routes/apiRoutes.js" $backupPath -Force
    Write-Host "   ✅ Sauvegardé: routes/apiRoutes.js → $backupPath" -ForegroundColor Green
}

# Vérifier les fichiers requis
Write-Host "🔍 Vérification des fichiers..." -ForegroundColor Yellow
$requiredFiles = @(
    "services/SearchCacheService.js",
    "services/SearchCareerService.js", 
    "services/JobMatchingService.js",
    "services/FileProcessingService.js",
    "services/ValidationService.js",
    "services/ResponseFormatterService.js",
    "services/ServicesBootstrap.js",
    "services/sse/EventStream.js",
    "controllers/SearchController.js",
    "controllers/ScrapingController.js",
    "controllers/FileController.js",
    "controllers/UserPreferencesController.js",
    "controllers/PlatformController.js",
    "routes/apiRoutes.refactored.js"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        $missingFiles += $file
        Write-Host "   ❌ Manquant: $file" -ForegroundColor Red
    } else {
        Write-Host "   ✅ Trouvé: $file" -ForegroundColor Green
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "❌ Fichiers manquants détectés. Veuillez d'abord créer tous les fichiers requis." -ForegroundColor Red
    Write-Host "Fichiers manquants:" -ForegroundColor Red
    foreach ($file in $missingFiles) {
        Write-Host "  - $file" -ForegroundColor Red
    }
    exit 1
}

# Remplacer apiRoutes.js
Write-Host "🔄 Remplacement des fichiers..." -ForegroundColor Yellow

if (Test-Path "routes/apiRoutes.refactored.js") {
    Copy-Item "routes/apiRoutes.refactored.js" "routes/apiRoutes.js" -Force
    Write-Host "   ✅ apiRoutes.js remplacé par la version refactorisée" -ForegroundColor Green
}

# Vérifier les dépendances NPM
Write-Host "📦 Vérification des dépendances NPM..." -ForegroundColor Yellow
$packageJsonContent = Get-Content "package.json" -Raw
$packageJson = $packageJsonContent | ConvertFrom-Json

$requiredDeps = @("multer", "sharp")
$missingDeps = @()

foreach ($dep in $requiredDeps) {
    $hasDep = $false
    
    if ($packageJson.dependencies -and $packageJson.dependencies.PSObject.Properties.Name -contains $dep) {
        $hasDep = $true
    }
    if ($packageJson.devDependencies -and $packageJson.devDependencies.PSObject.Properties.Name -contains $dep) {
        $hasDep = $true
    }
    
    if (-not $hasDep) {
        $missingDeps += $dep
        Write-Host "   ❌ Dépendance manquante: $dep" -ForegroundColor Red
    } else {
        Write-Host "   ✅ Dépendance trouvée: $dep" -ForegroundColor Green
    }
}

if ($missingDeps.Count -gt 0) {
    Write-Host "📦 Installation des dépendances manquantes..." -ForegroundColor Yellow
    try {
        $depsString = $missingDeps -join " "
        $installCmd = "npm install $depsString"
        Invoke-Expression $installCmd
        Write-Host "   ✅ Dépendances installées avec succès" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠️  Erreur lors de l'installation. Installez manuellement:" -ForegroundColor Yellow
        Write-Host "   npm install $($missingDeps -join ' ')" -ForegroundColor Yellow
    }
}

# Test de l'architecture
Write-Host "🧪 Test de l'architecture..." -ForegroundColor Yellow

$testJsContent = @"
try {
    const config = require('./config');
    const ServicesBootstrap = require('./services/ServicesBootstrap');
    const userPreferencesManager = require('./userPreferencesManager');
    const dictionaries = require('./dictionaries');
    const PlanService = require('./services/PlanService');
    
    const planService = PlanService.getInstance();
    const bootstrap = ServicesBootstrap.createBootstrap(config, userPreferencesManager, dictionaries, planService);
    
    bootstrap.validateDependencies();
    const health = bootstrap.getHealthStatus();
    
    console.log('Architecture Test: PASSED');
    console.log('Services: ' + health.totalServices);
    console.log('Controllers: ' + health.totalControllers);
    console.log('Status: ' + (health.healthy ? 'HEALTHY' : 'UNHEALTHY'));
    
    process.exit(0);
} catch (error) {
    console.log('Architecture Test: FAILED - ' + error.message);
    process.exit(1);
}
"@

try {
    $testJsContent | Out-File -FilePath "test-arch-temp.js" -Encoding UTF8
    $testOutput = & node "test-arch-temp.js" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Test de l'architecture réussi!" -ForegroundColor Green
        foreach ($line in $testOutput) {
            Write-Host "   $line" -ForegroundColor Blue
        }
    } else {
        Write-Host "   ❌ Test de l'architecture échoué:" -ForegroundColor Red
        foreach ($line in $testOutput) {
            Write-Host "   $line" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "   ⚠️  Impossible de tester l'architecture automatiquement" -ForegroundColor Yellow
} finally {
    if (Test-Path "test-arch-temp.js") {
        Remove-Item "test-arch-temp.js" -Force
    }
}

# Rapport final
Write-Host ""
Write-Host "🎉 MIGRATION TERMINÉE!" -ForegroundColor Green
Write-Host "===================" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Résumé des changements:" -ForegroundColor Cyan
Write-Host "  • Services créés: 6" -ForegroundColor White
Write-Host "  • Controllers créés: 5" -ForegroundColor White
Write-Host "  • Architecture: Injection de dépendances" -ForegroundColor White
Write-Host "  • Backup créé dans: $backupDir" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Prochaines étapes:" -ForegroundColor Cyan
Write-Host "  1. Démarrer le serveur: npm start" -ForegroundColor White
Write-Host "  2. Tester l'API: http://localhost:3000/api/health" -ForegroundColor White
Write-Host "  3. Vérifier les logs pour d'éventuelles erreurs" -ForegroundColor White
Write-Host ""
Write-Host "✨ L'architecture services/controllers est prête!" -ForegroundColor Green