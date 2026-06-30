import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Api } from "../api/client.js";
import { Button, Card, Field, FileInput, Pill, SectionHeader, Select } from "../components/Primitives.js";
import { ey } from "../theme/ey.js";
import { readBrowserFile } from "../utils/files.js";

export function NewNeedsScreen({ state, refresh, setActionDraft }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    origin: "Utilisateur",
    impact: "",
    urgency: "normal"
  });
  const [sourceFiles, setSourceFiles] = useState([]);
  const [message, setMessage] = useState("");

  async function selectSources(event) {
    const selected = [...event.target.files];
    const files = (await Promise.all(selected.map(readBrowserFile))).filter(Boolean);
    setSourceFiles(files);
  }

  async function submit() {
    const request = await Api.createChangeRequest({ ...form, sourceFiles });
    setMessage(`Nouveau besoin enregistré: ${request.id}`);
    await refresh();
  }

  function prepareAnalysis() {
    const sourceSummary = sourceFiles.length
      ? `\nSources jointes:\n${sourceFiles
          .map((file) => `\n--- ${file.path} ---\n${file.content.slice(0, 4000)}`)
          .join("\n")}`
      : "";
    setActionDraft({
      screen: "phase-G1",
      template: "new-need",
      agent: "",
      title: "Qualifier un nouveau besoin",
      changeRequest: `${form.title}\n${form.description}\nImpact: ${form.impact}${sourceSummary}`,
      instruction:
        "Analyse le nouveau besoin et ses sources. Requalifie l'impact sur vision, discovery, architecture, backlog et sécurité. Indique les phases à réouvrir et les livrables à mettre à jour."
    });
  }

  return (
    <>
      <Card>
        <SectionHeader
          title="Nouveau besoin"
          subtitle="Introduire un besoin en cours de route avec ses sources, par exemple un CR, un mail ou une note métier."
          right={<Pill label="Change intake" tone="info" />}
        />
        <View style={styles.formGrid}>
          <Field label="Titre" value={form.title} onChangeText={(title) => setForm({ ...form, title })} />
          <Select label="Urgence" value={form.urgency} onChange={(urgency) => setForm({ ...form, urgency })}>
            <option value="low">Faible</option>
            <option value="normal">Normale</option>
            <option value="high">Haute</option>
            <option value="critical">Critique</option>
          </Select>
          <Field label="Origine" value={form.origin} onChangeText={(origin) => setForm({ ...form, origin })} />
          <Field label="Impact pressenti" value={form.impact} onChangeText={(impact) => setForm({ ...form, impact })} />
          <Field label="Description" value={form.description} onChangeText={(description) => setForm({ ...form, description })} multiline rows={6} />
          <View style={styles.sources}>
            <Text style={styles.sourceLabel}>Sources du besoin</Text>
            <FileInput onChange={selectSources} label="Joindre des sources" />
            <Text style={styles.sourceHint}>{sourceFiles.length} fichier(s) texte prêt(s) à être attaché(s)</Text>
          </View>
          <View style={styles.buttons}>
            <Button label="Enregistrer" onPress={submit} />
            <Button label="Préparer analyse en phase Vision" onPress={prepareAnalysis} variant="secondary" />
          </View>
        </View>
        {sourceFiles.length ? (
          <View style={styles.sourceList}>
            {sourceFiles.map((file) => (
              <Text key={file.path} style={styles.sourceItem}>{file.path}</Text>
            ))}
          </View>
        ) : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </Card>

      <Card>
        <SectionHeader title="Besoins enregistrés" right={<Pill label={`${state.changeRequests.length}`} />} />
        <View style={styles.list}>
          {state.changeRequests.map((request) => (
            <View key={request.id} style={styles.item}>
              <Text style={styles.title}>{request.title}</Text>
              <Text style={styles.meta}>{request.urgency} · {request.origin} · {request.createdAt}</Text>
              <Text style={styles.description}>{request.description}</Text>
              {request.sourceFiles?.length ? (
                <View style={styles.sourceList}>
                  {request.sourceFiles.map((file) => (
                    <Text key={file.path} style={styles.sourceItem}>{file.path}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12
  },
  sources: {
    gap: 7
  },
  sourceLabel: {
    color: ey.colors.offBlack,
    fontSize: 13,
    fontWeight: "800"
  },
  sourceHint: {
    color: ey.colors.muted,
    fontSize: 12
  },
  sourceList: {
    marginTop: 12,
    gap: 6
  },
  sourceItem: {
    color: ey.colors.offBlack,
    backgroundColor: ey.colors.offWhite,
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    fontWeight: "700"
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end"
  },
  message: {
    color: ey.colors.success,
    fontWeight: "800",
    marginTop: 12
  },
  list: {
    gap: 10
  },
  item: {
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    backgroundColor: ey.colors.offWhite
  },
  title: {
    color: ey.colors.text,
    fontWeight: "900"
  },
  meta: {
    color: ey.colors.muted,
    marginTop: 4,
    fontSize: 12
  },
  description: {
    color: ey.colors.text,
    marginTop: 8,
    lineHeight: 20
  }
});
