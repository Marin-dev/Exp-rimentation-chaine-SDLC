import { readGates } from "./gates.js";
import { closePhaseTasks } from "./tasks-store.js";

// ONLY a clean PASS closes a phase's tasks. PASS_WITH_RISK explicitly means residual work
// or risk remains — its open tasks are usually the very remediation of that risk, so closing
// them would erase real work. A phase converges (and its backlog clears) only when it fully passes.
const PASSED = new Set(["PASS"]);

/**
 * Convergence reconcile: for every phase whose gate has passed, close out its still-live
 * tasks (candidates, todo, in-progress). A finished phase must not keep dragging a backlog.
 * Idempotent and cheap (writes only when something actually closes), so it is safe to call
 * on every state read — the closure then self-heals regardless of which run produced the gate.
 * Returns { closed }.
 */
export function closePassedPhaseTasks(paths, { by } = {}) {
  let gates;
  try { gates = readGates(paths); } catch { return { closed: 0 }; }
  let closed = 0;
  for (const g of Object.values(gates || {})) {
    if (g && PASSED.has(String(g.status || "").toUpperCase())) {
      closed += closePhaseTasks(paths, g.id, { by: by || "gate", gateStatus: g.status }).closed;
    }
  }
  return { closed };
}
