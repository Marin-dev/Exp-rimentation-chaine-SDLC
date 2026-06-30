import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  esbuild: {
    loader: "jsx",
    include: /src\/app\/.*\.js$/,
    exclude: []
  },
  resolve: {
    alias: {
      "react-native": "react-native-web"
    }
  },
  server: {
    proxy: {
      "/api": "http://localhost:4173"
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
