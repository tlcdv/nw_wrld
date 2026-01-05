import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import Editor, { loader } from "@monaco-editor/react";
import { FaTimes, FaRedo, FaPlay } from "react-icons/fa";
import { Button } from "./Button.js";
import {
  TextInput,
  NumberInput,
  ColorInput,
  Select,
  Checkbox,
  TERMINAL_STYLES,
} from "./FormInputs.js";
import { getBaseMethodNames } from "../utils/moduleUtils.js";
import { MethodBlock } from "./MethodBlock.js";
import { HelpIcon } from "./HelpIcon.js";
import { HELP_TEXT } from "../../shared/helpText.js";

const getBridge = () => globalThis.nwWrldBridge;

const TEMPLATES = {
  basic: (moduleName) => `/*
@nwWrld name: ${moduleName}
@nwWrld category: Custom
@nwWrld imports: ModuleBase
*/

class ${moduleName} extends ModuleBase {
  static methods = [
    ...((ModuleBase && ModuleBase.methods) || []),
    {
      name: "exampleMethod",
      executeOnLoad: false,
      options: [
        {
          name: "param1",
          defaultVal: 100,
          type: "number",
        },
      ],
    },
  ];

  constructor(container) {
    super(container);
    this.init();
  }

  init() {
    if (!this.elem) return;
    const html = \`
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 3rem;
        color: white;
      ">
        ${moduleName}
      </div>
    \`;
    this.elem.insertAdjacentHTML("beforeend", html);
  }

  exampleMethod({ param1 = 100 }) {
    void param1;
  }

  destroy() {
    super.destroy();
  }
}

export default ${moduleName};
`,

  threejs: (moduleName) => `/*
@nwWrld name: ${moduleName}
@nwWrld category: 3D
@nwWrld imports: BaseThreeJsModule, THREE
*/

class ${moduleName} extends BaseThreeJsModule {
  static methods = [
    ...((BaseThreeJsModule && BaseThreeJsModule.methods) || []),
    {
      name: "exampleMethod",
      executeOnLoad: false,
      options: [
        {
          name: "param1",
          defaultVal: 1.0,
          type: "number",
        },
      ],
    },
  ];

  constructor(container) {
    super(container);
    this.customGroup = new THREE.Group();
    this.init();
  }

  init() {
    if (this.destroyed) return;
    if (!this.scene || !this.camera) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.cube = new THREE.Mesh(geometry, material);
    this.customGroup.add(this.cube);
    this.scene.add(this.customGroup);

    this.camera.position.z = 5;

    this.setCustomAnimate(this.animateLoop.bind(this));
  }

  animateLoop() {
    if (this.cube) {
      this.cube.rotation.x += 0.01;
      this.cube.rotation.y += 0.01;
    }
  }

  exampleMethod({ param1 = 1.0 }) {
    if (this.cube) {
      this.cube.scale.set(param1, param1, param1);
    }
  }

  destroy() {
    if (this.destroyed) return;
    if (this.cube) {
      this.customGroup.remove(this.cube);
      this.cube.geometry.dispose();
      this.cube.material.dispose();
    }
    super.destroy();
  }
}

export default ${moduleName};
`,

  p5js: (moduleName) => `/*
@nwWrld name: ${moduleName}
@nwWrld category: 2D
@nwWrld imports: ModuleBase, p5
*/

class ${moduleName} extends ModuleBase {
  static methods = [
    ...((ModuleBase && ModuleBase.methods) || []),
    {
      name: "exampleMethod",
      executeOnLoad: false,
      options: [
        {
          name: "param1",
          defaultVal: 255,
          type: "number",
        },
      ],
    },
  ];

  constructor(container) {
    super(container);
    this.p5Instance = null;
    this.param1Value = 255;
    this.init();
  }

  init() {
    if (!this.elem) return;
    const sketch = (p) => {
      p.setup = () => {
        p.createCanvas(this.elem.offsetWidth, this.elem.offsetHeight);
        p.background(0);
      };

      p.draw = () => {
        p.background(0, 10);
        p.fill(this.param1Value);
        p.noStroke();
        p.ellipse(p.mouseX, p.mouseY, 50, 50);
      };
    };

    this.p5Instance = new p5(sketch, this.elem);
  }

  exampleMethod({ param1 = 255 }) {
    this.param1Value = param1;
  }

  destroy() {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    super.destroy();
  }
}

export default ${moduleName};
`,
};

