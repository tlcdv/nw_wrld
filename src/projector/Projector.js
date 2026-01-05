// Projector.js
import {
  reduce,
  find,
  forEach,
  get,
  isEmpty,
  isEqual,
  isFunction,
  throttle,
  random,
} from "lodash";
import { loadJsonFileSync } from "../shared/json/jsonFileBase.js";
import { buildMidiConfig } from "../shared/midi/midiUtils.js";
import { loadSettingsSync } from "../shared/json/configUtils.js";
import { getActiveSetTracks, migrateToSets } from "../shared/utils/setUtils.js";
import { buildMethodOptions } from "../shared/utils/methodOptions.js";
import { getProjectDir } from "../shared/utils/projectDir.js";
import logger from "./helpers/logger.js";
const getBridge = () => globalThis.nwWrldBridge;

const getMessaging = () => getBridge()?.messaging;

const createSandboxToken = () =>
  `nw_${Math.random().toString(16).slice(2)}_${Date.now()}`;

const getSandboxPageUrl = () => {
  try {
    return "nw-sandbox://app/moduleSandbox.html";
  } catch {
    return null;
  }
};

class TrackSandboxHost {
  constructor(modulesContainer) {
    this.modulesContainer = modulesContainer;
    this.iframe = null;
    this.token = createSandboxToken();
    this.pending = new Map();
    this.onMessage = this.onMessage.bind(this);
    this.disposed = false;
  }

  onMessage(event) {
    if (this.disposed) return;
    if (!this.iframe || event?.source !== this.iframe.contentWindow) return;
    const data = event?.data;
    if (!data || typeof data !== "object") return;
    if (data.token !== this.token) return;

    if (data.__nwWrldSandbox && data.type === "sdk:readAssetText") {
      const requestId = data.requestId;
      const relPath = data.props?.relPath;
      const bridge = getBridge();
      const fn = bridge?.workspace?.readAssetText;
      const respond = (result) => {
        try {
          this.iframe.contentWindow.postMessage(
            {
              __nwWrldSandboxResult: true,
              token: this.token,
              requestId,
              result,
            },
            "*"
          );
        } catch {}
      };
      if (typeof fn !== "function") {
        respond({ ok: false, text: null });
        return;
      }
      Promise.resolve()
        .then(() => fn(relPath))
        .then((text) => respond({ ok: true, text }))
        .catch(() => respond({ ok: false, text: null }));
      return;
    }

    if (!data.__nwWrldSandboxResult) return;
    const requestId = data.requestId;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.resolve(data.result);
  }

  request(type, props) {
    if (!this.iframe?.contentWindow) {
      return Promise.resolve({ ok: false, error: "NO_IFRAME" });
    }
    const requestId = `${Date.now()}:${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve) => {
      this.pending.set(requestId, { resolve });
      try {
        this.iframe.contentWindow.postMessage(
          {
            __nwWrldSandbox: true,
            token: this.token,
            type,
            requestId,
            props: props || {},
          },
          "*"
        );
      } catch {
        this.pending.delete(requestId);
        resolve({ ok: false, error: "POSTMESSAGE_FAILED" });
        return;
      }
      setTimeout(() => {
        if (!this.pending.has(requestId)) return;
        this.pending.delete(requestId);
        resolve({ ok: false, error: "TIMEOUT" });
      }, 8000);
    });
  }

  async ensureIframe() {
    if (this.iframe && !this.iframe.isConnected) this.iframe = null;
    if (this.iframe) return;

    const pageUrl = getSandboxPageUrl();
    if (!pageUrl) throw new Error(`[Projector] Sandbox page URL missing.`);

    this.iframe = document.createElement("iframe");
    this.iframe.setAttribute("sandbox", "allow-scripts");
    this.iframe.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:transparent;";
    this.iframe.src = `${pageUrl}#token=${encodeURIComponent(this.token)}`;

    try {
      this.modulesContainer.textContent = "";
      this.modulesContainer.appendChild(this.iframe);
    } catch {}

    await new Promise((resolve) => {
      const done = () => resolve();
      this.iframe.addEventListener("load", done, { once: true });
      setTimeout(done, 3000);
    });

    window.addEventListener("message", this.onMessage);
  }

  async initTrack({ track, moduleSources, assetsBaseUrl }) {
    await this.ensureIframe();
    return await this.request("initTrack", {
      track,
      moduleSources,
      assetsBaseUrl,
    });
  }

  invokeOnInstance(instanceId, methodName, options) {
    return this.request("invokeOnInstance", {
      instanceId,
      methodName,
      options,
    });
  }

  introspectModule(moduleType, sourceText) {
    return this.request("introspectModule", { moduleType, sourceText });
  }

  destroyTrack() {
    return this.request("destroyTrack", {});
  }

  destroy() {
    this.disposed = true;
    try {
      window.removeEventListener("message", this.onMessage);
    } catch {}
    try {
      this.destroyTrack().catch(() => {});
    } catch {}
    try {
      if (this.iframe && this.iframe.parentNode) {
        this.iframe.parentNode.removeChild(this.iframe);
      }
    } catch {}
    this.iframe = null;
    this.pending.clear();
  }
}

