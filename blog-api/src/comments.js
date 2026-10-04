// コメント
//
// 読者用（ブログの記事ページから呼ばれる）
//   GET  /comments?slug=...   → 公開中のコメント一覧
//   POST /comments?slug=...   {name, body, parentId?, website}
//        → 承認待ちとして保存。承認するまでは表示されない
//
// 管理用（/admin のページから呼ばれる。Authorization: Bearer <ADMIN_TOKEN> が必要）
//   GET  /admin/api/comments?status=pending|approved
//   POST /admin/api/comments/<id>/approve
//   POST /admin/api/comments/<id>/reply   {body}
//   POST /admin/api/comments/<id>/delete

import { json, hashedIp, readJson, articleExists, sha256Hex } from "./lib.js";

const NAME_MAX = 30;
const BODY_MAX = 1000;
const MAX_LINKS = 2;
const LIMIT_SHORT = { count: 5, ms: 10 * 60 * 1000 }; // 10分に5件まで
const LIMIT_DAY = { count: 20, ms: 24 * 60 * 60 * 1000 }; // 1日20件まで

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") // 制御文字を除く
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

// 公開用：投稿者のハッシュなど、表に出さない項目を外す
function publicComment(row) {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    body: row.body,
    isAdmin: row.is_admin === 1,
    createdAt: row.created_at,
  };
}

async function notifyDiscord(env, request, comment) {
  if (!env.DISCORD_WEBHOOK_URL) return;
  const adminUrl = `${new URL(request.url).origin}/admin`;
  const content = [
    "💬 新しいコメントが届きました（承認待ち）",
    `記事: ${comment.slug}`,
    `名前: ${comment.name}`,
    "",
    comment.body.length > 300 ? `${comment.body.slice(0, 300)}…` : comment.body,
    "",
    `管理ページ: ${adminUrl}`,
  ].join("\n");

  try {
    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // allowed_mentions を空にして、コメント内の @everyone などで通知が飛ばないようにする
      body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }),
    });
  } catch {
    // 通知に失敗してもコメントの保存には影響させない
  }
}

// ---------------------------------------------------------------
// 読者用
// ---------------------------------------------------------------

export async function handlePublicComments(request, env, ctx, { slug, origin }) {
  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM comments WHERE slug = ?1 AND status = 'approved' ORDER BY created_at ASC LIMIT 500"
    )
      .bind(slug)
      .all();
    return json({ comments: results.map(publicComment) }, 200, origin);
  }

  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  if (!origin) return json({ error: "forbidden_origin" }, 403, origin);

  const input = await readJson(request);
  if (!input) return json({ error: "invalid_body" }, 400, origin);

  // 人には見えない入力欄（website）に何か入っていたら、ボットとみなして保存せずに成功のふりをする
  if (String(input.website || "").trim()) return json({ ok: true, pending: true }, 200, origin);

  const name = cleanText(input.name, NAME_MAX).replace(/\n/g, " ");
  const body = cleanText(input.body, BODY_MAX);
  if (!name) return json({ error: "name_required" }, 400, origin);
  if (!body) return json({ error: "body_required" }, 400, origin);

  // ブログ主のなりすましを防ぐ
  const adminName = String(env.ADMIN_NAME || "ブログ主").replace(/\s/g, "");
  if (name.replace(/\s/g, "") === adminName) return json({ error: "name_reserved" }, 400, origin);

  // リンクだらけの書き込みはスパムとして断る
  const links = (body.match(/https?:\/\//gi) || []).length;
  if (links > MAX_LINKS) return json({ error: "too_many_links" }, 400, origin);

  if (!(await articleExists(slug, env, ctx))) return json({ error: "unknown_article" }, 404, origin);

  // 連投の制限（同じ人＝同じIPのハッシュ）
  const author = await hashedIp(request, env, "comments");
  const now = Date.now();
  const [short, day] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE author = ?1 AND created_at > ?2").bind(
      author,
      now - LIMIT_SHORT.ms
    ),
    env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE author = ?1 AND created_at > ?2").bind(
      author,
      now - LIMIT_DAY.ms
    ),
  ]);
  if (short.results[0].n >= LIMIT_SHORT.count || day.results[0].n >= LIMIT_DAY.count) {
    return json({ error: "rate_limited" }, 429, origin);
  }

  // 返信先は、同じ記事の公開中のコメントだけ。返信の返信は、元のコメントへの返信にまとめる（1段だけ）
  let parentId = null;
  if (input.parentId) {
    const parent = await env.DB.prepare(
      "SELECT id, parent_id FROM comments WHERE id = ?1 AND slug = ?2 AND status = 'approved'"
    )
      .bind(Number(input.parentId), slug)
      .first();
    if (!parent) return json({ error: "parent_not_found" }, 400, origin);
    parentId = parent.parent_id || parent.id;
  }

  await env.DB.prepare(
    "INSERT INTO comments (slug, parent_id, name, body, is_admin, status, author, created_at) VALUES (?1, ?2, ?3, ?4, 0, 'pending', ?5, ?6)"
  )
    .bind(slug, parentId, name, body, author, now)
    .run();

  ctx.waitUntil(notifyDiscord(env, request, { slug, name, body }));
  return json({ ok: true, pending: true }, 200, origin);
}

