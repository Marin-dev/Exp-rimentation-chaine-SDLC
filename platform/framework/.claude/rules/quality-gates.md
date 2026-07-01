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
- Test strategy can be derived without guessing.

## Definition Of Done For User Stories

A User Story is done only when:

- Code implements only the intended scope.
- Automated tests cover acceptance criteria at the right level.
- Relevant L1/L2/L3 tests have been executed or blocked with a precise cause.
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

Do not use it for missing mandatory inputs.

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
