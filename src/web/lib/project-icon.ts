// Project icon helpers. Icons are either https URLs (site favicon, GitHub
// avatar, direct image link) or small data: URLs from an upload. No
// third-party favicon service: the image loads straight from the user's own
// site, so no one else learns what projects exist.

const IMAGE_PATH = /\.(png|svg|ico|jpe?g|webp|gif|avif)$/i;

/**
 * Turn whatever the user pasted into an icon URL:
 * - data:image URLs pass through (uploads)
 * - github.com/<owner>[/repo] becomes the owner's avatar
 * - direct image URLs pass through
 * - anything else resolves to that site's /favicon.ico
 */
export function resolveIconUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (raw.startsWith("data:image/")) return raw;

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.protocol === "http:") url.protocol = "https:";
  if (!url.hostname.includes(".")) return null;

  if (url.hostname === "github.com" || url.hostname === "www.github.com") {
    const owner = url.pathname.split("/").filter(Boolean)[0];
    if (owner) return `https://github.com/${owner}.png?size=64`;
  }
  if (IMAGE_PATH.test(url.pathname)) return url.href;
  return `${url.origin}/favicon.ico`;
}

/**
 * Ask the Worker to read the site's HTML for declared icons (CORS keeps the
 * browser from doing it). Returns null when the site declares none or the
 * lookup fails; callers keep their /favicon.ico guess in that case.
 */
export async function discoverIcon(siteUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/icon?url=${encodeURIComponent(siteUrl)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { icon?: string | null };
    return body.icon ?? null;
  } catch {
    return null;
  }
}

/** Read a picked file verbatim as a data URL (crop dialogs need the full image). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read the file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Read an uploaded image as a small data URL. Raster images are downscaled to
 * fit 64px (a few KB as PNG); small SVGs pass through untouched to stay crisp.
 */
export async function fileToIconDataUrl(file: File, size = 64): Promise<string> {
  if (file.type === "image/svg+xml" && file.size <= 20_000) {
    return fileToDataUrl(file);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(size / bitmap.width, size / bitmap.height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process the image");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}
