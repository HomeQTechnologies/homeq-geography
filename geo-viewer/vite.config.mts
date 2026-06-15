import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnv } from "vite";
import viteTsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
import { localFilesPlugin } from "./vite/localFilesPlugin.mts";

const configDir = path.dirname(fileURLToPath(import.meta.url));

// @ts-expect-error Vite/Vitest config typing is version-skewed in this workspace
export default defineConfig(({ mode }) => {
  const env = {
    ...process.env,
    ...loadEnv(mode, process.cwd(), ["VITE_", "GEO_VIEWER_"]),
  };
  process.env = env;
  const meshRoot = env.GEO_VIEWER_MESH_DIR
    ? path.isAbsolute(env.GEO_VIEWER_MESH_DIR)
      ? path.resolve(env.GEO_VIEWER_MESH_DIR)
      : path.resolve(configDir, env.GEO_VIEWER_MESH_DIR)
    : path.resolve(configDir, "workspace/meshes");

  return {
    base: env.VITE_APP_BASE_URL || "/",
    plugins: [
      react(),
      viteTsconfigPaths(),
      tailwindcss(),
      localFilesPlugin({ meshRootDir: meshRoot }),
    ],
    optimizeDeps: {
      include: [
        "react-dom",
        "react",
        "@mui/material",
        "@mui/icons-material",
        "@emotion/react",
        "@emotion/styled",
      ],
    },
    server: {
      open: true,
      port: 9009,
      proxy: {
        "/api": {
          target: env.VITE_APP_PROXY_API_URL,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    resolve: {
      dedupe: ["react", "react-dom", "@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled"],
    },
    test: {
      dir: "./src",
      globals: true,
      environment: "happy-dom",
      clearMocks: true,
    },
  };
});
