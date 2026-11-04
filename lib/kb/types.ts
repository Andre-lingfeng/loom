export type SourceKind = "text" | "file" | "url" | "image";

export interface Source {
  id: string;
  kind: SourceKind;
  title: string;
  url?: string;
  /** 原文纯文本 */
  text: string;
  createdAt: number;
  openedAt: number;
  /** 意图门：为什么存它。空 = 未消化 */
  intent?: string;
  /** 自动推断 + 手动补充 */
  tags: string[];
  /** 三句摘要（MVP 为抽取式） */
  summary: string;
  /** 图片入库时的缩略图（dataURL，仅用于展示） */
  thumbnail?: string;
  /** 冲突处理时被判定为「已被取代」，检索与简报中会降权 */
  supersededBy?: string;
  /** 已确认的分歧：与这些素材「并存」，回答里必须点明冲突 */
  disputesWith?: string[];
  /** 被并入哪一条素材（作为它的附属材料，不再单独出现在库里） */
  absorbedBy?: string;
  /** 这条素材吸收了哪些材料（打包进来一起保留） */
  absorbed?: string[];
}

export type View =
  | "library"
  | "inbox"
  | "ask"
  | "gaps"
  | "brief"
  | "graph"
  | "conflicts"
  | "archive";

export interface Citation {
  index: number;
  sourceId: string;
  title: string;
  snippet: string;
}

export interface Answer {
  text: string;
  citations: Citation[];
  /** 检索为空时给出引导 */
  empty?: boolean;
}

export type GapLevel = "ok" | "weak" | "missing";

export interface GapTerm {
  term: string;
  count: number;
  sourceIds: string[];
  level: GapLevel;
}

export interface GapReport {
  goal: string;
  terms: GapTerm[];
  coverage: number;
  /** 结论用一句话，别让用户自己读表 */
  verdict: string;
}

/** 冲突的处理方式：采纳 A / 采纳 B / 并存 */
export type ConflictResolution = "a" | "b" | "both";

export interface Conflict {
  id: string;
  aId: string;
  bId: string;
  /** 模型给出的冲突理由 */
  reason: string;
  status: "pending" | "resolved";
  resolution?: ConflictResolution;
  /** 用户写下的判断，未填写不允许关闭冲突 */
  note?: string;
  resolvedAt?: number;
}
