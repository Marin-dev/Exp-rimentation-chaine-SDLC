# LLM-As-A-Judge Rubrics

Judges are evaluators, not implementers. They must read evidence, apply a rubric,
produce a score, and clearly separate facts from judgment.

## General Judge Rules

- Use project context from `project/PROJECT.md`.
- Use the smallest sufficient evidence set.
- Do not reward verbosity.
- Penalize unsupported claims.
- Prefer `FAIL` over optimistic approval when mandatory evidence is missing.
- Record uncertainty and ask for human arbitration on business-risk decisions.

## Score Scale

| Score | Meaning |
|---|---|
| 0 | Missing or unusable |
| 1 | Major gaps, unsafe to proceed |
| 2 | Partial, substantial rework needed |
| 3 | Acceptable with minor issues |
| 4 | Strong, ready |
| 5 | Excellent, clear, testable, traceable |

Default pass threshold: average score >= 4 and no criterion below 3.

## Spec Judge Rubric

| Criterion | Question |
|---|---|
| Clarity | Is the requirement understandable without chat history? |
| Testability | Can QA derive tests without guessing? |
| Scope control | Is what is out of scope explicit? |
| Domain alignment | Does it use the project ubiquitous language? |
| Traceability | Does it link to vision, UX, architecture, and backlog parents? |
| Risk visibility | Are security, NFR, and assumptions visible? |

## Architecture Judge Rubric

| Criterion | Question |
|---|---|
| Domain fit | Does the architecture respect Bounded Contexts and domain ownership? |
| Simplicity | Is the solution no more complex than needed for the current phase? |
| Integrations | Are trust boundaries and anti-corruption layers explicit? |
| NFR coverage | Are performance, resilience, observability, and security addressed? |
| Evolvability | Can future features fit without breaking the model? |

## Test Judge Rubric

| Criterion | Question |
|---|---|
| Acceptance coverage | Are all acceptance criteria covered? |
| Test level selection | Are assertions placed at L1/L2/L3 appropriately? |
| Negative cases | Are edge cases and abuse cases represented when relevant? |
| Execution evidence | Are results based on real execution or precise blockers? |
| Regression value | Would these tests catch meaningful future breakage? |

## Release Judge Rubric

| Criterion | Question |
|---|---|
| Scope integrity | Does the release match intended scope only? |
| Verification evidence | Are tests, appsec, and reviews complete? |
| Operational readiness | Are deployment, rollback, monitoring, and startup instructions ready? |
| Traceability | Can a human follow the full chain from objective to delivered behavior? |
| Residual risk | Are known risks owned and acceptable? |

## Judge Report Format

```markdown
# Judge Report - [Subject]

**Judge**: @[judge-agent]
**Date**: [ISO date]
**Status**: PASS / FAIL / PASS_WITH_RISK
**Average score**: [0-5]

## Evidence Reviewed
- [path]

## Scores
| Criterion | Score | Rationale |
|---|---:|---|

## Blocking Issues
- [issue]

## Non-Blocking Improvements
- [improvement]

## Final Decision
[Short decision and next action.]
```
