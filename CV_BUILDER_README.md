# CV Builder - Guide d'utilisation

## Fonctionnalités

- **3 CV maximum** : Possibilité de créer jusqu'à 3 CV différents
- **Upload de photo** : Redimensionnement automatique en format rond
- **Éditeur de texte riche** : Gras, italique, souligné, alignements
- **Sections dynamiques** : Ajout/suppression d'expériences et formations
- **Preview en temps réel** : Aperçu du CV pendant la modification
- **Export PDF** : Génération de PDF professionnel
- **Sauvegarde automatique** : Données sauvegardées dans le profil utilisateur

## Structure des données

Les CV sont sauvegardés dans `userData.cvs` avec la structure :
```json
{
  "cv_1": {
    "active": true,
    "name": "Mon CV Principal",
    "personalInfo": { ... },
    "summary": "...",
    "experience": [...],
    "education": [...],
    "extra1": { "title": "...", "content": "..." },
    "extra2": { "title": "...", "content": "..." }
  }
}