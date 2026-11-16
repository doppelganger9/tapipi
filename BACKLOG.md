# Backlog Tapis

Lots ordonnés : chacun se termine par quelque chose de jouable et vérifiable. « Majeur » = change ce
que le produit permet ; « mineur » = finition d'un lot. Avant chaque lot : `npm test` et le parcours
à deux navigateurs (créer une table, rejoindre par lien, piocher, jouer, changer de jeu).

État actuel : table générique, 5 jeux fournis, éditeur de cartes et de scripts, accueil par
invitation et tutoriel, composants de toutes tailles (plateau fixé), sélection au lasso, paquets
empilables et mélangeables, distribution paramétrable, scripts par phase, déballage de la boîte,
serveur Node en mémoire, Dockerfile.

## Lot 1 — Jouable entre amis, pour de vrai (majeur)

Objectif : une soirée complète à 3-5 joueurs, dont certains sur téléphone, sans accroc.

- **Majeur — Mise en ligne.** Déployer le Dockerfile (un seul processus, un seul port, WebSocket).
  Vérifier wss derrière le proxy de l'hébergeur et que l'instance ne s'endort pas en cours de partie.
- **Majeur — Disposition téléphone.** Aujourd'hui utilisable mais inconfortable : la main est sous
  le pli, le journal prend trop de place. Cible : main fixée en bas, zones communes au centre,
  adversaires réduits à une ligne, panneau latéral en tiroir. Fichiers : `public/style.css`,
  `public/js/table.js`.
- **Majeur — Arrivée en cours de partie.** Un retardataire s'assoit sans cartes. Ajouter au format
  une étape `onJoin` (ex. distribuer 5 cartes) exécutée pour le nouveau siège ; `server/room.js`
  (`join`) et `shared/engine.js` (`runSteps` limité à un siège).
- Mineur — Lasso au doigt (aujourd'hui souris uniquement, pour ne pas gêner le défilement) : appui
  long puis glisser.
- Mineur — Tutoriel : ajouter une leçon « lasso et paquets ».
- Mineur — Appui long sur mobile = sélection ; aperçu de la carte en plein écran au toucher.
- Mineur — Annuler la dernière action (pile d'instantanés de l'état dans `Room`, 20 niveaux).
- Mineur — Jouer « Chaudrons & Chardons » à 2, 3 et 5 et ajuster les règles (jamais testées).
- Mineur — Persistance minimale : sérialiser les tables sur disque à l'arrêt pour survivre à un
  redéploiement.

## Lot 2 — Plateaux et tuiles (majeur)

Objectif : jouer confortablement à un jeu de tuiles ou de pions sur plateau.

- **Majeur — Zoom et déplacement de la table.** Mise à l'échelle automatique pour que tout tienne,
  puis molette / pincement. Aujourd'hui un grand plateau repousse les autres zones hors écran.
- **Majeur — Grille aimantée.** `grid: { cols, rows }` ou `snap: taille` sur une zone libre ;
  les pièces s'alignent au dépôt. Validation dans `definition.js`, aimantation dans `place()`.
- **Majeur — Rotation par pas** (90° pour les tuiles, 60° pour les hexagones) en remplacement du
  seul « incliner ». Forme `hex` dans `cards.js`.
- Mineur — Verrouiller / déverrouiller une pièce en cours de partie (aujourd'hui `fixed` est figé
  dans le fichier).
- Mineur — Piles de pions : compteur de hauteur, prendre « la pile entière » ou « le dessus ».
- Mineur — Dés comme composants (faces dans le fichier, lancer = face aléatoire visible de tous).
- Mineur — Sac opaque : zone dont on tire au hasard (tuiles, jetons).
- Mineur — Recto et verso distincts pour une même pièce.

## Lot 2 bis — Scripts et phases (majeur)

Fait : scripts paramétrés (`params`), par phase (`group`), pour tous ou pour soi (`scope`),
automatiques en début de tour (`on: turnStart`), donne par paquets (`by`), éditables dans l'éditeur.

- **Majeur — Phases explicites.** Une liste `phases` dans le fichier (mise en place, tour, fin de
  manche), la phase courante affichée, un bouton « phase suivante » et les scripts liés à l'entrée
  dans chaque phase. Aujourd'hui `group` n'est qu'un rangement de boutons.
- **Majeur — Cibles et conditions.** « Chaque joueur sauf moi », « mon voisin de gauche »,
  « jusqu'à avoir N cartes en main », « si la pioche est vide, recycler la défausse ».
- Mineur — Scripts sur les compteurs (+N à moi, à tous) et sur une sélection de cartes.
- Mineur — Donneur tournant : la donne commence après le donneur, qui change à chaque manche.
- Mineur — Plusieurs paramètres dans l'éditeur (le format en accepte 3, l'éditeur un seul).
- Mineur — Tester un script depuis l'éditeur sur une table d'essai.

