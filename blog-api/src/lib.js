// Worker 全体で使う小さな道具

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

export function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const list = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return list.includes(origin) ? origin : "";
}

export function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// IPアドレスをそのまま保存しないよう、SALT と混ぜてハッシュ化する
export async function hashedIp(request, env, extra = "") {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  return sha256Hex(`${env.SALT || ""}:${ip}:${extra}`);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// 実在する記事かを、公開中の search-index.json で確認する（10分キャッシュ）。
// サイトが一時的に読めないときは、機能を止めないよう確認を省略する。
export async function articleExists(slug, env, ctx) {
  if (!env.SITE_URL) return true;
  const indexUrl = `${env.SITE_URL.replace(/\/+$/, "")}/search-index.json`;
  const cache = caches.default;
  const cacheKey = new Request(indexUrl);

  let res = await cache.match(cacheKey);
  if (!res) {
    try {
      const fresh = await fetch(indexUrl);
      if (!fresh.ok) return true;
      res = new Response(await fresh.text(), {
        headers: { "Content-Type": "application/json", "Cache-Control": "max-age=600" },
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    } catch {
      return true;
    }
  }

  try {
    const list = await res.json();
    return Array.isArray(list) && list.some((a) => a.slug === slug);
  } catch {
    return true;
  }
}
