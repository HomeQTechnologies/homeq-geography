// @ts-ignore
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
// @ts-ignore
import path from "path";
import { fileURLToPath } from "url";
import { loadEnv } from "vite";
import viteTsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
// @ts-ignore
import { localFilesPlugin } from "./vite/localFilesPlugin.mts";

// @ts-ignore
const configDir = path.dirname(fileURLToPath(import.meta.url));

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
  const individualRoot = env.GEO_VIEWER_INDIVIDUAL_DIR
    ? path.isAbsolute(env.GEO_VIEWER_INDIVIDUAL_DIR)
      ? path.resolve(env.GEO_VIEWER_INDIVIDUAL_DIR)
      : path.resolve(configDir, env.GEO_VIEWER_INDIVIDUAL_DIR)
    : path.resolve(configDir, "../data/individual");

  return {
    base: env.VITE_APP_BASE_URL || "/",
    plugins: [
      react(),
      viteTsconfigPaths(),
      tailwindcss(),
      localFilesPlugin({ meshRootDir: meshRoot, apiPrefix: "/local-files/api" }),
      localFilesPlugin({
        meshRootDir: individualRoot,
        apiPrefix: "/individual-files/api",
      }),
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
