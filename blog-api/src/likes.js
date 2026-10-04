// いいね
//   GET  /likes?slug=...                       → { count, liked }
//   POST /likes?slug=...  {"action":"like"}    → { count, liked }
//   POST /likes?slug=...  {"action":"unlike"}  → { count, liked }

import { json, hashedIp, readJson, articleExists } from "./lib.js";

async function getState(env, slug, voter) {
  const [countRow, voteRow] = await env.DB.batch([
    env.DB.prepare("SELECT count FROM likes WHERE slug = ?1").bind(slug),
    env.DB.prepare("SELECT 1 AS hit FROM votes WHERE slug = ?1 AND voter = ?2").bind(slug, voter),
  ]);
  return {
    count: countRow.results[0] ? countRow.results[0].count : 0,
    liked: voteRow.results.length > 0,
  };
}

async function like(env, slug, voter) {
  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO votes (slug, voter, created_at) VALUES (?1, ?2, ?3)"
  )
    .bind(slug, voter, Date.now())
    .run();

  // 初めてのいいねのときだけ数を増やす（連打しても1回分）
  if (inserted.meta.changes === 1) {
    await env.DB.prepare(
      "INSERT INTO likes (slug, count) VALUES (?1, 1) ON CONFLICT(slug) DO UPDATE SET count = count + 1"
    )
      .bind(slug)
      .run();
  }
}

async function unlike(env, slug, voter) {
  const deleted = await env.DB.prepare("DELETE FROM votes WHERE slug = ?1 AND voter = ?2")
    .bind(slug, voter)
    .run();

  if (deleted.meta.changes === 1) {
    await env.DB.prepare("UPDATE likes SET count = MAX(count - 1, 0) WHERE slug = ?1").bind(slug).run();
  }
}

export async function handleLikes(request, env, ctx, { slug, origin }) {
  const voter = await hashedIp(request, env, slug);

  if (request.method === "GET") {
    return json(await getState(env, slug, voter), 200, origin);
  }

  if (request.method === "POST") {
    // 他のサイトから勝手に押されないよう、許可したサイトからのリクエストだけ受け付ける
    if (!origin) return json({ error: "forbidden_origin" }, 403, origin);

    const body = await readJson(request);
    if (!body) return json({ error: "invalid_body" }, 400, origin);
    if (!(await articleExists(slug, env, ctx))) return json({ error: "unknown_article" }, 404, origin);

    if (body.action === "like") await like(env, slug, voter);
    else if (body.action === "unlike") await unlike(env, slug, voter);
    else return json({ error: "invalid_action" }, 400, origin);

    return json(await getState(env, slug, voter), 200, origin);
  }

  return json({ error: "method_not_allowed" }, 405, origin);
}
