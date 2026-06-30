# AI Dev Chain Control Center

Application locale de pilotage pour l'architecture multi-agents AI Dev Chain.
La V3 utilise un backend Node modulaire et une interface React Native Web en JavaScript.

## Lancer

```bash
cd control-center
npm install
npm run build
npm start
```

Puis ouvrir:

```text
http://localhost:4173
```

## Capacites

- Choisir le dossier de travail projet depuis l'ecran Configuration.
- Lire le projet actif depuis `.claude/project/PROJECT.md` du workspace choisi.
- Lister les agents, skills et MCP declares dans ce workspace.
- Suivre les gates G0 a G7 depuis `/livrables/_governance/gates/`.
- Piloter chaque grande phase dans son propre onglet: G0 lancement, G1 vision, G2 discovery, G3 architecture, G4 backlog/US, G5 developpement, G6 verification, G7 release.
- Afficher pour chaque phase les agents concernes, livrables Markdown, choix structurants, revues humaines completes et templates de commandes.
- Lancer le developpement des US depuis la phase G5 avec le template dedie.
- Importer un cahier des charges ou des documents d'intake pour G0.
- Lire les questions ouvertes G0 produites par `@project-bootstrapper`, sans questionnaire predefini dans l'app.
- Sourcer un nouveau besoin avec des fichiers, par exemple un CR, puis l'envoyer en requalification de phase.
- Lire les livrables Markdown et realiser les revues humaines directement dans l'onglet de chaque phase.
- Preparer et lancer Claude Code depuis chaque phase si une commande CLI est configuree.
- Conserver les prompts dans `.claude/control-center/actions/`.
- Conserver les logs dans `.claude/control-center/runs/`.

## Claude Code

La commande est configurable dans l'interface.

Par defaut:

```json
{
  "claudeCommand": "claude",
  "claudeArgs": ["-p", "{prompt}"]
}
```

Variables utilisables dans les arguments:

- `{prompt}` : prompt complet.
- `{promptFile}` : chemin vers le fichier prompt.
- `{workspace}` : racine du workspace.

Si la commande `claude` n'est pas dans le PATH, l'application reste utilisable
pour scanner, suivre et preparer les commandes de phase, mais l'execution directe est bloquee.

## Architecture

```text
control-center/
|-- server.js
|-- src/
|   |-- server/
|   |   |-- config/
|   |   |-- routes/
|   |   |-- services/
|   |   `-- utils/
|   `-- app/
|       |-- api/
|       |-- components/
|       |-- data/
|       |-- screens/
|       |-- theme/
|       `-- utils/
|-- .state/
`-- dist/
```
