/**
 * 端到端冒烟测试：真实浏览器里跑三条关键路径。
 * 需要本地已启动服务（默认 http://127.0.0.1:3000）与 Chrome。
 *
 *   pnpm test:e2e
 *
 * 与单元测试分开：单元测试跑在 node 里、不依赖浏览器，可以随时跑；
 * 这里验证的是「页面能打开、能加素材、能处理冲突」这三件事。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3000";
const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((candidate) => fs.existsSync(candidate));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await sleep(500);
  }
  return false;
}

async function connect() {
  const port = 12100 + Math.floor(Math.random() * 200);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "loom-e2e-"));

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--hide-scrollbars",
      "--remote-allow-origins=*",
      `--remote-debugging-port=${port}`,
      "--window-size=1440,900",
      `--user-data-dir=${profile}`,
      `${BASE}/kb`,
    ],
    { stdio: "ignore" },
  );

  let target = null;
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const list = await res.json();
      // 只认当前被测站点，不写死端口（本地 3000 / 线上 80 都适用）
      const host = new URL(BASE).host;
      target = list.find((item) => item.type === "page" && item.url.includes(host));
      if (target?.webSocketDebuggerUrl) break;
    } catch {
      /* 启动中 */
    }
    await sleep(300);
  }
  if (!target?.webSocketDebuggerUrl) throw new Error("连不上 Chrome 调试端口");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });

  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.result?.value;
  };

  /** 轮询等待条件成立，避免直接睡眠导致的竞态 */
  const waitFor = async (expression, timeout = 8000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = await evaluate(expression);
      if (value) return value;
      await sleep(200);
    }
    return null;
  };

  const close = () => {
    ws.close();
    chrome.kill();
    setTimeout(() => {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch {
        /* 占用时忽略 */
      }
    }, 500);
  };

  return { send, evaluate, waitFor, close };
}

async function main() {
  if (!CHROME) {
    console.error("找不到 Chrome，可用 CHROME_PATH 指定路径");
    process.exit(1);
  }

  if (!(await waitForServer())) {
    console.error(`服务没启动：${BASE}（先运行 pnpm start）`);
    process.exit(1);
  }

  const page = await connect();
  await page.send("Page.enable");
  await page.send("Runtime.enable");

  // 干净起点
  await sleep(1500);
  await page.evaluate("localStorage.clear(); location.reload(); true");
  await sleep(3000);

  /* ---------- 1. 三个页面能打开且关键元素在 ---------- */
  const hydrated = await page.waitFor(
    `JSON.parse(localStorage.getItem("loom.kb.v1") ?? "[]").length > 0`,
    10000,
  );
  check("本地数据已就绪", Boolean(hydrated));

  const libraryCount = await page.evaluate(`
    (() => {
      const buttons = [...document.querySelectorAll("button")];
      const nav = buttons.filter(b => /知识库|收件箱|问答|缺口|冲突|文件夹|关联|简报/.test(b.textContent));
      return { nav: nav.length, hasAdd: !!buttons.find(b => b.textContent.includes("添加素材")) };
    })()
  `);
  check(
    "页面渲染：导航 8 项 + 添加入口",
    libraryCount.nav >= 8 && libraryCount.hasAdd,
    `导航 ${libraryCount.nav} 项`,
  );

  /* ---------- 2. 粘贴一条素材，知识库 +1 ---------- */
  const before = await page.evaluate(`JSON.parse(localStorage.getItem("loom.kb.v1") ?? "[]").length`);

  await page.evaluate(`
    (() => {
      const add = [...document.querySelectorAll("button")].find(b => b.textContent.includes("添加素材"));
      add?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    })()
  `);
  await sleep(700);

  // 显式切到「粘贴」页签，避免默认页签变化导致用例不稳
  await page.evaluate(`
    (() => {
      const tab = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "粘贴");
      tab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    })()
  `);
  await sleep(400);

  const filled = await page.evaluate(`
    (() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(textarea, "端到端测试素材：这是一段用于验证入库流程的正文，长度足够参与检索与关联计算。");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()
  `);

  await page.evaluate(`
    (() => {
      const confirm = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "入库");
      confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    })()
  `);
  const after = await page.waitFor(
    `(() => {
      const count = JSON.parse(localStorage.getItem("loom.kb.v1") ?? "[]").length;
      return count > ${before} ? count : 0;
    })()`,
    8000,
  );
  check("添加素材：数量 +1", filled && after === before + 1, `${before} → ${after}`);

  /* ---------- 3. 冲突视图：注入一条待处理冲突，验证处理入口 ---------- */
  await page.evaluate(`
    (() => {
      const sources = JSON.parse(localStorage.getItem("loom.kb.v1") ?? "[]");
      const a = sources[0]?.id;
      const b = sources[1]?.id;
      if (!a || !b) return false;
      localStorage.setItem("loom.conflicts.v1", JSON.stringify([
        { id: "e2e-conflict", aId: a, bId: b, reason: "端到端测试注入的冲突", status: "pending" },
      ]));
      return true;
    })()
  `);
  await page.evaluate("location.reload(); true");
  await page.waitFor(
    `JSON.parse(localStorage.getItem("loom.conflicts.v1") ?? "[]").length > 0`,
    10000,
  );
  await sleep(600);

  await page.evaluate(`
    (() => {
      const target = [...document.querySelectorAll("button")].find(b => b.textContent.trim().startsWith("冲突"));
      target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    })()
  `);
  await sleep(900);

  // 点开那条冲突，看处理按钮是否出现
  await page.evaluate(`
    (() => {
      const card = [...document.querySelectorAll("button")].find(b => b.textContent.includes("端到端测试注入的冲突"));
      card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return !!card;
    })()
  `);
  await sleep(700);

  const conflictView = await page.evaluate(`
    (() => {
      const labels = [...document.querySelectorAll("button")].map(b => b.textContent.trim());
      return {
        opened: document.body.innerText.includes("端到端测试注入的冲突"),
        hasResolution: labels.some(t => /采纳|并入|改判|让模型说清/.test(t)),
      };
    })()
  `);
  check(
    "冲突视图：可打开并给出处理选项",
    conflictView.opened && conflictView.hasResolution,
    conflictView.opened ? "" : "冲突卡片没打开",
  );

  page.close();

  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("E2E 失败：", error.message);
  process.exit(1);
});