## Lot 3 — Éditeur complet (majeur)

Objectif : créer un jeu entier sans toucher au JSON.

- **Majeur — Éditeur de zones** : ajouter, nommer, choisir visibilité et disposition, avec aperçu
  de la table.
- Mineur — Import de cartes depuis un tableur (CSV : une ligne par carte).
- Mineur — Plusieurs paquets, dos de cartes, image de plateau.
- Mineur — Export pour impression (planche PDF) : le pont vers le prototypage physique.
- Mineur — « Tester seul » : ouvrir une table avec des joueurs fictifs.

## Lot 4 — Comptes et sauvegarde (majeur, première brique payante)

Objectif : retrouver ses jeux et ses tables d'un appareil à l'autre.

- **Majeur — Comptes facultatifs** (lien magique par courriel ; jouer reste sans compte).
- **Majeur — Bibliothèque personnelle dans le cloud** : jeux créés, images hébergées. Remplace le
  `localStorage` de `public/js/editor.js`. Stockage objet + base légère.
- **Majeur — Tables persistantes** : reprendre une partie le lendemain (état du moteur sérialisé,
  déjà un simple objet JSON).
- Mineur — Abonnement (quota gratuit, puis payant) et page de tarifs.
- Mineur — Groupes privés : partager un jeu avec ses amis par lien.
- À cadrer avant de coder : statut d'hébergeur, conditions d'utilisation, procédure de
  signalement et de retrait, RGPD (avis juridique nécessaire).

## Lot 5 — Communauté (majeur)

- **Majeur — Catalogue public** de jeux originaux, avec licence déclarée et signalement.
- Mineur — Fiches de jeu, notes, « jeux du moment », pages de créateurs.
- Mineur — Tables publiques ouvertes pour trouver des joueurs.
- Mineur — Modération : file de signalements, retrait, blocage.

## Lot 6 — Vie autour de la table (mineur, à piocher entre deux lots)

- Déballage : sons (cellophane, carton), détourage pièce par pièce au clic, couvercle en 3D,
  « remballer la boîte » en fin de soirée, paquets de cartes aléatoires à ouvrir (boosters) pour
  les jeux à collectionner originaux.
- Sons (carte posée, mélange, dé) avec réglage muet.
- Physique légère : inertie au lâcher, dés qui roulent et peuvent sortir de la table.
- Curseurs des autres joueurs visibles en direct ; pointer une carte.
- Réactions rapides (émojis), plus d'objets à lancer, renverser d'autres boissons.
- Thèmes de table (bois, feutrine, image personnelle), sièges autour d'une table ronde.
- Minuteur de tour, historique rejouable d'une partie (le moteur est déterministe).

## Lot 7 — Règles automatiques (majeur, optionnel)

- **Majeur — Validateurs par jeu** : module optionnel branché avant `applyAction` (tour imposé,
  coups légaux, score automatique). Commencer par la belote ou un jeu original.
- Mineur — Bots simples pour compléter une table.

## Dette et qualité (en continu)

- Tests du serveur (`Room` : sièges, reconnexion, hôte, changement de jeu) et test navigateur
  automatisé dans le dépôt (le parcours actuel a été vérifié à la main par script jetable).
- Envoi de différences d'état plutôt que de la vue complète au-delà de ~500 cartes.
- Limites par IP (création de tables), journalisation, supervision.
- Accessibilité : jouer au clavier (le glisser-déposer n'a pas d'équivalent clavier complet).
- Traductions (toute l'interface est en français, textes en dur).
