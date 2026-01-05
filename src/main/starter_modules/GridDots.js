/*
@nwWrld name: GridDots
@nwWrld category: 2D
@nwWrld imports: ModuleBase
*/

class GridDots extends ModuleBase {
  static methods = [
    ...((ModuleBase && ModuleBase.methods) || []),
    {
      name: "size",
      executeOnLoad: true,
      options: [
        { name: "x", defaultVal: 10, type: "number", allowRandomization: true },
        {
          name: "y",
          defaultVal: 10,
          type: "number",
          allowRandomization: false,
        },
      ],
    },
    {
      name: "colour",
      executeOnLoad: true,
      options: [{ name: "colour", defaultVal: "#ffffff", type: "color" }],
    },
  ];

  constructor(container) {
    super(container);
    this.name = GridDots.name;
    this.gridElem = null;
    this.x = 10;
    this.y = 10;
    this.dotColour = "#ffffff";
    this.init();
  }

  init() {
    this.createGridDots();
  }

  createGridDots() {
    if (!this.elem) return;
    if (this.gridElem && this.gridElem.parentNode === this.elem) {
      this.elem.removeChild(this.gridElem);
    }

    this.gridElem = document.createElement("canvas");
    this.gridElem.width = this.elem.clientWidth;
    this.gridElem.height = this.elem.clientHeight;
    const ctx = this.gridElem.getContext("2d");
    this.elem.style.opacity = 0.5;

    ctx.fillStyle = this.dotColour;

    const cellWidth = this.gridElem.width / this.x;
    const cellHeight = this.gridElem.height / this.y;
    const dotSize = 2;

    for (let i = 0; i <= this.x; i++) {
      for (let j = 0; j <= this.y; j++) {
        const x = i * cellWidth;
        const y = j * cellHeight;
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    this.elem.appendChild(this.gridElem);
  }

  size({ x = 10, y = 10 } = {}) {
    this.x = x;
    this.y = y;
    this.createGridDots();
  }

  colour({ colour = "#ffffff" } = {}) {
    this.dotColour = colour;
    this.createGridDots();
  }

  destroy() {
    if (this.gridElem && this.gridElem.parentNode === this.elem) {
      this.elem.removeChild(this.gridElem);
      this.gridElem = null;
    }
    super.destroy();
  }
}

export default GridDots;
