/**
 * 出站抓取的地址校验：阻止访问内网、回环与元数据地址。
 * 服务端替用户访问任意 URL 时，这类防护是必须的（SSRF）。
 */
import dns from "node:dns/promises";
import net from "node:net";

/** 判断一个 IP 是否属于内网 / 保留地址 */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + 云元数据
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // 组播 / 保留
    return false;
  }

  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");

  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(lower)) return true; // unique local
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));

  return false;
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * 校验 URL 并解析其真实地址。
 * 域名可能解析到内网（例如指向 127.0.0.1 的域名），所以必须看解析结果而不是字面量。
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("链接格式不正确");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error("只支持 http / https 链接");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("不能抓取本机或内网地址");
  }

  const literal = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(literal)) {
    if (isPrivateAddress(literal)) throw new Error("不能抓取本机或内网地址");
    return url;
  }

  // 端口限制在常见范围内，避免扫内网端口
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) {
    throw new Error("只支持标准端口（80 / 443）");
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("域名解析失败，检查链接是否正确");
  }

  if (addresses.length === 0) throw new Error("域名解析失败，检查链接是否正确");
  if (addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error("这个域名指向内网地址，已被拒绝");
  }

  return url;
}

/** 带校验的重定向跟随：每一跳都重新检查目标地址 */
export async function safeFetch(
  raw: string,
  init: RequestInit,
  maxHops = 3,
): Promise<Response> {
  let current = await assertPublicUrl(raw);
  let response = await fetch(current, { ...init, redirect: "manual" });

  for (let hop = 0; hop < maxHops; hop++) {
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) return response;

    const next = new URL(location, current).toString();
    current = await assertPublicUrl(next);
    // 已经手动处理过跳转，这里重新发起
    response = await fetch(current, { ...init, redirect: "manual" });
  }

  return response;
}

/** 读取响应体，超过上限就中止（防止被大文件拖死） */
export async function readLimitedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      break;
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}
