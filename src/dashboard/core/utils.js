import { produce } from "immer";
import { migrateToSets, getActiveSet } from "../../shared/utils/setUtils.js";
import { DEFAULT_GLOBAL_MAPPINGS } from "../../shared/config/defaultConfig.js";
import {
  getJsonFilePath,
  loadJsonFile,
  saveJsonFile,
  saveJsonFileSync,
} from "../../shared/json/jsonFileBase.js";

const getMethodsByLayer = (module, moduleBase, threeBase) => {
  if (!module || !module.methods) return [];

  const layers = [];
  const allModuleMethods = module.methods.map((m) => m.name);

  const baseMethodsInModule = allModuleMethods.filter((name) =>
    moduleBase.includes(name)
  );
  if (baseMethodsInModule.length > 0) {
    layers.push({
      name: "Base",
      methods: baseMethodsInModule,
    });
  }

  const threeBaseMethodsOnly = threeBase.filter(
    (name) => !moduleBase.includes(name)
  );
  const threeMethodsInModule = allModuleMethods.filter((name) =>
    threeBaseMethodsOnly.includes(name)
  );
  if (threeMethodsInModule.length > 0) {
    layers.push({
      name: "Three.js Base",
      methods: threeMethodsInModule,
    });
  }

  const allBaseMethods = [...moduleBase, ...threeBase];
  const moduleMethods = allModuleMethods.filter(
    (name) => !allBaseMethods.includes(name)
  );
  if (moduleMethods.length > 0) {
    layers.push({
      name: module.name,
      methods: moduleMethods,
    });
  }

  return layers;
};

const getMethodCode = (moduleName, methodName) => {
  try {
    const bridge = globalThis.nwWrldBridge;
    if (
      !bridge ||
      !bridge.app ||
      typeof bridge.app.getMethodCode !== "function"
    ) {
      return { code: null, filePath: null };
    }
    const res = bridge.app.getMethodCode(moduleName, methodName);
    return {
      code: res?.code || null,
      filePath: res?.filePath || null,
    };
  } catch (error) {
    console.error("Error extracting method code:", error);
    return { code: null, filePath: null };
  }
};

const updateUserData = (setUserData, updater) => {
  setUserData((prev) =>
    produce(prev, (draft) => {
      updater(draft);
    })
  );
};

const getUserDataPath = () => {
  return getJsonFilePath("userData.json");
};

const loadUserData = async () => {
  const defaultData = {
    config: {
      activeSetId: null,
      trackMappings: DEFAULT_GLOBAL_MAPPINGS.trackMappings,
      channelMappings: DEFAULT_GLOBAL_MAPPINGS.channelMappings,
    },
    sets: [],
    _isDefaultData: true,
  };

  const parsedData = await loadJsonFile(
    "userData.json",
    defaultData,
    "Could not load userData.json, initializing with empty data."
  );

  const migratedData = migrateToSets(parsedData);

  if (!migratedData.config) {
    migratedData.config = {};
  }
  if (!Array.isArray(migratedData.sets)) {
    migratedData.sets = [];
  }

  if (!migratedData.config.trackMappings) {
    migratedData.config.trackMappings = DEFAULT_GLOBAL_MAPPINGS.trackMappings;
  }
  if (!migratedData.config.channelMappings) {
    migratedData.config.channelMappings =
      DEFAULT_GLOBAL_MAPPINGS.channelMappings;
  }

  migratedData._loadedSuccessfully = !Boolean(migratedData._isDefaultData);
  return migratedData;
};

const saveUserData = async (data) => {
  if (data?._isDefaultData) {
    console.warn(
      "Skipping save: data is default empty data returned from loadUserData error. Not overwriting file."
    );
    return;
  }
  if (Array.isArray(data?.sets) && data.sets.length === 0) {
    console.warn(
      "Skipping save: data has empty sets array. Not overwriting file with empty data."
    );
    return;
  }
  try {
    const dataToSave = { ...data };
    delete dataToSave._isDefaultData;
    delete dataToSave._loadedSuccessfully;
    await saveJsonFile("userData.json", dataToSave);
  } catch (error) {
    console.error("Error writing userData to JSON file:", error);
  }
};

const saveUserDataSync = (data) => {
  if (data?._isDefaultData) {
    console.warn(
      "Skipping save (sync): data is default empty data returned from loadUserData error. Not overwriting file."
    );
    return;
  }
  if (Array.isArray(data?.sets) && data.sets.length === 0) {
    console.warn(
      "Skipping save (sync): data has empty sets array. Not overwriting file with empty data."
    );
    return;
  }
  try {
    const dataToSave = { ...data };
    delete dataToSave._isDefaultData;
    delete dataToSave._loadedSuccessfully;
    saveJsonFileSync("userData.json", dataToSave);
  } catch (error) {
    console.error("Error writing userData to JSON file (sync):", error);
  }
};

const generateTrackNotes = () => {
  const channelNotes = [
    "G8",
    "F#8",
    "F8",
    "E8",
    "D#8",
    "D8",
    "C#8",
    "C8",
    "B7",
    "A#7",
    "A7",
    "G#7",
    "G7",
    "F#7",
    "F7",
    "E7",
  ];

  const noteNames = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const octaves = [-1, 0, 1, 2];
  const standardNotes = [];
  octaves.forEach((oct) => {
    noteNames.forEach((n) => standardNotes.push(`${n}${oct}`));
  });

  return [...channelNotes, ...standardNotes];
};

const updateActiveSet = (setUserData, activeSetId, updater) => {
  updateUserData(setUserData, (draft) => {
    const activeSet = getActiveSet(draft, activeSetId);
    if (!activeSet) return;
    updater(activeSet, draft);
  });
};

export {
  getMethodsByLayer,
  getMethodCode,
  updateUserData,
  getUserDataPath,
  loadUserData,
  saveUserData,
  saveUserDataSync,
  generateTrackNotes,
  updateActiveSet,
};
