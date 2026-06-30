import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Api } from "../api/client.js";
import { Button, Card, Field, Pill, SectionHeader } from "../components/Primitives.js";
import { ey } from "../theme/ey.js";

export function ConfigScreen({ state, refresh }) {
  const [workspaceRoot, setWorkspaceRoot] = useState(state.config.workspaceRoot || state.workspaceRoot);
  const [command, setCommand] = useState(state.config.claudeCommand);
  const [args, setArgs] = useState(JSON.stringify(state.config.claudeArgs));
  const [message, setMessage] = useState("");

  async function save() {
    try {
      const parsed = JSON.parse(args);
      if (!Array.isArray(parsed)) throw new Error("Les arguments doivent être un tableau JSON.");
      await Api.saveConfig({ workspaceRoot, claudeCommand: command, claudeArgs: parsed });
      setMessage("Configuration enregistrée.");
      await refresh();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <>
      <Card>
        <SectionHeader
          title="Configuration application"
          subtitle="Dossier de travail, commande Claude Code, inventaire agents, skills et MCP."
          right={<Pill label={state.claudeAvailable ? "Claude disponible" : "Claude absent"} tone={state.claudeAvailable ? "success" : "warning"} />}
        />
        <View style={styles.configGrid}>
          <Field label="Dossier de travail projet" value={workspaceRoot} onChangeText={setWorkspaceRoot} placeholder="C:\\...\\mon-projet" />
          <Field label="Commande Claude Code" value={command} onChangeText={setCommand} />
          <Field label="Arguments JSON" value={args} onChangeText={setArgs} />
          <Button label="Enregistrer" onPress={save} />
        </View>
        <Text style={styles.hint}>Le dossier choisi doit contenir `CLAUDE.md` et `.claude/` pour que les agents, livrables et gates soient détectés.</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </Card>

      <View style={styles.grid}>
        <InventoryCard title="Agents" count={state.agents.length} items={state.agents} primary="id" secondary="file" prefix="@" />
        <InventoryCard title="Skills" count={state.skills.length} items={state.skills} primary="name" secondary="file" />
        <InventoryCard title="MCP" count={state.mcpServers.length} items={state.mcpServers} primary="id" secondary="command" />
      </View>
    </>
  );
}

function InventoryCard({ title, count, items, primary, secondary, prefix = "" }) {
  return (
    <Card>
      <SectionHeader title={title} right={<Pill label={`${count}`} />} />
      <View style={styles.list}>
        {items.map((item) => (
          <View key={item.id || item.name} style={styles.row}>
            <Text style={styles.rowTitle}>{prefix}{item[primary]}</Text>
            <Text style={styles.rowSub}>{item[secondary] || "n/a"}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  configGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(360px, 1.4fr) minmax(220px, 0.7fr) minmax(280px, 1fr) 140px",
    gap: 12,
    alignItems: "end"
  },
  hint: {
    marginTop: 12,
    color: ey.colors.muted,
    lineHeight: 20
  },
  message: {
    marginTop: 12,
    color: ey.colors.muted,
    fontWeight: "800"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 18
  },
  list: {
    gap: 8,
    maxHeight: 520,
    overflow: "auto"
  },
  row: {
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: ey.colors.offWhite
  },
  rowTitle: {
    color: ey.colors.text,
    fontWeight: "900"
  },
  rowSub: {
    color: ey.colors.muted,
    fontSize: 12,
    marginTop: 4
  }
});
