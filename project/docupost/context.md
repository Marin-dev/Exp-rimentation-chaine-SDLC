# DocuPost Project Context

## Product Summary

DocuPost is a delivery route management platform for field couriers and logistics supervisors.
The MVP aims to reproduce the complete value chain from business vision to deployed software,
with a structured set of specialized AI agents.

## Business Goals

- Improve route preparation and daily delivery execution.
- Reduce delivery errors and unresolved incidents.
- Give supervisors a clearer operational view.
- Capture field feedback quickly enough to adjust the backlog.

## Primary Users

| User | Goals | Constraints |
|---|---|---|
| Field courier | Execute daily route, identify parcels, report delivery outcomes and incidents | Mobile usage, time pressure, intermittent connectivity |
| Logistics supervisor | Prepare and monitor routes, react to incidents, support couriers | Operational visibility, prioritization, reliable metrics |

## Domain Seed

Initial domain terms, to be confirmed through UX and domain architecture:

- Tournee
- Colis
- Livraison
- Incident
- Superviseur
- Livreur
- Itineraire
- Adresse
- Preuve de livraison

## Delivery Assumptions

- Deliver one vertical slice per User Story.
- Preserve traceability from business objective to code, tests, security review, and feedback.
- Keep the MVP scope explicit and challenge new needs through the mini-chain defined by the orchestrator.

## Out Of Scope For Core Agents

Core agents must not assume that future projects involve logistics, parcels, couriers, Tailwind, GCP, or any DocuPost-specific integration.
