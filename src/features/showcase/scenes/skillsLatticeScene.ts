import type * as THREE from "three";
import type { TechStackTreeNode } from "@hd/content-schema/tech-stack-tree";
import type { SceneData, ScenePointer, ShowcaseScene, ThreeModule } from "./types";

// A preview of the cinematic Skills Lattice, rebuilt as its own module from the
// lattice code in ResumeSpace3D.tsx (which stays untouched): cores on a ring,
// their children orbiting them, deeper levels fanning outward, and data
// particles flowing along every link. Driven by the published tech stack.

const RING_RADIUS = 58;
const CORE_RADIUS = 3.2;
const NODE_RADIUS = 1.25;
const SHELL_RADIUS = 396;

interface LatticeNode {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Sprite;
  label: THREE.Sprite | null;
  key: string;
  depth: number;
  phase: number;
  baseScale: number;
  /** Keys of this node and its ancestors, for lighting a whole path. */
  pathKeys: string[];
}

interface FlowParticle {
  segment: number;
  offset: number;
  speed: number;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9#+]/g, "");

const makeHaloTexture = (THREE: ThreeModule) => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.35, "rgba(180,220,255,0.42)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/**
 * A name over a node. Headings read bright and cool; a child reads smaller and
 * a shade warmer, so the two levels tell apart at a glance.
 */
const makeLabel = (THREE: ThreeModule, text: string, size: number, isCore = true) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `${isCore ? 600 : 500} 44px "JetBrains Mono", Menlo, monospace`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text.toUpperCase()).width) + 24;
  canvas.width = width;
  canvas.height = 64;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.fillStyle = isCore ? "rgba(223, 246, 255, 1)" : "rgba(196, 214, 232, 1)";
  ctx.shadowColor = isCore ? "rgba(110, 215, 255, 0.9)" : "rgba(120, 170, 220, 0.7)";
  ctx.shadowBlur = isCore ? 12 : 8;
  ctx.fillText(text.toUpperCase(), 12, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 }),
  );
  sprite.scale.set((width / 64) * size, size, 1);
  return sprite;
};

