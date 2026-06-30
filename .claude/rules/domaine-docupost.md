# DocuPost Domain Notes

This file is project-specific and exists for compatibility with the original architecture.
Core agents must not copy these domain assumptions into their generic instructions.

For the active project profile, read:

- `project/PROJECT.md`
- `project/docupost/context.md`
- `project/docupost/stack.md`
- `project/docupost/security-context.md`

## Domain Seed

These words are a starting point only. `@ux` and `@architecte-metier` must confirm,
refine, or replace them through user journeys and ubiquitous language work.

| Term | Initial meaning |
|---|---|
| Tournee | Set of delivery stops assigned to a courier for a day or period |
| Colis | Parcel or shipment unit to be delivered |
| Livreur | Field user who executes the route |
| Superviseur | Operational user who prepares, monitors, and supports routes |
| Incident | Event that prevents or complicates normal delivery |
| Preuve de livraison | Evidence that delivery was completed |

## Reuse Rule

When reusing this architecture for another project, replace this file with the new
domain seed or point it to the new project-specific domain context.
