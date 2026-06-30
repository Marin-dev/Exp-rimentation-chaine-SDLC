# SDLC Studio

Plateforme de pilotage human-in-the-loop pour la chaîne de développement multi-agents
(AI Dev Chain). Pensée pour des profils **non techniques** : on suit l'avancement,
on lit les livrables en clair, et on tranche les décisions qui nous concernent.

Reconstruction de l'ancien `control-center/` (voir la mémoire projet pour les décisions).

## Démarrer

```bash
cd platform
npm install
npm run build      # construit le frontend dans dist/
npm start          # backend + frontend sur http://127.0.0.1:4174
```

### Mode développement (rechargement à chaud du front)

```bash
npm run dev:server   # backend Node sur :4174 (--watch)
npm run dev:web      # Vite sur :5174, proxy /api -> :4174
```

Vérification rapide sans serveur :

```bash
npm run check        # lit le workspace et résume l'état
```

## Architecture (M1 + M2 livrés)

```text
platform/
├── server.js                      # entrée backend
├── vite.config.js                 # build front + proxy /api en dev
├── src/
│   ├── server/
│   │   ├── app.js                 # serveur HTTP (API + statique)
│   │   ├── config/                # paths + store config (.state/config.json)
│   │   ├── domain/                # phases G0-G7 + profils (sources de vérité)
│   │   ├── services/              # lecture filesystem -> état structuré
│   │   └── routes/api.js          # endpoints REST
│   └── web/                       # app React (Vite)
│       ├── components/            # Layout, ProfileSwitcher, MarkdownView, ui
│       └── screens/               # Accueil, Avancement, Documents, Réglages
└── dist/                          # build front (généré)
```

### Choix de conception

- **État structuré** : `buildProjectState` produit l'état fiable de l'app à partir des
  gates et livrables. À terme (M5), les agents écriront un `project-state.json`
  machine-owned pour les décisions plutôt que de déduire par regex.
- **Couture stockage** : tout passe par `createWorkspacePaths`, point unique pour
  brancher un stockage cloud plus tard.
- **Couture identité** : les profils (`domain/profiles.js`) et le switch de profil
  local préfigurent les comptes/rôles multi-utilisateurs.

## Jalons

- [x] **M1** Fondations : backend propre, modèle d'état, sélection workspace.
- [x] **M2** Lecture : pipeline de supervision + documents rendus lisibles.
- [ ] **M3** Boîte de décisions par profil.
- [ ] **M4** Exécution Claude avec progression live + intake/G0.
- [ ] **M5** Contrat de sortie structuré des agents.
- [ ] **M6** Finition + coutures multi-user/cloud.
