import { tokenize } from "./text.ts";
import type { Source } from "./types";

export interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  /** 关联数量，决定节点大小 */
  degree: number;
  /** 最近入库的一条，渲染时高亮 */
  isNew: boolean;
}

export type EdgeLevel = "strong" | "mid" | "weak";

/** 关系类型：由云端模型判定；本地算法只会产出 related */
export type RelationKind = "supports" | "contradicts" | "duplicates" | "related";

export interface GraphEdge {
  source: string;
  target: string;
  /** 0–1 */
  strength: number;
  level: EdgeLevel;
  /** 贡献最大的几个共同词，用于说明「为什么相关」 */
  shared: string[];
  /** 云端模型给出的关系类型；本地模式为 related */
  kind?: RelationKind;
  /** 模型给出的一句话理由 */
  reason?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const hashOf = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

/** 绝对相似度在长文本上天然偏小，因此按同批素材内的相对位置分档 */
const levelByQuantile = (strength: number, cuts: { strong: number; mid: number }): EdgeLevel =>
  strength >= cuts.strong ? "strong" : strength >= cuts.mid ? "mid" : "weak";

/**
 * 建图：用 IDF 加权的集合相似度衡量两两关系。
 * 为什么不是普通词频：常见词（agent / 的）会让所有节点都连在一起，图就失去意义。
 */
export function buildGraph(sources: Source[]): Graph {
  if (sources.length === 0) return { nodes: [], edges: [] };

  const tokenSets = sources.map((source) => {
    const set = new Set<string>();
    for (const token of tokenize(`${source.title} ${source.text}`)) {
      if (token.length >= 2) set.add(token);
    }
    return set;
  });

  const df = new Map<string, number>();
  for (const set of tokenSets) {
    for (const token of set) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const idf = (token: string) =>
    Math.log(1 + sources.length / (df.get(token) ?? 1));

  const norm = tokenSets.map((set) => {
    let total = 0;
    for (const token of set) total += idf(token) ** 2;
    return Math.sqrt(total) || 1;
  });

  const pairs: GraphEdge[] = [];

  for (let i = 0; i < sources.length; i += 1) {
    for (let j = i + 1; j < sources.length; j += 1) {
      let shared = 0;
      const common: { token: string; weight: number }[] = [];

      for (const token of tokenSets[i]) {
        if (!tokenSets[j].has(token)) continue;
        const weight = idf(token) ** 2;
        shared += weight;
        common.push({ token, weight });
      }

      // 共同标签额外加权：标签是用户显式分类，比正文重复更可信
      const tagOverlap = sources[i].tags.filter((tag) =>
        sources[j].tags.includes(tag),
      ).length;

      // 正文零重合、标签也不沾边，才算无关
      if (shared === 0 && tagOverlap === 0) continue;

      const similarity = shared / (norm[i] * norm[j]);
      const boosted = Math.min(1, similarity * 1.15 + tagOverlap * 0.08);

      if (boosted < 0.02) continue;

      pairs.push({
        source: sources[i].id,
        target: sources[j].id,
        strength: Number(boosted.toFixed(3)),
        level: "weak" as EdgeLevel,
        shared: common
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 3)
          .map((item) => item.token),
      });
    }
  }

  // 相对强度：同批素材内做 min-max 归一化，保证颜色能分出层次
  if (pairs.length > 0) {
    const raws = pairs.map((pair) => pair.strength);
    const min = Math.min(...raws);
    const max = Math.max(...raws);
    const normalize = (value: number) =>
      max - min < 1e-6 ? 0.6 : 0.15 + 0.85 * ((value - min) / (max - min));

    pairs.forEach((pair) => {
      pair.strength = Number(normalize(pair.strength).toFixed(3));
    });

    const sorted = pairs.map((pair) => pair.strength).sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
    const cuts = { strong: at(0.7), mid: at(0.3) };
    pairs.forEach((pair) => {
      pair.level = levelByQuantile(pair.strength, cuts);
    });
  }

  // 每个节点最多保留最强的 4 条边，避免图变成毛线球
  const kept: GraphEdge[] = [];
  const perNode = new Map<string, number>();
  for (const edge of [...pairs].sort((a, b) => b.strength - a.strength)) {
    const a = perNode.get(edge.source) ?? 0;
    const b = perNode.get(edge.target) ?? 0;
    if (a >= 4 || b >= 4) continue;
    perNode.set(edge.source, a + 1);
    perNode.set(edge.target, b + 1);
    kept.push(edge);
  }

  const newestId = [...sources].sort((a, b) => b.createdAt - a.createdAt)[0]?.id;

  const nodes: GraphNode[] = sources.map((source) => ({
    id: source.id,
    title: source.title,
    tags: source.tags,
    degree: kept.filter((edge) => edge.source === source.id || edge.target === source.id)
      .length,
    isNew: source.id === newestId,
  }));

  return { nodes, edges: kept };
}

/**
 * 3D 力导向布局：斥力 + 弹簧 + 向心，迭代 220 次后冻结。
 * 位置用 id 哈希初始化，保证同一批素材每次打开形状一致（不会乱跳）。
 */
export function layoutGraph(graph: Graph): Record<string, Vec3> {
  const { nodes, edges } = graph;
  const n = nodes.length;
  const positions: Vec3[] = nodes.map((node) => {
    const h = hashOf(node.id);
    const theta = ((h % 360) * Math.PI) / 180;
    const phi = (((h >> 9) % 180) * Math.PI) / 180;
    const radius = 0.72 + ((h >> 17) % 100) / 400;
    return {
      x: radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.cos(phi) * 0.8,
      z: radius * Math.sin(phi) * Math.sin(theta),
    };
  });

  const index = new Map(nodes.map((node, i) => [node.id, i]));

  for (let iter = 0; iter < 220; iter += 1) {
    const force: Vec3[] = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const dz = positions[i].z - positions[j].z;
        const dist2 = dx * dx + dy * dy + dz * dz + 1e-4;
        const dist = Math.sqrt(dist2);
        const repulsion = 0.02 / dist2;
        force[i].x += (dx / dist) * repulsion;
        force[i].y += (dy / dist) * repulsion;
        force[i].z += (dz / dist) * repulsion;
        force[j].x -= (dx / dist) * repulsion;
        force[j].y -= (dy / dist) * repulsion;
        force[j].z -= (dz / dist) * repulsion;
      }
    }

