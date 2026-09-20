import type * as ThreeTypes from "three";

/**
 * The astrolabe: the sun the map is lit by. A burning core — its surface a
 * slow boil of fire, a corona licking off it, sparks thrown outward — caged
 * in three bronze bands that turn on different axes. The bands are pierced,
 * so the fire shows through them as they pass, and engraved with what the
 * film is about: the years, the places, the disciplines.
 *
 * This is the one thing in the film that runs on the clock rather than the
 * scrubber. A sun that stops burning when you pause reads as broken, and
 * nothing here carries a number anyone needs to read.
 */

type Three = typeof ThreeTypes;

const NOISE = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  float fbm(vec3 p) {
    float total = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      total += amp * snoise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return total;
  }
`;

export function makeAstrolabe(
  THREE: Three,
  engravings: { years: string; places: string; disciplines: string },
) {
  const group = new THREE.Group();
  const CORE = 30;

  /* The core: fire moving over a sphere, brightest where it faces you. */
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(CORE, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vPos = position;
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vPos;
        varying vec3 vNormal;
        varying vec3 vView;
        ${NOISE}
        void main() {
          vec3 p = normalize(vPos);
          // Two layers of boil drifting against each other, and slow dark cells.
          float boil = fbm(p * 2.6 + vec3(0.0, uTime * 0.16, uTime * 0.09));
          float fine = fbm(p * 7.0 - vec3(uTime * 0.22, 0.0, uTime * 0.13));
          float cells = snoise(p * 1.4 + vec3(uTime * 0.04));
          float heat = 0.55 + boil * 0.55 + fine * 0.28 - max(0.0, cells) * 0.22;
          heat = clamp(heat, 0.0, 1.2);
          vec3 ember = vec3(0.42, 0.05, 0.0);
          vec3 flame = vec3(1.0, 0.42, 0.04);
          vec3 white = vec3(1.0, 0.93, 0.7);
          vec3 colour = mix(ember, flame, smoothstep(0.15, 0.6, heat));
          colour = mix(colour, white, smoothstep(0.62, 1.05, heat));
          // The limb burns hotter against the dark, the way a star does.
          float rim = pow(1.0 - max(0.0, dot(vNormal, vView)), 2.2);
          colour += vec3(1.0, 0.5, 0.12) * rim * 0.9;
          gl_FragColor = vec4(colour * 0.98, 1.0);
        }
      `,
    }),
  );
  group.add(core);

  /* The corona: flame licking off the limb, drawn on a card that faces the camera. */
  const corona = new THREE.Mesh(
    new THREE.PlaneGeometry(CORE * 9, CORE * 9),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        ${NOISE}
        void main() {
          vec2 c = vUv - 0.5;
          float r = length(c) * 2.0;
          float angle = atan(c.y, c.x);
          // Tongues of flame: noise wound round the disc, streaming outward.
          float tongues = fbm(vec3(cos(angle) * 2.2, sin(angle) * 2.2, r * 3.0 - uTime * 0.55));
          float wisps = fbm(vec3(cos(angle) * 5.0, sin(angle) * 5.0, r * 6.0 - uTime * 0.9));
          float reach = 0.34 + tongues * 0.2 + wisps * 0.07;
          float flame = smoothstep(reach + 0.22, reach - 0.1, r) * smoothstep(0.16, 0.24, r);
          // And a wide soft heat-haze beyond the flames.
          float haze = exp(-r * 3.4) * 0.85 + exp(-r * 1.5) * 0.18;
          vec3 colour = vec3(1.0, 0.46, 0.08) * flame * 0.9 + vec3(1.0, 0.58, 0.2) * haze * 0.7;
          float alpha = clamp(flame + haze, 0.0, 1.0) * smoothstep(1.0, 0.72, r);
          gl_FragColor = vec4(colour, alpha);
        }
      `,
    }),
  );
  group.add(corona);

  /* Sparks thrown off the core. */
  const SPARKS = 190;
  const sparkPositions = new Float32Array(SPARKS * 3);
  const sparkColours = new Float32Array(SPARKS * 3);
  const sparks = Array.from({ length: SPARKS }, () => {
    const direction = new THREE.Vector3().randomDirection();
    return { direction, speed: 0.05 + Math.random() * 0.16, offset: Math.random(), swirl: (Math.random() - 0.5) * 1.6 };
  });
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  sparkGeometry.setAttribute("color", new THREE.BufferAttribute(sparkColours, 3));
  const sparkCloud = new THREE.Points(
    sparkGeometry,
    new THREE.PointsMaterial({
      size: 4.2,
      // A soft round ember rather than a square of pixels.
      map: (() => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d")!;
        const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        glow.addColorStop(0, "rgba(255, 255, 255, 1)");
        glow.addColorStop(0.3, "rgba(255, 220, 160, 0.7)");
        glow.addColorStop(1, "rgba(255, 160, 60, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(canvas);
      })(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  );
  group.add(sparkCloud);

  /* The bands. */
  const bandTexture = (text: string, ink: string, metal: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 4096;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = metal;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 260; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(255, 220, 150, 0.07)" : "rgba(30, 16, 4, 0.12)";
      ctx.fillRect((i * 53) % canvas.width, 0, 2 + (i % 3), canvas.height);
    }
    ctx.fillStyle = "rgba(34, 18, 4, 0.55)";
    ctx.fillRect(0, 0, canvas.width, 9);
    ctx.fillRect(0, canvas.height - 9, canvas.width, 9);
    ctx.fillStyle = ink;
    ctx.font = '700 58px "Cinzel", Georgia, serif';
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "10px";
    let x = 30;
    const run = `${text}   ✦   `;
    const width = ctx.measureText(run).width;
    while (x < canvas.width) {
      ctx.fillText(run, x, canvas.height / 2 + 3);
      x += width;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  };

  // Slots cut through the metal, so the fire shows as the band goes by.
  const pierced = (slots: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    const step = canvas.width / slots;
    for (let i = 0; i < slots; i += 1) {
      if (i % 4 === 3) continue;
      ctx.fillRect(i * step + step * 0.3, 4, step * 0.16, 9);
      ctx.fillRect(i * step + step * 0.3, canvas.height - 13, step * 0.16, 9);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  };

  const makeBand = (radius: number, height: number, text: string, tilt: [number, number, number], slots: number) => {
    const pivot = new THREE.Group();
    pivot.rotation.set(tilt[0], tilt[1], tilt[2]);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 128, 1, true),
      new THREE.MeshStandardMaterial({
        map: bandTexture(text, "#241405", "#8b6628"),
        alphaMap: pierced(slots),
        alphaTest: 0.5,
        metalness: 0.85,
        roughness: 0.38,
        // The inside of a band is always facing the fire, so it glows a little.
        emissive: new THREE.Color("#ff7a1c"),
        emissiveIntensity: 0.16,
        side: THREE.DoubleSide,
      }),
    );
    // A thin rail either edge, to give the band some body.
    [1, -1].forEach((edge) => {
      const rail = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 1.5, 8, 128),
        new THREE.MeshStandardMaterial({ color: "#a37a30", metalness: 0.9, roughness: 0.32 }),
      );
      rail.rotation.x = Math.PI / 2;
      rail.position.y = (edge * height) / 2;
      band.add(rail);
    });
    pivot.add(band);
    group.add(pivot);
    return band;
  };

  const bands = [
    { band: makeBand(74, 22, engravings.years, [0.35, 0, 0.2], 64), speed: 0.19 },
    { band: makeBand(98, 18, engravings.places, [-0.5, 0.4, 1.05], 80), speed: -0.13 },
    { band: makeBand(124, 16, engravings.disciplines, [1.15, -0.3, -0.45], 96), speed: 0.09 },
  ];

  /* The light it throws on the map, which wavers the way firelight does. */
  const light = new THREE.PointLight(0xffdcae, 1.9, 0, 0);
  group.add(light);

  const spot = new THREE.Vector3();
  return {
    group,
    update(time: number, camera: ThreeTypes.Camera) {
      (core.material as ThreeTypes.ShaderMaterial).uniforms.uTime.value = time;
      (corona.material as ThreeTypes.ShaderMaterial).uniforms.uTime.value = time;
      corona.quaternion.copy(camera.quaternion);

      bands.forEach(({ band, speed }) => {
        band.rotation.y = time * speed;
      });

      light.intensity = 1.9 * (0.93 + 0.045 * Math.sin(time * 7.3) + 0.03 * Math.sin(time * 13.1 + 1.7));

      sparks.forEach((spark, index) => {
        const life = (time * spark.speed + spark.offset) % 1;
        const reach = CORE * 1.05 + life * CORE * 5.2;
        spot.copy(spark.direction).applyAxisAngle(THREE.Object3D.DEFAULT_UP, life * spark.swirl).multiplyScalar(reach);
        sparkPositions.set([spot.x, spot.y + life * life * 26, spot.z], index * 3);
        const fade = Math.sin(Math.PI * Math.min(1, life * 1.15)) ** 1.5;
        sparkColours.set([1.0 * fade, (0.62 - life * 0.4) * fade, 0.12 * fade * (1 - life)], index * 3);
      });
      sparkGeometry.attributes.position.needsUpdate = true;
      sparkGeometry.attributes.color.needsUpdate = true;
    },
  };
}
