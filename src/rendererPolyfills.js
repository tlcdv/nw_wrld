// Ensure Node-ish globals expected by some deps exist even with nodeIntegration disabled.
// This runs before the main renderer entrypoint via webpack entry ordering.
try {
  if (typeof globalThis.global === "undefined") {
    globalThis.global = globalThis;
  }
} catch {}


