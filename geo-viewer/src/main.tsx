import "maplibre-gl/dist/maplibre-gl.css";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui";
import GeoShapeViewerPage from "./GeoShapeViewerPage";
import "./index.css";
import "./lib/fonts/material-symbols.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

createRoot(container).render(
  <>
    <GeoShapeViewerPage />
    <Toaster position="top-right" richColors closeButton />
  </>,
);
