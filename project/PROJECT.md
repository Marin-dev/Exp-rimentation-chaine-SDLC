# Active Project Profile

This file is the single entry point for project-specific context.
Core agents must stay reusable across projects and must read this profile before
using any project name, domain vocabulary, stack, infrastructure, or delivery convention.

## Project

- **Project name**: DocuPost
- **Project type**: Product development / MVP delivery
- **Current phase**: Product definition and MVP implementation
- **Primary language for deliverables**: French

## Context Files

| Topic | Source of truth |
|---|---|
| Business and domain context | `project/docupost/context.md` |
| Technical stack and local execution | `project/docupost/stack.md` |
| Security and compliance context | `project/docupost/security-context.md` |
| Domain-specific glossary seed | `.claude/rules/domaine-docupost.md` |
| Runtime ports and startup protocols | `/livrables/00-contexte/infrastructure-locale.md` |

## Project Variable Contract

Agents must treat these values as variables, not hardcoded assumptions:

| Variable | Meaning | Current value |
|---|---|---|
| `PROJECT_NAME` | Product/project display name | DocuPost |
| `PROJECT_DOMAIN` | Business domain | Delivery route management |
| `PRIMARY_USERS` | Main user groups | Field couriers, logistics supervisors |
| `DELIVERY_MODE` | Development approach | Vertical slices by User Story |
| `ARCHITECTURE_STYLE` | Preferred design style | DDD-oriented modular architecture |

## Reuse Rule

To reuse this agent architecture for another project:

1. Replace files under `project/docupost/` with a new project folder.
2. Update this `PROJECT.md` to point to the new project files.
3. Keep `.claude/agents/` and `.claude/rules/` project-agnostic.
4. Keep project-specific ports, stack, domain words, and examples out of agent files.
