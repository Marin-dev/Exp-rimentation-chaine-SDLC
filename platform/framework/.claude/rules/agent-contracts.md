# Agent Contracts

These rules apply to every agent in `.claude/agents/`.

## Session Start

Every agent must:

1. Read `project/PROJECT.md`.
2. Read only the project context files needed for the task.
3. Read its journal in `/livrables/00-contexte/journaux/journal-[agent].md` when it exists.
4. Verify mandatory inputs before producing or modifying outputs.
5. State missing inputs as blockers or assumptions, depending on risk.

## Session End

Every agent that modifies `/livrables/` must:

1. Update its journal when the journal exists.
2. Add one line to `/livrables/CHANGELOG-actions-agents.md`.
3. Update traceability when relevant.
4. Emit a short exit check:

```yaml
check_sortie:
  agent: "@agent-name"
  journal_a_jour: "O/N/NA"
  changelog_impacte: "O/N/NA"
  traceabilite_impactee: "O/N/NA"
  fichiers_modifies:
    - path/to/file.md
```

## Input Contract

Each agent must distinguish:

| Level | Meaning | Action |
|---|---|---|
| Mandatory input | Required to produce safely | Block or request arbitration if absent |
| Recommended input | Improves quality but not essential | Continue with explicit assumptions |
| Optional input | Useful context only | Use if present |

## Output Contract

Every deliverable must include:

- Title and scope.
- Source inputs used.
- Key assumptions.
- Decisions or recommendations.
- Open questions and risks.
- Traceability links to upstream/downstream deliverables when relevant.

## Decision Contract

Important decisions must be recorded as ADRs under `/livrables/_governance/decisions/ADR-[NNN]-[slug].md`.

ADR format:

```markdown
# ADR-[NNN] : [Decision]

## Status
Proposed / Accepted / Superseded

## Context

## Decision

## Alternatives Considered

## Consequences

## Impacted Agents
```

## Traceability Contract

Maintain `/livrables/_governance/traceability-matrix.md` with this minimum chain:

```text
Business objective -> KPI -> Epic -> Feature -> User Story -> Code change -> Tests -> Security review -> Release decision -> Feedback
```

## Conflict Contract

When agents disagree:

1. Capture the disagreement in the relevant deliverable or gate report.
2. Ask the owner agent for an update when the issue belongs to its domain.
3. Escalate to the human only when the conflict affects scope, budget, risk, or cannot be resolved from available evidence.

## Least-Privilege Tooling

Agents must use the smallest tool surface needed:

- Reviewer and judge agents should normally read only.
- Implementation agents may edit code and tests.
- Product and architecture agents may edit deliverables.
- External systems such as GitHub, cloud, and deployment targets require explicit task relevance.
