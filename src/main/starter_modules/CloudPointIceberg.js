/*
@nwWrld name: CloudPointIceberg
@nwWrld category: 3D
@nwWrld imports: BaseThreeJsModule, THREE, Noise
*/

class CloudPointIceberg extends BaseThreeJsModule {
  static name = "CloudPointIceberg";
  static category = "3D";

  static methods = [
    ...BaseThreeJsModule.methods,
    {
      name: "rotate",
      options: [
        {
          name: "speed",
          type: "number",
          defaultVal: 1,
          min: 0,
          max: 10,
        },
      ],
    },
    {
      name: "pulseOpacity",
      options: [
        {
          name: "amount",
          type: "number",
          defaultVal: 1,
          min: 0,
          max: 1,
        },
      ],
    },
    {
      name: "pulse",
      options: [
        {
          name: "amount",
          type: "number",
          defaultVal: 1,
          min: 0,
          max: 2,
        },
      ],
    },
  ];

  constructor(container) {
    super(container);
    if (!THREE) return;

    this.name = CloudPointIceberg.name;

    this.customGroup = new THREE.Group();
    this.parts = [];
    this.pulseAmount = 0;
    this.rotationSpeed = 0.2;
    this.baseOpacity = 0.6;

    this.init();

    // Hook into the animation loop
    this.setCustomAnimate(this.customUpdate.bind(this));
  }

  init() {
    if (!this.renderer || !this.scene || !this.camera || this.destroyed) return;

    this.createMechanicalShape();
    this.setModel(this.customGroup);
    this.render();
  }

  createMechanicalShape() {
    // Clear existing
    while (this.customGroup.children.length > 0) {
      this.customGroup.remove(this.customGroup.children[0]);
    }

    // Material: X-Ray / Wireframe look
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: this.baseOpacity,
      depthWrite: false, // Helps with x-ray feel
    });

    const pointMaterial = new THREE.PointsMaterial({
      color: 0xcccccc, // Light Grey
      size: 0.02,
      transparent: true,
      opacity: 0.8,
    });

    // 1. Central Core (Torus Knot) - The "Transmission"
    const coreGeometry = new THREE.TorusKnotGeometry(1.5, 0.4, 120, 20);
    const coreWire = new THREE.WireframeGeometry(coreGeometry);
    const coreMesh = new THREE.LineSegments(coreWire, material);
    this.customGroup.add(coreMesh);
    this.parts.push(coreMesh);

    // 2. Surrounding Pistons/Cylinders (Cylinders)
    for (let i = 0; i < 6; i++) {
      const cylinderGeo = new THREE.CylinderGeometry(0.2, 0.2, 4, 12);
      const cylWire = new THREE.WireframeGeometry(cylinderGeo);
      const cylMesh = new THREE.LineSegments(cylWire, material.clone()); // Clone for independent opacity

      const angle = (i / 6) * Math.PI * 2;
      const radius = 2.5;
      cylMesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      cylMesh.rotation.x = Math.PI / 2; // Horizontal
      cylMesh.lookAt(0, 0, 0); // Point inward

      this.customGroup.add(cylMesh);
      this.parts.push(cylMesh);
    }

    // 3. Point Cloud Dust (Simulating scan data)
    const particlesGeo = new THREE.BufferGeometry();
    const particleCount = 2000;
    const posArray = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      // Sphere distribution
      const r = 3 * Math.cbrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);

      posArray[i] = r * Math.sin(phi) * Math.cos(theta);
      posArray[i + 1] = r * Math.sin(phi) * Math.sin(theta);
      posArray[i + 2] = r * Math.cos(phi);
    }

    particlesGeo.setAttribute("position", new THREE.BufferAttribute(posArray, 3));
    this.pointCloud = new THREE.Points(particlesGeo, pointMaterial);
    this.customGroup.add(this.pointCloud);
  }

  customUpdate() {
    if (this.customGroup) {
      // Rotation
      this.customGroup.rotation.y += 0.01 * this.rotationSpeed;
      this.customGroup.rotation.z += 0.005 * this.rotationSpeed;

      // Pulse Scale
      const currentScale = this.customGroup.scale.x;
      const targetScale = 1.0 + this.pulseAmount;
      this.pulseAmount *= 0.9; // Decay
      const newScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.1);
      this.customGroup.scale.set(newScale, newScale, newScale);

      // Random "Glitch" rotation on kick
      if (this.pulseAmount > 0.1) {
        this.customGroup.rotation.x += (Math.random() - 0.5) * 0.1;
      }
    }
  }

  rotate(options = {}) {
    const { speed = 1 } = options;
    this.rotationSpeed = speed;
  }

  pulse(options = {}) {
    const { amount = 0.5 } = options;
    this.pulseAmount = amount;
  }

  pulseOpacity(options = {}) {
    const { amount = 1 } = options;
    // Flash opacity of all wireframe parts
    this.parts.forEach((part) => {
      if (part.material) {
        part.material.opacity = 1.0; // Flash full bright
        // Tween back down would be handled by a dedicated tween loop or simple decay
        // For simplicity in this loop, we just set it high, and rely on a decay in update if we added one.
        // Here we will just let it be bright for a frame (glitch style)
        setTimeout(() => {
          if (part.material) part.material.opacity = this.baseOpacity;
        }, 100);
      }
    });
  }

  destroy() {
    if (!this.renderer || !this.scene || !this.camera || this.destroyed) return;

    // Cleanup custom group
    if (this.customGroup) {
      this.customGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(this.customGroup);
    }
    this.customGroup = null;
    this.parts = [];

    super.destroy();
  }
}

export default CloudPointIceberg;
