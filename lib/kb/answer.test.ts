import assert from "node:assert/strict";
import { test } from "node:test";

import { answerQuery } from "./answer.ts";
import type { Source } from "./types.ts";

const make = (id: string, title: string, text: string, extra: Partial<Source> = {}): Source => ({
  id,
  kind: "text",
  title,
  text,
  createdAt: 0,
  openedAt: 0,
  tags: [],
  summary: "",
  ...extra,
});

const OLD = make(
  "old",
  "长上下文足够用",
  "把整份材料直接塞进上下文，就不需要再切片检索了。",
);

const NEW = make(
  "new",
  "长上下文并不可靠",
  "长上下文模型在检索中部信息时表现显著下降，检索仍然必要。",
);

test("被取代的素材不再出现在回答里", () => {
  const question = "长上下文还需要检索吗";

  const before = answerQuery(question, [OLD, NEW]);
  assert.ok(before.citations.length >= 1);
  const beforeIds = before.citations.map((citation) => citation.sourceId);
  assert.ok(beforeIds.includes("new"));

  const resolved = answerQuery(question, [
    { ...OLD, supersededBy: "new" },
    NEW,
  ]);
  const ids = resolved.citations.map((citation) => citation.sourceId);
  assert.ok(!ids.includes("old"), "被取代的素材不应被引用");
});

test("弱相关素材不会被硬凑成出处", () => {
  const answer = answerQuery("烘焙面包的温度控制", [
    make("a", "面包烘焙", "烘焙温度控制在 180 度左右。"),
    make("b", "量子计算", "量子比特的相干时间很短。"),
  ]);

  const ids = answer.citations.map((citation) => citation.sourceId);
  assert.ok(!ids.includes("b"));
});