export async function createSkillsLatticeScene(THREE: ThreeModule, data: SceneData): Promise<ShowcaseScene> {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 3000);
  const root = new THREE.Group();
  scene.add(root);

  const haloTexture = makeHaloTexture(THREE);
  const nodes: LatticeNode[] = [];
  const segments: Array<{ from: THREE.Vector3; to: THREE.Vector3 }> = [];
  const disposables: Array<{ dispose: () => void }> = [haloTexture];

  // Faint stained-glass wire shell and stars, standing in for the envelope.
  const shellGeometry = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(SHELL_RADIUS * 0.55, 1));
  const shellColors = new Float32Array(shellGeometry.getAttribute("position").count * 3);
  const palette = [0x2f6fff, 0x27dcff, 0x6f47ff, 0xdb43ff, 0x28e0b7, 0xffb13a].map((hex) => new THREE.Color(hex));
  for (let i = 0; i < shellColors.length / 3; i += 2) {
    const color = palette[Math.floor(i / 8) % palette.length];
    for (let v = 0; v < 2; v += 1) shellColors.set([color.r, color.g, color.b], (i + v) * 3);
  }
  shellGeometry.setAttribute("color", new THREE.BufferAttribute(shellColors, 3));
  const shell = new THREE.LineSegments(
    shellGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  root.add(shell);
  disposables.push(shellGeometry, shell.material);

  const starPositions = new Float32Array(1400 * 3);
  for (let i = 0; i < 1400; i += 1) {
    const direction = new THREE.Vector3().randomDirection().multiplyScalar(700 + Math.random() * 600);
    starPositions.set([direction.x, direction.y, direction.z], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0xbfd9ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55 }),
  );
  scene.add(stars);
  disposables.push(starGeometry, stars.material);

  const coreGeometry = new THREE.IcosahedronGeometry(CORE_RADIUS, 1);
  const coreEdges = new THREE.EdgesGeometry(coreGeometry);
  disposables.push(coreGeometry, coreEdges);

  const addNode = (
    name: string,
    position: THREE.Vector3,
    depth: number,
    phase: number,
    pathKeys: string[],
  ): LatticeNode => {
    const isCore = depth === 1;
    const radius = isCore ? CORE_RADIUS : NODE_RADIUS * Math.pow(0.78, depth - 2);
    const geometry = isCore ? coreGeometry : new THREE.OctahedronGeometry(radius, 0);
    const material = new THREE.MeshBasicMaterial({
      color: isCore ? 0x8fd3ff : 0xdaf1ff,
      transparent: true,
      opacity: isCore ? 0.92 : 0.85,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const edges = new THREE.LineSegments(
      isCore ? coreEdges : new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    edges.scale.setScalar(1.015);
    mesh.add(edges);
    mesh.position.copy(position);
    root.add(mesh);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTexture,
        color: isCore ? 0x8fd3ff : 0xdaf1ff,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.position.copy(position);
    halo.scale.setScalar(radius * 4.6);
    root.add(halo);

    const label = makeLabel(THREE, name, isCore ? 3.4 : 1.6, isCore);
    label.position.set(position.x, position.y + radius + (isCore ? 3.4 : 1.8), position.z);
    root.add(label);

    if (!isCore) disposables.push(geometry, edges.geometry);
    disposables.push(material, edges.material, halo.material, label.material, label.material.map!);

    const node: LatticeNode = {
      mesh,
      halo,
      label,
      key: normalize(name),
      depth,
      phase,
      baseScale: 1,
      pathKeys: [...pathKeys, normalize(name)],
    };
    nodes.push(node);
    return node;
  };

  const roots = data.techStack;
  // Cores on a sphere, not a ring (the same layout as the universe's lattice):
  // a Fibonacci spiral spreads them evenly, the radius grows with the count
  // so neighbours stay a branch-width apart, and a jitter seeded from the
  // name loosens the pattern while keeping the layout the same every visit.
  const seeded = (text: string, salt: number) => {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return ((h >>> 0) % 10000) / 10000;
  };
  const largestBranch = Math.max(1, ...roots.map((root) => root.children.length));
  const branchReach = 11 + Math.min(7, largestBranch * 0.7);
  const coreSpacing = branchReach * 2 + 14;
  const count = Math.max(1, roots.length);
  const sphereRadius = Math.max(RING_RADIUS, Math.sqrt((count * coreSpacing * coreSpacing) / (4 * Math.PI)));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const corePositions = roots.map((root, index) => {
    const y = 1 - ((index + 0.5) / count) * 2;
    const ringR = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * index + (seeded(root.name, 1) - 0.5) * 0.6;
    const radius = sphereRadius * (0.88 + seeded(root.name, 2) * 0.24);
    return new THREE.Vector3(Math.cos(theta) * ringR * radius, y * radius * 0.85, Math.sin(theta) * ringR * radius);
  });

  // Ring links between neighbouring cores.
  corePositions.forEach((position, index) => {
    if (corePositions.length < 2) return;
    segments.push({ from: position.clone(), to: corePositions[(index + 1) % corePositions.length].clone() });
  });

  // Children orbit their parent; deeper rings tilt away from the grandparent.
  const placeChildren = (
    parent: TechStackTreeNode,
    parentPosition: THREE.Vector3,
    grandparentPosition: THREE.Vector3 | null,
    depth: number,
    pathKeys: string[],
    seed: number,
  ) => {
    const children = parent.children;
    if (children.length === 0) return;
    const orbit =
      depth === 2
        ? 11 + Math.min(7, children.length * 0.7)
        : Math.max(3.2, 6.2 - (depth - 3) * 1.2) + Math.min(3, children.length * 0.35);
    // A core's ring faces away from the lattice's centre, fanning into empty
    // space; deeper rings face away from the grandparent.
    const outward = grandparentPosition
      ? parentPosition.clone().sub(grandparentPosition).normalize()
      : parentPosition.clone().normalize();
    const axisA = new THREE.Vector3();
    const axisB = new THREE.Vector3();
    let center = parentPosition.clone();
    if (depth === 2 && outward.lengthSq() < 1e-6) {
      axisA.set(1, 0, 0);
      axisB.set(0, 0, 1);
    } else {
      const helper = Math.abs(outward.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      axisA.crossVectors(outward, helper).normalize();
      axisB.crossVectors(outward, axisA).normalize();
      center = parentPosition.clone().addScaledVector(outward, orbit * 0.55);
    }
    children.forEach((child, index) => {
      const angle = (index / Math.max(1, children.length)) * Math.PI * 2 + seed * 0.35;
      const position = center
        .clone()
        .addScaledVector(axisA, Math.cos(angle) * orbit)
        .addScaledVector(axisB, Math.sin(angle) * orbit)
        .addScaledVector(outward, depth === 2 ? Math.sin(angle * 1.4) * 2.2 : 0);
      addNode(child.name, position, depth, seed * 2.13 + index * 0.77 + depth * 0.31, pathKeys);
      segments.push({ from: parentPosition.clone(), to: position.clone() });
      placeChildren(child, position, parentPosition, depth + 1, [...pathKeys, normalize(child.name)], seed + index + 1);
    });
  };

  roots.forEach((core, index) => {
    addNode(core.name, corePositions[index], 1, index * 1.73, []);
    placeChildren(core, corePositions[index], null, 2, [normalize(core.name)], index);
  });

  const linePoints = new Float32Array(segments.length * 6);
  segments.forEach((segment, index) => {
    linePoints.set([segment.from.x, segment.from.y, segment.from.z, segment.to.x, segment.to.y, segment.to.z], index * 6);
  });
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePoints, 3));
  const lines = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: 0x9ad9ff, transparent: true, opacity: 0.36, depthWrite: false }),
  );
  root.add(lines);
  disposables.push(lineGeometry, lines.material);

  // Data packets flowing along the links.
  const flowCount = Math.min(360, segments.length * 3);
  const flowPositions = new Float32Array(flowCount * 3);
  const flowGeometry = new THREE.BufferGeometry();
  flowGeometry.setAttribute("position", new THREE.BufferAttribute(flowPositions, 3));
  const flow = new THREE.Points(
    flowGeometry,
    new THREE.PointsMaterial({
      color: 0xe8f6ff,
      size: 0.72,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  flow.frustumCulled = false;
  root.add(flow);
  disposables.push(flowGeometry, flow.material);
  const particles: FlowParticle[] = Array.from({ length: flowCount }, () => ({
    segment: Math.floor(Math.random() * Math.max(1, segments.length)),
    offset: Math.random(),
    speed: 0.08 + Math.random() * 0.26,
  }));

  let lit = new Set<string>();
  let litPaths = new Set<string>();
  let time = 0;
  let azimuth = 0.6;
  let elevation = 0.42;
  const scratch = new THREE.Vector3();
  const litColor = new THREE.Color(0xfff1c2);
  const coreColor = new THREE.Color(0x8fd3ff);
  const nodeColor = new THREE.Color(0xdaf1ff);

  return {
    scene,
    camera,
    progress: () => 1,
    update(dt: number, pointer: ScenePointer, visible: boolean) {
      if (!visible) return;
      time += dt;

      // Slow orbit around the lattice, steered by the pointer.
      azimuth += dt * 0.06;
      const targetElevation = 0.42 - pointer.y * 0.5;
      elevation += (targetElevation - elevation) * (1 - Math.exp(-2 * dt));
      const angle = azimuth + pointer.x * 0.9;
      // Far enough to hold the whole sphere and its branches in frame.
      const distance = sphereRadius * 1.85 + Math.sin(time * 0.08) * 10;
      camera.position.set(
        Math.cos(angle) * Math.cos(elevation) * distance,
        Math.sin(elevation) * distance,
        Math.sin(angle) * Math.cos(elevation) * distance,
      );
      camera.lookAt(0, 0, 0);
      shell.rotation.y += dt * 0.01;

      const highlighting = lit.size > 0;
      nodes.forEach((node) => {
        const isLit = lit.has(node.key);
        const onPath = litPaths.has(node.key);
        const pulse = 1 + Math.sin(time * 1.7 + node.phase) * 0.08;
        const boost = isLit ? 1.6 : onPath ? 1.15 : 1;
        node.mesh.scale.setScalar(node.baseScale * pulse * boost);
        const material = node.mesh.material;
        material.color.copy(isLit ? litColor : node.depth === 1 ? coreColor : nodeColor);
        material.opacity = highlighting && !isLit && !onPath ? 0.28 : node.depth === 1 ? 0.92 : 0.85;
        node.halo.material.opacity = isLit ? 0.85 : highlighting && !onPath ? 0.08 : 0.28;
        node.halo.material.color.copy(isLit ? litColor : node.depth === 1 ? coreColor : nodeColor);
        node.halo.scale.setScalar((node.depth === 1 ? CORE_RADIUS : NODE_RADIUS) * (isLit ? 7 : 4.6));
        if (node.label) {
          // Children keep a quiet label of their own, so the tree can be read
          // without hovering; it steps back while a project is highlighted.
          const target = isLit ? 1 : node.depth === 1 ? (highlighting ? 0.35 : 0.75) : highlighting ? 0.12 : 0.42;
          node.label.material.opacity += (target - node.label.material.opacity) * (1 - Math.exp(-6 * dt));
        }
      });

      const positions = flowGeometry.getAttribute("position") as THREE.BufferAttribute;
      particles.forEach((particle, index) => {
        const segment = segments[particle.segment % segments.length];
        if (!segment) return;
        const progress = (time * particle.speed + particle.offset) % 1;
        scratch.lerpVectors(segment.from, segment.to, progress);
        positions.setXYZ(index, scratch.x, scratch.y, scratch.z);
      });
      positions.needsUpdate = true;
    },
    resize(width: number, height: number) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    setHighlights(technologies: string[]) {
      lit = new Set(technologies.map(normalize));
      litPaths = new Set(nodes.filter((node) => lit.has(node.key)).flatMap((node) => node.pathKeys));
    },
    dispose() {
      disposables.forEach((item) => item.dispose());
    },
  };
}
