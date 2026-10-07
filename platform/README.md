# SDLC Studio — Application (`platform/`)

> **Lis ce fichier en entier avant d'ajouter une fonctionnalité.** Il donne le
> modèle mental, les invariants et les points de couture. Le cadre agents/règles
> (`.claude/agents`, `.claude/rules`, `CLAUDE.md`) et le profil projet (`project/`)
> sont documentés ailleurs — ici on parle **de l'applicatif** qui pilote la chaîne.

---

## 1. Ce que c'est

**SDLC Studio** est une plateforme locale, **human-in-the-loop**, qui orchestre une
chaîne de développement multi-agents IA (les agents = des profils métier :
sponsor, UX, architectes, PO, dev, QA, DevOps, reviewers, judges) le long de 8
gates **G0 → G7**.

Paradigme central :

> L'IA produit le travail et, quand elle est bloquée ou qu'un choix est
> structurant, elle **écrit des questions / décisions** dans un fichier de contrat.
> La plateforme les **route** vers le bon profil humain. L'humain **répond** (saisie,
> document, ou « fais au mieux » délégué). La plateforme **relance** l'agent qui
> **reprend** avec les réponses. Tout se pilote **aux boutons**, sans terminal.

Cible : un utilisateur **non technique** dépose un besoin, suit l'avancement et
tranche ce qui le concerne. C'est la reconstruction de l'ancien `control-center/`.

---

## 2. Stack & exécution

- **Backend** : Node ≥ 20, module `http` natif **sans framework** (`src/server/`).
  ESM (`"type": "module"`). Bind sur `http://127.0.0.1:4174` (`PORT` env override).
- **Frontend** : React 18 + Vite 6 + Tailwind 3.4 + DaisyUI 4 (thème custom `ey`),
  `lucide-react` (icônes — **pas d'emoji dans l'UI**), `marked` (markdown). SPA buildée
  dans `dist/`, servie par le backend (fallback SPA).
- **Agents** : lancés via le CLI `claude` en mode print, sortie `stream-json`.

### Commandes (depuis `platform/`)

| But | Commande |
|---|---|
| Prod (build + serveur unique) | `npm run build` puis `npm start` |
| Dev backend (watch) | `npm run dev:server` |
| Dev frontend (HMR Vite) | `npm run dev:web` |
| Vérifier que le workspace se lit | `npm run check` |

En dev, lancer les deux (`dev:server` + `dev:web`) ; en prod, `build` puis `start`
sert tout depuis un seul port.

> **Redémarrage serveur** (Windows) : arrêter **par PID** le process qui écoute sur 4174
> (`Get-NetTCPConnection -LocalPort 4174` → `Stop-Process -Id <pid>`), puis `npm start`.
> **Jamais** `taskkill /IM node.exe` : ça tue aussi les runs d'agents en cours et les autres apps Node.

---

## 3. Arborescence

```
platform/
├── server.js                     # entrée : PORT, --check, listen 127.0.0.1:4174
├── src/
│   ├── server/
│   │   ├── app.js                # http.createServer : API + statique dist (SPA fallback)
│   │   ├── config/
│   │   │   ├── paths.js          # createWorkspacePaths(root) — SEULE source des chemins disque
│   │   │   └── store.js          # config.json (.state/) : workspaceRoot, claude*, app, policies, pricing
│   │   ├── domain/               # connaissance métier PURE (pas d'I/O)
│   │   │   ├── phases.js         # PHASES G0..G7, PRODUCERS, REVIEWERS, PHASE_PARALLEL, PHASE_BY_ID
│   │   │   ├── profiles.js       # PROFILES (10 profils humains) + mapping vers agents
│   │   │   ├── doc-types.js      # typologies de livrables par phase + classifyDoc(path)
│   │   │   └── instructions.js   # consignes-types affichées par phase
│   │   ├── services/             # logique + I/O (voir §7)
│   │   └── routes/api.js         # routeur unique : if (pathname===...) { ... } (voir §6)
│   └── web/
│       ├── App.jsx               # nav par état (screen), modales, run actif, bandeau reprise
│       ├── api.js                # client Api.* (un fetch par endpoint)
│       ├── components/           # Layout (nav), ui.jsx (primitives), modales, consoles run…
│       └── screens/              # un écran par entrée de nav (voir §8)
└── dist/                         # build Vite (généré)
```

---

## 4. Modèle mental (concepts clés)

- **Phase / Gate (G0–G7)** : source unique = `domain/phases.js`. Chaque phase a un
  **producteur**, un **reviewer** (qui décide la gate), des **folders** de livrables,
  des **ownerProfiles** (routage humain). Les gates sont lues depuis
  `livrables/_governance/gates/G*.md` (champ `**Status**: PASS/FAIL/PASS_WITH_RISK`).
