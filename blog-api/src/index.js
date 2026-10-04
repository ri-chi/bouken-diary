// ぼうけん日記の API（Cloudflare Workers + D1）
//
//   /likes          いいね（likes.js）
//   /comments       コメント（comments.js）
//   /admin          コメントの管理ページ（admin.js）
//   /admin/api/...  管理ページが使うAPI（パスワードが必要）

import { SLUG_RE, allowedOrigin, corsHeaders, json } from "./lib.js";
import { handleLikes } from "./likes.js";
import { handlePublicComments, handleAdminApi } from "./comments.js";
import { adminPage } from "./admin.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 管理ページ（ブラウザで直接開く）
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return request.method === "GET" ? adminPage() : json({ error: "method_not_allowed" }, 405);
    }
    if (url.pathname.startsWith("/admin/api/")) {
      return handleAdminApi(request, env, url);
    }

    // ブログの記事ページから呼ばれるAPI
    const origin = allowedOrigin(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const slug = url.searchParams.get("slug") || "";
    if (url.pathname === "/likes" || url.pathname === "/comments") {
      if (!SLUG_RE.test(slug)) return json({ error: "invalid_slug" }, 400, origin);
      if (url.pathname === "/likes") return handleLikes(request, env, ctx, { slug, origin });
      return handlePublicComments(request, env, ctx, { slug, origin });
    }

    return json({ error: "not_found" }, 404, origin);
  },
};
