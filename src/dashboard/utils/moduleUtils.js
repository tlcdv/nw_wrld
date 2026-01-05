export const getBaseMethodNames = () => {
  try {
    const bridge = globalThis.nwWrldBridge;
    if (
      !bridge ||
      !bridge.app ||
      typeof bridge.app.getBaseMethodNames !== "function"
    ) {
      return { moduleBase: [], threeBase: [] };
    }
    return bridge.app.getBaseMethodNames();
  } catch (error) {
    console.error("Error reading base files:", error);
    return { moduleBase: [], threeBase: [] };
  }
};
