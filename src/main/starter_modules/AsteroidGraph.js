/*
@nwWrld name: AsteroidGraph
@nwWrld category: 2D
@nwWrld imports: ModuleBase, p5, loadJson
*/

const getSdkMeteorDataset = async () => {
  try {
    const data = await loadJson("json/meteor.json");
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
};

const makeRandomMeteor = () => {
  const mass = 10 + Math.random() * 500;
  const lon = -180 + Math.random() * 360;
  const lat = -90 + Math.random() * 180;
  return {
    mass,
    geolocation: { coordinates: [lon, lat] },
  };
};

class AsteroidGraph extends ModuleBase {
  static methods = [
    {
      name: "loadMeteors",
      executeOnLoad: true,
      options: [
        {
          name: "count",
          defaultVal: 5,
          type: "number",
        },
      ],
    },
  ];

  constructor(container) {
    super(container);
    this.name = AsteroidGraph.name;
    this.meteors = [];
    this.dataset = null;
    this.myp5 = null;

    // Requested Palette: Camel, Brown, White, Light Grey, Teal
    this.palette = [
      [193, 154, 107], // Camel
      [139, 69, 19], // Brown
      [255, 255, 255], // White
      [211, 211, 211], // Light Grey
      [34, 75, 86], // #224b56 Teal
    ];

    this.init();
  }

  init() {
    if (!p5) return;
    const sketch = (p) => {
      this.myp5 = p;
      let noiseOffsetX = 0.0;
      let noiseOffsetY = 0.0;

      p.setup = () => {
        let canvasWidth = this.elem.clientWidth;
        let canvasHeight = this.elem.clientHeight;

        this.canvas = p.createCanvas(canvasWidth, canvasHeight);
        this.canvas.parent(this.elem);

        p.textSize(12);
        p.textAlign(p.CENTER, p.CENTER);
        p.frameRate(30); // Optimize for multiple instances
      };

      p.draw = () => {
        p.clear();
        const centerY = p.height / 2;
        let maxDistortion = (p.height / 2) * 0.9;

        this.meteors.forEach((meteor, index) => {
          // Cycle through palette
          const color = this.palette[index % this.palette.length];
          p.stroke(color[0], color[1], color[2]);
          p.strokeWeight(1.5);
          p.noFill();
          p.beginShape();

          let highestDistortion = 0;
          let peakX = 0;
          let peakY = centerY;

          // Reduced sampling step for performance with multiple graphs
          for (let x = 0; x < p.width; x += 10) {
            let distortionMagnitude = meteor ? meteor.mass / 10 : 1;
            distortionMagnitude = Math.min(distortionMagnitude, maxDistortion);

            let noiseVal = p.noise(noiseOffsetX + x * 0.01, noiseOffsetY + index);
            let distortion = (noiseVal - 0.5) * 2 * distortionMagnitude;

            let y = centerY - distortion;

            p.vertex(x, y);

            if (Math.abs(distortion) > highestDistortion) {
              highestDistortion = Math.abs(distortion);
              peakX = x;
              peakY = y;
            }
          }

          p.endShape();

          // Optional: Draw text info
          /*
          if (meteor.geolocation && meteor.geolocation.coordinates) {
            p.fill(color[0], color[1], color[2]);
            p.noStroke();
            p.text(
              `${meteor.mass.toFixed(0)}`,
              peakX,
              peakY - 10
            );
          }
          */
        });

        noiseOffsetX += 0.02; // Faster movement
        noiseOffsetY += 0.01;
      };
    };

    this.myp5 = new p5(sketch);
  }

  async loadMeteors({ count = 5 } = {}) {
    const safeCount = Math.max(0, Math.min(50, Number(count) || 0));
    this.meteors = [];
    if (!this.dataset) {
      this.dataset = await getSdkMeteorDataset();
    }

    if (this.dataset && this.dataset.length > 0 && this.myp5) {
      for (let i = 0; i < safeCount; i++) {
        const raw = this.dataset[Math.floor(this.myp5.random(this.dataset.length))];
        const mass = Number(raw?.mass);
        const coords = raw?.geolocation?.coordinates;
        const lon = Number(coords?.[0]);
        const lat = Number(coords?.[1]);
        this.meteors.push({
          mass: Number.isFinite(mass) ? mass : 10 + Math.random() * 500,
          geolocation: {
            coordinates: [
              Number.isFinite(lon) ? lon : -180 + Math.random() * 360,
              Number.isFinite(lat) ? lat : -90 + Math.random() * 180,
            ],
          },
        });
      }
      return;
    }

    for (let i = 0; i < safeCount; i++) {
      this.meteors.push(makeRandomMeteor());
    }
  }

  destroy() {
    if (this.myp5) {
      this.myp5.remove();
      this.myp5 = null;
    }
    super.destroy();
  }
}

export default AsteroidGraph;
