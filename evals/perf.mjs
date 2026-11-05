import { spawn } from "node:child_process";
import fs from "node:fs";

const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((p) => fs.existsSync(p));
const PORT = 12310 + Math.floor(Math.random() * 12);
const PROFILE = `D:\\DeepSeekHarness\\.chrome-perf-${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.env.EVAL_BASE ?? "http://127.0.0.1:3000";

if (!CHROME) {
  console.error("找不到 Chrome，可用 CHROME_PATH 指定路径");
  process.exit(1);
}

const chrome = spawn(CHROME, [
  "--headless=new", "--hide-scrollbars", "--remote-allow-origins=*",
  `--remote-debugging-port=${PORT}`, "--window-size=1440,900", `--user-data-dir=${PROFILE}`,
  "about:blank",
], { stdio: "ignore" });

const ready = async () => {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const p = list.find((t) => t.type === "page");
      if (p?.webSocketDebuggerUrl) return p;
    } catch {}
    await sleep(300);
  }
  throw new Error("no page");
};

const page = await ready();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
const send = (method, params = {}) => new Promise((res) => {
  const id = ++seq; pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = (expr) => send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }).then((r) => r.result?.result?.value);

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
// 模拟 4G：下行 9Mbps、上行 1.5Mbps、RTT 85ms
await send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 85,
  downloadThroughput: (9 * 1024 * 1024) / 8,
  uploadThroughput: (1.5 * 1024 * 1024) / 8,
});
await send("Emulation.setCPUThrottlingRate", { rate: 4 });

for (const path of ["/", "/kb"]) {
  await send("Page.navigate", { url: BASE + path });
  await sleep(1500);

  const metrics = await ev(`new Promise((resolve) => {
    const result = { lcp: 0, dcl: 0, load: 0 };
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      result.lcp = entries[entries.length - 1].startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });

    const nav = performance.getEntriesByType("navigation")[0];
    setTimeout(() => {
      result.dcl = nav ? nav.domContentLoadedEventEnd : 0;
      result.load = nav ? nav.loadEventEnd : 0;
      resolve(result);
    }, 2500);
  })`);

  console.log(
    `${path.padEnd(4)} LCP ${Math.round(metrics.lcp)}ms · DCL ${Math.round(metrics.dcl)}ms · load ${Math.round(metrics.load)}ms`,
  );
}

ws.close(); chrome.kill(); await sleep(300);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
process.exit(0);
