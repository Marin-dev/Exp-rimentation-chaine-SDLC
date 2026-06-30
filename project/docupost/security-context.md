# DocuPost Security Context

This file captures initial security assumptions for the DocuPost project.
It must be refined by `@security-architect` during framing and by `@appsec-reviewer` during implementation.

## Likely Data Classes

| Data | Sensitivity | Notes |
|---|---|---|
| Courier identity | Personal data | Apply minimization and role-based access |
| Delivery address | Personal/sensitive operational data | Avoid leaking in logs and screenshots |
| Delivery status | Operational data | Protect integrity and traceability |
| Incident reports | Potentially sensitive | May contain free text or photos later |
| Supervisor actions | Audit data | Preserve accountability |

## Initial Security Objectives

- Strong authentication and authorization per role.
- No sensitive data in logs, screenshots, prompts, or generated reports unless explicitly required.
- Input validation at API and domain boundaries.
- Audit trail for critical delivery and incident events.
- Least privilege for tools, integrations, and agent operations.

## Initial Threat Themes

- Unauthorized access to route or parcel data.
- Tampering with delivery status or incident records.
- Leakage of addresses or courier data through logs/test reports.
- Prompt injection or tool misuse through untrusted repository or document content.
- Over-permissive automation that modifies files or external systems outside the intended scope.
