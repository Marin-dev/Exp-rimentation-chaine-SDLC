import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Api } from "./api/client.js";
import { Layout } from "./components/Layout.js";
import { Card, Pill, SectionHeader } from "./components/Primitives.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { PhaseZeroScreen } from "./screens/PhaseZeroScreen.js";
import { PhaseControlScreen } from "./screens/PhaseControlScreen.js";
import { NewNeedsScreen } from "./screens/NewNeedsScreen.js";
import { ConfigScreen } from "./screens/ConfigScreen.js";
import { ey } from "./theme/ey.js";

export function App() {
  const [state, setState] = useState(null);
  const [activeScreen, setActiveScreen] = useState("dashboard");
  const [error, setError] = useState("");
  const [actionDraft, setActionDraftValue] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setError("");
      setState(await Api.state());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActionDraft = useCallback((draft) => {
    setActionDraftValue(draft);
    if (draft?.screen) setActiveScreen(draft.screen);
  }, []);

  const clearActionDraft = useCallback(() => setActionDraftValue(null), []);

  const screen = useMemo(() => {
    if (!state) return null;
    const props = { state, refresh, setActionDraft };
    if (activeScreen === "phase-G0") {
      return (
        <>
          <PhaseZeroScreen {...props} />
          <PhaseControlScreen
            phaseId="G0"
            state={state}
            refresh={refresh}
            actionDraft={actionDraft}
            clearActionDraft={clearActionDraft}
          />
        </>
      );
    }
    if (activeScreen.startsWith("phase-")) {
      return (
        <PhaseControlScreen
          phaseId={activeScreen.replace("phase-", "")}
          state={state}
          refresh={refresh}
          actionDraft={actionDraft}
          clearActionDraft={clearActionDraft}
        />
      );
    }
    if (activeScreen === "needs") return <NewNeedsScreen {...props} />;
    if (activeScreen === "config") return <ConfigScreen state={state} refresh={refresh} />;
    return <DashboardScreen state={state} />;
  }, [activeScreen, actionDraft, clearActionDraft, refresh, setActionDraft, state]);

  if (!state) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingTitle}>AI Dev Chain</Text>
        <Text style={styles.loadingText}>{error || "Chargement du centre de contrôle..."}</Text>
      </View>
    );
  }

  return (
    <Layout activeScreen={activeScreen} setActiveScreen={setActiveScreen} state={state} onRefresh={refresh}>
      {error ? (
        <Card>
          <SectionHeader title="Erreur" right={<Pill label="API" tone="danger" />} />
          <Text style={styles.error}>{error}</Text>
        </Card>
      ) : null}
      {screen}
    </Layout>
  );
}

const styles = StyleSheet.create({
  loading: {
    minHeight: "100vh",
    backgroundColor: ey.colors.confidentBlack,
    alignItems: "center",
    justifyContent: "center"
  },
  loadingTitle: {
    color: ey.colors.yellow,
    fontWeight: "900",
    fontSize: 34
  },
  loadingText: {
    color: ey.colors.white,
    marginTop: 12
  },
  error: {
    color: ey.colors.danger,
    fontWeight: "800"
  }
});
