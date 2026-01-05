export const getProjectDir = () => {
  const sdk = globalThis.nwWrldSdk;
  if (sdk && typeof sdk.getWorkspaceDir === "function") {
    return sdk.getWorkspaceDir();
  }
  const bridge = globalThis.nwWrldBridge;
  if (
    !bridge ||
    !bridge.project ||
    typeof bridge.project.getDir !== "function"
  ) {
    return null;
  }
  return bridge.project.getDir();
};
