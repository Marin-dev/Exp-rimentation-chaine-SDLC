import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { processSteps } from "../data/process.js";
import { ey } from "../theme/ey.js";

const navItems = [
  ["dashboard", "Pilotage"],
  ...processSteps.map((phase) => [`phase-${phase.id}`, `${phase.id} · ${phase.title}`]),
  ["needs", "Nouveaux besoins"],
  ["config", "Configuration"]
];

export function Layout({ activeScreen, setActiveScreen, children, state, onRefresh }) {
  return (
    <View style={styles.root}>
      <View style={styles.sidebar}>
        <View style={styles.yellowBand} />
        <View style={styles.brand}>
          <Text style={styles.brandMark}>EY</Text>
          <View>
            <Text style={styles.brandTitle}>AI Dev Chain</Text>
            <Text style={styles.brandSub}>Control Center</Text>
          </View>
        </View>
        <ScrollView style={styles.navScroll} contentContainerStyle={styles.nav}>
          {navItems.map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setActiveScreen(id)}
              style={[styles.navItem, activeScreen === id ? styles.navItemActive : null]}
            >
              <Text style={[styles.navText, activeScreen === id ? styles.navTextActive : null]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={styles.content}>
        <View style={styles.topbar}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.eyebrow}>Projet actif</Text>
            <Text style={styles.projectTitle}>{state?.project?.projectName || "Chargement"}</Text>
            <Text style={styles.workspacePath}>{state?.workspaceRoot || ""}</Text>
          </View>
          <Pressable style={styles.refreshButton} onPress={onRefresh}>
            <Text style={styles.refreshText}>Rafraîchir</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: "100vh",
    flexDirection: "row",
    backgroundColor: ey.colors.offWhite
  },
  sidebar: {
    width: 300,
    backgroundColor: ey.colors.confidentBlack,
    minHeight: "100vh"
  },
  yellowBand: {
    height: 12,
    backgroundColor: ey.colors.yellow
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 22,
    borderBottomColor: "#343442",
    borderBottomWidth: 1
  },
  brandMark: {
    width: 46,
    height: 46,
    backgroundColor: ey.colors.yellow,
    color: ey.colors.confidentBlack,
    borderRadius: 4,
    textAlign: "center",
    lineHeight: 46,
    fontWeight: "900",
    fontSize: 18
  },
  brandTitle: {
    color: ey.colors.white,
    fontWeight: "900",
    fontSize: 18
  },
  brandSub: {
    color: ey.colors.gray02,
    fontSize: 13,
    marginTop: 2
  },
  navScroll: {
    maxHeight: "calc(100vh - 104px)"
  },
  nav: {
    padding: 14,
    gap: 6
  },
  navItem: {
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  navItemActive: {
    backgroundColor: ey.colors.yellow
  },
  navText: {
    color: ey.colors.gray02,
    fontWeight: "700"
  },
  navTextActive: {
    color: ey.colors.confidentBlack,
    fontWeight: "900"
  },
  content: {
    flex: 1,
    minWidth: 0
  },
  topbar: {
    minHeight: 92,
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: ey.colors.white,
    borderBottomColor: ey.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center"
  },
  eyebrow: {
    color: ey.colors.muted,
    textTransform: "uppercase",
    fontSize: 11,
    fontWeight: "900"
  },
  projectTitle: {
    color: ey.colors.text,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 3
  },
  workspacePath: {
    color: ey.colors.muted,
    fontSize: 12,
    marginTop: 3
  },
  refreshButton: {
    backgroundColor: ey.colors.offBlack,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  refreshText: {
    color: ey.colors.white,
    fontWeight: "800"
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    padding: 20,
    gap: 18
  }
});
