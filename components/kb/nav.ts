import {
  FolderArchive,
  FolderOpen,
  Inbox,
  Newspaper,
  Search,
  Share2,
  Target,
  TriangleAlert,
} from "lucide-react";

import type { View } from "@/lib/kb/types";

/** 知识库的 6 个视图：侧栏与移动端标签条共用 */
export const NAV_ITEMS: { key: View; label: string; icon: typeof FolderOpen }[] = [
  { key: "library", label: "知识库", icon: FolderOpen },
  { key: "inbox", label: "收件箱", icon: Inbox },
  { key: "ask", label: "问答", icon: Search },
  { key: "gaps", label: "缺口", icon: Target },
  { key: "conflicts", label: "冲突", icon: TriangleAlert },
  { key: "archive", label: "文件夹", icon: FolderArchive },
  { key: "graph", label: "关联", icon: Share2 },
  { key: "brief", label: "简报", icon: Newspaper },
];
