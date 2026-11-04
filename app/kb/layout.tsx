import type { Metadata } from "next";

import "./kb.css";

export const metadata: Metadata = {
  title: "织识 Loom · 个人知识库",
  description: "把碎片织成结构：带引用的检索、缺口检测、每日简报。",
};

export default function KnowledgeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
