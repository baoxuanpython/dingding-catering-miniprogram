import { ENV } from "./env";

// 将后端返回的图片地址归一化为可用的完整 URL。
// 1. 完整 https 链接：原样返回
// 2. 完整 http 链接：升级为 https，避免小程序拒绝加载
// 3. 相对路径：拼接 OSS 域名
export function normalizeImageUrl(url?: string): string {
  if (!url) {
    return "";
  }

  const trimmed = url.trim();

  if (/^https:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^http:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }

  const base = ENV.IMAGE_BASE_URL.replace(/\/$/, "");
  return trimmed.startsWith("/") ? `${base}${trimmed}` : `${base}/${trimmed}`;
}
