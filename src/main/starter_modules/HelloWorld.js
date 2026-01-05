/*
@nwWrld name: HelloWorld
@nwWrld category: Text
@nwWrld imports: ModuleBase
*/

class HelloWorld extends ModuleBase {
  static methods = [
    ...((ModuleBase && ModuleBase.methods) || []),
    {
      name: "setText",
      executeOnLoad: true,
      options: [{ name: "text", defaultVal: "Hello world", type: "text" }],
    },
  ];

  constructor(container) {
    super(container);
    this.textEl = document.createElement("div");
    this.textEl.style.cssText = [
      "width: 100%;",
      "height: 100%;",
      "display: flex;",
      "align-items: center;",
      "justify-content: center;",
      "font-family: monospace;",
      "font-size: 48px;",
      "color: white;",
    ].join(" ");
    if (this.elem) {
      this.elem.appendChild(this.textEl);
    }
    this.setText({ text: "Hello world" });
  }

  setText({ text = "Hello world" } = {}) {
    if (this.textEl) {
      this.textEl.textContent = String(text);
    }
    this.show();
  }

  destroy() {
    if (this.textEl && this.textEl.parentNode) {
      this.textEl.parentNode.removeChild(this.textEl);
    }
    this.textEl = null;
    super.destroy();
  }
}

export default HelloWorld;
