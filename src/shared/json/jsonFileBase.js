import fs from "fs";
import path from "path";

const getJsonPath = (filename) => {
  const srcDir = path.join(__dirname, "..", "..");
  return path.join(srcDir, "shared", "json", filename);
};

export const loadJsonFile = async (filename, defaultValue, warningMsg) => {
  const filePath = getJsonPath(filename);
  try {
    const data = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (warningMsg) console.warn(warningMsg, error);
    return defaultValue;
  }
};

export const loadJsonFileSync = (filename, defaultValue, errorMsg) => {
  const filePath = getJsonPath(filename);
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (errorMsg) console.error(errorMsg, error);
    return defaultValue;
  }
};

export const saveJsonFile = async (filename, data) => {
  const filePath = getJsonPath(filename);
  try {
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(data, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
  }
};

export const saveJsonFileSync = (filename, data) => {
  const filePath = getJsonPath(filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`Error writing ${filename} (sync):`, error);
  }
};

