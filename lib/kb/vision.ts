import { loadConfig, resolveVision } from "./llm";

/** 解码：优先 createImageBitmap，失败再退回 <img>（HEIC / 特殊编码常能救回来） */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error(
        "这张图片浏览器无法解码，可能是 HEIC 或损坏文件。请换成 JPG / PNG 再试。",
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** 一次解码，同时产出「送模型的清晰图」和「存本地的缩略图」 */
async function toDataUrls(
  file: File,
): Promise<{ image: string; thumb: string }> {
  const bitmap = await decode(file);
  const naturalWidth = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
  const naturalHeight = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
  const longest = Math.max(naturalWidth, naturalHeight);

  if (!Number.isFinite(longest) || longest < 1) {
    throw new Error("这张图片尺寸异常（0 像素），换一张再试。");
  }

  const draw = (maxSize: number, quality: number) => {
    const scale = Math.min(1, maxSize / longest);
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 Canvas");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  };

  // 自动压缩：从 1280px / 0.8 起步，超预算就逐级降，直到进入目标区间
  const TARGET_BYTES = 1_200_000; // base64 长度（约 900KB 原始字节）
  const LADDER: [number, number][] = [
    [1280, 0.8],
    [1100, 0.75],
    [960, 0.7],
    [800, 0.65],
    [640, 0.6],
  ];

  let image = "";
  for (const [size, quality] of LADDER) {
    image = draw(size, quality);
    if (image.length <= TARGET_BYTES) break;
  }

  if (!image.startsWith("data:image/jpeg;base64,") || image.length < 200) {
    throw new Error("图片转码失败，换一张 JPG / PNG 再试。");
  }

  const thumb = draw(240, 0.7);
  if ("close" in bitmap) bitmap.close();
  return { image, thumb };
}

/**
 * 图片入库：先本地压缩，再交给视觉模型转录成文本。
 * 视觉模型必须单独配置 —— DeepSeek / GLM-4-Flash 这类纯文本模型看不了图。
 */
export async function extractImageText(
  file: File,
): Promise<{ text: string; thumb: string; tokens: number | null; model: string }> {
  const config = loadConfig();
  const vision = resolveVision(config);

  if (!vision.model) {
    throw new Error("还没配置视觉模型，先去「模型接入」选一个");
  }

  const { image, thumb } = await toDataUrls(file);

  const response = await fetch("/api/vision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      image,
      baseUrl: vision.baseUrl,
      apiKey: vision.apiKey,
      model: vision.model,
    }),
  });

  const data = (await response.json()) as {
    text?: string;
    tokens?: number | null;
    model?: string;
    error?: string;
  };

  if (!response.ok || !data.text) {
    throw new Error(data.error ?? "图片识别失败");
  }

  return {
    text: data.text,
    thumb,
    tokens: data.tokens ?? null,
    model: data.model ?? vision.model,
  };
}
