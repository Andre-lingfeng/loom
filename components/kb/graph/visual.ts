/**
 * 图谱的视觉层：调色板、贴图、粒子着色器与背景纤维。
 * 与 React 无关，纯粹是 three.js 的构建逻辑，方便单独调整观感。
 */
import * as THREE from "three";

import type { RelationKind } from "@/lib/kb/graph";

export type Mode = "light" | "dark";

/** 粒子顶点着色器：每颗独立闪烁 + 透视尺寸衰减 */
/** 泛光强度：深色模式下才启用（浅色背景会被洗白） */
export const BLOOM = {
  light: { strength: 0.28, radius: 0.65, threshold: 0.72 },
  dark: { strength: 0.5, radius: 0.5, threshold: 0.42 },
} as const;

export const PARTICLE_VERTEX = `
uniform float uTime;
uniform float uPixelRatio;
attribute vec3 aColor;
attribute float aPhase;
attribute float aSize;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = aColor;
  float twinkle = 0.5 + 0.5 * sin(uTime * 1.6 + aPhase * 6.28318);
  vAlpha = 0.3 + 0.7 * twinkle;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * (300.0 / max(0.001, -mv.z)) * (0.65 + 0.7 * twinkle);
  gl_Position = projectionMatrix * mv;
}
`;

export const PARTICLE_FRAGMENT = `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  if (tex.a < 0.01) discard;
  gl_FragColor = vec4(vColor, tex.a * vAlpha * uOpacity);
}
`;

/** 颜色统一来自 app/kb/kb.css 的 --kb-graph-* 变量，组件内不写死色值 */
export function readPalette(mount: HTMLElement, mode: Mode) {
  const styles = getComputedStyle(mount);
  const raw = (key: string) =>
    styles.getPropertyValue(`--kb-graph-${key}`).trim() || "rgb(245,158,11)";
  const read = (key: string) =>
    styles
      .getPropertyValue(`--kb-graph-${mode}-${key}`)
      .trim() || "rgb(128,128,128)";

  return {
    shell: read("shell"),
    ring: read("ring"),
    edge: {
      strong: read("edge-strong"),
      mid: read("edge-mid"),
      weak: read("edge-weak"),
    },
    node: {
      strong: read("node-strong"),
      mid: read("node-mid"),
      weak: read("node-weak"),
    },
    kind: {
      supports: read("kind-supports"),
      contradicts: read("kind-contradicts"),
      duplicates: read("kind-duplicates"),
      related: read("kind-related"),
    } as Record<RelationKind, string>,
    label: read("label"),
    labelHover: read("label-hover"),
    labelShadow: read("label-shadow"),
    background: read("bg"),
    warm: [raw("warm-1"), raw("warm-2"), raw("warm-3"), raw("warm-4")],
    dust: raw("dust"),
  };
}

/** 能量核心：暖橙色光斑 */
export function makeCoreTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const half = size / 2;
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0, "rgba(255,250,240,1)");
    g.addColorStop(0.12, "rgba(254,215,170,0.9)");
    g.addColorStop(0.34, "rgba(251,146,60,0.42)");
    g.addColorStop(0.68, "rgba(245,158,11,0.12)");
    g.addColorStop(1, "rgba(245,158,11,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** 细尘：柔和的圆点 */
export function makeDotTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const half = size / 2;
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** 星芒：四向尖刺 + 中心光核 */
export function makeFlareTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const c = size / 2;
    const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.12, "rgba(255,240,210,0.7)");
    glow.addColorStop(0.4, "rgba(251,146,60,0.14)");
    glow.addColorStop(1, "rgba(251,146,60,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(c, c);
    for (let i = 0; i < 4; i += 1) {
      ctx.rotate(Math.PI / 2);
      const spike = ctx.createLinearGradient(0, 0, c, 0);
      spike.addColorStop(0, "rgba(255,246,225,1)");
      spike.addColorStop(0.3, "rgba(253,186,116,0.5)");
      spike.addColorStop(1, "rgba(253,186,116,0)");
      ctx.fillStyle = spike;
      ctx.beginPath();
      ctx.moveTo(0, -1.5);
      ctx.lineTo(c, 0);
      ctx.lineTo(0, 1.5);
      ctx.closePath();
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** 球面随机撒点 + 近邻连线，得到疏密不均的纤维球 */
export function buildFibrous(radius: number, count: number, neighbors: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * Math.PI * (3 - Math.sqrt(5));
    const wobble = 0.92 + Math.random() * 0.16;
    points.push(
      new THREE.Vector3(Math.cos(theta) * ring, y, Math.sin(theta) * ring).multiplyScalar(
        radius * wobble,
      ),
    );
  }

  const vertices: number[] = [];
  points.forEach((p, i) => {
    const nearest = points
      .map((q, j) => ({ j, d: p.distanceToSquared(q) }))
      .filter((item) => item.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, neighbors);
    for (const { j } of nearest) {
      if (j <= i) continue;
      const q = points[j];
      vertices.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}
