import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset URL relative, so the build also works behind nginx on a sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true, rewrite: p => p.replace(/^\/api/, "") },
    },
  },
  build: {
    outDir: "dist",
    rolldownOptions: {
      output: {
        // keep the big chart library and React in their own cached files
        advancedChunks: {
          groups: [
            { name: "charts", test: /node_modules[\\/](recharts|d3-|victory-vendor|decimal\.js|es-toolkit|immer|reselect|@reduxjs|react-redux|redux)/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "icons", test: /node_modules[\\/]lucide-react/ },
          ],
        },
      },
    },
  },
});
