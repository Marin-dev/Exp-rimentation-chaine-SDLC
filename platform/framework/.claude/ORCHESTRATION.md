# Project And Agent Orchestration

This document gives a structural view of the project-agnostic AI Dev Chain.

## Repository Structure

```text
.
├── CLAUDE.md
├── .claude/
│   ├── agents/
│   │   ├── project-bootstrapper.md
│   │   ├── sponsor.md
│   │   ├── discovery-reviewer.md
│   │   ├── ux.md
│   │   ├── ui-designer.md
│   │   ├── architecte-metier.md
│   │   ├── architecte-technique.md
│   │   ├── security-architect.md
│   │   ├── po.md
│   │   ├── spec-reviewer.md
│   │   ├── developpeur.md
│   │   ├── code-quality-reviewer.md
│   │   ├── appsec-reviewer.md
│   │   ├── qa.md
│   │   ├── test-reviewer.md
│   │   ├── devops.md
│   │   ├── release-judge.md
│   │   ├── agent-security-guard.md
│   │   ├── end-user.md
│   │   └── architecture-reviewer.md
│   ├── project/
│   │   ├── PROJECT.md
│   │   └── docupost/
│   │       ├── context.md
│   │       ├── stack.md
│   │       └── security-context.md
│   ├── rules/
│   │   ├── agent-contracts.md
│   │   ├── conventions-livrables.md
│   │   ├── quality-gates.md
│   │   ├── security.md
│   │   ├── judge-rubrics.md
│   │   └── domaine-docupost.md
│   ├── skills/
│   ├── mcp.json
│   └── settings.json
└── livrables/
    ├── 00-contexte/
    ├── 01-vision/
    ├── 02-ux/
    ├── 02-ui/
    ├── 03-architecture-metier/
    ├── 04-architecture-technique/
    ├── 05-backlog/
    ├── 06-dev/
    ├── 07-tests/
    ├── 08-devops/
    ├── 09-feedback/
    ├── 10-security/
    ├── 11-evaluations/
    └── _governance/
project-intake/
    ├── 00-brief/
    ├── 01-business/
    ├── 02-users/
    ├── 03-processes/
    ├── 04-data/
    ├── 05-systems/
    ├── 06-constraints/
    ├── 07-security-compliance/
    ├── 08-design-brand/
    └── 09-existing-assets/
```

## Layering

```mermaid
flowchart TB
  User["Human / Product Owner"] --> Orchestrator["CLAUDE.md Orchestrator"]
  Orchestrator --> CoreAgents[".claude/agents (generic roles)"]
  Orchestrator --> CoreRules[".claude/rules (contracts, gates, rubrics)"]
  Orchestrator --> ProjectProfile["project/PROJECT.md"]
  ProjectProfile --> ProjectContext["project/[project] (domain, stack, security context)"]
  CoreAgents --> Deliverables["/livrables (evidence and work products)"]
  CoreRules --> Deliverables
  ProjectContext --> Deliverables
```

## End-To-End Flow

```mermaid
flowchart LR
  Intake["Project intake docs"] --> Bootstrapper["@project-bootstrapper"]
  Bootstrapper --> A["G0 Project Context"]
  A --> B["@sponsor"]
  B --> DR1["@discovery-reviewer"]
  DR1 --> C["G1 Vision"]
  C --> D["@ux"]
  C --> E["@architecte-metier"]
  E --> D
  D --> E
  D --> UI["@ui-designer"]
  E --> UI
  UI --> DR2["@discovery-reviewer"]
  E --> DR2
  DR2 --> F["G2 Domain, UX And UI Ready"]
  F --> G["@architecte-technique"]
  F --> H["@security-architect"]
  G --> I["@architecture-reviewer"]
  H --> I
  I --> J["G3 Architecture + Security"]
  J --> K["@po"]
  K --> L["@spec-reviewer"]
  L --> M["G4 Story Ready"]
  M --> N["@developpeur"]
  N --> O["@code-quality-reviewer"]
  O --> P["G5 Implementation Done"]
  P --> Q["@qa"]
  P --> R["@appsec-reviewer"]
  Q --> S["@test-reviewer"]
  S --> T["G6 Verification Done"]
  R --> T
  T --> U["@devops"]
  U --> V["@release-judge"]
  V --> W["G7 Release Decision"]
  W --> X["@end-user"]
  X --> K
```

## Judge And Review Gates

```mermaid
flowchart TB
  Spec["@spec-reviewer"] --> G4["G4 Story Ready"]
  Code["@code-quality-reviewer"] --> G5["G5 Implementation Done"]
  AppSec["@appsec-reviewer"] --> G6["G6 Verification Done"]
  Test["@test-reviewer"] --> G6
  Release["@release-judge"] --> G7["G7 Release Decision"]
  AgentGuard["@agent-security-guard"] --> Hardening["Agent architecture hardening"]
```

## Reuse Model

```text
Reusable:
  .claude/agents/*
  .claude/rules/*
  CLAUDE.md orchestration model

Replace per project:
  project/PROJECT.md
  project/[project]/*
  .claude/rules/domaine-[project].md when needed

Generated during delivery:
  /livrables/*
```
