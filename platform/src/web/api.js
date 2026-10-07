async function request(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Réponse invalide du serveur (${res.status}).`);
  }
  if (!res.ok) {
    throw new Error(data.error || data.message || `Erreur serveur (${res.status}).`);
  }
  return data;
}

export const Api = {
  getState: () => request("/api/state"),
  getDeliverable: (path) =>
    request(`/api/deliverable?path=${encodeURIComponent(path)}`),
  setWorkspace: (workspaceRoot) =>
    request("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceRoot })
    }),
  newProject: (path) =>
    request("/api/projects/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    }),
  pickFolder: (initial) =>
    request("/api/pick-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initial })
    }),
  createSkill: (name, description, scope) =>
    request("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, scope })
    }),
  createAgent: (name, description, tools, scope) =>
    request("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, tools, scope })
    }),
  searchSkills: (name, description) =>
    request("/api/skills/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description })
    }),
  createDecision: (payload) =>
    request("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  answerDecision: (payload) =>
    request("/api/decisions/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  answerItemsAuto: (ids, decidedBy) =>
    request("/api/decisions/answer-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, decidedBy })
    }),
  resolveViaAgent: (payload) =>
    request("/api/decisions/resolve-via-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  auditDecisions: (scope, profileId) =>
    request("/api/decisions/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, profileId })
    }),
  addInput: (phaseId, filename, contentBase64, description) =>
    request("/api/inputs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId, filename, contentBase64, description })
    }),
  setInputStatus: (id, status) =>
    request("/api/inputs/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status })
    }),
  removeInput: (id) =>
    request("/api/inputs/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    }),
  reopenDecision: (id) =>
    request("/api/decisions/reopen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    }),
  scanIntake: (path) =>
    request("/api/intake/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    }),
  startG0: (intakePath) =>
    request("/api/runs/g0", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intakePath })
    }),
  startNewNeed: (description, documents) =>
    request("/api/runs/new-need", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, documents })
    }),
  startPhase: (phaseId) =>
    request("/api/runs/phase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId })
    }),
  startPhaseParallel: (phaseId) =>
    request("/api/runs/phase-parallel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId })
    }),
  startDevBatches: () =>
    request("/api/runs/dev-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }),
  getDevBatchesPlan: () => request("/api/runs/dev-batches/plan"),
  getUsReport: () => request("/api/dev/us-report"),
  getGroup: (groupId) => request(`/api/runs/group/${encodeURIComponent(groupId)}`),
  getActiveRuns: () => request("/api/runs/active"),
  startReview: (phaseId) =>
    request("/api/runs/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId })
    }),
  remediateRisks: (phaseId) =>
    request("/api/runs/remediate-risks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId })
    }),
  chat: (phaseId, message, history, by) =>
    request("/api/runs/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId, message, history, by })
    }),
  orchestratorChat: (message, history) =>
    request("/api/runs/orchestrator-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history })
    }),
  orchestratorActions: () => request("/api/orchestrator/actions"),
  orchestratorAct: (action) =>
    request("/api/orchestrator/act", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    }),
  autopilotStatus: () => request("/api/autopilot/status"),
  autopilotStart: (requestText, settings) =>
    request("/api/autopilot/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: requestText, settings: settings || null })
    }),
  autopilotStop: () =>
    request("/api/autopilot/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }),
  autopilotAnswer: (payload) =>
    request("/api/autopilot/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  addFeedback: (docPath, comment, phaseId, by) =>
    request("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docPath, comment, phaseId, by })
    }),
  getRisks: () => request("/api/risks"),
  createRisk: (payload) =>
    request("/api/risks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  setRiskStatus: (payload) =>
    request("/api/risks/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  seedRisks: () =>
    request("/api/risks/seed", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
  resolveRiskViaAgent: (id) =>
    request("/api/risks/resolve-via-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    }),
  resolveRisksBatch: (ids) =>
    request("/api/risks/resolve-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
    }),
  integrateDecisions: (ids) =>
    request("/api/decisions/integrate-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
    }),
  getTasks: () => request("/api/tasks"),
  createTask: (payload) =>
    request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  setTaskStatus: (payload) =>
    request("/api/tasks/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  runTaskBatch: (ids) =>
    request("/api/tasks/run-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
    }),
  getSpend: () => request("/api/spend"),
  getActivity: () => request("/api/activity"),
  setPricing: (pricing) =>
    request("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricing })
    }),
  appStatus: () => request("/api/app/status"),
  appStart: (which) =>
    request("/api/app/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ which })
    }),
  appStop: (which) =>
    request("/api/app/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ which })
    }),
  appDetect: (agent) =>
    request("/api/app/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent })
    }),
  setAppConfig: (app) =>
    request("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app })
    }),
  setPolicies: (policies) =>
    request("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policies })
    }),
  setPermissionMode: (permissionMode) =>
    request("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionMode })
    }),
  setAutopilotSettings: (autopilot) =>
    request("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autopilot })
    }),
  gitStatus: () => request("/api/git/status"),
  gitAction: (action, params) =>
    request("/api/git/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, params: params || {} })
    }),
  githubStatus: () => request("/api/git/github-status"),
  gitPublish: (repo, visibility, token) =>
    request("/api/git/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo, visibility, token })
    }),
  resumeRun: (runId, phaseId) =>
    request("/api/runs/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, phaseId })
    }),
  uploadFile: (itemId, filename, contentBase64) =>
    request("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, filename, contentBase64 })
    })
};