// ---------------------------------------------------------------
// 管理用
// ---------------------------------------------------------------

// パスワードの比較は、文字列を直接比べず、ハッシュ同士を比べる（比較時間で推測されないように）
async function isAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !env.ADMIN_TOKEN) return false;
  const [a, b] = await Promise.all([sha256Hex(token), sha256Hex(env.ADMIN_TOKEN)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleAdminApi(request, env, url) {
  if (!(await isAdmin(request, env))) return json({ error: "unauthorized" }, 401);

  const path = url.pathname.replace(/^\/admin\/api/, "");

  if (request.method === "GET" && path === "/comments") {
    const status = url.searchParams.get("status") === "approved" ? "approved" : "pending";
    const order = status === "pending" ? "ASC" : "DESC";
    const { results } = await env.DB.prepare(
      `SELECT c.*, p.name AS parent_name, p.body AS parent_body
         FROM comments c LEFT JOIN comments p ON p.id = c.parent_id
        WHERE c.status = ?1 ORDER BY c.created_at ${order} LIMIT 200`
    )
      .bind(status)
      .all();
    return json({
      siteUrl: env.SITE_URL || "",
      comments: results.map((r) => ({
        ...publicComment(r),
        slug: r.slug,
        status: r.status,
        parentName: r.parent_name,
        parentBody: r.parent_body,
      })),
    });
  }

  const match = path.match(/^\/comments\/(\d+)\/(approve|reply|delete)$/);
  if (request.method === "POST" && match) {
    const id = Number(match[1]);
    const action = match[2];
    const target = await env.DB.prepare("SELECT * FROM comments WHERE id = ?1").bind(id).first();
    if (!target) return json({ error: "not_found" }, 404);

    if (action === "approve") {
      await env.DB.prepare("UPDATE comments SET status = 'approved' WHERE id = ?1").bind(id).run();
      return json({ ok: true });
    }

    if (action === "delete") {
      // 返信もいっしょに消す
      await env.DB.batch([
        env.DB.prepare("DELETE FROM comments WHERE parent_id = ?1").bind(id),
        env.DB.prepare("DELETE FROM comments WHERE id = ?1").bind(id),
      ]);
      return json({ ok: true });
    }

    if (action === "reply") {
      const input = await readJson(request);
      const body = cleanText(input && input.body, BODY_MAX);
      if (!body) return json({ error: "body_required" }, 400);

      // 返信するコメントがまだ承認待ちなら、いっしょに公開する
      const parentId = target.parent_id || target.id;
      await env.DB.batch([
        env.DB.prepare("UPDATE comments SET status = 'approved' WHERE id = ?1").bind(target.id),
        env.DB.prepare(
          "INSERT INTO comments (slug, parent_id, name, body, is_admin, status, author, created_at) VALUES (?1, ?2, ?3, ?4, 1, 'approved', 'admin', ?5)"
        ).bind(target.slug, parentId, env.ADMIN_NAME || "ブログ主", body, Date.now()),
      ]);
      return json({ ok: true });
    }
  }

  return json({ error: "not_found" }, 404);
}
