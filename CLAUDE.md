# SDLC Studio — repo de la plateforme

Ce repo contient **SDLC Studio** (`platform/`), une app locale qui pilote une chaîne de
développement multi-agents IA sur des **projets situés ailleurs sur le disque**.
Ce fichier sert à travailler **sur la plateforme**. Ce n'est pas le prompt des agents :
celui-là est le gabarit `platform/framework/CLAUDE.template.md`, copié sous le nom
`CLAUDE.md` dans chaque nouveau projet. Il porte ce nom pour que Claude Code ne le
charge pas comme consigne quand on travaille ici.

Détail du code (services, écrans, ajout d'endpoint ou d'écran) : `platform/README.md`.

## Les trois espaces à ne pas confondre

| Espace | Emplacement | Contenu | Qui écrit |
|---|---|---|---|
| **Code de l'app** | `platform/src/` | Backend Node + front React | Nous |
| **Socle livré aux projets** | `platform/framework/` | `CLAUDE.template.md` (→ `CLAUDE.md` du projet) + `.claude/` (agents, rules, skills, mcp, ORCHESTRATION/VERIFICATION) | Nous ; copié tel quel à la création d'un projet |
| **Workspace projet** | `config.workspaceRoot` (un dossier hors de ce repo) | Copie du socle + `project/` + `livrables/` + code produit | Les agents, et la plateforme pour son état |

- État **de l'app** : `platform/.state/config.json` (workspace actif, commande claude,
  `permissionMode`, `runLimits`, `models`, `autoReview`, `devIsolation`, app à lancer,
  politiques, autopilote, tarifs). Non versionné.
  `platform/.state/worktrees/` : checkouts des lanes G5 isolées (option `devIsolation`).
- État **du projet** : `<workspace>/.claude/control-center/` (`project-state.json` avec
  décisions/risques/tâches, `spend.jsonl` (+ ancien `spend.json` lu seulement),
  `runs/<id>.jsonl` (flux brut), `.log` (lisible), `.meta.json` (session, agent, prompt),
  `active-runs.json`, `autopilot-state.json`).
- Contrat agent ↔ plateforme : `<workspace>/livrables/_governance/agent-io/`, **un jeu de
  fichiers par run** : `pending-input-<runId>.json`, `risks-<runId>.json`,
  `tasks-<runId>.json`, `resolutions-<runId>.json`, et `answers-<runId>.json` pour une
  reprise. Les prompts écrivent les noms partagés par défaut ; `runs.js` les réécrit.
- Modifier `platform/framework/` ne change **pas** les projets existants : leur copie
  est figée à la création. Reporter à la main dans un projet existant si besoin.

## Fonctionnement

1. **Création d'un projet** (`project-scaffold.js`) : copie du socle + arborescence
   `livrables/` vide. Refuse si le socle est incomplet ou si le dossier a déjà des agents.
2. **G0** : `@project-bootstrapper` lit un dossier d'intake et produit `project/PROJECT.md`,
   le contexte projet et le gate G0.
3. **Phases G1 → G7** (`domain/phases.js`) : chaque phase a un producteur, un reviewer
   qui décide le gate, des dossiers de livrables et des profils humains propriétaires.
   Le producteur (et la remédiation) n'écrit jamais le `**Status**` d'un gate qui a un
   reviewer : la revue est enchaînée automatiquement (`phase-runs.js`, réglage `autoReview`).
   **Tests d'abord** : à G4, après le PO, `@qa` écrit les tests d'acceptation exécutables de
   chaque US (`07-tests/acceptance/manifest.json`) et les commandes de vérification
   (`07-tests/verification.json`), puis la revue G4 suit. La plateforme verrouille ces tests
   (sha256 dans `control-center/acceptance-lock.json`) ; seul un run `@qa` de G4/G6 les reverrouille.
   **Preuves exécutables** (`verification.js`) : pour G5/G6, la plateforme exécute elle-même
   les commandes **approuvées par un humain** (toute modification du fichier exige une nouvelle
   approbation), lit les rapports JUnit, relie chaque test à son US (`US-NNN` dans le nom) et
   vérifie le verrou. Le verdict est dans `control-center/evidence/` (miroir lisible
   `livrables/_governance/evidence/<G>.md`). Une revue G5/G6 est précédée d'une vérification
   si les preuves ne sont pas fraîches ; après chaque run, un G5/G6 en PASS sans preuve
   fraîche et réussie est ramené à FAIL dans son fichier de gate. Politique par projet
   (`control-center/evidence-policy.json`) : active à la création, à activer depuis l'écran
   de l'étape pour un projet existant.
   Les gates sont lus dans `livrables/_governance/gates/G*.md` (`**Status**: PASS / FAIL / PASS_WITH_RISK`).
