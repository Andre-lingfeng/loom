import assert from "node:assert/strict";
import { test } from "node:test";

import { buildGraph, layoutGraph } from "./graph.ts";
import type { Source } from "./types.ts";

const make = (id: string, title: string, text: string, tags: string[] = []): Source => ({
  id,
  kind: "text",
  title,
  text,
  createdAt: 0,
  openedAt: 0,
  tags,
  summary: "",
});

test("有共同词的素材会被连起来", () => {
  const graph = buildGraph([
    make("a", "成本观察", "单次任务成本下降 80%，主要来自缓存复用。"),
    make("b", "投入产出", "成本下降让 ROI 提前，缓存复用是主因。"),
  ]);

  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);

  const edge = graph.edges[0];
  assert.ok(edge.strength > 0);
  assert.ok(["strong", "mid", "weak"].includes(edge.level));
});

test("完全无关的素材不会连边", () => {
  const graph = buildGraph([
    make("a", "量子", "量子纠缠实验的观测结果。"),
    make("b", "烘焙", "面包烘焙温度与湿度控制。"),
  ]);

  assert.equal(graph.edges.length, 0);
});

test("共同标签会提高关联强度", () => {
  const withoutTag = buildGraph([
    make("a", "苹果", "苹果生长需要充足的阳光。"),
    make("b", "河流", "河流最终流向大海。"),
  ]);
  const withTag = buildGraph([
    make("a", "苹果", "苹果生长需要充足的阳光。", ["agent"]),
    make("b", "河流", "河流最终流向大海。", ["agent"]),
  ]);

  assert.equal(withoutTag.edges.length, 0);
  assert.equal(withTag.edges.length, 1);
  assert.ok(withTag.edges[0].strength > 0);
});

test("布局为每个节点返回有限坐标", () => {
  const graph = buildGraph([
    make("a", "甲", "知识管理需要输出。"),
    make("b", "乙", "输出倒逼输入。"),
    make("c", "丙", "输入与输出形成闭环。"),
  ]);

  const positions = layoutGraph(graph);
  assert.equal(Object.keys(positions).length, graph.nodes.length);

  for (const point of Object.values(positions)) {
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
    assert.ok(Number.isFinite(point.z));
    // 坐标被限制在球体内，避免布局发散
    assert.ok(Math.hypot(point.x, point.y, point.z) <= 1.36);
  }
});
