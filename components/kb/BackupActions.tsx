"use client";

import { useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";

import { applyBackup, downloadBackup, parseBackup } from "@/lib/kb/backup";

/**
 * 备份：导出为 JSON / 从 JSON 导入。
 * 放在侧边栏底部，和「恢复演示数据」同属数据管理动作。
 */
export function BackupActions() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const exportFile = () => {
    try {
      const counts = downloadBackup();
      setNote(`已导出 ${counts.sources} 条素材`);
    } catch {
      setNote("导出失败，检查浏览器是否阻止了下载");
    }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setNote("");

    try {
      const result = applyBackup(parseBackup(await file.text()));
      setNote(
        `导入 ${result.sources} 条，跳过 ${result.skipped} 条${
          result.conflicts ? `，冲突 ${result.conflicts} 条` : ""
        }`,
      );
      // 让 store 重新读一遍 localStorage
      setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <button
        onClick={exportFile}
        className="flex items-center gap-1 px-1 text-2xs text-white/30 transition-colors hover:text-white"
      >
        <Download size={11} />
        导出备份
      </button>

      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-1 px-1 text-2xs text-white/30 transition-colors hover:text-white disabled:opacity-50"
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
        导入备份
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = "";
        }}
      />

      {note && <p className="px-1 text-2xs leading-relaxed text-white/45">{note}</p>}
    </div>
  );
}
