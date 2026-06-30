export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Erreur API");
  return data;
}

export const Api = {
  state: () => api("/api/state"),
  readDeliverable: (path) => api(`/api/deliverables/content?path=${encodeURIComponent(path)}`),
  saveConfig: (body) => api("/api/config", { method: "POST", body }),
  scanIntake: (folderPath) => api("/api/intake/scan", { method: "POST", body: { folderPath } }),
  importIntake: (body) => api("/api/intake/import", { method: "POST", body }),
  prepareAction: (body) => api("/api/actions/prepare", { method: "POST", body }),
  runAction: (body) => api("/api/actions/run", { method: "POST", body }),
  createHumanReview: (body) => api("/api/human-reviews", { method: "POST", body }),
  createChangeRequest: (body) => api("/api/change-requests", { method: "POST", body }),
  answerG0: (body) => api("/api/g0/answers", { method: "POST", body })
};