    for (const edge of edges) {
      const a = index.get(edge.source);
      const b = index.get(edge.target);
      if (a === undefined || b === undefined) continue;

      const dx = positions[b].x - positions[a].x;
      const dy = positions[b].y - positions[a].y;
      const dz = positions[b].z - positions[a].z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
      const target = 0.62 - edge.strength * 0.18;
      const stiffness = (dist - target) * 0.05 * (0.4 + edge.strength);
      const ux = dx / dist;
      const uy = dy / dist;
      const uz = dz / dist;

      force[a].x += ux * stiffness;
      force[a].y += uy * stiffness;
      force[a].z += uz * stiffness;
      force[b].x -= ux * stiffness;
      force[b].y -= uy * stiffness;
      force[b].z -= uz * stiffness;
    }

    for (let i = 0; i < n; i += 1) {
      force[i].x -= positions[i].x * 0.012;
      force[i].y -= positions[i].y * 0.012;
      force[i].z -= positions[i].z * 0.012;

      positions[i].x += Math.max(-0.06, Math.min(0.06, force[i].x));
      positions[i].y += Math.max(-0.06, Math.min(0.06, force[i].y));
      positions[i].z += Math.max(-0.06, Math.min(0.06, force[i].z));

      const radius = Math.hypot(positions[i].x, positions[i].y, positions[i].z);
      if (radius > 1.35) {
        const k = 1.35 / radius;
        positions[i].x *= k;
        positions[i].y *= k;
        positions[i].z *= k;
      }
    }
  }

  const result: Record<string, Vec3> = {};
  nodes.forEach((node, i) => {
    result[node.id] = positions[i];
  });
  return result;
}
