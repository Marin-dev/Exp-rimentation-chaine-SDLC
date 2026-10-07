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
  `permissionMode`, app à lancer, politiques, autopilote, tarifs). Non versionné.
- État **du projet** : `<workspace>/.claude/control-center/` (`project-state.json` avec
  décisions/risques/tâches, `spend.json`, `runs/<id>.log`, `autopilot-state.json`).
- Contrat agent ↔ plateforme : `<workspace>/livrables/_governance/agent-io/`
  (`pending-input.json`, `answers.json`, `resolutions.json`, `risks.json`, `tasks.json`).
- Modifier `platform/framework/` ne change **pas** les projets existants : leur copie
  est figée à la création. Reporter à la main dans un projet existant si besoin.

## Fonctionnement

1. **Création d'un projet** (`project-scaffold.js`) : copie du socle + arborescence
   `livrables/` vide. Refuse si le socle est incomplet ou si le dossier a déjà des agents.
2. **G0** : `@project-bootstrapper` lit un dossier d'intake et produit `project/PROJECT.md`,
   le contexte projet et le gate G0.
3. **Phases G1 → G7** (`domain/phases.js`) : chaque phase a un producteur, un reviewer
   qui décide le gate, des dossiers de livrables et des profils humains propriétaires.
   Les gates sont lus dans `livrables/_governance/gates/G*.md` (`**Status**: PASS / FAIL / PASS_WITH_RISK`).
4. **Run** (`runs.js`) : chaque agent est un process `claude -p --permission-mode <config>
   --output-format stream-json --verbose`, lancé dans le workspace. Le flux est parsé en
   direct (SSE vers l'UI) ; coût et tokens sont lus dans l'event `result` (sinon estimés).
   Chaque run a un `kind` (`g0`, `phase`, `parallel`, `review`, `chat`, `resume`, `new-need`…).
5. **Human-in-the-loop** : un agent bloqué écrit ses questions dans `pending-input.json`.
   En fin de run, `inbox-ingest.js` les route vers le profil humain concerné
   (`decisions-store.js`). La réponse peut venir de l'humain ou être déléguée à l'agent
   expert du profil (`resolve-via-agent.js`) ; une fois tout répondu, le run reprend.
6. **Registres** : risques (`risks-store.js`), tâches (`tasks-store.js`, statut `proposed`
   = candidat non actionnable tant qu'il n'est pas promu), décisions. Un gate en PASS
   **propre** clôt les tâches de sa phase (`coordination.js`) ; `PASS_WITH_RISK` ne clôt rien.
7. **Orchestrateur** (écran Orchestrateur), trois modes, tous sur la même base
   (`orchestrator-snapshot.js` ; objectif courant = premier gate non passé) :
   - **chat** : il propose des actions, l'humain confirme (`orchestrator-actions.js`) ;
   - **autopilote** (`autopilot.js`) : boucle à tick qui planifie un lot borné, lance les
     agents, délègue chaque décision à l'expert et n'escalade à l'humain que si l'expert
     est bloqué. Plafonds : `budgetUsd`, `maxIterations`, `maxConcurrent` ;
   - **copilote** : même boucle, mais l'objectif est une demande unique de l'humain.

   Les actions externes (git push, publication GitHub, lancement du produit) ne sont
   **jamais** lancées en automatique.
8. **Dev G5 en vagues** (`dev-batches.js`) : les US prêtes sont groupées par Bounded
   Context ; une vague = plusieurs lanes `@developpeur` en parallèle, chacune avec ses
   propres fichiers agent-io. L'ordre des vagues vient de
   `livrables/03-architecture-metier/dev-waves.json` (produit par `@architecte-metier`) ;
   sans ce fichier, un BC par vague, par ordre d'id.
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
12. **Au démarrage** (`server.js`) : les runs encore vivants sont ré-adoptés, l'ingestion
   des runs finis est rattrapée, et l'autopilote reprend s'il était actif.

## Lancer

Depuis `platform/` :

| But | Commande |
|---|---|
| Prod (un seul port, 4174) | `npm run build` puis `npm start` |
| Dev | `npm run dev:server` (watch) + `npm run dev:web` (Vite, port 5174) |
| Vérifier la lecture du workspace | `npm run check` |

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
