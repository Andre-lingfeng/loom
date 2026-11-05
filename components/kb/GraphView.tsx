"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Loader2, Moon, RotateCcw, Share2, Sparkles, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

import { buildGraph, layoutGraph, type EdgeLevel } from "@/lib/kb/graph";
import { loadConfig } from "@/lib/kb/llm";
import { useKb } from "@/lib/kb/store";
import { cn } from "@/lib/utils";

import { ErrorNote } from "./ErrorNote";
import { card } from "./theme";
import { RelationList } from "./graph/RelationList";
import { BLOOM, PARTICLE_FRAGMENT, PARTICLE_VERTEX, buildFibrous, makeCoreTexture, makeDotTexture, makeFlareTexture, readPalette, type Mode } from "./graph/visual";

function ago(ts: number) {
  const minutes = Math.round((Date.now() - ts) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

export function GraphView() {
  const sources = useKb((s) => s.sources);
  const select = useKb((s) => s.select);
  const selectedId = useKb((s) => s.selectedId);
  const edges = useKb((s) => s.edges);
  const edgeSource = useKb((s) => s.edgeSource);
  const edgeStatus = useKb((s) => s.edgeStatus);
  const edgeError = useKb((s) => s.edgeError);
  const edgeTokens = useKb((s) => s.edgeTokens);
  const edgeSavedAt = useKb((s) => s.edgeSavedAt);
  const refreshEdges = useKb((s) => s.refreshEdges);

  const graph = useMemo(() => buildGraph(sources), [sources]);
  const layout = useMemo(() => layoutGraph(graph), [graph]);

  const mountRef = useRef<HTMLDivElement | null>(null);
  /** 悬停右侧某条关系时，只高亮这一对与它们之间的线 */
  const focusRef = useRef<{ a: string; b: string } | null>(null);
  /** 当前选中的素材：只用于高亮，不触发场景重建 */
  const selectedRef = useRef<string | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [mode, setMode] = useState<Mode>("dark");
  const [webglFailed, setWebglFailed] = useState(false);
  const [focusPair, setFocusPair] = useState<{ a: string; b: string } | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const serverCloud = useKb((s) => s.serverCloud);
  // 自己填了 Key，或服务端预置了 Key，都能跑云端分析
  const canCloud = hasKey || Boolean(serverCloud?.relations);
  const router = useRouter();

  // 选中某条素材时，只列它自己的关联；未选中才显示全库前 5
  const selectedEdges = useMemo(() => {
    if (!selectedId) return [];
    return edges
      .filter((edge) => edge.source === selectedId || edge.target === selectedId)
      .sort((a, b) => b.strength - a.strength);
  }, [edges, selectedId]);

  const topEdges = useMemo(
    () => [...edges].sort((a, b) => b.strength - a.strength).slice(0, 5),
    [edges],
  );

  // 结构签名：只有素材集合或关系集合变化时才重建 three.js 场景
  const structureKey = `${graph.nodes.map((node) => node.id).join(",")}|${edges
    .map((edge) => `${edge.source}>${edge.target}`)
    .join(",")}`;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const theme = readPalette(mount, mode);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebglFailed(true);
      return;
    }

    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    // 2 倍屏按 1.5 倍渲染：画质肉眼看不出，像素少 44%
    const maxDpr = Math.min(window.devicePixelRatio || 1, 1.25);
    renderer.setPixelRatio(maxDpr);
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.background);
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 300);
    camera.position.set(0, 1.4, 17.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.autoRotate = false;
    controls.rotateSpeed = 0.7;
    controls.minDistance = 10;
    controls.maxDistance = 32;
    controlsRef.current = controls;

    const SPREAD = 3.4;
    const positionOf = (id: string) => {
      const p = layout[id];
      return new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(SPREAD);
    };

    const disposables: { dispose: () => void }[] = [];

    /* ---------- 1. 环境光晕：只给体积感，不画任何线 ---------- */
    const auraMaterial = new THREE.SpriteMaterial({
      map: makeCoreTexture(),
      color: new THREE.Color(theme.ring),
      transparent: true,
      opacity: mode === "light" ? 0.1 : 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const aura = new THREE.Sprite(auraMaterial);
    aura.scale.setScalar(13);
    scene.add(aura);
    disposables.push(auraMaterial);

    /* ---------- 2. 背景同心圆 ---------- */
    for (const radius of [7.4, 8.6, 9.9]) {
      const points: number[] = [];
      for (let i = 0; i <= 160; i += 1) {
        const angle = (i / 160) * Math.PI * 2;
        points.push(Math.cos(angle) * radius, Math.sin(angle) * radius, -3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(theme.ring),
        transparent: true,
        opacity: mode === "light" ? 0.11 : 0.07,
        depthWrite: false,
      });
      scene.add(new THREE.LineLoop(geometry, material));
      disposables.push(geometry, material);
    }

    /* ---------- 3. 能量核心（两层：柔光 + 热核） ---------- */
    const coreTexture = makeCoreTexture();
    const coreMaterial = new THREE.SpriteMaterial({
      map: coreTexture,
      transparent: true,
      opacity: mode === "light" ? 0.55 : 0.58,
      blending: mode === "light" ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreBase = mode === "light" ? 0.55 : 0.58;
    const hotspotBase = 0.65;
    const core = new THREE.Sprite(coreMaterial);
    core.scale.setScalar(4.2);
    scene.add(core);
    disposables.push(coreMaterial, coreTexture);

    const hotspotMaterial = new THREE.SpriteMaterial({
      map: coreTexture,
      transparent: true,
      opacity: 0.65,
      blending: mode === "light" ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
    });
    const hotspot = new THREE.Sprite(hotspotMaterial);
    hotspot.scale.setScalar(1.1);
    scene.add(hotspot);
    disposables.push(hotspotMaterial);

    /* ---------- 4. 粒子：细尘 + 星芒（着色器驱动） ---------- */
    const dotTexture = makeDotTexture();
    const flareTexture = makeFlareTexture();
    const pixelRatio = renderer.getPixelRatio();

    const makeSlab = (
      count: number,
      radius: number,
      sizeMin: number,
      sizeMax: number,
      texture: THREE.Texture,
      opacity: number,
      palette: string[],
      additive: boolean,
    ) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const phases = new Float32Array(count);
      const sizes = new Float32Array(count);
      const color = new THREE.Color();

      for (let i = 0; i < count; i += 1) {
        const r = Math.cbrt(Math.random()) * radius;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi);
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

        color.set(palette[Math.floor(Math.random() * palette.length)]);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        phases[i] = Math.random();
        sizes[i] = sizeMin + Math.random() * (sizeMax - sizeMin);
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
      geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: pixelRatio },
          uMap: { value: texture },
          uOpacity: { value: opacity },
        },
        vertexShader: PARTICLE_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });

      const points = new THREE.Points(geometry, material);
      disposables.push(geometry, material);
      return { points, material };
    };

    const dustBase = mode === "light" ? 0.85 : 0.32;
    const dust = makeSlab(520, 5.4, 0.14, 0.42, dotTexture, dustBase, [theme.dust, theme.warm[0]], mode === "dark");
    scene.add(dust.points);
    disposables.push(dotTexture);

    const flaresBase = mode === "light" ? 0.7 : 0.62;
    const flares = makeSlab(70, 5, 0.9, 1.9, flareTexture, flaresBase, theme.warm, mode === "dark");
    scene.add(flares.points);
    disposables.push(flareTexture);

    /* ---------- 5. 语义节点与关系 ---------- */
    const rank: Record<EdgeLevel, number> = { weak: 0, mid: 1, strong: 2 };
    const nodeLevel = new Map<string, EdgeLevel>();
    for (const edge of edges) {
      for (const id of [edge.source, edge.target]) {
        const current = nodeLevel.get(id) ?? "weak";
        if (rank[edge.level] > rank[current]) nodeLevel.set(id, edge.level);
      }
    }

    const sphereGeometry = new THREE.SphereGeometry(1, 20, 20);
    disposables.push(sphereGeometry);

    const meshes: THREE.Mesh[] = [];
    const nodeEntries: { id: string; mesh: THREE.Mesh }[] = [];
    const labels: { id: string; el: HTMLDivElement; always: boolean }[] = [];
    const labelLayer = document.createElement("div");
    labelLayer.style.position = "absolute";
    labelLayer.style.inset = "0";
    labelLayer.style.pointerEvents = "none";
    mount.appendChild(labelLayer);

    for (const node of graph.nodes) {
      const point = positionOf(node.id);
      const level = nodeLevel.get(node.id) ?? "weak";
      const color = new THREE.Color(theme.node[level]);
      const radius = 0.16 + Math.min(node.degree, 6) * 0.03;

      const material = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(sphereGeometry, material);
      mesh.position.copy(point);
      mesh.scale.setScalar(radius);
      mesh.userData = { id: node.id, radius };
      scene.add(mesh);
      meshes.push(mesh);
      nodeEntries.push({ id: node.id, mesh });
      material.transparent = true;
      disposables.push(material);

      const haloMaterial = new THREE.SpriteMaterial({
        map: dotTexture,
        color,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Sprite(haloMaterial);
      halo.position.copy(point);
      halo.scale.setScalar(radius * 3.6);
      scene.add(halo);
      disposables.push(haloMaterial);

      const el = document.createElement("div");
      el.textContent =
        node.title.length > 15 ? `${node.title.slice(0, 15)}…` : node.title;
      el.style.position = "absolute";
      el.style.transform = "translate(-50%, -100%)";
      el.style.fontSize = "10px";
      el.style.fontWeight = "500";
      el.style.lineHeight = "1.2";
      el.style.whiteSpace = "nowrap";
      el.style.color = theme.label;
      el.style.textShadow = theme.labelShadow;
      el.style.transition = "color 0.15s ease, opacity 0.15s ease";
      labelLayer.appendChild(el);
      labels.push({ id: node.id, el, always: true });
    }

    const lineMaterials: LineMaterial[] = [];
    const edgeEntries: {
      a: string;
      b: string;
      material: LineMaterial;
      baseOpacity: number;
      baseWidth: number;
    }[] = [];
    for (const edge of edges) {
      const a = positionOf(edge.source);
      const b = positionOf(edge.target);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.add(mid.clone().normalize().multiplyScalar(0.3 + edge.strength * 0.8));

      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const list = curve.getPoints(24).flatMap((p) => [p.x, p.y, p.z]);

      const geometry = new LineGeometry();
      geometry.setPositions(list);

      const material = new LineMaterial({
        color: new THREE.Color(
          edge.kind ? theme.kind[edge.kind] : theme.edge[edge.level],
        ),
        linewidth: 0.9 + edge.strength * 1.6,
        transparent: true,
        opacity: 0.35 + edge.strength * 0.45,
        dashed: false,
      });
      material.resolution.set(width, height);

      const line = new Line2(geometry, material);
      line.computeLineDistances();
      scene.add(line);
      lineMaterials.push(material);
      edgeEntries.push({
        a: edge.source,
        b: edge.target,
        material,
        baseOpacity: 0.35 + edge.strength * 0.45,
        baseWidth: 0.9 + edge.strength * 1.6,
      });
      disposables.push(geometry, material);
    }

    /* ---------- 6. 后处理 ---------- */
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    renderPass.clearAlpha = 0;
    composer.addPass(renderPass);

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width / 2, height / 2),
      BLOOM[mode].strength,
      BLOOM[mode].radius,
      BLOOM[mode].threshold,
    );
    // 浅色背景亮度接近阈值，整个画面会被洗白，只在深色模式启用
    if (mode === "dark") composer.addPass(bloom);

    // 泛光默认关：先测帧率，跑得动再开（弱显卡上这一步能省一半时间）
    let bloomOn = false;
    bloom.enabled = false;

    /* ---------- 交互 ---------- */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredId: string | null = null;
    let downPoint = { x: 0, y: 0 };

    const pick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      return hit ? (hit.object.userData.id as string) : null;
    };

    const onPointerMove = (event: PointerEvent) => {
      const id = pick(event);
      if (id === hoveredId) return;
      hoveredId = id;
      renderer.domElement.style.cursor = id ? "pointer" : "grab";
      for (const entry of labels) {
        entry.el.style.color = entry.id === id ? theme.labelHover : theme.label;
        entry.el.style.fontWeight = entry.id === id ? "700" : "500";
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      downPoint = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      const moved =
        Math.abs(event.clientX - downPoint.x) +
        Math.abs(event.clientY - downPoint.y);
      if (moved > 5) return;
      const id = pick(event);
      if (id) select(id);
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.style.cursor = "grab";

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      bloom.setSize(w, h);
      for (const material of lineMaterials) material.resolution.set(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const clock = new THREE.Clock();
    let raf = 0;
    const frameInterval = 1000 / 30;
    let lastPaint = 0;
    let paused = false;

    // 自适应质量：开头 40 帧测平均帧耗时，太慢就关泛光并降分辨率
    let degraded = false;
    let costSum = 0;
    let costCount = 0;
    // 前 20 帧包含着色器编译与纹理上传，不能作为性能样本
    let warmup = 20;

    const degrade = () => {
      if (degraded) return;
      degraded = true;
      bloom.enabled = false;
      renderer.setPixelRatio(Math.min(maxDpr, 0.85));
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w && h) {
        renderer.setSize(w, h);
        composer.setSize(w, h);
      }
    };

    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      if (paused) return;

      if (warmup > 0) warmup -= 1;


      if (now - lastPaint < frameInterval) return;
      lastPaint = now;

      const elapsed = clock.getElapsedTime();
      const focus = focusRef.current;
      const fade = focus ? 0.28 : 1;

      dust.material.uniforms.uTime.value = elapsed;
      flares.material.uniforms.uTime.value = elapsed;
      dust.points.rotation.y = -elapsed * 0.05;
      flares.points.rotation.y = -elapsed * 0.035;
      flares.points.rotation.x = Math.sin(elapsed * 0.2) * 0.05;

      core.material.opacity += ((coreBase * fade) - core.material.opacity) * 0.15;
      hotspot.material.opacity += ((hotspotBase * fade) - hotspot.material.opacity) * 0.15;
      core.scale.setScalar(4.2 + Math.sin(elapsed * 0.9) * 0.22);
      hotspot.scale.setScalar(1.1 + Math.sin(elapsed * 1.7 + 1.2) * 0.16);

      for (const mesh of meshes) {
        const data = mesh.userData as { id: string; radius: number };
        const node = graph.nodes.find((item) => item.id === data.id);
        const isSelected = data.id === selectedRef.current;

        let scale = data.radius;
        if (isSelected) scale *= 1.28;
        if (node?.isNew) scale *= 1 + Math.sin(elapsed * 2.2) * 0.08;
        mesh.scale.setScalar(scale);
      }

      for (const entry of edgeEntries) {
        const isPair =
          !!focus &&
          ((entry.a === focus.a && entry.b === focus.b) ||
            (entry.a === focus.b && entry.b === focus.a));

        const targetOpacity = focus ? (isPair ? 1 : 0.05) : entry.baseOpacity;
        entry.material.opacity += (targetOpacity - entry.material.opacity) * 0.18;
        const targetWidth = focus && isPair ? entry.baseWidth + 1.6 : entry.baseWidth;
        entry.material.linewidth += (targetWidth - entry.material.linewidth) * 0.18;
      }

      (dust.material.uniforms.uOpacity as { value: number }).value +=
        (dustBase * fade - (dust.material.uniforms.uOpacity as { value: number }).value) * 0.15;
      (flares.material.uniforms.uOpacity as { value: number }).value +=
        (flaresBase * fade - (flares.material.uniforms.uOpacity as { value: number }).value) * 0.15;

      for (const entry of nodeEntries) {
        const related = !focus || entry.id === focus.a || entry.id === focus.b;
        const material = entry.mesh.material as THREE.MeshBasicMaterial;
        const target = related ? 1 : 0.18;
        material.opacity += (target - material.opacity) * 0.18;
      }

      controls.update();
      const renderStart = performance.now();
      if (bloomOn) composer.render();
      else renderer.render(scene, camera);
      const renderCost = performance.now() - renderStart;

      // 用「渲染耗时」而不是 rAF 间隔判断：到 30fps 上限不代表慢
      if (warmup === 0) {
        costSum += renderCost;
        costCount += 1;
        if (costCount === 8) {
          const avgCost = costSum / costCount;
          costSum = 0;
          costCount = 0;

          if (!bloomOn && !degraded && avgCost < 7 && mode === "dark") {
            bloomOn = true;
            bloom.enabled = true;
          } else if (!degraded && avgCost > 16) {
            degrade();
          }
        }
      }

      for (const entry of labels) {
        const projected = positionOf(entry.id).clone().project(camera);
        const behind = projected.z > 1;
        const inFocus =
          !focusRef.current ||
          entry.id === focusRef.current.a ||
          entry.id === focusRef.current.b;
        const visible = inFocus && (entry.always || entry.id === hoveredId);
        entry.el.style.opacity = behind || !visible ? "0" : "1";
        if (behind || !visible) continue;
        entry.el.style.left = `${(projected.x * 0.5 + 0.5) * mount.clientWidth}px`;
        entry.el.style.top = `${(-projected.y * 0.5 + 0.5) * mount.clientHeight - 9}px`;
      }
    };
    const startLoop = () => {
      if (raf) return;
      paused = false;
      lastPaint = 0;
      costSum = 0;
      costCount = 0;
      warmup = 10;
      raf = requestAnimationFrame(animate);
    };
    const stopLoop = () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      viewport.disconnect();
      raf = 0;
      paused = true;
    };

    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const viewport = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !document.hidden) startLoop();
        else stopLoop();
      },
      { threshold: 0.01 },
    );
    viewport.observe(mount);

    startLoop();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      controlsRef.current = null;
      composer.dispose();
      for (const item of disposables) item.dispose();
      labelLayer.remove();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [structureKey, mode]);

  useEffect(() => {
    focusRef.current = focusPair;
  }, [focusPair]);

  // 配置可能在另一个标签页里改，回到本页时重新检查
  useEffect(() => {
    const sync = () => setHasKey(Boolean(loadConfig().apiKey));
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const empty = sources.length < 2;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-6 py-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-xl font-medium tracking-tight">
            <Share2 size={16} className="text-violet-300" />
            关联图谱
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-white/35">
            每加一条素材，都会重新分析它与其他素材的关系。
            <span className="text-white/45"> 拖拽旋转 · 滚轮缩放 · 点击节点打开原文。</span>
            <br />
            <span className="text-white/30">
              右侧序号是「本文库内的强度排名」，不是相似度评分——同一对素材换一批邻居，排名就会变。
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs">
            <span
              className={
                edgeSource === "cloud"
                  ? "rounded-md bg-violet-500/20 px-1.5 py-0.5 text-violet-300"
                  : "rounded-md bg-white/[0.07] px-1.5 py-0.5 text-white/45"
              }
            >
              {edgeSource === "cloud"
                ? `云端模型判定${edgeSavedAt ? ` · ${ago(edgeSavedAt)}` : ""}`
                : "本地算法（词面相似）"}
            </span>
            {edgeTokens !== null && (
              <span className="text-white/25">本次 {edgeTokens} tokens</span>
            )}
            {edgeStatus === "error" && edgeError && (
              <ErrorNote
                className="basis-full"
                message={`关系判定失败：${edgeError}`}
                hint="已保留本地算法结果；可以重试一次"
                route="POST /api/relations"
              />
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* 配置入口常驻：即使用服务端 Key，也能换成自己的 */}
          <button
            onClick={() => router.push("/kb/settings")}
            title="配置自己的模型（可选）"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-2xs text-white/45 transition-colors hover:border-white/25 hover:text-white"
          >
            <Link2 size={11} />
            配置模型
          </button>

          <button
            onClick={() => void refreshEdges()}
            disabled={!canCloud || edgeStatus === "loading" || sources.length < 2}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-2xs text-white/45 transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {edgeStatus === "loading" ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Sparkles size={11} />
            )}
            {edgeStatus === "loading" ? "分析中…" : "云端重算"}
          </button>

          <button
            onClick={() => setMode(mode === "light" ? "dark" : "light")}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-2xs text-white/45 transition-colors hover:border-white/25 hover:text-white"
          >
            {mode === "light" ? <Moon size={11} /> : <Sun size={11} />}
            {mode === "light" ? "深色" : "浅色"}
          </button>
          <button
            onClick={() => controlsRef.current?.reset()}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-2xs text-white/45 transition-colors hover:border-white/25 hover:text-white"
          >
            <RotateCcw size={11} />
            重置视角
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <div className={`${card} relative min-h-[380px] flex-1 overflow-hidden`}>
          <div ref={mountRef} className="absolute inset-0" />

          {/* 暗角：让视觉焦点回到中心 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                mode === "light"
                  ? "radial-gradient(circle at 52% 46%, transparent 42%, rgba(15,23,42,0.16) 100%)"
                  : "radial-gradient(circle at 50% 46%, transparent 40%, rgba(0,0,0,0.45) 100%)",
            }}
          />

          {webglFailed && (
            <div className="absolute inset-0 grid place-items-center">
              <p className="text-sm text-white/50">当前环境不支持 WebGL</p>
            </div>
          )}

          {empty && !webglFailed && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="text-sm text-white/50">至少需要 2 条素材才能建图</p>
                <p className="mt-1 text-2xs text-white/25">
                  先去「添加素材」，关联会自动生成
                </p>
              </div>
            </div>
          )}

          <div
            className={cn(
              "pointer-events-none absolute bottom-3 left-4 flex items-center gap-3 text-2xs",
              mode === "light" ? "text-slate-600" : "text-white/30",
            )}
          >
            {edgeSource === "cloud" ? (
              <>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-4 rounded-full bg-violet-500" /> 支持
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-4 rounded-full bg-red-500" /> 矛盾
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-4 rounded-full bg-slate-400" /> 重复
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-4 rounded-full bg-blue-500" /> 相关
                </span>
                <span className="ml-2 hidden sm:inline">连线颜色 = 关系类型</span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-4 rounded-full bg-violet-400" /> 强
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-4 rounded-full bg-blue-400" /> 中
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-4 rounded-full bg-slate-600" /> 弱
                </span>
                <span className="ml-2 hidden sm:inline">连线颜色 = 相对强度</span>
              </>
            )}
          </div>
        </div>

        <RelationList
          title={
            selectedId
              ? `这条素材的 ${selectedEdges.length} 条关联`
              : "最值得看的关联"
          }
          entries={selectedId ? selectedEdges : topEdges}
          nodes={graph.nodes}
          action={
            selectedId
              ? {
                  label: "查看全部",
                  onClick: () => {
                    setFocusPair(null);
                    select(null);
                  },
                }
              : focusPair
                ? { label: "取消高亮", onClick: () => setFocusPair(null) }
                : undefined
          }
          onPick={(edge) => {
            const same = focusPair?.a === edge.source && focusPair?.b === edge.target;
            if (!same) setFocusPair({ a: edge.source, b: edge.target });
            select(selectedId === edge.source ? edge.target : edge.source);
          }}
          onHover={(edge) => {
            focusRef.current = edge ? { a: edge.source, b: edge.target } : null;
          }}
        />
      </div>
    </div>
  );
}
