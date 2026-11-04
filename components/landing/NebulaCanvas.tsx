"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * 黑洞 / 星云主视觉。
 * 性能取舍（首版卡顿的三个原因都已处理）：
 *  1. 像素比封顶 1.5：2 倍屏不再按 4 倍像素渲染
 *  2. 噪声 6 层 → 4 层，每像素计算量降约 40%
 *  3. 目标 30fps（星云本身是慢动画，30fps 看不出差别），页面隐藏 / 滚出视口时暂停
 */
const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const FRAGMENT = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p *= 2.05;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 uv = (vUv - vec2(0.60, 0.5)) * vec2(aspect, 1.0) * 0.92;

  float r = length(uv);

  // 域扭曲（domain warping）做丝状纹理，全程没有 atan，不会出现分支割线
  vec2 p = rotate(uv, -uTime * 0.035) * 3.1;
  vec2 warp = vec2(
    fbm(p + vec2(0.0, uTime * 0.02)),
    noise(p * 1.7 + vec2(5.2, 1.3))
  );
  float texture = fbm(p + warp * 1.9);

  // 螺旋臂：用 2θ 的三角恒等式（由归一化坐标直接得到），没有角度分支
  vec2 dir = uv / max(r, 0.0001);
  float c2 = dir.x * dir.x - dir.y * dir.y;
  float s2 = 2.0 * dir.x * dir.y;
  float phase = log(r + 0.05) * 7.4 - uTime * 0.34;
  float arms = 0.5 + 0.5 * (c2 * cos(phase) + s2 * sin(phase));
  arms = pow(clamp(arms, 0.0, 1.0), 1.7);

  // 同心环带：让画面有层次，而不是一团均匀的雾
  float bands = 0.5 + 0.5 * sin(r * 52.0 - uTime * 0.9);
  bands = mix(0.48, 1.0, bands);

  float n = pow(clamp(texture, 0.0, 1.0), 1.25);
  n = n * mix(0.05, 2.3, arms) * bands;

  float ring = smoothstep(0.085, 0.20, r) * (1.0 - smoothstep(0.52, 0.95, r));

  float drift = pow(smoothstep(-0.75, 0.95, uv.x), 0.85);
  float tail = smoothstep(0.0, 1.0, 1.0 - abs(uv.y) * 1.15 - r * 0.35);

  vec3 cWhite = vec3(1.0, 1.0, 1.0);
  vec3 cIce = vec3(0.66, 0.86, 1.0);
  vec3 cBlue = vec3(0.36, 0.47, 1.0);
  vec3 cViolet = vec3(0.70, 0.50, 1.0);

  vec3 color = mix(cWhite, cIce, smoothstep(0.0, 0.30, n));
  color = mix(color, cBlue, smoothstep(0.26, 0.52, n));
  color = mix(color, cViolet, smoothstep(0.58, 0.95, n));

  float purpleRim = smoothstep(0.16, 0.58, r);
  color = mix(color, cViolet, purpleRim * 0.72);

  float alpha = n * ring * (0.26 + 0.74 * drift) * (0.45 + 0.75 * tail) * 2.1;

  // 左侧渐隐直接做进着色器：比叠一层 CSS 渐变干净，不会出现色带接缝
  float leftFade = smoothstep(-0.62, 0.30, uv.x);
  alpha *= leftFade;

  float core = 1.0 - smoothstep(0.075, 0.135, r);
  alpha *= 1.0 - core;

  float edge = smoothstep(0.12, 0.155, r) * (1.0 - smoothstep(0.155, 0.26, r));
  vec3 glow = cIce * edge * 0.10;

  vec2 grid = floor(vUv * uResolution / 2.6);
  float star = step(0.9973, hash(grid));
  float twinkle = 0.45 + 0.55 * sin(uTime * 1.8 + hash(grid + 7.0) * 6.2831);
  // 星点跟着一起压暗，否则左侧会出现「暗背景 + 亮星点」的割裂
  vec3 stars = vec3(star * twinkle) * (0.12 + 0.88 * leftFade);

  // 抖动（dither）：把 8 位色深下必然出现的色带打散成噪点
  float dither = (hash(vUv * uResolution + uTime) - 0.5) / 220.0;

  gl_FragColor = vec4(color * alpha + glow + stars + dither, 1.0);
}
`;

const MAX_DPR = 1.5;
/** 星云是柔焦画面，按 0.8 倍内部渲染再放大，肉眼看不出差别 */
const RENDER_SCALE = 0.8;
const TARGET_FPS = 30;

export function NebulaCanvas() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }

    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR) * RENDER_SCALE);
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      (uniforms.uResolution.value as THREE.Vector2).set(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    /* ---------- 渲染循环：限帧 + 可见性管理 ---------- */
    const clock = new THREE.Clock();
    const frameInterval = 1000 / TARGET_FPS;
    let raf = 0;
    let lastPaint = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - lastPaint < frameInterval) return;
      lastPaint = now;
      uniforms.uTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
    };

    const start = () => {
      if (raf) return;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // 滚出视口就不再烧 GPU
    const viewport = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !document.hidden) start();
        else stop();
      },
      { threshold: 0.01 },
    );
    viewport.observe(mount);

    // 系统里关掉动画时：只画一帧静态星云
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      uniforms.uTime.value = 8;
      renderer.render(scene, camera);
    } else {
      start();
    }

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      viewport.disconnect();
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />;
}
