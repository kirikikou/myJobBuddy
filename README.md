Toute proposition de code, de correctif ou de modification dans myJobBuddy doit absolument respecter les règles suivantes :

📂 Gestion des fichiers & périmètre

Toujours vérifier si les fichiers concernés ont été fournis.

Si présents : appliquer la modification directement.

Si absents : les réclamer avant toute proposition (⚠️ interdiction d’écrire un fichier non fourni).

En cas de modification :

Réécrire le fichier entier si plusieurs parties sont concernées.

Réécrire en entier la fonction, const, class, route, get/post, middleware concernée si une seule unité est à modifier.

Jamais de patch partiel ou ligne isolée sortie du contexte → toujours un bloc complet, autoportant et exécutable.

❌ Interdits absolus

Pas de hardcode : aucune valeur magique dans la logique métier (durées, seuils, quotas, URLs, clés API).

Pas de console.log brut : logs uniquement via config.smartLog() avec catégories définies.

Pas de commentaires explicatifs dans le code livré (le code doit être autoportant et clair par lui-même).

✅ Obligations

Code compact (pas verbeux), mais indentation claire et retours à la ligne respectés.

Code robuste et tout terrain : gestion d’erreurs systématique (try/catch, Promise.allSettled, fallback gracieux).

Paramètres configurables : toute constante dans config/*.js ou dictionaries/, jamais en dur.

Internationalisation : utiliser les dictionnaires (dictionaries/) pour tout texte, job titles, patterns, UI, etc.

Logging intelligent :

Toujours config.smartLog() avec la bonne catégorie (SCRAPING, BUFFER, LANGUE, etc.).

Jamais de stacktrace brute envoyée en prod → formatage clair + fallback user-friendly.

Respect des endpoints existants : uniquement les routes définies dans routes/.

Respect des plans & quotas : vérifier avec plan/limits.js et subscriptionPlans.js avant toute action.

⚙️ Directives techniques

Buffer & cache obligatoires : pas de scrap doublon, respecter slot unique/domain, servir cache avant live.

Promesses : préférer Promise.allSettled ou async/await robuste.

Modularité : isoler les responsabilités (profilage, scraping step, orchestration, parsing).

Résilience : retry limité sur erreurs transitoires, fallback cache stale ou step suivante.

Stabilité prouvée : ne rien introduire qui dégrade les performances validées (buffer ~29% efficacité, UX <3 min).

👉 En résumé :
Avant toute modification, vérifier les fichiers → livrer le fichier entier ou l’unité de code complète (func/route/etc.), sans hardcode, compact, robuste, avec smartLog et dictionnaires.