export const ModuleEditorModal = ({
  isOpen,
  onClose,
  moduleName,
  templateType = null,
  onModuleSaved,
  predefinedModules = [],
  workspacePath = null,
}) => {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const editorRef = useRef(null);

  const [methodOptions, setMethodOptions] = useState({});

  const moduleData = useMemo(() => {
    if (!moduleName) return null;
    return predefinedModules.find(
      (m) => m.id === moduleName || m.name === moduleName
    );
  }, [predefinedModules, moduleName]);

  const filePath = useMemo(() => {
    if (!moduleName) return null;
    if (workspacePath) {
      return `${workspacePath}/modules/${moduleName}.js`;
    }
    return null;
  }, [moduleName, workspacePath]);

  const handleOpenInFileExplorer = useCallback(() => {
    const bridge = getBridge();
    if (
      !bridge ||
      !bridge.workspace ||
      typeof bridge.workspace.showModuleInFolder !== "function"
    ) {
      return;
    }
    bridge.workspace.showModuleInFolder(moduleName);
  }, [moduleName]);

  const { moduleBase, threeBase } = useMemo(() => getBaseMethodNames(), []);

  const customMethods = useMemo(() => {
    if (!moduleData || !moduleData.methods) return [];

    const allBaseMethods = [...moduleBase, ...threeBase];
    return moduleData.methods.filter(
      (method) => !allBaseMethods.includes(method.name)
    );
  }, [moduleData, moduleBase, threeBase]);

  const methodsWithValues = useMemo(() => {
    return customMethods.map((method) => ({
      name: method.name,
      options: (method.options || []).map((opt) => {
        const currentValue =
          methodOptions[method.name]?.[opt.name] !== undefined
            ? methodOptions[method.name][opt.name]
            : opt.defaultVal;
        return {
          name: opt.name,
          value: currentValue,
        };
      }),
    }));
  }, [customMethods, methodOptions]);

  useEffect(() => {
    try {
      const vsUrl = new URL(
        "../../../dist/vs",
        window.location.href
      ).toString();
      loader.config({ paths: { vs: vsUrl } });
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);

    if (templateType && moduleName) {
      const WORKSPACE_TEMPLATES = {
        basic: (n) =>
          [
            "/*",
            `@nwWrld name: ${n}`,
            "@nwWrld category: Custom",
            "@nwWrld imports: ModuleBase",
            "*/",
            "",
            `class ${n} extends ModuleBase {`,
            "",
            "  static methods = [",
            "    ...((ModuleBase && ModuleBase.methods) || []),",
            "    {",
            '      name: "exampleMethod",',
            "      executeOnLoad: false,",
            "      options: [",
            '        { name: "param1", defaultVal: 100, type: "number" },',
            "      ],",
            "    },",
            "  ];",
            "",
            "  constructor(container) {",
            "    super(container);",
            "    this.init();",
            "  }",
            "",
            "  init() {",
            "    const html = `",
            '      <div style="',
            "        position: absolute;",
            "        top: 50%;",
            "        left: 50%;",
            "        transform: translate(-50%, -50%);",
            "        font-size: 3rem;",
            "        color: white;",
            '      ">',
            `        ${n}`,
            "      </div>",
            "    `;",
            "    if (this.elem) {",
            '      this.elem.insertAdjacentHTML("beforeend", html);',
            "    }",
            "  }",
            "",
            "  exampleMethod({ param1 = 100 } = {}) {",
            "  }",
            "",
            "  destroy() {",
            "    super.destroy();",
            "  }",
            "}",
            "",
            `export default ${n};`,
            "",
          ].join("\n"),
        threejs: (n) =>
          [
            "/*",
            `@nwWrld name: ${n}`,
            "@nwWrld category: 3D",
            "@nwWrld imports: BaseThreeJsModule, THREE",
            "*/",
            "",
            `class ${n} extends BaseThreeJsModule {`,
            "",
            "  static methods = [",
            "    ...((BaseThreeJsModule && BaseThreeJsModule.methods) || []),",
            "  ];",
            "",
            "  constructor(container) {",
            "    super(container);",
            "    if (!THREE) return;",
            "    const geometry = new THREE.BoxGeometry(1, 1, 1);",
            "    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });",
            "    this.cube = new THREE.Mesh(geometry, material);",
            "    const light = new THREE.DirectionalLight(0xffffff, 2);",
            "    light.position.set(2, 2, 4);",
            "    this.scene.add(light);",
            "    this.setModel(this.cube);",
            "    this.setCustomAnimate(() => {",
            "      if (!this.cube) return;",
            "      this.cube.rotation.x += 0.01;",
            "      this.cube.rotation.y += 0.01;",
            "    });",
            "  }",
            "",
            "  destroy() {",
            "    this.cube = null;",
            "    super.destroy();",
            "  }",
            "}",
            "",
            `export default ${n};`,
            "",
          ].join("\n"),
        p5js: (n) =>
          [
            "/*",
            `@nwWrld name: ${n}`,
            "@nwWrld category: 2D",
            "@nwWrld imports: ModuleBase, p5",
            "*/",
            "",
            `class ${n} extends ModuleBase {`,
            "",
            "  static methods = [",
            "    ...((ModuleBase && ModuleBase.methods) || []),",
            "  ];",
            "",
            "  constructor(container) {",
            "    super(container);",
            "    this.p5Instance = null;",
            "    this.param1Value = 255;",
            "    this.init();",
            "  }",
            "",
            "  init() {",
            "    if (!p5) return;",
            "    const sketch = (p) => {",
            "      p.setup = () => {",
            "        p.createCanvas(this.elem.offsetWidth, this.elem.offsetHeight);",
            "        p.background(0);",
            "      };",
            "      p.draw = () => {",
            "        p.background(0, 10);",
            "        p.fill(this.param1Value);",
            "        p.noStroke();",
            "        p.ellipse(p.mouseX, p.mouseY, 50, 50);",
            "      };",
            "    };",
            "    this.p5Instance = new p5(sketch, this.elem);",
            "  }",
            "",
            "  destroy() {",
            "    if (this.p5Instance) {",
            "      this.p5Instance.remove();",
            "      this.p5Instance = null;",
            "    }",
            "    super.destroy();",
            "  }",
            "}",
            "",
            `export default ${n};`,
            "",
          ].join("\n"),
      };

      const template = (workspacePath ? WORKSPACE_TEMPLATES : TEMPLATES)[
        templateType
      ](moduleName);
      setCode(template);
      setIsLoading(false);
      try {
        const bridge = getBridge();
        if (
          bridge &&
          bridge.workspace &&
          typeof bridge.workspace.moduleExists === "function" &&
          typeof bridge.workspace.writeModuleTextSync === "function"
        ) {
          if (!bridge.workspace.moduleExists(moduleName)) {
            const res = bridge.workspace.writeModuleTextSync(
              moduleName,
              template
            );
            if (res && res.ok === false) {
              setError(
                `Failed to create module: ${res.reason || "write failed"}`
              );
            }
          }
        }
      } catch (err) {
        setError(`Failed to create module: ${err.message}`);
      }
    } else if (moduleName) {
      (async () => {
        try {
          const bridge = getBridge();
          if (
            !bridge ||
            !bridge.workspace ||
            typeof bridge.workspace.readModuleText !== "function"
          ) {
            throw new Error("Workspace bridge unavailable");
          }
          const fileContent = await bridge.workspace.readModuleText(moduleName);
          if (fileContent == null) {
            throw new Error("Module file not found");
          }
          setCode(String(fileContent));
          setIsLoading(false);
        } catch (err) {
          setError(`Failed to load module: ${err.message}`);
          setIsLoading(false);
        }
      })();
    }
  }, [isOpen, moduleName, templateType, workspacePath]);

  useEffect(() => {
    if (isOpen && moduleData && !isLoading) {
      triggerPreview();
    }
  }, [isOpen, isLoading, moduleData]);

  const triggerPreview = () => {
    if (!moduleName || !moduleData) return;

    try {
      const executeOnLoadMethods = moduleData.methods
        .filter((m) => m.executeOnLoad)
        .map((m) => ({
          name: m.name,
          options:
            m.options?.length > 0
              ? m.options.map((opt) => ({
                  name: opt.name,
                  value: opt.defaultVal,
                }))
              : null,
        }));

      const showMethod = moduleData.methods.find((m) => m.name === "show");
      const finalConstructorMethods = [...executeOnLoadMethods];

      if (
        showMethod &&
        !finalConstructorMethods.some((m) => m.name === "show")
      ) {
        finalConstructorMethods.push({
          name: "show",
          options:
            showMethod.options?.length > 0
              ? showMethod.options.map((opt) => ({
                  name: opt.name,
                  value: opt.defaultVal,
                }))
              : null,
        });
      }

      const previewData = {
        type: "preview-module",
        props: {
          moduleName: moduleName,
          moduleData: {
            constructor: finalConstructorMethods,
            methods: {},
          },
        },
      };

      const bridge = getBridge();
      bridge?.messaging?.sendToProjector?.(previewData.type, previewData.props);
    } catch (error) {
      console.error("Error triggering preview:", error);
    }
  };

  const clearPreview = () => {
    const bridge = getBridge();
    bridge?.messaging?.sendToProjector?.("clear-preview", {});
  };

  const handleMethodTrigger = (method) => {
    const params = {};
    method.options.forEach((opt) => {
      params[opt.name] = opt.value;
    });

    const bridge = getBridge();
    bridge?.messaging?.sendToProjector?.("trigger-preview-method", {
      moduleName: moduleName,
      methodName: method.name,
      options: params,
    });
  };

  const handleOptionChange = useCallback((methodName, optionName, value) => {
    setMethodOptions((prev) => ({
      ...prev,
      [methodName]: {
        ...prev[methodName],
        [optionName]: value,
      },
    }));
  }, []);

  const handleClose = () => {
    clearPreview();
    setCode("");
    setError(null);
    setMethodOptions({});
    onClose();
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    monaco.editor.defineTheme("custom-dark", {
      base: "vs-dark",
      inherit: false,
      rules: [
        { token: "", foreground: "d4d4d8" },
        { token: "string", foreground: "b85c5c" },
        { token: "string.escape", foreground: "d4d4d8" },
        { token: "string.sql", foreground: "b85c5c" },
        { token: "string.yaml", foreground: "b85c5c" },
        { token: "keyword", foreground: "b85c5c" },
        { token: "keyword.control", foreground: "b85c5c" },
        { token: "keyword.operator", foreground: "737373" },
        { token: "keyword.other", foreground: "b85c5c" },
        { token: "comment", foreground: "525252" },
        { token: "comment.line", foreground: "525252" },
        { token: "comment.block", foreground: "525252" },
        { token: "function", foreground: "b85c5c" },
        { token: "function.call", foreground: "b85c5c" },
        { token: "variable", foreground: "a3a3a3" },
        { token: "variable.parameter", foreground: "a3a3a3" },
        { token: "variable.other", foreground: "a3a3a3" },
        { token: "variable.property", foreground: "a3a3a3" },
        { token: "number", foreground: "a3a3a3" },
        { token: "number.hex", foreground: "a3a3a3" },
        { token: "number.octal", foreground: "a3a3a3" },
        { token: "number.binary", foreground: "a3a3a3" },
        { token: "type", foreground: "b85c5c" },
        { token: "type.identifier", foreground: "b85c5c" },
        { token: "class", foreground: "b85c5c" },
        { token: "class.identifier", foreground: "b85c5c" },
        { token: "operator", foreground: "737373" },
        { token: "delimiter", foreground: "737373" },
        { token: "delimiter.bracket", foreground: "737373" },
        { token: "delimiter.parenthesis", foreground: "737373" },
        { token: "delimiter.square", foreground: "737373" },
        { token: "delimiter.curly", foreground: "737373" },
        { token: "delimiter.angle", foreground: "737373" },
        { token: "tag", foreground: "d4d4d8" },
        { token: "attribute.name", foreground: "a3a3a3" },
        { token: "attribute.value", foreground: "a3a3a3" },
        { token: "property", foreground: "a3a3a3" },
        { token: "property.name", foreground: "a3a3a3" },
        { token: "constant", foreground: "a3a3a3" },
        { token: "constant.numeric", foreground: "a3a3a3" },
        { token: "constant.language", foreground: "d4d4d8" },
        { token: "constant.character", foreground: "a3a3a3" },
        { token: "regexp", foreground: "a3a3a3" },
        { token: "entity", foreground: "d4d4d8" },
        { token: "entity.name", foreground: "d4d4d8" },
        { token: "entity.name.function", foreground: "b85c5c" },
        { token: "entity.name.type", foreground: "b85c5c" },
        { token: "entity.name.class", foreground: "b85c5c" },
        { token: "support.function", foreground: "b85c5c" },
        { token: "support.type", foreground: "b85c5c" },
        { token: "support.class", foreground: "b85c5c" },
        { token: "support.constant", foreground: "a3a3a3" },
        { token: "support.variable", foreground: "a3a3a3" },
        { token: "invalid", foreground: "737373" },
        { token: "invalid.illegal", foreground: "737373" },
        { token: "meta", foreground: "737373" },
        { token: "meta.brace", foreground: "737373" },
        { token: "punctuation", foreground: "737373" },
        { token: "punctuation.definition", foreground: "737373" },
        { token: "punctuation.section", foreground: "737373" },
        { token: "text", foreground: "d4d4d8" },
        { token: "storage", foreground: "d4d4d8" },
        { token: "storage.type", foreground: "d4d4d8" },
        { token: "storage.modifier", foreground: "d4d4d8" },
      ],
      colors: {
        "editor.background": "#101010",
        "editor.foreground": "#d4d4d8",
        "editorLineNumber.foreground": "#525252",
        "editor.selectionBackground": "#262626",
        "editor.lineHighlightBackground": "#1a1a1a",
        "editorCursor.foreground": "#d4d4d8",
        "editorWhitespace.foreground": "#333333",
        "editorIndentGuide.background": "#262626",
        "editorIndentGuide.activeBackground": "#404040",
        "editor.selectionHighlightBackground": "#262626",
        "editor.wordHighlightBackground": "#262626",
        "editor.wordHighlightStrongBackground": "#262626",
        "editorBracketMatch.background": "#262626",
        "editorBracketMatch.border": "#737373",
        "editorBracketHighlight.foreground1": "#737373",
        "editorBracketHighlight.foreground2": "#737373",
        "editorBracketHighlight.foreground3": "#737373",
        "editorBracketHighlight.foreground4": "#737373",
        "editorBracketHighlight.foreground5": "#737373",
        "editorBracketHighlight.foreground6": "#737373",
        "editorBracketPairGuide.activeBackground": "#404040",
        "editorBracketPairGuide.background": "#262626",
      },
    });

    monaco.editor.setTheme("custom-dark");

    editor.focus();

    const writeClipboard = async (text) => {
      try {
        await navigator.clipboard.writeText(String(text ?? ""));
      } catch {}
    };
    const readClipboard = async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return "";
      }
    };

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {
      const selection = editor.getSelection();
      const selectedText = editor.getModel().getValueInRange(selection);
      if (selectedText) {
        void writeClipboard(selectedText);
      }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => {
      const selection = editor.getSelection();
      const selectedText = editor.getModel().getValueInRange(selection);
      if (selectedText) {
        void writeClipboard(selectedText);
        editor.executeEdits("", [
          {
            range: selection,
            text: "",
          },
        ]);
      }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
      const selection = editor.getSelection();
      readClipboard().then((text) => {
        if (!text) return;
        editor.executeEdits("", [{ range: selection, text }]);
        const newPosition = {
          lineNumber: selection.startLineNumber,
          column: selection.startColumn + text.length,
        };
        editor.setPosition(newPosition);
        editor.focus();
      });
    });

    editor.addAction({
      id: "editor.action.clipboardCopyAction",
      label: "Copy",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC],
      contextMenuGroupId: "9_cutcopypaste",
      contextMenuOrder: 2,
      run: (ed) => {
        const selection = ed.getSelection();
        const selectedText = ed.getModel().getValueInRange(selection);
        if (selectedText) {
          void writeClipboard(selectedText);
        }
      },
    });

    editor.addAction({
      id: "editor.action.clipboardCutAction",
      label: "Cut",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX],
      contextMenuGroupId: "9_cutcopypaste",
      contextMenuOrder: 1,
      run: (ed) => {
        const selection = ed.getSelection();
        const selectedText = ed.getModel().getValueInRange(selection);
        if (selectedText) {
          void writeClipboard(selectedText);
          ed.executeEdits("", [
            {
              range: selection,
              text: "",
            },
          ]);
        }
      },
    });

    editor.addAction({
      id: "editor.action.clipboardPasteAction",
      label: "Paste",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
      contextMenuGroupId: "9_cutcopypaste",
      contextMenuOrder: 3,
      run: (ed) => {
        const selection = ed.getSelection();
        return readClipboard().then((text) => {
          if (!text) return null;
          ed.executeEdits("", [{ range: selection, text }]);
          return null;
        });
      },
    });

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ES2015,
      allowJs: true,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-95 flex flex-col">
      {/* Header */}
      <div className="bg-[#101010] border-b border-neutral-700 px-6 py-3 flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <h2 className="text-neutral-300 font-mono text-md uppercase">
              {moduleName}
            </h2>
          </div>
          {filePath && (
            <div className="text-neutral-500 font-mono">
              <div className="text-[11px]">
                To edit this module, open file in your code editor:
              </div>
              <div>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handleOpenInFileExplorer();
                  }}
                  className="text-neutral-500 font-mono text-[10px] underline cursor-pointer"
                  title="Open in File Explorer"
                >
                  {filePath}
                </a>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-6">
          <Button onClick={handleClose} type="secondary" icon={<FaTimes />}>
            Close
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 bg-[#101010] overflow-hidden relative pt-6 min-h-0">
        {isLoading && (
          <div className="absolute inset-0 bg-[#101010] flex items-center justify-center z-10">
            <div className="text-neutral-400 font-mono text-[11px]">
              Loading editor...
            </div>
          </div>
        )}
        <Editor
          height="100%"
          language="javascript"
          theme="custom-dark"
          value={code}
          onChange={setCode}
          onMount={handleEditorDidMount}
          loading={
            <div className="w-full h-full bg-[#101010] flex items-center justify-center">
              <div className="text-neutral-400 font-mono text-[11px]">
                Initializing editor...
              </div>
            </div>
          }
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 11,
            lineNumbers: "off",
            rulers: null,
            wordWrap: "off",
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
            insertSpaces: true,
            formatOnPaste: true,
            formatOnType: true,
            bracketPairColorization: { enabled: false },
            guides: {
              bracketPairs: false,
              bracketPairsHorizontal: false,
              highlightActiveIndentation: false,
            },
          }}
        />
      </div>

      {/* Footer Panel */}
      <div className="bg-[#101010] border-t border-neutral-700 flex flex-col flex-shrink-0">
        <div className="overflow-x-auto overflow-y-hidden px-6 py-6">
          {methodsWithValues.length === 0 ? (
            <div className="text-neutral-500 font-mono text-[10px] py-2">
              No custom methods found
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <h3 className="text-neutral-300 font-mono text-[11px] uppercase">
                    Methods
                  </h3>
                  <span className="relative inline-block">
                    <HelpIcon helpText={HELP_TEXT.editorMethods} />
                  </span>
                </div>
                <Button
                  onClick={triggerPreview}
                  type="secondary"
                  icon={<FaRedo />}
                >
                  Re-render
                </Button>
              </div>
              <div className="flex items-start gap-4">
                {methodsWithValues.map((method) => (
                  <MethodBlock
                    key={method.name}
                    method={method}
                    mode="editor"
                    moduleMethods={moduleData?.methods || []}
                    moduleName={moduleName}
                    onTrigger={handleMethodTrigger}
                    onOptionChange={handleOptionChange}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error/Status Bar */}
      {error && (
        <div
          className={`px-6 py-3 font-mono text-[10px] ${
            error.includes("successfully")
              ? "bg-green-900 text-green-200"
              : "bg-red-900 text-red-200"
          }`}
        >
          {error}
        </div>
      )}
    </div>
  );
};
