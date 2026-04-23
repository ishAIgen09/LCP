import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Port 5174 is reserved for admin-dashboard to avoid colliding with
// b2b-dashboard on 5173. Both origins are already in the backend
// CORS_ORIGINS list on the droplet (see memory/project_droplet_deploy_architecture.md).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
