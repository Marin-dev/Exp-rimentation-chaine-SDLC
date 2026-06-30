import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Api } from "../api/client.js";
import { actionTemplates } from "../data/process.js";
import { Button, Card, Field, Pill, SectionHeader, Select } from "../components/Primitives.js";
import { ey } from "../theme/ey.js";
import { formatSize } from "../utils/files.js";

function toneFor(status) {
  if (status === "PASS") return "success";
  if (status === "FAIL") return "danger";
  if (status === "PASS_WITH_RISK" || status === "unknown") return "warning";
  return "neutral";
}

function firstAgent(owner = "") {
  return owner.match(/@[a-zA-Z0-9_-]+/)?.[0] || "";
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function templatesForPhase(phaseId) {
  return actionTemplates.filter((template) => template.phaseId === phaseId || template.phaseId === "*");
}

function buildReviewContext(phase, selectedDocPath, reviewForm) {
  return [
    `Phase: ${phase.id} - ${phase.title}`,
    `Document cible: ${selectedDocPath || "revue generale de phase"}`,
    reviewForm.quotedText ? `Passage ou choix cible:\n${reviewForm.quotedText}` : "",
    reviewForm.comment ? `Feedback humain:\n${reviewForm.comment}` : "",
    reviewForm.expectedChange ? `Correction attendue:\n${reviewForm.expectedChange}` : "",
    `Decision humaine: ${reviewForm.status}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function PhaseControlScreen({ phaseId, state, refresh, actionDraft, clearActionDraft }) {
  const phase = useMemo(
    () => (state.phaseWorkspaces || []).find((item) => item.id === phaseId),
    [phaseId, state.phaseWorkspaces]
  );
  const templates = useMemo(() => templatesForPhase(phaseId), [phaseId]);
  const defaultTemplate = templates[0] || actionTemplates[actionTemplates.length - 1];

  const [commandForm, setCommandForm] = useState({
    template: defaultTemplate.id,
    title: defaultTemplate.label,
    agent: defaultTemplate.agent,
    instruction: defaultTemplate.instruction,
    extraContext: "",
    reviewContext: "",
    changeRequest: "",
    intakePath: ""
  });
  const [selectedDocPath, setSelectedDocPath] = useState("");
  const [document, setDocument] = useState(null);
  const [loadingDoc, setLoadingDoc] = useState("");
  const [reviewForm, setReviewForm] = useState({
    status: "needs_changes",
    title: "",
    quotedText: "",
    comment: "",
    expectedChange: "",
    requestedAgent: ""
  });
  const [preview, setPreview] = useState("");
  const [actionFile, setActionFile] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const nextDefault = templatesForPhase(phaseId)[0] || actionTemplates[actionTemplates.length - 1];
    setCommandForm({
      template: nextDefault.id,
      title: nextDefault.label,
      agent: nextDefault.agent,
      instruction: nextDefault.instruction,
      extraContext: "",
      reviewContext: "",
      changeRequest: "",
      intakePath: ""
    });
    setSelectedDocPath("");
    setDocument(null);
    setReviewForm({
      status: "needs_changes",
      title: "",
      quotedText: "",
      comment: "",
      expectedChange: "",
      requestedAgent: ""
    });
    setPreview("");
    setActionFile("");
    setMessage("");
    setError("");
  }, [phaseId]);

  useEffect(() => {
    if (!phase) return;
    const stillValid = phase.docs.some((doc) => doc.path === selectedDocPath);
    if (!stillValid) {
      setSelectedDocPath(phase.docs[0]?.path || "");
      setDocument(null);
    }
    setReviewForm((current) => ({
      ...current,
      requestedAgent: current.requestedAgent || firstAgent(phase.owner)
    }));
  }, [phase, selectedDocPath]);

  useEffect(() => {
    let cancelled = false;
    async function loadDocument() {
      if (!selectedDocPath) {
        setDocument(null);
        setLoadingDoc("");
        return;
      }
      setLoadingDoc("Chargement du livrable...");
      try {
        const result = await Api.readDeliverable(selectedDocPath);
        if (!cancelled) {
          setDocument(result);
          setLoadingDoc("");
        }
      } catch (err) {
        if (!cancelled) {
          setDocument(null);
          setLoadingDoc(err.message);
        }
      }
    }
    loadDocument();
    return () => {
      cancelled = true;
    };
  }, [selectedDocPath]);

  useEffect(() => {
    if (!actionDraft) return;
    setCommandForm((current) => ({ ...current, ...actionDraft }));
    clearActionDraft?.();
  }, [actionDraft, clearActionDraft]);

  function applyTemplate(templateId) {
    const template = templates.find((item) => item.id === templateId);
    setCommandForm({
      ...commandForm,
      template: templateId,
      title: template?.label || "Action phase",
      agent: template?.agent || "",
      instruction: template?.instruction || ""
    });
  }

  function commandBody(overrides = {}) {
    const next = { ...commandForm, ...overrides };
    return {
      title: next.title || "Action phase",
      agent: next.agent,
      instruction: next.instruction,
      intakePath: next.intakePath,
      extraContext: next.extraContext,
      reviewContext: next.reviewContext,
      changeRequest: next.changeRequest
    };
  }

  async function prepare() {
    setError("");
    const result = await Api.prepareAction(commandBody());
    setPreview(result.prompt);
    setActionFile(result.actionFile);
  }

  async function run() {
    setError("");
    try {
      const result = await Api.runAction(commandBody());
      setPreview(`Run lance: ${result.id}\nLog: ${result.log}\nAction: ${result.actionFile}`);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveReview() {
    if (!phase) return;
    const body = {
      gate: phase.id,
      phaseTitle: phase.title,
      status: reviewForm.status,
      target: selectedDocPath || reviewForm.title || `${phase.id} - ${phase.title}`,
      documentPath: selectedDocPath,
      quotedText: reviewForm.quotedText,
      expectedChange: reviewForm.expectedChange,
      title: reviewForm.title || `Revue ${phase.id}`,
      comment: reviewForm.comment,
      requestedAgent: reviewForm.requestedAgent || firstAgent(phase.owner)
    };
    const review = await Api.createHumanReview(body);
    setMessage(`Revue enregistree: ${review.id}`);
    await refresh();
  }

  async function prepareCorrection() {
    if (!phase) return;
    const reviewContext = buildReviewContext(phase, selectedDocPath, reviewForm);
    const correction = {
      template: "custom",
      title: `Correction revue humaine ${phase.id}`,
      agent: reviewForm.requestedAgent || firstAgent(phase.owner),
      instruction:
        "Prends en compte la revue humaine ci-dessous. Mets a jour les livrables concernes, explicite les choix modifies, puis prepare les elements necessaires pour repasser le gate de la phase.",
      reviewContext
    };
    setCommandForm((current) => ({ ...current, ...correction }));
    setError("");
    const result = await Api.prepareAction(commandBody(correction));
    setPreview(result.prompt);
    setActionFile(result.actionFile);
  }

  function targetDecision(decision) {
    setSelectedDocPath(decision.documentPath);
    setReviewForm((current) => ({
      ...current,
      quotedText: decision.excerpt || decision.title,
      title: current.title || `Revue ${decision.title.slice(0, 80)}`
    }));
  }

  if (!phase) {
    return (
      <Card>
        <SectionHeader title="Phase introuvable" />
        <Text style={styles.emptyText}>La phase {phaseId} n'est pas disponible dans l'etat courant.</Text>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <SectionHeader
          title={`${phase.id} - ${phase.title}`}
          subtitle={phase.subtitle}
          right={<Pill label={phase.status} tone={toneFor(phase.status)} />}
        />
        <View style={styles.heroGrid}>
          <View style={styles.phaseSummary}>
            <Text style={styles.owner}>{phase.owner}</Text>
            <Text style={styles.control}>{phase.humanControl}</Text>
            <View style={styles.expectedList}>
              {phase.expectedOutputs.map((output) => (
                <Text key={output} style={styles.expectedItem}>{output}</Text>
              ))}
            </View>
          </View>
          <View style={styles.kpiGrid}>
            <Metric label="Livrables" value={phase.progress.docs} />
            <Metric label="Choix" value={phase.progress.decisions} />
            <Metric label="Revues" value={phase.progress.reviews} />
            <Metric label="Gate" value={phase.status} />
          </View>
        </View>
      </Card>

      <View style={styles.workspaceGrid}>
        <View style={styles.leftColumn}>
          <Card>
            <SectionHeader title="Commandes de phase" subtitle="Les commandes proposees dependent de la phase active." />
            <View style={styles.form}>
              <Select label="Template phase" value={commandForm.template} onChange={applyTemplate}>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.label}</option>
                ))}
              </Select>
              <Select label="Agent" value={commandForm.agent} onChange={(agent) => setCommandForm({ ...commandForm, agent })}>
                <option value="">Orchestrateur</option>
                {state.agents.map((agent) => (
                  <option key={agent.id} value={`@${agent.id}`}>@{agent.id}</option>
                ))}
              </Select>
              <Field label="Titre action" value={commandForm.title} onChangeText={(title) => setCommandForm({ ...commandForm, title })} />
              <Field label="Instruction" value={commandForm.instruction} onChangeText={(instruction) => setCommandForm({ ...commandForm, instruction })} multiline rows={7} />
              <Field label="Nouveau besoin / changement" value={commandForm.changeRequest} onChangeText={(changeRequest) => setCommandForm({ ...commandForm, changeRequest })} multiline rows={4} />
              <Field label="Contexte revue humaine" value={commandForm.reviewContext} onChangeText={(reviewContext) => setCommandForm({ ...commandForm, reviewContext })} multiline rows={4} />
              <Field label="Contexte complementaire" value={commandForm.extraContext} onChangeText={(extraContext) => setCommandForm({ ...commandForm, extraContext })} multiline rows={4} />
              <View style={styles.buttons}>
                <Button label="Preparer prompt" onPress={prepare} variant="secondary" />
                <Button label="Lancer Claude Code" onPress={run} disabled={!state.claudeAvailable} />
              </View>
              {!state.claudeAvailable ? <Text style={styles.warning}>Claude Code est a configurer dans l'ecran Configuration.</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          </Card>

          <Card>
            <SectionHeader title="Livrables de phase" right={<Pill label={`${phase.docs.length}`} />} />
            <View style={styles.list}>
              {phase.docs.length ? phase.docs.map((doc) => (
                <Pressable
                  key={doc.path}
                  onPress={() => setSelectedDocPath(doc.path)}
                  style={[styles.docItem, selectedDocPath === doc.path ? styles.docItemActive : null]}
                >
                  <View style={styles.docTop}>
                    <Text style={styles.docTitle}>{doc.title}</Text>
                    <Pill label={doc.kind} />
                  </View>
                  <Text style={styles.docPath}>{doc.path}</Text>
                  <Text style={styles.docMeta}>{formatSize(doc.size)} - modifie {formatDate(doc.modifiedAt)}</Text>
                </Pressable>
              )) : <Text style={styles.emptyText}>Aucun livrable Markdown trouve pour cette phase.</Text>}
            </View>
          </Card>

          <Card>
            <SectionHeader title="Choix structurants a relire" right={<Pill label={`${phase.decisions.length}`} />} />
            <View style={styles.list}>
              {phase.decisions.length ? phase.decisions.map((decision) => (
                <Pressable key={decision.id} style={styles.decision} onPress={() => targetDecision(decision)}>
                  <Text style={styles.decisionTitle}>{decision.title}</Text>
                  <Text style={styles.docPath}>{decision.documentPath}:{decision.line}</Text>
                  {decision.excerpt ? <Text style={styles.decisionExcerpt}>{decision.excerpt}</Text> : null}
                </Pressable>
              )) : <Text style={styles.emptyText}>Aucun choix structurant extrait pour cette phase.</Text>}
            </View>
          </Card>
        </View>

        <View style={styles.rightColumn}>
          <Card>
            <SectionHeader
              title={document?.title || "Lecture du livrable"}
              subtitle={selectedDocPath || "Selectionne un document de la phase, ou fais une revue generale."}
              right={<Pill label={document ? "Markdown" : "Aucun doc"} tone={document ? "success" : "neutral"} />}
            />
            <Text style={styles.markdown}>{loadingDoc || document?.content || "Aucun contenu a afficher pour l'instant."}</Text>
          </Card>

          <Card>
            <SectionHeader
              title="Revue humaine de la phase"
              subtitle="Controle le livrable, cible un passage ou un choix, puis demande une correction agent si necessaire."
              right={<Pill label="HITL phase" tone="info" />}
            />
            <View style={styles.form}>
              <Select label="Decision" value={reviewForm.status} onChange={(status) => setReviewForm({ ...reviewForm, status })}>
                <option value="approved">Approuve</option>
                <option value="needs_changes">Corrections demandees</option>
                <option value="rejected">Rejete</option>
              </Select>
              <Select label="Agent a relancer" value={reviewForm.requestedAgent || firstAgent(phase.owner)} onChange={(requestedAgent) => setReviewForm({ ...reviewForm, requestedAgent })}>
                <option value="">Orchestrateur</option>
                {state.agents.map((agent) => (
                  <option key={agent.id} value={`@${agent.id}`}>@{agent.id}</option>
                ))}
              </Select>
              <Field label="Titre de la revue" value={reviewForm.title} onChangeText={(title) => setReviewForm({ ...reviewForm, title })} />
              <Field label="Passage ou choix cible" value={reviewForm.quotedText} onChangeText={(quotedText) => setReviewForm({ ...reviewForm, quotedText })} multiline rows={4} />
              <Field label="Ce qui ne va pas / commentaire" value={reviewForm.comment} onChangeText={(comment) => setReviewForm({ ...reviewForm, comment })} multiline rows={4} />
              <Field label="Correction attendue" value={reviewForm.expectedChange} onChangeText={(expectedChange) => setReviewForm({ ...reviewForm, expectedChange })} multiline rows={4} />
              <View style={styles.buttons}>
                <Button label="Enregistrer revue" onPress={saveReview} />
                <Button label="Preparer correction agent" onPress={prepareCorrection} variant="secondary" />
              </View>
            </View>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </Card>

          <Card>
            <SectionHeader title="Historique des revues de la phase" right={<Pill label={`${phase.humanReviews.length}`} />} />
            <View style={styles.list}>
              {phase.humanReviews.length ? phase.humanReviews.map((review) => (
                <View key={review.id} style={styles.review}>
                  <View style={styles.reviewTop}>
                    <Text style={styles.reviewTitle}>{review.title}</Text>
                    <Pill label={review.status} tone={review.status === "approved" ? "success" : "warning"} />
                  </View>
                  <Text style={styles.docPath}>{review.documentPath || review.target || "Aucune cible"} - {review.requestedAgent || "agent non defini"}</Text>
                  {review.quotedText ? <Text style={styles.reviewQuote}>{review.quotedText}</Text> : null}
                  {review.comment ? <Text style={styles.decisionExcerpt}>{review.comment}</Text> : null}
                  {review.expectedChange ? <Text style={styles.expectedChange}>{review.expectedChange}</Text> : null}
                </View>
              )) : <Text style={styles.emptyText}>Aucune revue humaine enregistree pour cette phase.</Text>}
            </View>
          </Card>

          <Card>
            <SectionHeader title="Prompt prepare" right={<Pill label={actionFile || "non sauvegarde"} />} />
            <Text style={styles.preview}>{preview || "Prepare une commande de phase ou une correction issue de revue humaine."}</Text>
          </Card>
        </View>
      </View>
    </>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 1.2fr) minmax(320px, 0.8fr)",
    gap: 18
  },
  phaseSummary: {
    gap: 10
  },
  owner: {
    color: ey.colors.offBlack,
    fontWeight: "900"
  },
  control: {
    color: ey.colors.text,
    lineHeight: 21,
    fontWeight: "700"
  },
  expectedList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  expectedItem: {
    backgroundColor: ey.colors.offWhite,
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 999,
    color: ey.colors.text,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
    gap: 10
  },
  metric: {
    backgroundColor: ey.colors.offWhite,
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12
  },
  metricValue: {
    color: ey.colors.confidentBlack,
    fontSize: 22,
    fontWeight: "900"
  },
  metricLabel: {
    color: ey.colors.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  workspaceGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(380px, 0.95fr) minmax(460px, 1.05fr)",
    gap: 18,
    alignItems: "start"
  },
  leftColumn: {
    gap: 18
  },
  rightColumn: {
    gap: 18
  },
  form: {
    gap: 12
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  warning: {
    color: ey.colors.warning,
    fontWeight: "800"
  },
  error: {
    color: ey.colors.danger,
    fontWeight: "800"
  },
  preview: {
    minHeight: 280,
    maxHeight: 520,
    overflow: "auto",
    backgroundColor: ey.colors.confidentBlack,
    color: ey.colors.white,
    borderRadius: 8,
    padding: 14,
    fontFamily: "Consolas, monospace",
    whiteSpace: "pre-wrap",
    lineHeight: 19
  },
  markdown: {
    minHeight: 280,
    maxHeight: 560,
    overflow: "auto",
    backgroundColor: ey.colors.confidentBlack,
    color: ey.colors.white,
    borderRadius: 8,
    padding: 14,
    fontFamily: "Consolas, monospace",
    whiteSpace: "pre-wrap",
    lineHeight: 20
  },
  list: {
    gap: 10
  },
  docItem: {
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    backgroundColor: ey.colors.offWhite
  },
  docItemActive: {
    borderColor: ey.colors.yellow,
    borderWidth: 3,
    backgroundColor: ey.colors.white
  },
  docTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  docTitle: {
    color: ey.colors.text,
    fontWeight: "900",
    flex: 1
  },
  docPath: {
    color: ey.colors.gray01,
    fontSize: 12,
    marginTop: 5
  },
  docMeta: {
    color: ey.colors.muted,
    fontSize: 12,
    marginTop: 4
  },
  decision: {
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: ey.colors.offWhite,
    padding: 12
  },
  decisionTitle: {
    color: ey.colors.text,
    fontWeight: "900"
  },
  decisionExcerpt: {
    color: ey.colors.muted,
    lineHeight: 19,
    marginTop: 8
  },
  review: {
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    backgroundColor: ey.colors.offWhite
  },
  reviewTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  reviewTitle: {
    color: ey.colors.text,
    fontWeight: "900"
  },
  reviewQuote: {
    color: ey.colors.offBlack,
    marginTop: 8,
    padding: 10,
    borderLeftColor: ey.colors.yellow,
    borderLeftWidth: 4,
    backgroundColor: ey.colors.white
  },
  expectedChange: {
    color: ey.colors.text,
    marginTop: 8,
    padding: 10,
    backgroundColor: ey.colors.white,
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 6,
    fontWeight: "700"
  },
  message: {
    color: ey.colors.success,
    fontWeight: "800",
    marginTop: 12
  },
  emptyText: {
    color: ey.colors.muted,
    lineHeight: 20
  }
});
