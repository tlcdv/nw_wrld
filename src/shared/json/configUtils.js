import { loadJsonFile, loadJsonFileSync } from "./jsonFileBase.js";

const DEFAULT_SETTINGS = {
  aspectRatios: [
    {
      id: "landscape",
      label: "Landscape",
      width: "100vw",
      height: "100vh",
    },
  ],
  backgroundColors: [{ id: "grey", label: "Grey", value: "#151715" }],
  autoRefresh: false,
};

export const loadSettings = () =>
  loadJsonFile(
    "config.json",
    DEFAULT_SETTINGS,
    "Could not load config.json, using defaults."
  );

export const loadSettingsSync = () =>
  loadJsonFileSync("config.json", DEFAULT_SETTINGS, "Error loading config.json:");