const Projector = {
  activeTrack: null,
  activeModules: {},
  activeChannelHandlers: {},
  moduleClassCache: new Map(),
  workspaceModuleSourceCache: new Map(),
  assetsBaseUrl: null,
  trackSandboxHost: null,
  trackModuleSources: null,
  restoreTrackNameAfterPreview: null,
  workspacePath: null,
  getAssetsBaseUrl() {
    if (this.assetsBaseUrl) return this.assetsBaseUrl;
    const bridge = getBridge();
    if (
      !bridge ||
      !bridge.workspace ||
      typeof bridge.workspace.assetUrl !== "function"
    ) {
      return null;
    }
    try {
      const url = bridge.workspace.assetUrl(".");
      this.assetsBaseUrl = typeof url === "string" ? url : null;
    } catch {
      this.assetsBaseUrl = null;
    }
    return this.assetsBaseUrl;
  },
  async loadWorkspaceModuleSource(moduleType) {
    if (!moduleType) return null;

    const safeModuleType = String(moduleType).trim();
    if (!safeModuleType) return null;
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(safeModuleType)) {
      throw new Error(
        `[Projector] Invalid module type "${safeModuleType}" (expected alphanumeric class/file name, no paths).`
      );
    }

    if (!this.workspacePath) {
      throw new Error(
        `[Projector] Project directory is not set; cannot load module "${safeModuleType}".`
      );
    }

    const bridge = getBridge();
    if (
      !bridge ||
      !bridge.workspace ||
      typeof bridge.workspace.readModuleWithMeta !== "function"
    ) {
      throw new Error(`[Projector] Workspace module bridge is unavailable.`);
    }

    const info = await bridge.workspace.readModuleWithMeta(safeModuleType);
    if (!info || typeof info.text !== "string") {
      throw new Error(
        `[Projector] Workspace module not found: "${safeModuleType}".`
      );
    }

    const mtimeMs = typeof info.mtimeMs === "number" ? info.mtimeMs : 0;
    const cacheKey = `${safeModuleType}:${mtimeMs}`;
    if (this.workspaceModuleSourceCache.has(cacheKey)) {
      return this.workspaceModuleSourceCache.get(cacheKey);
    }

    const promise = Promise.resolve({
      moduleId: safeModuleType,
      text: info.text,
      mtimeMs,
    });

    for (const key of this.workspaceModuleSourceCache.keys()) {
      if (key.startsWith(`${safeModuleType}:`) && key !== cacheKey) {
        this.workspaceModuleSourceCache.delete(key);
      }
    }
    this.workspaceModuleSourceCache.set(cacheKey, promise);
    return promise;
  },
  async loadModuleClass(moduleType) {
    return await this.loadWorkspaceModuleSource(moduleType);
  },
  userData: [],
  isDeactivating: false,
  isLoadingTrack: false,
  pendingTrackName: null,
  pendingReloadData: null,
  previewModuleName: null,
  previewToken: 0,
  debugOverlayActive: false,
  debugLogQueue: [],
  debugLogTimeout: null,
  moduleIntrospectionCache: new Map(),

  logToMain(message) {
    const appBridge = globalThis.nwWrldAppBridge;
    if (!appBridge || typeof appBridge.logToMain !== "function") return;
    appBridge.logToMain(message);
  },

  queueDebugLog(log) {
    if (!this.debugOverlayActive) return;

    this.debugLogQueue.push(log);
    if (!this.debugLogTimeout) {
      this.debugLogTimeout = setTimeout(() => {
        if (this.debugLogQueue.length > 0 && this.debugOverlayActive) {
          const batchedLogs = this.debugLogQueue.join("\n\n");
          const messaging = getMessaging();
          if (!messaging || typeof messaging.sendToDashboard !== "function")
            return;
          messaging.sendToDashboard("debug-log", { log: batchedLogs });
          this.debugLogQueue = [];
        }
        this.debugLogTimeout = null;
      }, 100);
    }
  },

  init() {
    this.loadUserData();
    this.settings = loadSettingsSync();
    this.applyConfigSettings();

    {
      const messaging = getMessaging();
      messaging?.sendToDashboard?.("projector-ready", {});
    }

    {
      const messaging = getMessaging();
      messaging?.onWorkspaceModulesChanged?.(() => {
        this.workspaceModuleSourceCache.clear();
        this.assetsBaseUrl = null;
        try {
          this.trackSandboxHost?.destroy?.();
        } catch {}
        this.trackSandboxHost = null;
        this.trackModuleSources = null;
      });
    }

    // IPC listener for receiving updated userData from Dashboard
    {
      const messaging = getMessaging();
      if (messaging && typeof messaging.onFromDashboard === "function") {
        messaging.onFromDashboard((event, data) => {
          try {
            if (!data || typeof data !== "object") {
              console.error(
                "❌ [PROJECTOR-IPC] Invalid IPC message received:",
                data
              );
              return;
            }

            const { type, props = {} } = data;

            if (!type) {
              console.error(
                "❌ [PROJECTOR-IPC] Message missing type field:",
                data
              );
              return;
            }

            if (type === "module-introspect") {
              const moduleId = props?.moduleId || null;
              if (!moduleId) return;
              this.introspectModule(moduleId).then((result) => {
                const messaging = getMessaging();
                messaging?.sendToDashboard?.(
                  "module-introspect-result",
                  result
                );
              });
              return;
            }

            if (type === "toggleAspectRatioStyle") {
              if (!props.name) {
                console.error(
                  "❌ [PROJECTOR-IPC] toggleAspectRatioStyle missing name"
                );
                return;
              }
              return this.toggleAspectRatioStyle(props.name);
            }

            if (type === "setBg") {
              if (!props.value) {
                console.error("❌ [PROJECTOR-IPC] setBg missing value");
                return;
              }
              return this.setBg(props.value);
            }

            if (type === "preview-module") {
              if (!props.moduleName) {
                console.error(
                  "❌ [PROJECTOR-IPC] preview-module missing moduleName"
                );
                return;
              }
              return this.previewModule(props.moduleName, props.moduleData);
            }

            if (type === "clear-preview") {
              return this.clearPreview();
            }

            if (type === "trigger-preview-method") {
              if (!props.moduleName || !props.methodName) {
                console.error(
                  "❌ [PROJECTOR-IPC] trigger-preview-method missing moduleName or methodName"
                );
                return;
              }
              return this.triggerPreviewMethod(
                props.moduleName,
                props.methodName,
                props.options || {}
              );
            }

            if (type === "refresh-projector") {
              return this.refreshPage();
            }

            if (type === "reload-data") {
              if (this.isLoadingTrack) {
                this.pendingReloadData = {
                  setId: props.setId,
                  trackName: props.trackName || this.activeTrack?.name,
                };
                return;
              }

              const currentTrackName =
                props.trackName || this.activeTrack?.name;
              this.loadUserData(props.setId);
              this.applyConfigSettings();

              if (currentTrackName) {
                const nextTrack = find(this.userData, {
                  name: currentTrackName,
                });
                if (
                  this.activeTrack &&
                  this.activeTrack.name === currentTrackName &&
                  nextTrack &&
                  isEqual(
                    {
                      name: this.activeTrack.name,
                      modules: this.activeTrack.modules,
                      modulesData: this.activeTrack.modulesData,
                      channelMappings: this.activeTrack.channelMappings,
                    },
                    {
                      name: nextTrack.name,
                      modules: nextTrack.modules,
                      modulesData: nextTrack.modulesData,
                      channelMappings: nextTrack.channelMappings,
                    }
                  )
                ) {
                  return;
                }
                this.deactivateActiveTrack();
                return this.handleTrackSelection(currentTrackName);
              }
              return;
            }

            if (type === "set-activate") {
              this.loadUserData(props.setId);
              this.deactivateActiveTrack();
              return;
            }

            if (type === "track-activate") {
              if (!props.trackName) {
                console.error(
                  "❌ [PROJECTOR-IPC] track-activate missing trackName"
                );
                return;
              }
              return this.handleTrackSelection(props.trackName);
            }

            if (type === "channel-trigger") {
              let channelNumber = props.channelNumber;

              if (!channelNumber && props.channelName) {
                const match = String(props.channelName).match(/^ch(\d+)$/i);
                channelNumber = match ? match[1] : props.channelName;
              }

              if (!channelNumber) {
                console.error(
                  "❌ [PROJECTOR-IPC] channel-trigger missing channelNumber/channelName"
                );
                return;
              }

              console.log("🎵 [PROJECTOR-IPC] Channel trigger:", channelNumber);
              return this.handleChannelMessage(`/Ableton/${channelNumber}`);
            }

            if (type === "debug-overlay-visibility") {
              if (typeof props.isOpen !== "boolean") {
                console.error(
                  "❌ [PROJECTOR-IPC] debug-overlay-visibility missing isOpen"
                );
                return;
              }
              this.debugOverlayActive = props.isOpen;
              if (!props.isOpen) {
                if (this.debugLogTimeout) {
                  clearTimeout(this.debugLogTimeout);
                  this.debugLogTimeout = null;
                }
                this.debugLogQueue = [];
              }
              return;
            }
          } catch (error) {
            console.error(
              "❌ [PROJECTOR-IPC] Error processing IPC message:",
              error
            );
            console.error("❌ [PROJECTOR-IPC] Error stack:", error.stack);
            console.error(
              "❌ [PROJECTOR-IPC] Message that caused error:",
              data
            );
          }
        });
      }
    }

    this.initInputListener();
  },

  async introspectModule(moduleId) {
    const safeModuleId = String(moduleId || "").trim();
    if (!safeModuleId) {
      return { moduleId, ok: false, error: "INVALID_MODULE_ID" };
    }

    let mtimeMs = null;
    try {
      if (this.workspacePath) {
        const bridge = globalThis.nwWrldBridge;
        const info =
          bridge?.workspace &&
          typeof bridge.workspace.getModuleUrl === "function"
            ? await bridge.workspace.getModuleUrl(safeModuleId)
            : null;
        mtimeMs = typeof info?.mtimeMs === "number" ? info.mtimeMs : null;
      }
    } catch {
      mtimeMs = null;
    }

    const cacheKey =
      mtimeMs != null ? `${safeModuleId}:${mtimeMs}` : `${safeModuleId}:na`;
    if (this.moduleIntrospectionCache.has(cacheKey)) {
      return this.moduleIntrospectionCache.get(cacheKey);
    }

    const result = await (async () => {
      try {
        const src = await this.loadWorkspaceModuleSource(safeModuleId);
        const assetsBaseUrl = this.getAssetsBaseUrl();
        if (!assetsBaseUrl) {
          throw new Error("ASSETS_BASE_URL_UNAVAILABLE");
        }

        const temp = document.createElement("div");
        temp.style.cssText =
          "position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;";
        document.body.appendChild(temp);

        const host = new TrackSandboxHost(temp);
        let initRes;
        try {
          await host.ensureIframe();
          initRes = await host.introspectModule(src.moduleId, src.text);
        } finally {
          host.destroy();
          try {
            document.body.removeChild(temp);
          } catch {}
        }

        const displayName = initRes?.name || safeModuleId;
        return {
          moduleId: safeModuleId,
          ok: true,
          name: displayName,
          category: initRes?.category || "Workspace",
          methods: Array.isArray(initRes?.methods) ? initRes.methods : [],
          mtimeMs,
        };
      } catch (e) {
        return {
          moduleId: safeModuleId,
          ok: false,
          error: e?.message || "INTROSPECTION_FAILED",
          mtimeMs,
        };
      }
    })();

    for (const key of this.moduleIntrospectionCache.keys()) {
      if (key.startsWith(`${safeModuleId}:`) && key !== cacheKey) {
        this.moduleIntrospectionCache.delete(key);
      }
    }
    this.moduleIntrospectionCache.set(cacheKey, result);
    return result;
  },

  initInputListener() {
    const midiConfig = buildMidiConfig(
      this.userData,
      this.config,
      this.inputType
    );

    const messaging = getMessaging();
    if (!messaging || typeof messaging.onInputEvent !== "function") return;
    messaging.onInputEvent((event, payload) => {
      const { type, data } = payload;

      logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      logger.log(`🎵 [INPUT] Event type: ${type}, source: ${data.source}`);

      let trackName = null;
      const timestamp = data.timestamp || performance.now() / 1000;

      switch (type) {
        case "track-selection":
          logger.log("🎯 [INPUT] Track selection event...");

          if (data.source === "midi") {
            const trackNameFromNote = midiConfig.trackTriggersMap[data.note];
            logger.log(
              `🎯 [INPUT] Note ${data.note} maps to track:`,
              trackNameFromNote
            );

            if (trackNameFromNote) {
              logger.log(`✅ [INPUT] Activating track: "${trackNameFromNote}"`);
              trackName = trackNameFromNote;
              this.handleTrackSelection(trackNameFromNote);
            } else {
              logger.warn(
                `⚠️ [INPUT] Note ${data.note} not mapped to any track`
              );
            }
          } else if (data.source === "osc") {
            const trackNameFromIdentifier =
              midiConfig.trackTriggersMap[data.identifier];
            logger.log(
              `🎯 [INPUT] OSC address ${data.identifier} maps to track:`,
              trackNameFromIdentifier
            );

            if (trackNameFromIdentifier) {
              logger.log(
                `✅ [INPUT] Activating track: "${trackNameFromIdentifier}"`
              );
              trackName = trackNameFromIdentifier;
              this.handleTrackSelection(trackNameFromIdentifier);
            } else {
              logger.warn(
                `⚠️ [INPUT] OSC address ${data.identifier} not mapped to any track`
              );
              logger.log(
                "📋 [INPUT] Available OSC mappings:",
                Object.keys(midiConfig.trackTriggersMap)
              );
            }
          }
          break;

        case "method-trigger":
          logger.log("🎯 [INPUT] Method trigger event...");
          logger.log(
            "🎯 [INPUT] Current active track:",
            this.activeTrack?.name
          );

          let channelNames = [];
          const activeTrackName = this.activeTrack?.name;

          if (activeTrackName && midiConfig.channelMappings[activeTrackName]) {
            const trackMappings = midiConfig.channelMappings[activeTrackName];

            if (data.source === "midi") {
              const mappedChannels = trackMappings[data.note];
              if (mappedChannels) {
                channelNames = Array.isArray(mappedChannels)
                  ? mappedChannels
                  : [mappedChannels];
                logger.log(
                  `🎯 [INPUT] Note ${data.note} maps to channels:`,
                  channelNames
                );
              }
            } else if (data.source === "osc") {
              const mappedChannels = trackMappings[data.channelName];
              if (mappedChannels) {
                channelNames = Array.isArray(mappedChannels)
                  ? mappedChannels
                  : [mappedChannels];
                logger.log(
                  `🎯 [INPUT] OSC address maps to channels:`,
                  channelNames
                );
              }
            }
          } else {
            logger.warn(
              `⚠️ [INPUT] No channel mappings for track "${activeTrackName}"`
            );
          }

          if (channelNames.length > 0 && activeTrackName) {
            trackName = activeTrackName;
            channelNames.forEach((channelName) => {
              logger.log(
                `✅ [INPUT] Triggering ${channelName} on track "${activeTrackName}"`
              );
              this.handleChannelMessage(`/Ableton/${channelName}`, {
                note: data.note,
                channel: data.channel,
                velocity: data.velocity || 127,
                timestamp,
                trackName,
                source: data.source,
              });
            });
          } else if (channelNames.length === 0) {
            logger.warn(`⚠️ [INPUT] Event not mapped to any channel`);
          } else if (!activeTrackName) {
            logger.warn(`⚠️ [INPUT] No active track - select a track first`);
          }
          break;
      }

      const timeStr = timestamp.toFixed(5);
      const source = data.source === "midi" ? "MIDI" : "OSC";
      let log = `[${timeStr}] ${source} Event\n`;
      if (data.source === "midi") {
        log += `  Note: ${data.note}\n`;
        log += `  Channel: ${data.channel}\n`;
      } else if (data.source === "osc") {
        log += `  Address: ${data.address}\n`;
      }
      if (trackName) {
        log += `  Track: ${trackName}\n`;
      }
      this.queueDebugLog(log);

      logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    });
  },

  applyConfigSettings() {
    const config = this.config;
    if (config.aspectRatio) {
      this.toggleAspectRatioStyle(config.aspectRatio);
    }
    if (config.bgColor) {
      this.setBg(config.bgColor);
    }
  },

  loadUserData(activeSetIdOverride = null) {
    const parsedData = loadJsonFileSync(
      "userData.json",
      { config: {}, sets: [] },
      "Could not load userData.json, initializing with empty data."
    );
    const migratedData = migrateToSets(parsedData);

    let activeSetId = null;
    if (activeSetIdOverride) {
      activeSetId = activeSetIdOverride;
    } else {
      const appState = loadJsonFileSync(
        "appState.json",
        { activeSetId: null, workspacePath: null },
        "Could not load appState.json, initializing with defaults."
      );
      activeSetId = appState?.activeSetId || null;
      const projectDir = getProjectDir();
      this.workspacePath = projectDir || appState?.workspacePath || null;
    }

    this.userData = getActiveSetTracks(migratedData, activeSetId);
    this.config = migratedData.config || {};
    this.inputType = migratedData.config?.input?.type || "midi";
    console.log(
      `✅ [Projector] Loaded ${this.userData.length} tracks from set: ${
        activeSetId || "default"
      }`
    );
  },

  refreshPage() {
    // Reload the current window
    window.location.reload();
  },

  deactivateActiveTrack() {
    if (!this.activeTrack || this.isDeactivating) return;
    this.isDeactivating = true;

    const modulesContainer = document.querySelector(".modules");
    if (!modulesContainer) {
      this.isDeactivating = false;
      return;
    }

    try {
      this.trackSandboxHost?.destroy?.();
    } catch {}
    this.trackSandboxHost = null;

    forEach(this.activeModules, (instances, instanceId) => {
      forEach(instances, (instance) => {
        if (isFunction(instance.destroy)) {
          try {
            instance.destroy();
          } catch (error) {
            console.error(
              `Error during destroy of instance "${instanceId}":`,
              error
            );
          }
        }
      });
    });

    try {
      modulesContainer.textContent = "";
    } catch {}

    this.activeModules = {};
    this.activeTrack = null;
    this.activeChannelHandlers = {};
    this.isDeactivating = false;
  },

  async handleTrackSelection(trackName) {
    logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.log("📦 [TRACK] handleTrackSelection called with:", trackName);
    logger.log("📦 [TRACK] Current userData:", this.userData);
    logger.log("📦 [TRACK] Looking for track with name:", trackName);

    // If already loading, store this as pending and return
    if (this.isLoadingTrack) {
      // If requesting the same track that's loading, ignore
      if (this.activeTrack?.name === trackName) {
        logger.log(
          "⚠️ [TRACK] Already loading this track, ignoring duplicate request"
        );
        return;
      }
      // Store the new track as pending (latest request wins)
      logger.log(
        `⚠️ [TRACK] Track load in progress, queueing "${trackName}" as pending`
      );
      this.pendingTrackName = trackName;
      return;
    }

    // Set loading flag early to prevent concurrent loads
    this.isLoadingTrack = true;

    const track = find(this.userData, { name: trackName });
    logger.log("📦 [TRACK] Track found:", track);

    if (!track) {
      logger.error(`❌ [TRACK] Track "${trackName}" not found in userData`);
      logger.log(
        "📦 [TRACK] Available tracks:",
        this.userData.map((t) => t.name)
      );
      this.deactivateActiveTrack();
      this.isLoadingTrack = false;
      return;
    }

    logger.log("📦 [TRACK] Current activeTrack:", this.activeTrack);

    if (this.activeTrack && this.activeTrack.name !== trackName) {
      logger.log(
        "📦 [TRACK] Deactivating previous track:",
        this.activeTrack.name
      );
      this.deactivateActiveTrack();
    }

    if (this.activeTrack?.name === trackName) {
      logger.log("⚠️ [TRACK] Track already active, skipping");
      this.isLoadingTrack = false;
      return;
    }

    const modulesContainer = document.querySelector(".modules");
    logger.log("📦 [TRACK] Modules container:", modulesContainer);

    if (!modulesContainer) {
      logger.error("❌ [TRACK] No .modules container found in DOM!");
      this.isLoadingTrack = false;
      return;
    }

    logger.log("📦 [TRACK] Track modules to load:", track.modules);

    if (!Array.isArray(track.modules)) {
      logger.error(
        `❌ [TRACK] Track "${trackName}" has invalid modules array:`,
        track.modules
      );
      logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      this.isLoadingTrack = false;
      return;
    }

    try {
      this.activeTrack = track;
      this.activeChannelHandlers = this.buildChannelHandlerMap(track);

      const assetsBaseUrl = this.getAssetsBaseUrl();
      if (!assetsBaseUrl) {
        throw new Error("ASSETS_BASE_URL_UNAVAILABLE");
      }

      const moduleSources = {};
      const seenTypes = new Set();
      for (const m of track.modules) {
        const t = String(m?.type || "").trim();
        if (!t || seenTypes.has(t)) continue;
        seenTypes.add(t);
        const src = await this.loadWorkspaceModuleSource(t);
        moduleSources[t] = { text: src?.text || "" };
      }
      this.trackModuleSources = moduleSources;

      if (!this.trackSandboxHost) {
        this.trackSandboxHost = new TrackSandboxHost(modulesContainer);
      }

      logger.log("⏳ [TRACK] Waiting for sandbox track init...");
      const res = await this.trackSandboxHost.initTrack({
        track,
        moduleSources,
        assetsBaseUrl,
      });
      if (!res || res.ok !== true) {
        throw new Error(res?.error || "SANDBOX_TRACK_INIT_FAILED");
      }

      this.activeModules = {};
      for (const m of track.modules) {
        const instanceId = String(m?.id || "").trim();
        if (!instanceId) continue;
        this.activeModules[instanceId] = [{}];
      }
      logger.log("✅ [TRACK] Sandbox track initialized");

      logger.log(`✅✅✅ [TRACK] Track activated successfully: "${trackName}"`);
      logger.log("📦 [TRACK] Active modules:", Object.keys(this.activeModules));
      logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    } catch (error) {
      logger.error(
        `❌ [TRACK] Failed to activate track "${trackName}":`,
        error
      );
      this.deactivateActiveTrack();
    } finally {
      this.isLoadingTrack = false;
    }

    // Check if another track switch was requested during load
    if (this.pendingTrackName) {
      const nextTrack = this.pendingTrackName;
      this.pendingTrackName = null;
      logger.log(`🔄 [TRACK] Loading pending track: "${nextTrack}"`);
      this.handleTrackSelection(nextTrack);
      return;
    }

    if (this.pendingReloadData) {
      const pending = this.pendingReloadData;
      this.pendingReloadData = null;
      this.loadUserData(pending.setId);
      this.applyConfigSettings();
      if (pending.trackName) {
        const nextTrack = find(this.userData, { name: pending.trackName });
        if (
          this.activeTrack &&
          this.activeTrack.name === pending.trackName &&
          nextTrack &&
          isEqual(
            {
              name: this.activeTrack.name,
              modules: this.activeTrack.modules,
              modulesData: this.activeTrack.modulesData,
              channelMappings: this.activeTrack.channelMappings,
            },
            {
              name: nextTrack.name,
              modules: nextTrack.modules,
              modulesData: nextTrack.modulesData,
              channelMappings: nextTrack.channelMappings,
            }
          )
        ) {
          // no-op
        } else {
          this.deactivateActiveTrack();
          this.handleTrackSelection(pending.trackName);
          return;
        }
      }
    }

    // Only send ready when no pending track
    {
      const messaging = getMessaging();
      messaging?.sendToDashboard?.("projector-ready", {});
    }
    logger.log("✅ [PROJECTOR-IPC] Sent projector-ready signal to dashboard");
  },

  async handleChannelMessage(channelPath, debugContext = {}) {
    if (!this.activeTrack) return;

    if (this.isLoadingTrack) {
      logger.warn(`Ignoring channel trigger during track initialization`);
      return;
    }

    const track = this.activeTrack;
    const channelMatch = channelPath.match(/^\/Ableton\/(\d+)$/);

    if (channelMatch && channelMatch[1]) {
      const channelNumber = channelMatch[1];
      logger.log(`Received message for channel: ${channelNumber}`);
      const { modulesData } = track;
      if (!this.activeChannelHandlers[channelNumber]) {
        this.activeChannelHandlers = this.buildChannelHandlerMap(track);
      }
      const channelTargets = this.activeChannelHandlers[channelNumber] || [];
      if (channelTargets.length === 0) {
        logger.warn(`No modules mapped to channel ${channelNumber}`);
        return;
      }

      await Promise.all(
        channelTargets.map(async ({ instanceId, moduleType }) => {
          if (this.debugOverlayActive) {
            Projector.logToMain(
              `instanceId: ${instanceId}, moduleType: ${moduleType}`
            );
          }

          const moduleData = get(modulesData, instanceId);
          if (!moduleData) return;

          const methods = get(moduleData.methods, channelNumber);
          if (!methods) return;

          const moduleInstances = this.activeModules[instanceId] || [];
          await this.executeMethods(
            methods,
            instanceId,
            moduleInstances,
            false,
            {
              ...debugContext,
              moduleInfo: { instanceId, type: moduleType },
              trackName: this.activeTrack.name,
            }
          );
        })
      );
    } else {
      logger.warn(`Invalid channel path received: ${channelPath}`);
    }
  },

  buildChannelHandlerMap(track) {
    if (!track || !Array.isArray(track.modules)) {
      return {};
    }
    const map = {};
    track.modules.forEach(({ id: instanceId, type }) => {
      const methodEntries = get(track, ["modulesData", instanceId, "methods"]);
      if (!methodEntries) return;
      Object.entries(methodEntries).forEach(([channelNumber, methods]) => {
        if (!Array.isArray(methods) || methods.length === 0) return;
        if (!map[channelNumber]) {
          map[channelNumber] = [];
        }
        map[channelNumber].push({
          instanceId,
          moduleType: type,
        });
      });
    });
    return map;
  },

  async executeMethods(
    methods,
    instanceId,
    moduleInstances,
    isConstructor = false,
    debugContext = {}
  ) {
    logger.log(`⏱️ executeMethods start: ${instanceId}`);

    if (this.debugOverlayActive) {
      Projector.logToMain(`${performance.now()}`);
      Projector.logToMain(`executeMethods: ${instanceId}`);
    }

    let needsMatrixUpdate = false;
    let matrixOptions = null;
    let otherMethods = [];
    forEach(methods, (method) => {
      if (method.name === "matrix") {
        needsMatrixUpdate = true;
        matrixOptions = method.options;
      } else {
        otherMethods.push(method);
      }
    });

    if (needsMatrixUpdate && this.trackSandboxHost && this.activeTrack) {
      const assetsBaseUrl = this.getAssetsBaseUrl();
      const moduleSources = this.trackModuleSources || {};
      if (assetsBaseUrl) {
        await this.trackSandboxHost.initTrack({
          track: this.activeTrack,
          moduleSources,
          assetsBaseUrl,
        });
      }
    }

    logger.log(`⏱️ Other methods execution start: ${instanceId}`);
    await Promise.all(
      otherMethods.map(async ({ name: methodName, options: methodOptions }) => {
        const options = buildMethodOptions(methodOptions, {
          onInvalidRandomRange: ({ name, min, max, value }) => {
            console.warn(
              `[Projector] Invalid randomRange for "${name}": [${min}, ${max}] - expected numbers. Using value: ${value}`
            );
          },
          onSwapRandomRange: ({ name, min, max }) => {
            console.warn(
              `[Projector] Invalid randomRange for "${name}": min (${min}) > max (${max}). Swapping values.`
            );
          },
        });

        const timestamp = (
          debugContext.timestamp || performance.now() / 1000
        ).toFixed(5);
        let log = `[${timestamp}] Method Execution\n`;
        if (debugContext.trackName) {
          log += `  Track: ${debugContext.trackName}\n`;
        }
        if (debugContext.moduleInfo) {
          log += `  Module: ${debugContext.moduleInfo.instanceId} (${debugContext.moduleInfo.type})\n`;
        }
        log += `  Method: ${methodName}\n`;
        if (options && Object.keys(options).length > 0) {
          log += `  Props: ${JSON.stringify(options, null, 2)}\n`;
        }
        this.queueDebugLog(log);

        logger.log(`⏱️ Method start: ${methodName} for ${instanceId}`);
        if (this.debugOverlayActive) {
          Projector.logToMain(
            `${JSON.stringify(options)} [${performance.now()}]`
          );
        }

        const host = this.trackSandboxHost;
        if (!host) return;
        const res = await host.invokeOnInstance(
          instanceId,
          methodName,
          options
        );
        if (!res || res.ok !== true) {
          throw new Error(res?.error || "SANDBOX_INVOKE_FAILED");
        }

        if (isConstructor) {
          logger.log(
            `Executed constructor method "${methodName}" on module "${instanceId}".`
          );
        } else {
          logger.log(
            `Executed method "${methodName}" with options ${JSON.stringify(
              options
            )} on module "${instanceId}".`
          );
        }
        logger.log(`⏱️ Method end: ${methodName} for ${instanceId}`);
      })
    );
    logger.log(`⏱️ Other methods execution end: ${instanceId}`);
    logger.log(`⏱️ executeMethods end: ${instanceId}`);
  },

  toggleAspectRatioStyle(selectedRatioId) {
    document.documentElement.classList.remove("reel", "portrait", "scale");

    const ratio = this.settings.aspectRatios.find(
      (r) => r.id === selectedRatioId
    );
    if (!ratio) {
      logger.warn(`Aspect ratio "${selectedRatioId}" not found in settings`);
      document.body.style = ``;
      return;
    }

    if (ratio.id === "landscape") {
      document.body.style = ``;
    } else {
      if (ratio.id === "9-16") {
        document.documentElement.classList.add("reel");
      } else if (ratio.id === "4-5") {
        document.documentElement.classList.add("scale");
      }

      document.body.style = `
        width: ${ratio.width}; 
        height: ${ratio.height};
        position: relative;
        margin: 0 auto;
        transform-origin: center center;
      `;
    }
  },

  setBg(colorId) {
    const color = this.settings.backgroundColors.find((c) => c.id === colorId);
    if (!color) {
      logger.warn(`Background color "${colorId}" not found in settings`);
      return;
    }

    const currentStyle = document.documentElement.style.filter;
    const hasHueRotate = currentStyle.includes("hue-rotate");
    const hueRotateValue = hasHueRotate
      ? currentStyle.match(/hue-rotate\(([^)]+)\)/)[1]
      : "";

    document.documentElement.style.backgroundColor = color.value;
    document.documentElement.style.filter = hasHueRotate
      ? `invert(0) hue-rotate(${hueRotateValue})`
      : "invert(0)";
  },

  async previewModule(moduleName, moduleData) {
    const token = ++this.previewToken;
    logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    logger.log(`🎨 [PREVIEW] Starting preview for module: ${moduleName}`);
    logger.log(`🎨 [PREVIEW] Module data received:`, moduleData);

    logger.log(`🎨 [PREVIEW] Clearing any existing preview...`);
    const prevName = this.previewModuleName;
    if (prevName) {
      this.clearPreviewForModule(prevName);
    }

    const modulesContainer = document.querySelector(".modules");
    logger.log(`🎨 [PREVIEW] Modules container found:`, !!modulesContainer);
    if (!modulesContainer) {
      logger.error("❌ [PREVIEW] No .modules container found in DOM");
      return;
    }

    if (token !== this.previewToken) {
      return;
    }

    try {
      logger.log(`🎨 [PREVIEW] Setting preview module name: ${moduleName}`);
      this.previewModuleName = moduleName;
      const previewKey = `preview_${moduleName}`;
      const assetsBaseUrl = this.getAssetsBaseUrl();
      if (!assetsBaseUrl) throw new Error("ASSETS_BASE_URL_UNAVAILABLE");

      const src = await this.loadWorkspaceModuleSource(moduleName);
      const moduleSources = { [moduleName]: { text: src?.text || "" } };

      if (this.activeTrack?.name) {
        this.restoreTrackNameAfterPreview = this.activeTrack.name;
      } else {
        this.restoreTrackNameAfterPreview = null;
      }

      try {
        this.trackSandboxHost?.destroy?.();
      } catch {}
      this.trackSandboxHost = new TrackSandboxHost(modulesContainer);
      this.trackModuleSources = moduleSources;

      const track = {
        name: `preview:${moduleName}`,
        modules: [{ id: previewKey, type: moduleName }],
        modulesData: {
          [previewKey]: {
            constructor: Array.isArray(moduleData?.constructor)
              ? moduleData.constructor
              : [],
          },
        },
      };

      const res = await this.trackSandboxHost.initTrack({
        track,
        moduleSources,
        assetsBaseUrl,
      });
      if (!res || res.ok !== true) {
        throw new Error(res?.error || "SANDBOX_PREVIEW_INIT_FAILED");
      }
      this.activeModules[previewKey] = [{}];

      if (token !== this.previewToken) {
        this.clearPreviewForModule(moduleName);
        logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        return;
      }

      logger.log(`✅✅✅ [PREVIEW] Preview active for: ${moduleName}`);
      logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    } catch (error) {
      logger.error(
        `❌ [PREVIEW] Error instantiating module "${moduleName}":`,
        error
      );
      logger.error(`❌ [PREVIEW] Error stack:`, error.stack);

      this.clearPreviewForModule(moduleName);

      logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }
  },

  clearPreview() {
    this.previewToken++;
    logger.log(`🧹 [PREVIEW] clearPreview called`);

    if (!this.previewModuleName) {
      logger.log(`🧹 [PREVIEW] No preview module to clear`);
      return;
    }

    const moduleName = this.previewModuleName;
    this.clearPreviewForModule(moduleName);
  },

  clearPreviewForModule(moduleName) {
    logger.log(`🧹 [PREVIEW] Clearing preview for: ${moduleName}`);

    const modulesContainer = document.querySelector(".modules");
    if (!modulesContainer) {
      logger.error("❌ [PREVIEW] No .modules container found");
      if (this.previewModuleName === moduleName) {
        this.previewModuleName = null;
      }
      return;
    }

    const previewKey = `preview_${moduleName}`;
    try {
      this.trackSandboxHost?.destroy?.();
    } catch {}
    this.trackSandboxHost = null;
    this.trackModuleSources = null;
    try {
      modulesContainer.textContent = "";
    } catch {}

    if (this.activeModules[previewKey]) {
      delete this.activeModules[previewKey];
    }
    if (this.previewModuleName === moduleName) {
      this.previewModuleName = null;
    }
    logger.log(`✅✅✅ [PREVIEW] Preview cleared successfully`);

    const restore = this.restoreTrackNameAfterPreview;
    this.restoreTrackNameAfterPreview = null;
    if (restore) {
      this.handleTrackSelection(restore);
    }
  },

  async triggerPreviewMethod(moduleName, methodName, options) {
    logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    logger.log(
      `🎯 [PREVIEW] Triggering method "${methodName}" on preview: ${moduleName}`
    );
    logger.log(`🎯 [PREVIEW] Options:`, options);

    if (!this.previewModuleName || this.previewModuleName !== moduleName) {
      logger.error(`❌ [PREVIEW] No active preview for module: ${moduleName}`);
      logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      return;
    }

    const previewKey = `preview_${moduleName}`;
    const host = this.trackSandboxHost;
    if (!host) return;

    try {
      const res = await host.invokeOnInstance(previewKey, methodName, options);
      if (!res || res.ok !== true) {
        throw new Error(res?.error || "SANDBOX_PREVIEW_INVOKE_FAILED");
      }
      logger.log(`✅✅✅ [PREVIEW] Method trigger completed`);
      logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    } catch (error) {
      logger.error(
        `❌ [PREVIEW] Error triggering method "${methodName}":`,
        error
      );
      logger.error(`❌ [PREVIEW] Error stack:`, error.stack);
      logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }
  },
};

export default Projector;