4. **Run** (`runs.js`) : chaque agent est un process `claude -p --permission-mode <config>
   --output-format stream-json --verbose [--model] [--max-turns] [--resume]`, lancé dans le
   workspace. Sa sortie va dans `runs/<id>.jsonl`, que le serveur suit en direct (SSE vers
   l'UI) ; un serveur redémarré relit donc le run jusqu'à son event `result`. Coût et tokens
   viennent de `result` (sinon estimés, y compris en direct pendant le run). Chaque run a un
   `kind` (`g0`, `phase`, `parallel`, `review`, `plan`, `chat`, `resume`, `resolution`…) qui
   choisit aussi le modèle (`models.byKind`). Il est arrêté (par PID) au-delà de
   `runLimits.timeoutMinutes`, ou depuis l'UI (`POST /api/runs/<id>/cancel`).
   En fin de run, `run-hooks.js` ingère ses fichiers agent-io puis fait la coordination
   (clôture des tâches, résolution déléguée, reprise, revue enchaînée), y compris pour un
   run ré-adopté après redémarrage.
5. **Human-in-the-loop** : un agent bloqué écrit ses questions dans son `pending-input-<runId>.json`.
   En fin de run, `inbox-ingest.js` les route vers le profil humain concerné
   (`decisions-store.js`). La réponse peut venir de l'humain ou être déléguée à l'agent
   expert du profil (`resolve-via-agent.js`) ; une fois tout répondu, **le même agent**
   reprend **sa session** (`run-resume.js`, `--resume <session_id>`, même cwd et mêmes
   fichiers), avec ses réponses dans `answers-<runId>.json`. Si la session ne peut pas être
   reprise, le prompt d'origine est rejoué avec les réponses.
6. **Registres** : risques (`risks-store.js`), tâches (`tasks-store.js`, statut `proposed`
   = candidat non actionnable tant qu'il n'est pas promu), décisions. Un gate en PASS
   **propre** clôt les tâches de sa phase (`coordination.js`) ; `PASS_WITH_RISK` ne clôt rien.
7. **Orchestrateur** (écran Orchestrateur), trois modes, tous sur la même base
   (`orchestrator-snapshot.js` ; objectif courant = premier gate non passé) :
   - **chat** : il propose des actions, l'humain confirme (`orchestrator-actions.js`) ;
   - **autopilote** (`autopilot.js`) : boucle à tick qui planifie un lot borné, lance les
     agents, délègue chaque décision à l'expert et n'escalade à l'humain que si l'expert
     est bloqué. Plafonds : `budgetUsd` (dépense en cours comprise ; dépassé, il arrête
     ses propres agents), `maxIterations`, `maxConcurrent` (agents au travail en même temps ;
     sous ce plafond il continue de déléguer et de planifier) ;
   - **copilote** : même boucle, mais l'objectif est une demande unique de l'humain.

   Les actions externes (git push, publication GitHub, lancement du produit) ne sont
   **jamais** lancées en automatique.
8. **Dev G5 en vagues** (`dev-batches.js`) : les US prêtes sont groupées par Bounded
   Context ; une vague = plusieurs lanes `@developpeur` en parallèle, chacune avec ses
   propres fichiers agent-io. L'ordre des vagues vient de
   `livrables/03-architecture-metier/dev-waves.json` (produit par `@architecte-metier`) ;
   sans ce fichier, un BC par vague, par ordre d'id. Après une vague de plusieurs lanes, une
   étape d'intégration builde, teste et répare les cassures entre lanes. Avec
   `devIsolation: "worktree"`, chaque lane travaille dans son worktree git (`worktrees.js`),
   fusionné après la vague ; un conflit arrête le groupe et ouvre un risque (rien n'est poussé).
9. **Amorçage depuis un dossier client** (`source-ingest.js`, `source-map.js`) : à la création
   d'un projet (ou depuis Lancement), le dossier du client est copié et converti sous
   `livrables/_sources/`. `@project-bootstrapper` cartographie chaque document (niveau, étapes,
   fiabilité, contradictions), l'humain valide l'affectation, et chaque étape concernée reçoit un
   brief `_sources/par-etape/<Gx>.md` qui bascule ses agents en **mode reprise** (transformer la
   matière du client en citant les sources, poser des questions sur les manques). Une analyse de
   couverture produit la matrice G1→G4 et un questionnaire client exportable en Word.
10. **Planning** : `@chef-de-projet` produit à G4 `05-backlog/planning.md` + `planning.json`
   (charge en jours-homme, équipe, sprints, jalons).
11. **Supports** (`supports.js`, `support-render.js`) : depuis chaque étape, un agent rédige un plan
   JSON consolidé de G0 à l'étape, rendu en PowerPoint ou Word avec le gabarit déposé dans les
   Réglages (couleurs, polices, styles Word), sinon un gabarit neutre.
12. **Guichet des demandes** (`request-flow.js`, écran Demandes, bouton « Nouvelle demande »
   de l'en-tête) : n'importe qui dépose une demande en texte libre. L'orchestrateur la
   **classe** seulement (un appel LLM : question, anomalie, évolution, changement de cadrage,
   doublon), puis un **déroulé fixe écrit en code** la mène au bout :
   question → agent du profil, en lecture seule ; anomalie → `@qa` écrit un test de
   non-régression qui échoue (`regressions` du manifeste, verrouillé) → correction → preuves
   exécutables → revue, avec au plus 3 tentatives ; évolution → impact (`@po`) → **décision
   du chef de projet** (`humanOnly` : jamais déléguée à une IA) → spécification → tests
   d'acceptation → dev → preuves → revue ; changement de cadrage → circuit « nouveau besoin ».
   Les étapes qui touchent le produit passent une par une (file d'attente par priorité). Les
   questions des agents mettent l'étape en pause, et la reprise la poursuit (`post.request`).
   Registre : `control-center/requests.json` ; sorties des agents :
   `agent-io/request-<REQ>-<étape>.json`.
13. **Au démarrage** (`server.js`) : les runs encore vivants sont ré-adoptés, l'ingestion
   des runs finis est rattrapée, et l'autopilote reprend s'il était actif.

## Lancer

Depuis `platform/` :

| But | Commande |
|---|---|
| Prod (un seul port, 4174) | `npm run build` puis `npm start` |
| Dev | `npm run dev:server` (watch) + `npm run dev:web` (Vite, port 5174) |
| Vérifier la lecture du workspace | `npm run check` |
| Tests (moteur de runs avec faux CLI, prompts, vagues, worktrees) | `npm test` |

En prod, toute modification du front demande un `npm run build`, et toute modification
du backend un redémarrage.

## Pièges

- **Arrêter un process par PID, jamais par nom.** `taskkill /IM node.exe` tue la plateforme,
  les runs d'agents en cours et d'autres apps de la machine. Pour redémarrer : trouver le PID
  qui écoute sur 4174 (`Get-NetTCPConnection -LocalPort 4174`), arrêter ce PID seulement.
  Arrêter le wrapper `npm` ne suffit pas toujours : le `node server.js` enfant peut rester orphelin.
- **Spawns Windows** : toujours `windowsHide: true` (sinon épuisement du desktop heap,
  erreur `0xC0000142`). Le prompt passe par stdin, jamais par argv.
- **Les agents n'écrivent jamais dans `.claude/`** (protégé en headless) : tout ce qu'ils
  produisent va dans `project/` ou `livrables/`.
- **`config/paths.js` est la seule source des chemins disque.**
- **Pas de savoir propre à un projet** dans `platform/src/` ni `platform/framework/` : ce qui
  dépend du domaine se lit dans le workspace (ex. ordre des BC dans `dev-waves.json`).
- Toute modification d'agents, permissions, MCP ou hooks du socle → revue `@agent-security-guard`.
- UI : icônes lucide, pas d'emoji ; primitives de `web/components/ui.jsx` ; thème EY.
