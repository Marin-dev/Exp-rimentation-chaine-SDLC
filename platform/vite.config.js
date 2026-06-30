import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, the React app runs on Vite (5174) and proxies /api to the Node server (4174).
// In production, `npm run build` emits dist/ and the Node server serves it directly.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:4174"
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
