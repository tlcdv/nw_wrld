export const createSdkHelpers = ({
  assetUrlImpl,
  readTextImpl,
  normalizeRelPath,
} = {}) => {
  const normalize = (relPath) => {
    if (typeof normalizeRelPath === "function") {
      try {
        return normalizeRelPath(relPath);
      } catch {
        return null;
      }
    }
    return relPath;
  };

  const assetUrl = (relPath) => {
    const safe = normalize(relPath);
    if (safe == null) return null;
    if (typeof assetUrlImpl !== "function") return null;
    try {
      return assetUrlImpl(safe);
    } catch {
      return null;
    }
  };

  const readText = async (relPath) => {
    const safe = normalize(relPath);
    if (safe == null) return null;
    if (typeof readTextImpl !== "function") return null;
    try {
      const res = await readTextImpl(safe);
      return typeof res === "string" ? res : null;
    } catch {
      return null;
    }
  };

  const loadJson = async (relPath) => {
    try {
      const text = await readText(relPath);
      if (!text) return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  return { assetUrl, readText, loadJson };
};
