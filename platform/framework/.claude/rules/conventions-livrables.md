# Deliverable Conventions

These conventions are project-agnostic and apply to every project using this architecture.

## Directory Structure

```text
/livrables/
├── 00-contexte/
│   ├── infrastructure-locale.md
│   ├── intake-synthesis.md
│   └── journaux/
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
├── _governance/
│   ├── decisions/
│   ├── gates/
│   └── traceability-matrix.md
└── CHANGELOG-actions-agents.md
```

## File Naming

- User Stories: `/livrables/05-backlog/user-stories/US-[NNN]-[slug].md`
- Delivery plan: `/livrables/05-backlog/planning.md` + `planning.json`
- Implementation notes: `/livrables/06-dev/vertical-slices/US-[NNN]-impl.md`
- Test scenarios: `/livrables/07-tests/scenarios/US-[NNN]-scenarios.md`
- Test reports: `/livrables/07-tests/scenarios/US-[NNN]-rapport-test.md`
- Security reviews: `/livrables/10-security/reviews/US-[NNN]-appsec-review.md`
- Judge reports: `/livrables/11-evaluations/US-[NNN]-[judge-name].md`
- Gate reports: `/livrables/_governance/gates/G[NN]-[gate-name].md`
- UI screen specs: `/livrables/02-ui/ecrans/[screen-slug].md`
- UI flow specs: `/livrables/02-ui/flows/[flow-slug].md`

## Deliverable Header

Every major deliverable should start with:

```markdown
# [Title]

**Agent**: @[agent]
**Date**: [ISO date]
**Project**: [PROJECT_NAME]
**Inputs used**:
- [path]
**Status**: Draft / Proposed / Accepted / Superseded
```

## Quality Bar

A deliverable is not complete if it lacks:

- Traceability to upstream inputs.
- Explicit assumptions.
- Known risks or open questions.
- Actionable next steps for downstream agents.

## Changelog Entry Format

```markdown
- [date ISO] [agent] [type d'action] -> [fichier(s) impacte(s)]
  [resume tres court]
```

Use ASCII arrows in new entries for portability.

## Journal Archiving

When a journal exceeds 150 lines:

1. Move older intervention and decision rows to `/livrables/00-contexte/journaux/archives/journal-[agent]-[YYYY-MM].md`.
2. Keep the latest 10 intervention rows and latest 10 decision rows in the active journal.
3. Do not archive synthesized context, active work tracking, or current points of attention.

## Source Of Truth Rule

Never duplicate runtime ports, startup commands, or local URLs outside `/livrables/00-contexte/infrastructure-locale.md`.

## Project Intake Convention

Before G0, a new project may start from a raw documentation folder supplied by
the user. Prefer this structure when creating a new intake folder:

```text
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

`@project-bootstrapper` converts this folder into:

- `project/[project-slug]/context.md`
- `project/[project-slug]/stack.md`
- `project/[project-slug]/security-context.md`
- `project/[project-slug]/intake-inventory.md`
- `project/PROJECT.md`
- `/livrables/00-contexte/intake-synthesis.md`
- `/livrables/_governance/gates/G0-project-context-ready.md`

## Client Sources

When a project starts from a client's existing documents, the platform manages
`/livrables/_sources/`:

- `originaux/` — untouched copy of the client folder. Never edit it.
- `normalises/` — readable conversions (Markdown with extracted images). PDF and images
  are read directly from `originaux/`.
- `sources.json` — index of every document (id `SRC-NNN`, conversion, classification).
- `par-etape/<phase>.md` — documents validated for a phase. When it exists, that phase is
  in reprise mode: transform the client's material, cite sources as `(source : SRC-NNN, §x)`,
  and end each deliverable with a "Traçabilité des sources" section.

Generated PowerPoint / Word supports are stored under `/livrables/_supports/`.

