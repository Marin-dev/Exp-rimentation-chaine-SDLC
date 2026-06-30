import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card, Pill, SectionHeader } from "../components/Primitives.js";
import { ProcessStepper, currentGate } from "../components/ProcessStepper.js";
import { ey } from "../theme/ey.js";

function toneFor(status) {
  if (status === "PASS") return "success";
  if (status === "FAIL") return "danger";
  if (status === "PASS_WITH_RISK" || status === "unknown") return "warning";
  return "neutral";
}

export function DashboardScreen({ state }) {
  const gate = currentGate(state.gates);
  const phases = state.phaseWorkspaces || [];
  const passed = state.gates.filter((item) => item.status === "PASS").length;
  const producedDocs = phases.reduce((sum, phase) => sum + phase.progress.docs, 0);
  const decisions = phases.reduce((sum, phase) => sum + phase.progress.decisions, 0);

  return (
    <>
      <ProcessStepper gates={state.gates} phaseWorkspaces={phases} />

      <View style={styles.grid}>
        <Card>
          <SectionHeader title="Situation actuelle" right={<Pill label={gate?.id || "Gate"} tone="info" />} />
          <Metric label="Gates validés" value={`${passed}/${state.gates.length}`} />
          <Metric label="Livrables Markdown" value={producedDocs} />
          <Metric label="Choix structurants" value={decisions} />
          <Metric label="Claude Code" value={state.claudeAvailable ? "Disponible" : "À configurer"} />
        </Card>
        <Card>
          <SectionHeader title="Prochaine étape" subtitle="Le contrôleur propose l'action de pilotage la plus probable." />
          <Text style={styles.nextText}>{nextActionText(gate)}</Text>
          <Text style={styles.hint}>Le lancement réel se fait depuis l'onglet de la phase concernée, pour garder le contexte métier et les agents visibles.</Text>
        </Card>
      </View>

      <Card>
        <SectionHeader
          title="Carte d'avancement agents"
          subtitle="Vue phase par phase de la production attendue, des agents responsables et des points de contrôle."
          right={<Pill label={`${phases.length} phases`} />}
        />
        <View style={styles.agentBoard}>
          {phases.map((phase) => (
            <View key={phase.id} style={[styles.phaseCard, gate?.id === phase.id ? styles.phaseCardActive : null]}>
              <View style={styles.phaseTop}>
                <Text style={styles.phaseId}>{phase.id}</Text>
                <Pill label={phase.status} tone={toneFor(phase.status)} />
              </View>
              <Text style={styles.phaseTitle}>{phase.title}</Text>
              <Text style={styles.phaseOwner}>{phase.owner}</Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${Math.min(100, Math.round((phase.progress.produced / Math.max(1, phase.progress.expected)) * 100))}%` }
                  ]}
                />
              </View>
              <View style={styles.phaseStats}>
                <Text style={styles.phaseStat}>{phase.progress.docs} doc(s)</Text>
                <Text style={styles.phaseStat}>{phase.progress.decisions} choix</Text>
                <Text style={styles.phaseStat}>{phase.progress.reviews} revue(s)</Text>
              </View>
              <Text style={styles.expected}>{phase.expectedOutputs.join(" · ")}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <SectionHeader title="Points de contrôle humains" subtitle="Les phases structurantes doivent pouvoir être relues, commentées et renvoyées aux agents." />
        <View style={styles.reviewGrid}>
          {state.gates
            .filter((gateItem) => gateItem.requiredHumanReview)
            .map((gateItem) => (
              <View key={gateItem.id} style={styles.reviewCard}>
                <Text style={styles.reviewGate}>{gateItem.id}</Text>
                <Text style={styles.reviewTitle}>{gateItem.name}</Text>
                <Text style={styles.reviewText}>{gateItem.humanReviews.length} revue(s) humaine(s)</Text>
              </View>
            ))}
        </View>
      </Card>
    </>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function nextActionText(gate) {
  if (!gate) return "Aucun gate chargé.";
  if (gate.id === "G0") return "Importer le cahier des charges, lancer @project-bootstrapper, puis traiter les questions ouvertes qu'il produit si le contexte est incomplet.";
  if (gate.id === "G1") return "Produire la vision avec @sponsor puis faire valider G1 par @discovery-reviewer.";
  if (gate.id === "G2") return "Faire converger UX, UI et architecture métier, puis faire valider G2.";
  if (gate.id === "G3") return "Produire architecture technique et sécurité, puis faire challenger G3.";
  if (gate.id === "G4") return "Préparer les User Stories et les faire relire avant dev.";
  if (gate.id === "G5") return "Implémenter une vertical slice, puis demander la revue qualité.";
  if (gate.id === "G6") return "Exécuter QA/AppSec et faire contrôler les preuves.";
  if (gate.id === "G7") return "Préparer la release et demander une décision de livraison.";
  return "Process complet.";
}

const styles = StyleSheet.create({
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 0.8fr) minmax(360px, 1.2fr)",
    gap: 18
  },
  metric: {
    borderBottomColor: ey.colors.border,
    borderBottomWidth: 1,
    paddingVertical: 10
  },
  metricLabel: {
    color: ey.colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  metricValue: {
    color: ey.colors.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 2
  },
  nextText: {
    color: ey.colors.text,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "800"
  },
  hint: {
    color: ey.colors.muted,
    marginTop: 12,
    lineHeight: 20
  },
  agentBoard: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 12
  },
  phaseCard: {
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: ey.colors.offWhite,
    padding: 14
  },
  phaseCardActive: {
    borderColor: ey.colors.yellow,
    borderWidth: 3,
    backgroundColor: ey.colors.white
  },
  phaseTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  phaseId: {
    color: ey.colors.confidentBlack,
    fontSize: 20,
    fontWeight: "900"
  },
  phaseTitle: {
    color: ey.colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 8
  },
  phaseOwner: {
    color: ey.colors.offBlack,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5
  },
  progressTrack: {
    height: 8,
    borderRadius: 8,
    backgroundColor: ey.colors.gray02,
    overflow: "hidden",
    marginTop: 12
  },
  progressBar: {
    height: 8,
    backgroundColor: ey.colors.yellow
  },
  phaseStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10
  },
  phaseStat: {
    color: ey.colors.text,
    backgroundColor: ey.colors.white,
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "800"
  },
  expected: {
    color: ey.colors.muted,
    lineHeight: 18,
    fontSize: 12,
    marginTop: 10
  },
  reviewGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 10
  },
  reviewCard: {
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    backgroundColor: ey.colors.offWhite
  },
  reviewGate: {
    color: ey.colors.confidentBlack,
    fontWeight: "900",
    fontSize: 18
  },
  reviewTitle: {
    color: ey.colors.text,
    fontWeight: "800",
    marginTop: 4
  },
  reviewText: {
    color: ey.colors.muted,
    marginTop: 6,
    fontSize: 12
  }
});
