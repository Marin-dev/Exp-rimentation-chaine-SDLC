# Frontend UI Quality Rules

Project-agnostic good-practice rules for any UI produced by `@ui-designer` (prototypes
under `/livrables/02-ui/prototypes/`) and later implemented by `@developpeur`.

These rules are **enforceable and verifiable**. `@ui-designer` applies them; `@qa` and
`@discovery-reviewer` can check them; `@developpeur` carries them into production code.

**Reference screen**: the canonical, fully-compliant worked example is
`/livrables/02-ui/prototypes/espace-mission-workspace.html`. New screens mirror its
patterns rather than reinventing them.

## R1 — Design system is the source of truth

- Use only the tokens, brand ramp, typography, spacing, and components declared in the
  active project `design-system.md`. No ad-hoc colors, fonts, or spacing values.
- When a project has a committed UI library / tone (e.g. Fluent 2, sober institutional),
  it **overrides** any generic "bold aesthetic" instinct from the `frontend-design` skill.
  Craft = refined execution *within* the system, never a license to reinvent identity.
- Every reusable pattern (badge, header, table row) matches the `ui-kit/` component.

## R2 — Complete state coverage (no dead ends)

Every screen renders, and every prototype demonstrates, these states where relevant:

- **Loading** (skeleton, not a blank frame)
- **Empty** — with a clear exit action (never a dead end)
- **Success** (nominal)
- **Error** — with a retry / recovery path
- **Permission denied** — an exit action, and **no leakage** of confidential existence
- **Offline / degraded** when the screen targets unstable connections

## R3 — Accessibility floor (non-negotiable)

- **Contrast**: AA (4.5:1 text, 3:1 large text / UI components).
- **Never color alone**: status/danger/warning always doubled with a label and/or icon.
- **Keyboard**: full keyboard operability; logical tab order; visible focus ring
  (`:focus-visible`, ≥2px, ≥3:1 contrast) on **every** interactive element.
- **ARIA patterns**: use the correct roles (e.g. `tablist/tab/tabpanel` with arrow-key
  navigation; `role="status"`/live regions for banners, receipts, and errors).
- **Decorative SVG/icons** carry `aria-hidden="true"`; meaningful icons have an accessible name.
- **Skip link** to main content as the first focusable element.
- **`lang`** attribute set; in bilingual UIs the foreign-language term carries an
  accessible explanation (tooltip + FR `aria-label`).
- **Touch targets** ≥44×44px on any mobile/touch view; text resizable to 200%.
- **Motion**: honor `prefers-reduced-motion`.

## R4 — Domain & language fidelity

- Labels, entity names, and state names use the project **ubiquitous language**.
- Bilingual convention (when set): displayed label in the UI language, canonical term
  in tooltip/`aria-label`. Do not translate state names ad hoc — reuse the
  `design-system.md` status→label→tone mapping. Never recompute labels locally.

## R5 — Business-rule & confidentiality visibility

- Out-of-scope / unauthorized content is **not rendered** (not greyed out); no leakage of
  existence of confidential items.
- Actions are **conditioned on state + role**: hide (don't disable-and-show) actions the
  current role/state may not perform, unless disabled+explained is explicitly required.
- Single-source-of-truth markers (e.g. "current version") appear only on the authoritative
  item, and are visually unambiguous.

## R6 — Layout, responsive & density

- Respect the project layout tokens (max width, sidebar width, spacing grid).
- Desktop-first or mobile-first per the screen's target persona, but define the breakpoint
  behavior (nav collapse, table→cards, header stacking).
- Prefer a short nominal path (progressive disclosure) over dense do-everything screens.

## R7 — Production-grade craft

- Real, working, self-contained code (interactions functional, not mocked screenshots).
- CSS variables for tokens; no magic numbers scattered inline.
- Meticulous spacing, alignment, and refined interactive states (hover/active/focus).
- Motion is purposeful and restrained; one considered page-load reveal beats scattered
  micro-animations.

## Applied-to-reference checklist

When producing or reviewing a screen, confirm each rule is satisfied and, for the
reference screen, that it is *demonstrated*:

| Rule | Demonstrated in reference screen |
|---|---|
| R1 tokens | eDataDoc brand ramp + Segoe UI + spacing tokens as CSS variables |
| R2 states | Empty (Logistique cloisonnée, Décisions), overdue error, permission-denied pattern |
| R3 a11y | ARIA tablist + arrow keys, `:focus-visible`, skip link, `aria-hidden` on decorative SVG, `role="status"` banner |
| R4 language | FR labels + EN canonical in tooltip; status mapping from design-system |
| R5 rules | "Version faisant foi" only on current doc; confidential banner; cloisonnement |
| R6 layout | AppShell max-width, sidebar, tab overflow, responsive intent |
| R7 craft | Functional tabs, token variables, refined states, restrained motion |