- **Profil humain** : `domain/profiles.js`. L'utilisateur « switche » de profil dans
  le header (couture pour de vrais comptes multi-users plus tard). Chaque profil
  `agents: [...]` relie le profil aux agents IA par lesquels il « parle ».
- **project-state** : `services/project-state.js` **assemble tout l'état** lu par le
  front (`GET /api/state`) : config, phases (avec gateStatus, docTypes, docCount,
  producers/reviewer, inputs), deliverables, agents/skills/mcp, decisions enrichies,
  feedback, summary. **C'est l'agrégateur central côté lecture.**
- **Contrat d'I/O agent** (human-in-the-loop) : fichiers JSON sous
  `livrables/_governance/agent-io/` — `pending-input.json` (questions/décisions émises
  par l'IA), `answers.json` (réponses humaines), `resolutions.json` (choix délégués
  faits par l'IA), `feedback.json`, `uploads/`.
- **Run** : une exécution d'agent (`services/runs.js`). Lance `claude -p
  --permission-mode <config.permissionMode, défaut bypassPermissions> --output-format stream-json --verbose`, parse le flux
  en progression lisible (SSE), capture coût/tokens depuis l'event `result`, et
  **persiste un enregistrement** dans `spend.json` + un **log** `runs/<id>.log`.
- **Decision inbox** : `services/decisions-store.js`. Les items émis par l'IA sont
  ingérés (`inbox-ingest.js`), routés à un profil, répondus par l'humain, et une
  réponse complète débloque une **reprise** (`resume`).
- **Coûts / Activité** : `spend.json` est le journal persistant de chaque run.
  `spend-store.js` l'agrège (BI par phase/agent/kind/jour). `activity.js` en dérive le
  **journal d'activité** (qui a fait quoi, fichiers produits, décisions soulevées).

---

## 5. Invariants & pièges (À NE PAS CASSER)

1. **`.claude/` est protégé en écriture** pour le `claude` headless (même en
   acceptEdits). ⇒ Tout ce que l'IA doit écrire vit **hors** `.claude/` :
   - le contrat d'I/O est sous `livrables/_governance/agent-io/` ;
   - **le profil projet est sous `project/`** (pas `.claude/project/`).
   Ne jamais faire écrire un agent dans `.claude/`.
2. **`paths.js` est la seule source des chemins disque.** Tout nouveau fichier/dossier
   passe par `createWorkspacePaths()` — pour que le stockage soit abstractible (cloud)
   plus tard. Ne pas hardcoder de chemins ailleurs.
3. **`config/store.js` (`.state/config.json`) = état applicatif** (workspaceRoot,
   pricing, app, policies). À distinguer du **workspace** (le projet piloté, ailleurs
   sur le disque).
4. **Le `claude` CLI ne stream qu'en `stream-json --verbose`** ; en print simple il
   ne sort qu'à la fin (console figée). Garder le parsing ligne-à-ligne.
5. **`classifyDoc` matche sur le sous-chemin APRÈS le dossier de tête** (« subtail »)
   pour éviter les faux positifs (ex. `01-vision/` matchant `/vision/`). Étendre les
   typologies dans `domain/doc-types.js`, pas ailleurs.
6. **Le coût vient de l'event `result`** (`total_cost_usd`) ; s'il est absent
   (abonnement), il est **estimé** via `pricing` (bannière « estimé » côté UI).
7. **Reviewers & judges ne corrigent pas le code** : ils évaluent (règle du cadre).
8. **Chaque run porte un `kind`** (`g0`/`phase`/`parallel`/`review`/`chat`/`resume`/
   `new-need`) : utilisé partout (spend, activité, prompts). Le préciser à `startRun`.
9. **Ne pas dupliquer** ports / commandes de démarrage hors
   `livrables/00-contexte/infrastructure-locale.md`.
10. **Icônes lucide, pas d'emoji** dans l'UI ; réutiliser les primitives de `ui.jsx`
    et le thème EY (jaune `#FFE600`, noir `#2E2E38`).

---

## 6. Ajouter un endpoint backend

Tout passe par `src/server/routes/api.js`, fonction `handleApi(req, res, url)` :
une suite de `if (pathname === "/api/x" && req.method === "GET/POST") { … return true; }`.

Pattern :

```js
if (pathname === "/api/mon-truc" && req.method === "GET") {
  const config = loadConfig();
  // const paths = createWorkspacePaths(config.workspaceRoot);  // si accès disque
  sendJson(res, 200, { ok: true, ...monService(config) });
  return true;
}
```

- POST : `const body = await readBody(req);` (JSON, tolérant).
- Réponse : `sendJson(res, status, payload)`.
- Mettre la **logique dans un `service/`**, pas dans la route.
- Ajouter la méthode correspondante dans `src/web/api.js` (`Api.monTruc = () => request("/api/mon-truc")`).

**Exemple récent de bout en bout — l'onglet Activité :**
`services/activity.js` → route `GET /api/activity` → `Api.getActivity()` →
`screens/ActivityScreen.jsx` → entrée nav dans `components/Layout.jsx` + branchement `App.jsx`.

---

## 7. Services backend (carte)

| Fichier | Rôle |
|---|---|
| `project-state.js` | **Agrégateur de lecture** : construit tout l'état pour `/api/state`. |
| `runs.js` | Moteur d'exécution d'un agent (spawn claude, SSE, capture coût, persist spend + log). |
| `group-runner.js` | Exécution **parallèle** intra-phase (Option A) : plusieurs agents d'un stage en simultané, scindés par folders. |
| `run-prompts.js` | Fabrique des prompts (G0, phase, tâche agent, review, chat, resume, nouveau besoin) + bloc contrat + politique librairies. |
| `decisions-store.js` | CRUD décisions/questions : create, createItems (ingest bulk), answer, answer bulk (délégué), reopen, applyResolutions, readRunAnswers. |
| `inbox-ingest.js` | Ingestion de `pending-input.json` / `resolutions.json` dans l'inbox routée. |
| `inputs-store.js` | Documents d'entrée **par phase** (`livrables/_inputs/<phase>/`) + statut pris/pas-pris en compte. |
| `feedback-store.js` | Feedback sur livrables (état + miroir dans agent-io). |
| `spend-store.js` | Append + agrégation BI des coûts/tokens (`spend.json`). Coût effectif = reporté sinon estimé via pricing. |
| `activity.js` | Journal d'activité : timeline enrichie (desc, fichiers produits parsés du log, décisions), rollups par agent & par phase. |
| `gates.js` | Lecture/parse des fichiers de gate. |
| `deliverables.js` / `deliverable-content.js` | Liste des livrables / lecture d'un contenu. |
| `agents.js` / `resources.js` | Liste agents `.claude/agents`, skills, MCP. |
| `skill-discovery.js` | Recherche d'un skill existant en ligne avant d'en créer un. |
| `project.js` / `project-scaffold.js` | Lecture `PROJECT.md` / scaffolding d'un nouveau projet. |
| `intake.js` | Scan d'un dossier d'intake (G0). |
| `uploads.js` | Sauvegarde d'un fichier uploadé (base64 → disque). |
| `app-runner.js` | Lance/arrête le **produit développé** (back/front) en local. |
| `git-service.js` / `github-publish.js` | Actions git (argv, sans shell) / publication GitHub (gh ou token éphémère). |
| `folder-picker.js` | Ouvre l'explorateur Windows (WinForms via PowerShell) pour autocompléter un chemin. |
| `claude-runner.js` | Wrapper bas niveau d'appel au CLI claude. |
| `fs-utils.js` | `readTextSafe`, `statSafe`, etc. |
| `orchestrator-snapshot.js` | Snapshot d'état partagé par le chat orchestrateur et l'autopilote (objectif courant = 1er gate non passé, gates en échec, risques, travail ouvert). |
| `orchestrator-actions.js` | Exécute une action proposée par l'orchestrateur, via la même mécanique run/groupe que les boutons (fichiers agent-io par run). |
| `autopilot.js` | « Gestion automatique » : boucle à tick, délégation aux experts, garde-fous coût/itérations, modes autopilote et copilote, reprise au boot. |
| `resolve-via-agent.js` | Résout un item routé en lançant l'agent du profil cible (délégation ou validation), puis reprend le run émetteur. |
| `audit-decisions.js` | Contrôle de cohérence des décisions déjà répondues ; rouvre celles incohérentes ou non documentées. |
| `risks-store.js` / `tasks-store.js` | Registres risques et tâches (`project-state.json` + miroir lisible sous `_governance/`). Tâche `proposed` = candidate non actionnable. |
| `coordination.js` | Convergence : un gate en PASS propre clôt les tâches encore ouvertes de sa phase. |
| `dev-batches.js` | G5 en vagues : US prêtes groupées par Bounded Context, lanes `@developpeur` parallèles. |

---

## 8. Frontend (carte)

- **`App.jsx`** : navigation par état (`screen`), profil courant (localStorage), run/groupe
  actif, bandeau de reprise, modales décision/création. Chaque écran = un
  `screen === "x" ? <XScreen/> : null`.
- **`components/Layout.jsx`** : sidebar EY (nav groupée Pilotage / Projet / Système),
  badge de décisions en attente, `ProfileSwitcher`, header + crumb workspace.
- **`components/ui.jsx`** : primitives — `GateBadge`, `Chip`, `Card`, `Stat`, `EmptyState`,
  `Avatar`, `SectionTitle`, `ProgressBar`. **Réutiliser ces primitives** pour rester cohérent.

| Écran | Rôle |
|---|---|
| `DashboardScreen` | Accueil : hero vision, `ProcessMap`, stats, inbox. |
| `DecisionsScreen` | Inbox des décisions (filtres, bulk, délégation). |
| `PipelineScreen` | Liste G0–G7 (ouvre une phase). |
| `ActivityScreen` | **Journal d'activité** : Chronologie (agents + ce qu'ils ont fait) & Par étape/gate. |
| `CostScreen` | BI coûts/tokens (barres + 2 donuts + éditeur de tarifs). |
| `LaunchScreen` | G0 (intake) + soumission d'un **nouveau besoin métier**. |
| `PhaseScreen` | Une étape : statut, inputs, à-traiter (bulk), livrables (onglets), revue, chat/consignes, console(s) run, prochaines actions. |
| `DocumentsScreen` | Livrables par phase → par type, viewer plein écran + feedback. |
| `LaunchAppScreen` | Lancer le produit développé (back/front) en local. |
| `GitScreen` | init/commit/push/pull/remote/branches/historique + publication GitHub. |
| `SettingsScreen` | Workspace, nouveau projet, politique librairies, autopilote, agents/skills/MCP. |
| `OrchestratorScreen` | Chat avec l'orchestrateur (actions à confirmer) + panneau autopilote/copilote et escalades. |
| `TasksScreen` | Registre des tâches par profil (candidates, à faire, en cours). |
| `RisksScreen` | Registre des risques. |

