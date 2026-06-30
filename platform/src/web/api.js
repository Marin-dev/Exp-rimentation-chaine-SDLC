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
    throw new Error(data.error || `Erreur serveur (${res.status}).`);
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
  createSkill: (name, description) =>
    request("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description })
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
  getGroup: (groupId) => request(`/api/runs/group/${encodeURIComponent(groupId)}`),
  startReview: (phaseId) =>
    request("/api/runs/review", {
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
  addFeedback: (docPath, comment, phaseId, by) =>
    request("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docPath, comment, phaseId, by })
    }),
  getSpend: () => request("/api/spend"),
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
  gitStatus: () => request("/api/git/status"),
  gitAction: (action, params) =>
    request("/api/git/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, params: params || {} })
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

