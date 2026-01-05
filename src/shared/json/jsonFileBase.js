const getBridge = () => globalThis.nwWrldAppBridge;

export const getJsonDir = () => null;

export const getJsonFilePath = (filename) => filename;

export const loadJsonFile = async (filename, defaultValue, warningMsg) => {
  const bridge = getBridge();
  if (!bridge || !bridge.json || typeof bridge.json.read !== "function") {
    if (warningMsg) console.warn(warningMsg);
    return defaultValue;
  }
  try {
    return await bridge.json.read(filename, defaultValue);
  } catch (e) {
    if (warningMsg) console.warn(warningMsg, e);
    return defaultValue;
  }
};

export const loadJsonFileSync = (filename, defaultValue, errorMsg) => {
  const bridge = getBridge();
  if (!bridge || !bridge.json || typeof bridge.json.readSync !== "function") {
    if (errorMsg) console.error(errorMsg);
    return defaultValue;
  }
  try {
    return bridge.json.readSync(filename, defaultValue);
  } catch (e) {
    if (errorMsg) console.error(errorMsg, e);
    return defaultValue;
  }
};

export const saveJsonFile = async (filename, data) => {
  const bridge = getBridge();
  if (!bridge || !bridge.json || typeof bridge.json.write !== "function") {
    console.error(`Refusing to write ${filename}: json bridge is unavailable.`);
    return;
  }
  const res = await bridge.json.write(filename, data);
  if (res && res.ok === false) {
    console.error(
      `Refusing to write ${filename}: project folder is not available (${res.reason}).`
    );
  }
};

export const saveJsonFileSync = (filename, data) => {
  const bridge = getBridge();
  if (!bridge || !bridge.json || typeof bridge.json.writeSync !== "function") {
    console.error(
      `Refusing to write ${filename} (sync): json bridge is unavailable.`
    );
    return;
  }
  const res = bridge.json.writeSync(filename, data);
  if (res && res.ok === false) {
    console.error(
      `Refusing to write ${filename} (sync): project folder is not available (${res.reason}).`
    );
  }
};
