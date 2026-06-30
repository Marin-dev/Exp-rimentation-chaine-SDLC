import React from "react";
import { AppRegistry } from "react-native";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

document.body.style.margin = "0";
document.body.style.background = "#F6F6FA";
document.body.style.fontFamily = "Inter, Segoe UI, Arial, sans-serif";

AppRegistry.registerComponent("ControlCenter", () => App);
const root = createRoot(document.getElementById("root"));
root.render(<App />);
