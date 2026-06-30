import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ey } from "../theme/ey.js";

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({ title, subtitle, right }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Pill({ label, tone = "neutral" }) {
  const palette = {
    neutral: [ey.colors.offWhite, ey.colors.offBlack],
    info: [ey.colors.infoBg, ey.colors.info],
    success: [ey.colors.successBg, ey.colors.success],
    danger: [ey.colors.dangerBg, ey.colors.danger],
    warning: [ey.colors.warningBg, ey.colors.warning]
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette[0] }]}>
      <Text style={[styles.pillText, { color: palette[1] }]}>{label}</Text>
    </View>
  );
}

export function Button({ label, onPress, variant = "primary", disabled }) {
  const isSecondary = variant === "secondary";
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.button,
        isSecondary ? styles.secondaryButton : styles.primaryButton,
        disabled ? styles.disabled : null
      ]}
    >
      <Text style={[styles.buttonText, isSecondary ? styles.secondaryButtonText : null]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, multiline, rows = 3 }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        numberOfLines={rows}
        style={[styles.input, multiline ? { minHeight: rows * 34, textAlignVertical: "top" } : null]}
      />
    </View>
  );
}

export function Select({ label, value, onChange, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {React.createElement(
        "select",
        {
          value,
          onChange: (event) => onChange(event.target.value),
          style: {
            minHeight: 40,
            border: `1px solid ${ey.colors.border}`,
            borderRadius: 6,
            padding: "8px 10px",
            background: ey.colors.white,
            color: ey.colors.text
          }
        },
        children
      )}
    </View>
  );
}

export function FileInput({ onChange, directory = false, label = "Choisir des fichiers" }) {
  return React.createElement("input", {
    type: "file",
    multiple: true,
    webkitdirectory: directory ? "true" : undefined,
    onChange,
    "aria-label": label,
    style: {
      border: `1px solid ${ey.colors.border}`,
      borderRadius: 6,
      minHeight: 40,
      padding: 8,
      background: ey.colors.white,
      color: ey.colors.text
    }
  });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ey.colors.white,
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: ey.radius.lg,
    padding: ey.spacing.lg
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: ey.spacing.md,
    marginBottom: ey.spacing.md
  },
  sectionTitle: {
    color: ey.colors.text,
    fontSize: 17,
    fontWeight: "800"
  },
  sectionSubtitle: {
    color: ey.colors.muted,
    fontSize: 13,
    marginTop: 4
  },
  pill: {
    minHeight: 26,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  pillText: {
    fontSize: 12,
    fontWeight: "800"
  },
  button: {
    minHeight: 40,
    borderRadius: ey.radius.md,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryButton: {
    backgroundColor: ey.colors.yellow
  },
  secondaryButton: {
    backgroundColor: ey.colors.offBlack
  },
  disabled: {
    opacity: 0.5
  },
  buttonText: {
    color: ey.colors.confidentBlack,
    fontSize: 13,
    fontWeight: "900"
  },
  secondaryButtonText: {
    color: ey.colors.white
  },
  field: {
    gap: 6
  },
  fieldLabel: {
    color: ey.colors.offBlack,
    fontSize: 13,
    fontWeight: "800"
  },
  input: {
    borderColor: ey.colors.border,
    borderWidth: 1,
    borderRadius: ey.radius.md,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: ey.colors.white,
    color: ey.colors.text
  }
});
