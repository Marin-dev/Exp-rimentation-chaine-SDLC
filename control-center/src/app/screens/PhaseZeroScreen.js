import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Api } from "../api/client.js";
import { Button, Card, Field, FileInput, Pill, SectionHeader } from "../components/Primitives.js";
import { ey } from "../theme/ey.js";
import { formatSize, readBrowserFile } from "../utils/files.js";

export function PhaseZeroScreen({ state, refresh }) {
  const [folderPath, setFolderPath] = useState("");
  const [intake, setIntake] = useState(null);
  const [answers, setAnswers] = useState({});
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState("");
  const [actionFile, setActionFile] = useState("");
  const [error, setError] = useState("");

  async function scan() {
    const result = await Api.scanIntake(folderPath);
    setIntake(result);
  }

  async function importFiles(event) {
    const selected = [...event.target.files];
    const files = (await Promise.all(selected.map(readBrowserFile))).filter(Boolean);
    const imported = await Api.importIntake({
      name: selected[0]?.webkitRelativePath?.split("/")[0] || "intake",
      files
    });
    setFolderPath(imported.folderPath);
    const result = await Api.scanIntake(imported.folderPath);
    setIntake(result);
  }

  async function answer(question) {
    await Api.answerG0({
      questionId: question.id,
      questionPrompt: question.prompt,
      answer: answers[question.id] || "",
      linkedIntakePath: folderPath
    });
    setMessage("Réponse enregistrée.");
    await refresh();
  }

  async function prepareG0() {
    setError("");
    const result = await Api.prepareAction({
      agent: "@project-bootstrapper",
      title: "Initialiser le cahier des charges",
      intakePath: folderPath,
      instruction:
        "Analyse le dossier d'intake et les réponses G0 enregistrées. Si des informations structurantes manquent, ne les invente pas: produis .claude/control-center/g0-open-questions.json avec les questions à poser à l'utilisateur. Si le contexte est suffisant, produis le profil projet actif, l'arborescence /livrables et le rapport /livrables/_governance/gates/G0-project-context-ready.md."
    });
    setPreview(result.prompt);
    setActionFile(result.actionFile);
  }

  async function runG0() {
    setError("");
    try {
      const result = await Api.runAction({
        agent: "@project-bootstrapper",
        title: "Initialiser le cahier des charges",
        intakePath: folderPath,
        instruction:
          "Analyse le dossier d'intake et les réponses G0 enregistrées. Si des informations structurantes manquent, ne les invente pas: produis .claude/control-center/g0-open-questions.json avec les questions à poser à l'utilisateur. Si le contexte est suffisant, produis le profil projet actif, l'arborescence /livrables et le rapport /livrables/_governance/gates/G0-project-context-ready.md."
      });
      setPreview(`Run lancé: ${result.id}\nLog: ${result.log}\nAction: ${result.actionFile}`);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <Card>
        <SectionHeader
          title="Lancement projet - Initialisation du cahier des charges"
          subtitle="Transformer les documents bruts et les réponses humaines en contexte projet exploitable."
          right={<Pill label="Pré-G0" tone="info" />}
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Chemin dossier intake" value={folderPath} onChangeText={setFolderPath} placeholder="C:\\...\\project-intake" />
          </View>
          <Button label="Scanner" onPress={scan} variant="secondary" />
          <Button label="Préparer analyse agent" onPress={prepareG0} />
          <Button label="Lancer Claude Code" onPress={runG0} disabled={!state.claudeAvailable} />
        </View>
        <View style={styles.fileRow}>
          <Text style={styles.label}>Importer un dossier ou des fichiers</Text>
          <FileInput directory onChange={importFiles} />
        </View>
        {intake ? (
          <View style={styles.summary}>
            <Pill label={`${intake.summary.totalFiles} fichiers`} tone="info" />
            <Pill label={`${intake.summary.readableFiles} lisibles`} tone="success" />
            <Text style={styles.path}>{intake.folderPath}</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <SectionHeader title="Prompt de lancement" right={<Pill label={actionFile || "non sauvegardé"} />} />
        <Text style={styles.preview}>{preview || "Prépare l'analyse agent pour générer le prompt de lancement projet."}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!state.claudeAvailable ? <Text style={styles.warning}>Claude Code est à configurer dans l'écran Configuration.</Text> : null}
      </Card>

      <Card>
        <SectionHeader
          title="Questions ouvertes posées par l'agent"
          subtitle="Ces questions proviennent des artefacts générés par @project-bootstrapper, pas d'un questionnaire prédéfini dans l'application."
          right={<Pill label={`${state.g0Questions.length} question(s) agent`} tone={state.g0Questions.length ? "warning" : "neutral"} />}
        />
        <View style={styles.questions}>
          {state.g0Questions.length ? (
            state.g0Questions.map((question) => (
              <View key={question.id} style={styles.question}>
                <View style={styles.questionHeader}>
                  <Text style={styles.questionTitle}>{question.label}</Text>
                  <Pill label={question.severity} tone={question.severity === "critical" ? "danger" : "warning"} />
                </View>
                <Text style={styles.questionPrompt}>{question.prompt}</Text>
                <Text style={styles.source}>Source: {question.source || "agent"}</Text>
                <Field
                  label="Réponse humaine"
                  value={answers[question.id] || ""}
                  onChangeText={(value) => setAnswers({ ...answers, [question.id]: value })}
                  multiline
                  rows={3}
                />
                <View style={styles.questionFooter}>
                  <Text style={styles.existing}>{question.responses?.length || 0} réponse(s) enregistrée(s)</Text>
                  <Button label="Enregistrer réponse" onPress={() => answer(question)} variant="secondary" />
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Aucune question ouverte détectée.</Text>
              <Text style={styles.emptyText}>
                Lance @project-bootstrapper. S'il identifie des manques structurants, il doit générer
                .claude/control-center/g0-open-questions.json ou .claude/control-center/g0-open-questions.md.
              </Text>
            </View>
          )}
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </Card>

      {intake ? (
        <Card>
          <SectionHeader title="Fichiers intake" />
          <View style={styles.fileList}>
            {intake.files.slice(0, 80).map((file) => (
              <View key={file.path} style={styles.fileItem}>
                <Text style={styles.fileName}>{file.path}</Text>
                <Text style={styles.fileMeta}>{file.extension} · {formatSize(file.size)} · {file.readable ? "lisible" : "non lisible"}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end"
  },
  fileRow: {
    marginTop: 14,
    gap: 8
  },
  label: {
    color: ey.colors.text,
    fontWeight: "800"
  },
  summary: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  path: {
    color: ey.colors.muted,
    fontSize: 12
  },
  questions: {
    gap: 12
  },
  question: {
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    backgroundColor: ey.colors.offWhite,
    gap: 10
  },
  questionHeader: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  questionTitle: {
    color: ey.colors.text,
    fontWeight: "900",
    fontSize: 15
  },
  questionPrompt: {
    color: ey.colors.muted,
    lineHeight: 20
  },
  source: {
    color: ey.colors.gray01,
    fontSize: 12,
    fontWeight: "700"
  },
  questionFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  existing: {
    color: ey.colors.muted,
    fontSize: 12
  },
  emptyState: {
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: ey.colors.offWhite,
    padding: 18
  },
  emptyTitle: {
    color: ey.colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  emptyText: {
    color: ey.colors.muted,
    lineHeight: 20,
    marginTop: 8
  },
  message: {
    marginTop: 12,
    color: ey.colors.success,
    fontWeight: "800"
  },
  preview: {
    minHeight: 220,
    maxHeight: 420,
    overflow: "auto",
    backgroundColor: ey.colors.confidentBlack,
    color: ey.colors.white,
    borderRadius: 8,
    padding: 14,
    fontFamily: "Consolas, monospace",
    whiteSpace: "pre-wrap",
    lineHeight: 19
  },
  warning: {
    color: ey.colors.warning,
    fontWeight: "800",
    marginTop: 10
  },
  error: {
    color: ey.colors.danger,
    fontWeight: "800",
    marginTop: 10
  },
  fileList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 8
  },
  fileItem: {
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    backgroundColor: ey.colors.offWhite
  },
  fileName: {
    color: ey.colors.text,
    fontWeight: "800"
  },
  fileMeta: {
    color: ey.colors.muted,
    marginTop: 4,
    fontSize: 12
  }
});
