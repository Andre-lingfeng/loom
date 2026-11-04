/**
 * 把厂商返回的错误码翻译成可操作的中文。
 * 各家的语义基本一致，所以按 code 匹配，再按 HTTP 状态兜底。
 */
const CODE_HINTS: Record<string, string> = {
  "30003": "这个模型在你的账号下被禁用（可能需要实名认证，或该模型已下线），换一个模型试试",
  "20012": "模型名不存在，检查拼写与组织前缀（如 Qwen/Qwen2.5-VL-72B-Instruct）",
  "30001": "账户余额不足，充值或换一个免费模型",
  "30014": "API Key 无效，检查是否复制完整",
  "10001": "请求参数不合法",
  "10002": "速率限制，稍后再试",
};

export function explainProviderError(status: number, raw: string): string {
  const code = raw.match(/"code"\s*:\s*(\d+)/)?.[1];
  if (code && CODE_HINTS[code]) return CODE_HINTS[code];

  if (status === 401) return "API Key 无效或已过期";
  if (status === 403) return "这个模型或接口在你的账号下没有权限";
  if (status === 404) return "接口地址不对，检查 Base URL 是否带版本号（如 /v1）";
  if (status === 429) return "触发限流，稍后再试";
  if (status >= 500) return "上游服务异常，稍后再试";

  return "";
}
