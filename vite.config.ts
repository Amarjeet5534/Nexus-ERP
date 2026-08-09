import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import viteTsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    viteTsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    mode === "production" ? nitro() : null,
    viteReact(),
  ],
}));