Composants notables : `RunConsole` (SSE d'un run), `ParallelRunView` (groupe parallèle),
`RunNextSteps` (actions post-run par phase), `DecisionDetailModal` (réponse/options/
délégation/upload), `DocViewerModal`, `PhaseInputs`, `FolderInput` (chemin + « Parcourir »),
`DonutChart`, `ProcessMap`.

### Ajouter un écran

1. Créer `screens/MonEcran.jsx` (réutiliser `ui.jsx`).
2. `App.jsx` : import + `TITLES.mon = "..."` + `screen === "mon" ? <MonEcran .../> : null`.
3. `components/Layout.jsx` : entrée dans `NAV` (id + label + icône lucide).
4. Données via un endpoint dédié (voir §6) ou depuis `state` déjà chargé.

---

## 9. Cycle human-in-the-loop (flux runtime)

```
G0 / phase / review lancé  ─▶  runs.js spawn claude (stream-json)
   agent écrit livrables + pending-input.json (questions/décisions)
        │  (SSE live vers RunConsole)
        ▼
run terminé ─▶ onDone ─▶ inbox-ingest ─▶ decisions-store (items routés au profil)
        ▼
humain répond dans DecisionDetailModal ─▶ answers.json (+ ADR si besoin)
        │  quand un run est "fully answered"
        ▼
bandeau « Relancer l'IA » ─▶ POST /api/runs/resume ─▶ claude reprend avec les réponses
```

Chaque run persiste : `spend.json` (coût/tokens/kind/phase/agent) et `runs/<id>.log`
(progression) — c'est **ce que lisent les écrans Coûts et Activité**.

---

## 10. Où poser quoi (mémo)

- Nouveau **savoir métier** (phase, profil, typologie, consigne) → `src/server/domain/*`.
- Nouveau **traitement / I/O** → `src/server/services/*` (un fichier par responsabilité).
- Nouveau **chemin disque** → `config/paths.js` uniquement.
- Nouveau **réglage applicatif** → `config/store.js` (schéma config).
- Nouvel **endpoint** → `routes/api.js` + `web/api.js`.
- Nouvel **écran / vue** → `web/screens/*` + `Layout.jsx` + `App.jsx`.
- Nouveau **visuel réutilisable** → `web/components/*` (et primitives dans `ui.jsx`).

---

## 11. Après avoir modifié agents / permissions / tools / MCP / hooks

Déclencher une revue **@agent-security-guard** (règle du cadre). L'applicatif ne doit pas
élargir la surface de tools d'un agent sans cette revue.

---

## 12. État des jalons

- [x] **M1** Fondations : backend propre, modèle d'état, sélection workspace.
- [x] **M2** Lecture : pipeline de supervision + documents lisibles.
- [x] **M3** Boîte de décisions par profil (routage, bulk, délégation).
- [x] **M4** Exécution Claude live (SSE) + intake/G0 + reprise.
- [x] Extensions livrées : coûts/BI, inputs par phase, exécution parallèle, publication
      GitHub, scaffolding nouveau projet, sélecteur de dossier natif, **journal d'activité**.
- [x] Orchestrateur (chat), registres risques/tâches, convergence par gate, dev G5 en vagues
      par Bounded Context, autopilote / copilote.
- [ ] **M5** Contrat de sortie structuré des agents (durcissement).
- [ ] **M6** Finition + coutures multi-user / cloud.
```
