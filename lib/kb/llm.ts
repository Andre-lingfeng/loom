/**
 * 大模型接入配置。
 * 只存在浏览器 localStorage —— 不上传、不进仓库、随时可清。
 * 服务端部署时优先读环境变量（见 .env.example），前端配置仅用于本机演示。
 */

export interface LlmConfig {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;

  /** 视觉模型独立配置：留空则复用上面的 baseUrl / apiKey */
  visionBaseUrl: string;
  visionModel: string;
  visionApiKey: string;
}

export const PROVIDERS: {
  key: string;
  label: string;
  baseUrl: string;
  model: string;
  note: string;
}[] = [
  {
    key: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    note: "国内直连，便宜；纯文本，不支持图片",
  },
  {
    key: "zhipu",
    label: "智谱",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    note: "国内直连，有免费额度；视觉用 glm-4v-flash",
  },
  {
    key: "wuying",
    label: "无影网关",
    baseUrl: "http://127.0.0.1:19901/v1",
    model: "deepseek-v4-flash",
    note: "本地网关：需先启动「无影 AI 模型网关」，端口 19901",
  },
  {
    key: "dashscope",
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    note: "国内直连；视觉用 qwen-vl-plus / qwen-vl-max",
  },
  {
    key: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    note: "需自备网络环境，评审可能打不开",
  },
  {
    key: "custom",
    label: "自定义",
    baseUrl: "",
    model: "",
    note: "任何 OpenAI 兼容端点",
  },
];

/** 视觉模型预设：只需要选模型名，Key 默认复用主模型的 */
export const VISION_PRESETS: {
  key: string;
  label: string;
  baseUrl: string;
  model: string;
  note: string;
}[] = [
  {
    key: "glm-4v-flash",
    label: "智谱 GLM-4V-Flash",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4v-flash",
    note: "免费，够做文字识别与图表描述",
  },
  {
    key: "qwen-vl-plus",
    label: "通义 qwen-vl-plus",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-vl-plus",
    note: "识别质量更稳，按量计费",
  },
  {
    key: "siliconflow-vl",
    label: "硅基流动 Qwen-VL",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen2.5-VL-72B-Instruct",
    note: "一个 Key 用多家模型；模型名以控制台为准",
  },
  {
    key: "moonshot-vl",
    label: "月之暗面 Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-latest",
    note: "kimi-latest 支持图片输入，按量计费",
  },
  {
    key: "gpt-4o-mini",
    label: "OpenAI gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    note: "需自备网络环境",
  },
];

const KEY = "loom.llm.v1";

export const EMPTY_CONFIG: LlmConfig = {
  provider: "deepseek",
  baseUrl: PROVIDERS[0].baseUrl,
  model: PROVIDERS[0].model,
  apiKey: "",
  visionBaseUrl: "",
  visionModel: "",
  visionApiKey: "",
};

export function loadConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_CONFIG;

    const parsed = JSON.parse(raw) as Partial<Record<keyof LlmConfig, unknown>>;
    // 只接受字符串：旧版本残留的 null / 数字 / 对象会让后续 .trim() 直接抛错
    const str = (value: unknown, fallback: string) =>
      typeof value === "string" ? value : fallback;

    return {
      provider: str(parsed.provider, EMPTY_CONFIG.provider),
      baseUrl: str(parsed.baseUrl, EMPTY_CONFIG.baseUrl),
      model: str(parsed.model, EMPTY_CONFIG.model),
      apiKey: str(parsed.apiKey, EMPTY_CONFIG.apiKey),
      visionBaseUrl: str(parsed.visionBaseUrl, ""),
      visionModel: str(parsed.visionModel, ""),
      visionApiKey: str(parsed.visionApiKey, ""),
    };
  } catch {
    return EMPTY_CONFIG;
  }
}

export function saveConfig(config: LlmConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    /* 隐私模式下可能不可写 */
  }
}

export function clearConfig() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function isConfigured(config: LlmConfig | null): boolean {
  return Boolean(config?.apiKey && config.baseUrl && config.model);
}

/** 视觉调用的实际参数：vision* 留空则回落到主配置 */
export function resolveVision(config: LlmConfig): {
  baseUrl: string;
  model: string;
  apiKey: string;
} {
  return {
    baseUrl: (config.visionBaseUrl || config.baseUrl).replace(/\/+$/, ""),
    // 主模型本身支持图片时，不必重复配置视觉模型
    model: config.visionModel || config.model,
    apiKey: config.visionApiKey || config.apiKey,
  };
}

export function isVisionConfigured(config: LlmConfig | null): boolean {
  if (!config) return false;
  const vision = resolveVision(config);
  // 只要主模型可用就算可用；真不支持图片时会在调用时报错并给提示
  return Boolean(vision.model && vision.baseUrl && vision.apiKey);
}

/** 是否显式配置了独立的视觉模型（用于界面文案） */
export function hasDedicatedVision(config: LlmConfig | null): boolean {
  return Boolean(config?.visionModel);
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 3)}${"•".repeat(Math.min(18, key.length - 6))}${key.slice(-3)}`;
}
