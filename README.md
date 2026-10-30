# Salles libres

Application statique. Le navigateur parle à Google Calendar avec le compte du salarié. La liste des salles vient de `public/rooms.json`, produit par un admin Workspace.

## Lancer en local

```bash
npm install
cp .env.example .env
```

Renseigner `VITE_GOOGLE_CLIENT_ID` dans `.env`, puis :

```bash
npm run dev
```

Aperçu de la liste sans compte Google : [http://localhost:5173/?preview=1](http://localhost:5173/?preview=1). Les occupations sont fictives et le bouton Réserver ne crée pas d’événement.

## Client OAuth

1. Dans la Google Cloud Console, ouvrir un projet de l’organisation.
2. Activer **Google Calendar API**.
3. Écran de consentement OAuth : type **Interne**.
4. Créer un identifiant OAuth « Application Web ».
5. Origines JavaScript autorisées : `http://localhost:5173` et l’origine de production.
6. Coller l’ID client dans `.env` :

```bash
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

L’application demande `calendar.freebusy` et `calendar.events`. Aucun secret client n’est utilisé.

## Export des salles

Les salles ressources ne sont listables que par un admin.

1. Ouvrir [script.google.com](https://script.google.com) avec un compte administrateur.
2. Créer un projet et y coller `scripts/export-rooms.gs`.
3. Ajouter le service avancé **Admin SDK API**. L’identifiant doit rester `AdminDirectory`.
4. Exécuter `exportRooms` et autoriser les droits admin.
5. Le journal affiche le JSON. Un fichier `rooms.json` est créé ou mis à jour dans le Drive de l’admin.
6. Télécharger ce fichier et remplacer `public/rooms.json`.
7. Les libellés de `locations` peuvent être corrigés à la main.
8. Reconstruire le site (`npm run build`, dossier `dist`).

Un bâtiment avec un seul étage devient un lieu (`Paris`). Plusieurs étages produisent un lieu par étage (`Nantes 1er étage`, `Nantes 2e étage`). `1` devient « 1er étage », `2` et au-delà « 2e étage », `RDC` ou `0` « rez-de-chaussée ».

Le fichier d’exemple versionné est `public/rooms.example.json`.

## Créneaux et réservation

Le filtre **Jusque** propose quatre quarts d’heure, fuseau `Europe/Paris`. Le premier est le prochain quart d’heure situé au moins 10 minutes après l’heure actuelle. Un horaire pile est conservé.

- 09h55 et 10h05 affichent 10h15, 10h30, 10h45, 11h00.
- 10h06 affiche 10h30, 10h45, 11h00, 11h15.

Une salle **libre** n’a aucun chevauchement jusqu’au créneau. Une salle **bientôt libre** est occupée maintenant, se libère avant le créneau, et rien ne reprend avant. Les autres sont masquées.

**Réserver** crée un événement « Réservé last minute » sur l’agenda du salarié et invite la salle (`sendUpdates=none`). Une salle libre est prise de maintenant jusqu’au créneau. Une salle bientôt libre est prise à partir du moment où elle se libère. Les ressources Workspace doivent accepter automatiquement les invitations quand elles sont libres (réglage par défaut).

## Scripts

```bash
npm test
npm run build
```
