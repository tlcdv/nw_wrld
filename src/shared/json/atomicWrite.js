import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  atomicWriteFile,
  atomicWriteFileSync,
  cleanupStaleTempFiles,
} = require("./atomicWrite.cjs");

export { atomicWriteFile, atomicWriteFileSync, cleanupStaleTempFiles };
