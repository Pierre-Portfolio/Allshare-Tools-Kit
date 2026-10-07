# Audit d'Allshare Tools Kit — version 3.12.0

_Audit du 7 octobre 2026, sur le commit `07250de` (branche `main`)._

## Synthèse

| Contrôle | Résultat |
| --- | --- |
| Tests unitaires (`npm test`) | ✅ 81 / 81 |
| Test de bout en bout (`npm run test:e2e`) | ✅ réussi, **à condition de forcer le Chromium installé** (voir B11) |
| Formatage Prettier | ✅ tous les fichiers conformes |
| Injection HTML (`innerHTML`) | ✅ valeurs échappées partout (Prisme, tableau de bord, Training) ; la CSP MV3 bloque de toute façon les scripts injectés |
| Dépendances d'exécution | ✅ aucune |

Le code est propre : logique métier isolée en fonctions pures testées (`lib/`), commentaires utiles, conventions homogènes. Les problèmes relevés tiennent surtout à **la montée en charge du stockage des mesures** (le parc visé est de 100 à 200 clients) et à **quelques cas limites** d'import, de conversion et de mesure.

**À traiter en premier :** B1 (import sur un autre poste), B2 (conversion Prisme des fichiers mixtes), O1 (stockage des mesures : ~4 s à chaque ouverture à l'échelle visée), puis B3 et B4.

---

## 1. Bugs

Gravité : **Élevée** = données fausses dans un usage normal · **Moyenne** = fonction qui ne fait pas ce qu'elle annonce · **Faible** = cas limite ou confort.

### B1 — Élevée · Les capsules importées d'un autre poste restent « ouvertes (en cours) » sans fin

- **Où :** `extension/lib/backup.js:140` (`mergeBackup`), conséquence dans `lib/cra.js` (`openedOn`) et `background.js` (`closeCapsuleSpans`).
- **Scénario :** sur le poste A, une capsule est ouverte (période `spans` sans `to`, fenêtre n° 1234) au moment de « Exporter mes données ». Sur le poste B, l'import ajoute la capsule telle quelle. La fenêtre 1234 n'existe pas sur B : aucune fermeture de fenêtre ne termine cette période, seul un redémarrage de Chrome le fait.
- **Reproduit :** avec un export fait 3 h plus tôt, CRA affiche la capsule « ouverte 4 h 00 (en cours) », et le temps continue de grimper. Le relevé chaque minute (alarme `tick`) reste aussi actif pour rien.
- **Également :** `craPages` et `capsuleAlive` du poste A sont repris s'ils manquent sur B (boucle « autres clés », `backup.js:170`), ce qui peut créditer jusqu'à 3 min à des pages qui ne sont pas ouvertes sur B.
- **Correctif :** dans `mergeBackup`, terminer les périodes ouvertes des capsules importées (`to = Date.parse(exportedAt)` borné par `from`, sans `wins`) et exclure `craPages` et `capsuleAlive` de la reprise.

### B2 — Moyenne · Prisme : convertir un fichier à encodage mixte garde les accents cassés

- **Où :** `extension/lib/prisme.js:410` (`decode`) puis `prisme.js:1019` (`convert`).
- **Scénario :** un fichier ANSI avec une ou plusieurs lignes en UTF-8 (cas détecté par `enc-mixed`, et justement présent dans le fichier d'exemple). Le fichier entier est décodé en Windows-1252 : les lignes UTF-8 deviennent « Ã‰clair cafÃ© », et **l'export (ANSI comme UTF-8) écrit ces caractères cassés**.
- **Reproduit avec l'exemple :** `A005;Ã‰clair cafÃ©;3,80;06/01/2024;BesanÃ§on;…` dans les deux exports.
- **Correctif :** pour `mixed`, décoder ligne par ligne (`scanBytes` sait déjà quelles lignes sont en UTF-8 : `utf8Lines` / `badLines`) ; la conversion répare alors le fichier au lieu de figer l'erreur.

### B3 — Moyenne (probable) · Raccourci Alt+Maj+M : le panneau ne s'ouvre pas quand le formulaire est incomplet

- **Où :** `extension/background.js:515-517`.
- **Scénario :** le raccourci appelle `chrome.sidePanel.open()` **après deux `await`** (`getConfig`, `arm`). Chrome n'accepte cette ouverture qu'en réponse directe à un geste de l'utilisateur ; après un `await`, ce geste est perdu et l'erreur est avalée par `.catch(() => {})`. Le code de `report/report.js` (`runRedo`) contourne déjà ce piège (« avant tout await »), pas celui du raccourci.
- **Correctif :** ouvrir le panneau tout de suite au début du gestionnaire (`tab.windowId` est fourni) ou toujours l'ouvrir au raccourci ; à vérifier dans Chrome (le test e2e ne couvre pas ce chemin).

### B4 — Faible à moyenne · Couleur du résultat dans le panneau différente du tableau de bord et des exports

- **Où :** `extension/panel/panel.js:313` et `:330`.
- **Scénario :** `renderResult` recalcule l'anomalie à la main : il ignore les **seuils absolus** (`warnMs`, `critMs`) des Réglages et la garde `ratio > 0` de `anomaly()` (`lib/report.js`). Une mesure au-dessus du seuil absolu est orange dans les exports mais neutre dans le panneau. Aussi, si la mesure de l'autre réseau vaut 0 ms, l'écart affiché est « Infinity % ».
- **Correctif :** réutiliser `anomaly()` (et `MIN_APPS_FOR_RATIO` à la place du `3` codé en dur) ; protéger la division.

### B5 — Faible à moyenne · Mesure Insight sous-estimée pour les réponses `fetch` volumineuses

- **Où :** `extension/content/page-hook.js:24`.
- **Scénario :** pour `fetch`, la fin de requête est signalée quand la promesse se résout, c'est-à-dire **à la réception des en-têtes**, pas à la fin du téléchargement. Si le corps met plus que le délai de calme (1 s par défaut) à arriver, sans autre activité de la page, la mesure s'arrête avant l'affichage. `XMLHttpRequest` (utilisé par APEX via jQuery) n'est pas concerné : `loadend` arrive après le corps.
- **Correctif :** considérer la requête terminée à la lecture complète du corps, ou à l'arrivée de l'entrée `PerformanceResourceTiming` correspondante (déjà observée dans `content.js`).

### B6 — Faible · Pendant une mesure, tous les onglets reçoivent le script de page

- **Où :** `extension/background.js:63` (`registerScripts`, `matches: ['<all_urls>']`).
- **Scénario :** tant qu'une mesure attend le clic, toute page chargée dans **n'importe quel onglet** (messagerie, autre site) reçoit `page-hook.js` dans son monde principal. Le service worker ignore ces onglets, mais `fetch` et `XMLHttpRequest` y restent enveloppés jusqu'au rechargement. Peu de risque fonctionnel, mais c'est inutile, et certains sites détectent ce type d'enveloppe.
- **Correctif :** limiter `matches` à l'origine de la page de départ (`new URL(armUrl).origin + '/*'`).

### B7 — Faible · Capsule : une saisie en cours est perdue quand la liste se recharge

- **Où :** `extension/panel/capsule.js:434`.
- **Scénario :** toute écriture de `capsules` reconstruit la liste, y compris celles du service worker quand une fenêtre de capsule se ferme. Un renommage ou une adresse en cours de saisie disparaît alors sans enregistrement.
- **Correctif :** différer le rechargement tant qu'un champ de la liste a le focus (comme `options.js` le fait pour les pages).

### B8 — Faible · Écritures concurrentes sans verrou sur `chrome.storage.local`

- **Où :** `lib/capsule.js` (`updateCapsule`, `setDone`, `recordOpen`) contre `background.js` (`closeOpenSpans`) ; idem pour `settings`, `pages` et `apps` entre les pages et le service worker.
- **Scénario :** chaque écriture fait « lire, modifier, réécrire la clé entière ». Si deux contextes le font en même temps, la dernière écriture efface l'autre (par exemple, une période de capsule fermée par le service worker est rouverte par le panneau). La fenêtre de temps est de quelques millisecondes : c'est rare.
- **Correctif :** faire passer les écritures de capsules par le service worker (messages, comme les mesures) ou les rendre atomiques (une clé par capsule).

### B9 — Faible · Training : les dernières frappes sont perdues si l'onglet est fermé juste après

- **Où :** `extension/training/training.js:51` (enregistrement différé de 400 ms, pas de sauvegarde à la fermeture).
- **Correctif :** appeler `persist(true)` sur `pagehide` / `visibilitychange`.

### B10 — Faible · CRA : panneau ouvert à minuit

- **Où :** `extension/panel/cra.js:101`.
- **Scénario :** le jour choisi est fixé au chargement : après minuit, le panneau continue d'afficher la veille et ses textes « aujourd'hui » deviennent faux.
- **Correctif :** dans le relevé de chaque minute, avancer le calendrier s'il était sur le jour en cours.

### B11 — Faible (outillage) · `npm run test:e2e` échoue sur une installation neuve

- **Où :** `package.json` (`"playwright": "^1.56.1"`), aucun `package-lock.json` versionné.
- **Constat :** `npm install` installe aujourd'hui Playwright 1.63, qui attend un autre Chromium (`chromium-1243`) : le test échoue (« Executable doesn't exist ») tant qu'on ne lance pas `npx playwright install` ou `CHROME_PATH=…`. Le README indique seulement `npm install && npm run test:e2e`.
- **Correctif :** versionner `package-lock.json` (ou figer la version exacte de Playwright).

### À surveiller

- L'adresse de la page C.R.A est écrite à trois endroits sous deux formes : `manifest.json` (`saisie-cra*`) et `lib/cra.js` / `content/cra.js` (`saisie-cra?`). Une adresse sans paramètre serait acceptée par le manifest puis ignorée en silence par le script.
- Les fichiers importés (« Mes données », sauvegarde Insight, progression Training) ne sont pas validés en profondeur : adresses des onglets de Capsule (`javascript:`…), types des réglages (`quietMs: "abc"`). Le risque reste limité à un fichier piégé importé volontairement.

---

## 2. Optimisations du code

### O1 — Priorité haute · Stockage des mesures : tout est relu à chaque ouverture

- **Constat :** `getMeasures()` (`lib/storage.js:97`) lit **tout** `chrome.storage.local` (`get(null)`) puis filtre les clés `m_*`. Elle est appelée par le panneau Insight (à l'ouverture **et après chaque nouvelle mesure**), le tableau de bord, les exports, les Réglages, l'accueil (rien que pour afficher des compteurs, `home.js:33`) et le formulaire Capsule (pour proposer les noms de clients, `capsule.js:387`).
- **Volume :** une mesure pèse environ **4,6 Ko**, dont **89 % pour le détail des temps** (15 adresses de requêtes APEX). À l'échelle visée (200 clients × 46 pages du menu × 2 réseaux = **18 400 mesures**, sans compter les relances), cela fait environ **85 Mo** relus à chaque fois.
- **Mesuré dans Chromium (sans interface), 18 400 mesures :**

  | Page | Avec le détail | Sans le détail |
  | --- | --- | --- |
  | Accueil (compteurs) | 4,0 s | 0,65 s |
  | Panneau Insight | 3,8 s | 0,63 s |
  | Tableau de bord | 4,8 s | 1,8 s |

  Le test e2e actuel (7 093 mesures **sans** détail, 20 pages) affiche déjà le tableau de bord en 2,7 s.
- **Proposition :**
  1. Ranger le détail à part (IndexedDB, ou clés `d_<id>`), chargé seulement quand on l'affiche ou pour l'export « Détail des temps » : temps divisés par environ 6.
  2. Ensuite, passer les mesures en IndexedDB avec des index (client, page), ou tenir un résumé par case (client · SID · version × page × réseau).
  3. Accueil et Capsule : lire le référentiel (`apps`, `pages`) ou un compteur plutôt que toutes les mesures.

  Prévoir une migration au `onInstalled` (comme `migrateV1`).

### O2 — Priorité moyenne · Relevé des pages allshare-scenario.fr : une écriture à chaque changement d'onglet

- **Où :** `background.js:476`.
- **Constat :** tout `tabs.onUpdated` portant une adresse ou un titre, **sur n'importe quel onglet**, déclenche `tabs.query({})` puis une écriture de `craPages` dès qu'une page du domaine est ouverte (`at` change toujours). Chaque écriture déclenche à son tour `syncTickAlarm` (relecture des capsules). Les sites dont le titre change souvent (compteurs de messagerie, de visio) provoquent des écritures en continu toute la journée.
- **Proposition :** ne traiter que les onglets du domaine (ou ceux déjà suivis), n'écrire que si la liste ouverte ou un titre change, et laisser le cumul du temps au relevé de chaque minute.

### O3 — Priorité moyenne · Prisme : fichier analysé deux fois, sur le fil principal, sans limite de taille

- **Où :** `prisme/prisme.js:112` puis `:137` (`setFile` relance `reanalyze()`) ; même logique dans `panel/prisme.js`.
- **Proposition :** réutiliser le premier résultat ; déplacer `analyze()` dans un Web Worker (le module est déjà pur) ; avertir au-delà d'une taille donnée (par exemple 20 Mo), car un gros CSV fige le panneau et finit stocké dans IndexedDB.

### O4 — Exports

- `exportData()` (`lib/export.js:50`) recharge tout le modèle alors que le tableau de bord l'a déjà en mémoire : passer `state.model`.
- Le `.xlsx` est écrit sans compression (`lib/xlsx.js:288`, méthode « stockée »). `CompressionStream('deflate-raw')`, disponible dans Chrome, réduirait les fichiers d'un facteur 5 à 10.
- CSV d'Insight (`lib/report.js:806`) : neutraliser les valeurs qui commencent par `= + - @` (risque que Prisme signale lui-même chez les autres).

### O5 — Code dupliqué à factoriser

- `el()`, `toast()`, `esc()` et `$()` sont redéfinis dans 5 à 7 fichiers : créer un `lib/dom.js`.
- Trois façons de télécharger un fichier (`export.js` libère l'adresse après 30 s, `prisme-files.js` après 2 s, Training en ligne).
- `openDashboard()` (`prisme-files.js`) et `openTraining()` (`training.js`) sont identiques : en faire `openOrFocusTab(base, url)`.
- La liste des états actifs `ACTIVE` est dans `background.js` et dans `home.js` ; l'adresse C.R.A à trois endroits.
- Le seuil d'anomalie est calculé à deux endroits (voir B4).

### O6 — Outillage

- Pas d'intégration continue : ajouter un workflow GitHub Actions (tests unitaires, `prettier --check`, e2e sans interface).
- Versionner `package-lock.json` (B11) et ajouter `npm run format` / `npm run lint` (ESLint avec `no-unused-vars` et `no-undef`).
- Ajouter `// @ts-check` et les JSDoc déjà présents pour faire vérifier les types par l'éditeur, sans changer d'outil de build.
- Ajouter un script qui vérifie que `manifest.json` et `package.json` ont la même version.
- Ajouter des tests unitaires sur les correctifs B1, B2 et B4 : ce sont des fonctions pures, faciles à tester.

### O7 — Permissions

- `host_permissions: <all_urls>` sert à mesurer n'importe quelle application et à lire les titres et adresses des onglets. On pourrait passer à des **permissions facultatives** demandées par origine de client (`chrome.permissions.request` dans Réglages › Clients), avec `<all_urls>` en repli pour les clients sans URL déclarée. C'est plus rassurant pour une diffusion interne.

---

## 3. Évolutions possibles (pistes par module)

**Insight**
- Reconnaître automatiquement la page mesurée d'après l'adresse (apprendre « fin d'URL → page » à partir des mesures passées) : moins de saisie, moins d'erreurs de libellé.
- Comparer deux versions d'un même client et SID : écart page par page et régressions au-delà de x %. Le modèle « ligne = client · SID · version » s'y prête déjà.
- Afficher des tendances : évolution dans le temps d'une page ou d'un client, distribution des durées (boîtes à moustaches).
- Enchaîner une campagne guidée : toutes les pages manquantes d'une ligne, avec reprise après interruption (« Page suivante » existe déjà).

**Capsule**
- Réouverture paresseuse (onglets créés puis mis en veille), groupes d'onglets Chrome (`tabGroups`), mise à jour d'une capsule depuis la fenêtre en cours.

**CRA**
- Récapitulatif de la journée par client (capsules associées à un client + pages allshare-scenario.fr), prêt à copier dans la grille.
- Ne pas compter le temps où le poste est inactif (`chrome.idle`).

**Prisme**
- Bouton « Réparer » : encodage mixte, accents cassés, espaces insécables, espaces en bord de cellule, avec aperçu avant / après.
- Profils d'import par client (colonnes attendues, types, séparateur), pour vérifier un fichier contre son format cible.

**Training**
- Révision espacée des QCM ratés, score d'examen dans l'historique, contenu en fichiers JSON ou Markdown pour l'éditer sans toucher au code.

**Transverse**
- Référentiel partagé par l'équipe (clients, URL, pages), réglages synchronisés (`chrome.storage.sync`), accessibilité clavier des groupes de boutons radio, tests unitaires du service worker (avec des API Chrome simulées).

---

## 4. Propositions d'évolution (priorisées)

| # | Proposition | Valeur | Effort | Contenu |
| --- | --- | --- | --- | --- |
| 1 | **Fiabilité 3.12.x** | Données justes | S (1 à 2 j) | B1, B2, B3, B4, B11 ; tests unitaires associés ; workflow CI |
| 2 | **Insight à l'échelle 200 clients** | Ouvertures < 1 s | M (2 à 3 j) | O1 (détail séparé + migration), O2, accueil et Capsule sans relire les mesures ; scénario e2e à 18 400 mesures |
| 3 | **Récap CRA de la journée** | Gain de temps quotidien | M | Temps par client (capsules + pages du domaine), inactivité exclue, copier / coller vers la grille du C.R.A |
| 4 | **Comparateur de versions Insight** | Détection des régressions | M | Vue « version A / version B » par client · SID, export Excel dédié, seuil de régression dans les Réglages |
| 5 | **Reconnaissance automatique de la page** | Moins de saisie | S à M | Correspondance « fin d'URL → page » apprise des mesures, proposée dans le formulaire et dans « Page suivante » |
| 6 | **Prisme « Réparer »** | Fichiers corrigés en un clic | M | Décodage mixte (B2), corrections automatiques avec aperçu, Web Worker (O3) |
| 7 | **Référentiel d'équipe** | Cohérence entre consultants | M à L | Fichier « équipe » (clients, URL, pages) importable et fusionnable, puis éventuellement synchronisé |

**Ordre conseillé :** 1 → 2 → 3, puis 4 à 7 selon les retours des consultants. Les lots 1 et 2 ne changent pas l'interface et sécurisent les données avant d'ajouter des fonctions.
