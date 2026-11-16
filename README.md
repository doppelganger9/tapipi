# Tapipi

[![Déployer sur Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/doppelganger9/tapipi)

Une table de jeu multijoueur en ligne qui ne connaît aucun jeu : elle simule une table
(cartes, tuiles, pions, zones, compteurs, dés) et charge un **fichier de jeu** qui décrit le
matériel. Les règles sont appliquées par les joueurs, comme autour d'une vraie table.

```bash
npm install
npm start        # http://localhost:3000
npm test
```

Ouvrez une table, envoyez le lien : les autres s'assoient sans compte. `/editor.html` permet de
créer ses cartes et de jouer aussitôt avec. La suite du développement est dans `BACKLOG.md`.

## Où tourne le serveur ?

Tapipi est **un seul processus Node, sans base de données** : les tables vivent en mémoire et
disparaissent 30 minutes après le départ du dernier joueur (ou au redémarrage). Pour jouer avec
des amis, ce processus doit être joignable depuis Internet :

- **Hébergeur de conteneurs** (Fly.io, Render, Railway, un VPS…) : le `Dockerfile` fourni suffit.
  Il faut le support des WebSockets et une seule instance (les tables ne sont pas partagées entre
  instances).
- **Depuis votre ordinateur, le temps d'une soirée** : `npm start`, puis un tunnel
  (`cloudflared tunnel --url http://localhost:3000`, ou ngrok) qui vous donne une adresse publique.

```bash
docker build -t tapis . && docker run -p 3000:3000 tapis
```

## Architecture

```
shared/            Logique pure, importée telle quelle par le serveur ET le navigateur
  definition.js    Validation / normalisation d'un fichier de jeu (entrée non fiable)
  engine.js        État de la table + actions (move, take, shuffle, peek, macro…)
  view.js          Projection de l'état pour un joueur : l'information cachée ne sort jamais
  zones.js, rng.js Adressage des zones, hasard déterministe (graine)
server/
  room.js          Une table : sièges, hôte, reconnexion, journal, discussion
  index.js         HTTP statique + WebSocket ; ne contient aucune règle
public/            Client sans étape de build (modules ES)
  js/table.js      Rendu + gestes (glisser-déposer, sélection, menus)
  js/cards.js      Dessin d'une carte à partir des données du fichier
  js/onboarding.js Surnoms et tutoriel interactif
  js/unboxing.js   Boîte scellée, paquets à déchirer, planches à détourer
  js/editor.js     Éditeur de jeu, validation en direct avec shared/definition.js
games/             Jeux fournis (domaine public ou originaux)
```

Principes :

- **Serveur autoritaire.** Le client envoie des intentions (`{type:'take', from, to, count}`),
  le moteur les valide et chaque joueur reçoit *sa* vue. Une carte que vous ne devez pas voir
  n'est jamais envoyée à votre navigateur.
- **Un mélange est un vrai mélange** : les cartes changent d'identifiant, impossible de les suivre.
- **Le tapis d'abord** : lasso ou Ctrl-clic pour sélectionner, poser une carte sur une autre pour
  empiler, pastille du paquet pour le déplacer ou le mélanger entier.
- **Tout est annoncé** dans le journal (y compris « regarde une carte en secret »), sans jamais
  nommer une carte restée cachée. C'est ce qui remplace l'arbitre.
- **Moteur sans E/S** et déterministe : testable, rejouable, déplaçable (worker, autre transport).

Points d'extension : une nouvelle mécanique = un handler dans `engine.js` ; une nouvelle
opération de mise en place = un `case` dans `runSteps` + sa validation dans `definition.js` ;
des règles automatiques pour un jeu donné viendraient se brancher comme validateur avant
`applyAction`. Comptes, sauvegarde cloud et bibliothèque communautaire sont un service à part,
à brancher là où l'éditeur écrit aujourd'hui dans `localStorage` et où `Room` vit en mémoire.

## Le fichier de jeu (`tapis/1`)

`games/01-chaudrons-et-chardons.json` est un exemple complet. En résumé :

```jsonc
{
  "format": "tapis/1", "id": "mon-jeu", "name": "Mon jeu",
  "players": { "min": 2, "max": 4 },
  "rules": "Texte libre affiché dans « Règles ».",
  "table": { "color": "#22384f" },                      // tapis par défaut (image possible)
  "decks": {
    "cartes": {
      "back": { "color": "#3b2a5c", "label": "✦" },
      "preset": "standard52", "jokers": 2,              // optionnel : jeu traditionnel (ou standard32)
      "cards": [
        { "name": "Renard", "type": "Créature", "cost": "2", "art": ":oiseau", "stats": "3/1",
          "text": "Effet de la carte.", "color": "#b8322a", "count": 3 },
        { "name": "Pion", "shape": "round", "size": 0.5, "color": "#14808a", "count": 8 },
        { "name": "Tuile", "shape": "square", "image": "data:image/jpeg;base64,…" }
      ]
    }
  },
  "zones": [
    { "id": "pioche", "name": "Pioche", "visibility": "hidden", "layout": "stack" },
    { "id": "plateau", "name": "Plateau", "layout": "free", "image": "https://…" },
    { "id": "main", "name": "Main", "owner": "player", "visibility": "owner", "layout": "row" }
  ],
  "counters": [{ "id": "points", "name": "Points", "scope": "player", "initial": 0 }],
  "setup": [
    { "op": "spawn", "deck": "cartes", "to": "pioche" },
    { "op": "shuffle", "zone": "pioche" },
    { "op": "deal", "from": "pioche", "to": "main", "count": 5 }
  ],
  "macros": [{ "id": "recycler", "name": "Recycler la défausse", "steps": [ /* mêmes opérations */ ] }],
  "ui": { "hand": "main", "draw": "pioche", "play": "plateau" }
}
```

- `owner: "player"` crée une zone par joueur. `visibility` : `public` (face visible), `hidden`
  (face cachée pour tous), `owner` (visible de son seul propriétaire).
- `layout` : `stack` (pile), `row` (rangée ordonnée), `free` (placement libre, empilable — avec
  une `image`, c'est un plateau).
- Composants : `shape` (`card`, `square`, `round`), `size` (largeur ; 1 = une carte, jusqu'à 12),
  `ratio` (hauteur / largeur), `fixed` (vissé à la table : un plateau). Voir `games/05-bac-a-sable.json`.
- `quickstart` : jusqu'à 6 lignes « comment jouer », montrées à chaque joueur qui s'assoit.
- Opérations : `spawn`, `shuffle`, `deal`/`move` (`count`, `"all"` ou `"$n"` ; `by` = cartes données
  à la fois, pour une donne « 3 puis 2 »), `gather`, `flip`, `setCounter`.
  Un `spawn` vers une zone de joueur donne un exemplaire du paquet à chacun.
- Scripts (`macros`) : `group` range le bouton dans une phase (« Mise en place », « À mon tour »),
  `scope: "me"` l'applique au seul joueur qui clique, `on: "turnStart"` le lance aussi au début de
  chaque tour, `params` demande un nombre au joueur (`{ "id": "n", "name": "Combien ?", "min": 1,
  "max": 10, "default": 1 }`). L'onglet « Scripts et mise en place » de l'éditeur les construit.
- `unboxing: false` supprime la boîte scellée à déballer avant la première partie ; `name` sur un
  paquet est le nom affiché sur son emballage.

## Contenus et droits

Tapipi ne distribue que des jeux traditionnels (domaine public) et des jeux originaux, dessinés
à partir de texte et d'emoji. Les fichiers chargés par les joueurs ne sont ni stockés ni
publiés : ils vivent en mémoire le temps de la table. Code sous licence MIT ; « Chaudrons &
Chardons » sous CC BY 4.0.

## Tricher, et faire vivre le jeu

- **Lorgner** : le bouton « Lorgner » sur la main d'un autre joueur montre une carte de plus à chaque essai, à vous seul — ou vous fait prendre devant toute la table (25 % au premier essai, +15 % par carte déjà vue). `"cheating": false` dans le fichier de jeu l'interdit.
- **Marquer** : une carte face visible peut recevoir un mot, un gribouillis, une déchirure, des autocollants (menu « Marquer… » de la sélection). La marque appartient à la carte : elle revient aux parties suivantes.
- **Ajouter une carte** : « Ajouter une carte… » écrit une nouvelle carte (texte et émoji) qui rejoint le paquet pour de bon.
- **Sauvegarder la boîte** : télécharge le jeu tel qu'il est devenu, au format `tapis/1` ; on le rouvre avec « Charger un fichier de jeu ». Rien n'est stocké sur le serveur.

## Pictogrammes

Tapipi n'utilise aucun emoji. Le champ `art` d'une carte accepte un mot court, un chiffre, ou le nom d'un pictogramme maison précédé de deux-points : `":flamme"`, `":crane"`, `":de"`… La liste complète est dans `public/js/glyphs.js` ; l'éditeur et la boîte « Ajouter une carte » la proposent à la saisie.

Les polices (Anton, Archivo, JetBrains Mono, licence OFL) sont servies depuis `public/fonts/` : aucun appel à un service tiers.

## Le catalogue

`node tools/make-catalogue.js` génère les jeux `games/c-*.json` : cartes traditionnelles, plateaux et pions, créations Tapipi. Règle de la maison pour y ajouter un jeu :

- uniquement des jeux traditionnels du domaine public, sous leur nom courant, ou des créations originales ;
- jamais la copie d'un jeu édité, même renommé ou redessiné : ni sa liste de cartes, ni ses textes, ni un nom qui l'évoque ;
- le matériel est dessiné par Tapipi ; aucune règle n'est fournie pour les jeux traditionnels.
