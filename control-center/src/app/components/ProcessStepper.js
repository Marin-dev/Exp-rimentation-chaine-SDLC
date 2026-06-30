import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { processSteps } from "../data/process.js";
import { ey } from "../theme/ey.js";
import { Card, Pill, SectionHeader } from "./Primitives.js";

function toneFor(status) {
  if (status === "PASS") return "success";
  if (status === "FAIL") return "danger";
  if (status === "PASS_WITH_RISK" || status === "unknown") return "warning";
  return "neutral";
}

export function currentGate(gates) {
  return gates?.find((gate) => gate.status !== "PASS") || gates?.[gates.length - 1];
}

export function ProcessStepper({ gates = [], phaseWorkspaces = [] }) {
  const active = currentGate(gates);
  return (
    <Card>
      <SectionHeader
        title="Process de développement"
        subtitle="Chaque phase expose les agents responsables, ses livrables, ses choix structurants et son gate."
        right={<Pill label={active ? `${active.id} actif` : "Aucun gate"} tone="info" />}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.steps}>
          {processSteps.map((step, index) => {
            const gate = gates.find((item) => item.id === step.id);
            const phase = phaseWorkspaces.find((item) => item.id === step.id);
            const isActive = active?.id === step.id;
            return (
              <View key={step.id} style={[styles.step, isActive ? styles.activeStep : null]}>
                <View style={styles.stepTop}>
                  <Text style={styles.stepIndex}>{index + 1}</Text>
                  <Pill label={gate?.status || "missing"} tone={toneFor(gate?.status)} />
                </View>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepSubtitle}>{step.subtitle}</Text>
                <Text style={styles.stepOwner}>{phase?.owner || step.owner}</Text>
                <View style={styles.phaseStats}>
                  <Text style={styles.statText}>{phase?.progress.docs || 0} doc(s)</Text>
                  <Text style={styles.statText}>{phase?.progress.decisions || 0} choix</Text>
                  <Text style={styles.statText}>{phase?.progress.reviews || 0} revue(s)</Text>
                </View>
                <Text style={styles.human}>{phase?.humanControl || step.human}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  steps: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 2
  },
  step: {
    width: 238,
    minHeight: 205,
    borderRadius: ey.radius.lg,
    borderWidth: 1,
    borderColor: ey.colors.border,
    backgroundColor: ey.colors.offWhite,
    padding: ey.spacing.md
  },
  activeStep: {
    borderColor: ey.colors.yellow,
    borderWidth: 3,
    backgroundColor: ey.colors.white
  },
  stepTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  stepIndex: {
    color: ey.colors.confidentBlack,
    fontSize: 22,
    fontWeight: "900"
  },
  stepTitle: {
    color: ey.colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  stepSubtitle: {
    color: ey.colors.muted,
    fontSize: 13,
    marginTop: 3
  },
  stepOwner: {
    color: ey.colors.offBlack,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 10
  },
  phaseStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10
  },
  statText: {
    backgroundColor: ey.colors.white,
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 999,
    color: ey.colors.text,
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  human: {
    color: ey.colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10
  }
});
