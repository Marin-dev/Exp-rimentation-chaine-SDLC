# Quality Gates

The orchestrator must route work through gates. Gates are explicit pass/fail checkpoints,
not informal opinions.

## Gate Summary

| Gate | Name | Owner | Required before |
|---|---|---|---|
| G0 | Project Context Ready | Project Bootstrapper + Orchestrator | Any specialized agent work |
| G1 | Vision Ready | Sponsor + Discovery Reviewer | UX / UI / Domain Architecture |
| G2 | Domain, UX And UI Ready | UX + UI Designer + Domain Architect + Discovery Reviewer | Technical architecture |
| G3 | Architecture And Security Ready | Solution Architect + Security Architect + Architecture Reviewer | Backlog commitment |
| G4 | Story Ready | PO + Spec Reviewer | Development |
| G5 | Implementation Done | Developer + Code/Spec Review | QA and AppSec |
| G6 | Verification Done | QA + Test Reviewer + AppSec Reviewer | Release decision |
| G7 | Release Decision | Release Judge + DevOps | Deployment / feedback loop |

## Definition Of Ready For User Stories

A User Story is ready only when:

- It links to one Epic and one Feature.
- Persona, goal, and benefit are explicit.
- Bounded Context and impacted Aggregate(s) are identified when relevant.
- Acceptance criteria are testable and written in domain language.
- Non-functional and security expectations are stated or explicitly not applicable.
- UX, UI, and architecture links are present when the US changes user-facing behavior or technical structure.
- **Back and Front portions are explicitly delimited.** A user-facing story either splits its work into a `Back` part and a `Front` part (screens + states), or is tagged `Back-only` / `Front-only`. Each concerned screen under `02-ui/ecrans/` is linked. No user-facing story is `Prête` with an implicit or missing front scope.
- Test strategy can be derived without guessing.

## Definition Of Done For User Stories

A User Story is done only when:

- Code implements only the intended scope.
- Automated tests cover acceptance criteria at the right level.
- Relevant L1/L2/L3 tests have been executed or blocked with a precise cause.
- **Both the Back and the Front portions of the slice are delivered.** For a user-facing story not tagged `Back-only`, "done" requires the screen(s) actually built and wired — `Chargement` / `Vide` / `Erreur` states handled per the UI spec — not only the server logic. Fluent-2 (or design-system) components authored but never assembled into a running screen do **not** satisfy the front portion.
- For a user-facing story, at least one **L3 / UI evidence is executed** (an automated UI/E2E test, or at minimum "the app renders this screen against the real back"). A story whose front layer is absent is **`FAIL`, never `PASS_WITH_RISK`**. Deferring the UI is a scope change that requires an explicit, human-arbitrated decision recorded under `_governance/decisions/` — it must not ride as a residual risk.
- AppSec review is passed or risk is accepted by the human.
- Traceability matrix links the US to code, tests, security review, and feedback.
- Implementation notes explain commands, URLs, and verification path by reference to infrastructure source of truth.

## Gate Report Format

```markdown
# G[NN] - [Gate Name]

**Status**: PASS / FAIL / PASS_WITH_RISK
**Owner**: @[agent]
**Date**: [ISO date]

## Evidence
- [path or command result]

## Blocking Issues
- [issue]

## Accepted Risks
- [risk + owner]

## Required Next Action
- [action]
```

## Pass With Risk

Use `PASS_WITH_RISK` only when:

- The residual risk is explicitly named.
- The risk owner is clear.
- The next mitigation is tracked.

Do not use it for missing mandatory inputs, nor for an **unbuilt product layer** — e.g. the entire front of user-facing stories. A whole missing layer is a `FAIL` or an explicit scope decision, never an accepted risk.

## Risk Register

Risks are tracked, first-class objects — not just prose inside a gate report. Any agent that
raises or changes a risk (notably when setting a gate to `PASS_WITH_RISK`, or noting a residual
risk of a `FAIL`) MUST register it in `livrables/_governance/agent-io/risks.json` (a JSON array),
which the platform ingests into the register. Each entry:

```json
{
  "id": "R-<GATE>-NN",
  "title": "short risk title",
  "description": "what the risk is and its impact",
  "severity": "low | medium | high | critical",
  "phaseId": "G0..G7", "gate": "e.g. G6",
  "owner": "@profile",
  "status": "open | mitigating | resolved | accepted | closed",
  "mitigation": "next action to reduce/lift it",
  "note": "what changed (when updating an existing risk)"
}
```

Rules:
- Reuse the existing `id` when the risk already exists; change only what evolves (`status`, `mitigation`).
- A `PASS_WITH_RISK` is not valid unless every named residual risk is present in the register.
- Marking a risk `resolved` requires the mitigating evidence to exist in the deliverables.

## G0 Project Context Ready

G0 validates that the project can safely enter the agent chain.

Producer:

- `@project-bootstrapper` when starting from an intake documentation folder.
- Orchestrator when the project profile already exists and only needs checking.

Required evidence:

- `project/PROJECT.md`
- `project/[project-slug]/context.md`
- `project/[project-slug]/stack.md`
- `project/[project-slug]/security-context.md`
- `project/[project-slug]/intake-inventory.md` when an intake folder was used.
- `/livrables/00-contexte/intake-synthesis.md`
- `/livrables/_governance/gates/G0-project-context-ready.md`

G0 `PASS` means `@sponsor` can start G1.

## UX / Domain Convergence Rule

UX and domain architecture may start in parallel after G1, but G2 requires convergence:

- UX journeys must reflect the current domain vocabulary or explicitly flag unconfirmed terms.
- Domain architecture must incorporate relevant field vocabulary and journey evidence from UX.
- UI design must consume both UX wireframes and domain architecture before being considered ready.
- Any disagreement between screen wording, user language, and domain model must be captured as a G2 issue.
