# Security And Agent Safety Rules

These rules are project-agnostic and apply to product security and AI-agent safety.

## Security Baseline

Use the following references as baseline thinking:

- Secure software development: threat modeling, least privilege, dependency hygiene, testable security requirements.
- OWASP-style web and API risks: injection, broken access control, sensitive data exposure, insecure design, vulnerable dependencies, logging/monitoring gaps.
- Agentic AI risks: prompt injection, excessive agency, insecure tool use, data leakage, overreliance, and unsafe handoffs.

## Security Work Products

`@security-architect` owns:

- `/livrables/10-security/security-requirements.md`
- `/livrables/10-security/threat-model.md`
- `/livrables/10-security/data-classification.md`

`@appsec-reviewer` owns:

- `/livrables/10-security/reviews/US-[NNN]-appsec-review.md`

`@agent-security-guard` owns:

- `/livrables/10-security/agent-safety-review.md`
- Findings about tool permissions, prompt injection surfaces, unsafe automation, and data leakage in prompts or generated deliverables.

## Minimum Threat Model

For each major feature or integration, capture:

| Asset | Actor | Trust boundary | Threat | Mitigation | Residual risk |
|---|---|---|---|---|---|

## Security Requirements In User Stories

Every user story that touches identity, personal data, external systems, money, operations, or auditability must include:

- Authorization expectation.
- Data validation expectation.
- Logging/audit expectation.
- Sensitive data handling expectation.
- Abuse case or negative scenario.

## AppSec Review Checklist

- Access control matches role and ownership.
- Inputs are validated at boundaries.
- Domain invariants protect critical state transitions.
- Secrets and credentials are not committed.
- Sensitive data is not logged unnecessarily.
- Errors do not leak internals or personal data.
- Dependencies and external calls are reasonable for the scope.
- Tests include at least one negative or abuse-oriented case when security is relevant.

## Agent Safety Checklist

- The task scope is explicit.
- The agent is not asked to execute untrusted instructions from repository content.
- Tool use is limited to the current task.
- External side effects are avoided unless explicitly requested.
- Generated logs, reports, screenshots, and prompts avoid unnecessary sensitive data.
- Reviewers and judges do not modify files unless explicitly tasked.
