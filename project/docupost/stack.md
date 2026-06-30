# DocuPost Stack Context

This file contains project-specific technical assumptions. Agents must read this file instead of hardcoding stack details.

## Current Known Stack

| Area | Current assumption | Notes |
|---|---|---|
| Frontend web supervision | Tailwind CSS v3 + DaisyUI | Applies only when the actual repository confirms this stack |
| Mobile | React Native / Expo possible | Confirm in repository before implementation |
| E2E testing | Playwright for web UI, RNTL/Jest for mobile UI | Use UI tests only when interaction or rendering is the real subject |
| Backend | To be confirmed from repository | Do not invent framework choices |
| Cloud/deployment | GCP possible for recette/staging | Treat as project-specific, not core architecture |

## UI Styling Rules For DocuPost Web Supervision

When the target codebase confirms Tailwind + DaisyUI:

- Use Tailwind classes rather than inline styles, except for dynamic computed values.
- Use project tokens from `tailwind.config.js` when they exist.
- Use DaisyUI components when they match the expected interaction.
- In jsdom tests, assert classes, semantic attributes, or dynamic inline styles; do not assert computed Tailwind colors.

## Runtime Source Of Truth

Do not duplicate ports, URLs, startup commands, or environment protocols here.
Read `/livrables/00-contexte/infrastructure-locale.md` when it exists.

## Anti-Hardcoding Rule

Any absolute path, localhost port, cloud project, repository name, or framework-specific command must come from:

1. The active repository.
2. `/livrables/00-contexte/infrastructure-locale.md`.
3. A user-provided instruction for the current session.
