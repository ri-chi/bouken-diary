// コメントの管理ページ（https://bouken-api.〇〇.workers.dev/admin）
// パスワード（ADMIN_TOKEN）を入れると、承認待ちのコメントの承認・返信・削除ができる。
// パスワードはこのページのブラウザにだけ保存される。

export function adminPage() {
  return new Response(ADMIN_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    },
  });
}

const ADMIN_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>コメント管理｜ぼうけん日記</title>
<style>
  :root {
    --paper: #eef2ec; --surface: #fff; --ink: #263228; --muted: #5e6b60;
    --line: #c9d3c5; --grass: #356b2b; --gold: #e6b437; --danger: #a33a2a; --window: #000;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; background: var(--paper); color: var(--ink);
    font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; line-height: 1.7; }
  main { max-width: 44rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  h1 { font-size: 1.3rem; margin: 0 0 1rem; }
  button, input, textarea { font: inherit; }
  button { cursor: pointer; border-radius: 6px; padding: 0.45rem 0.9rem; border: 1px solid var(--line);
    background: var(--surface); color: var(--ink); }
  button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
  .primary { background: var(--window); border-color: var(--window); color: #fff; }
  .danger { color: var(--danger); border-color: currentColor; }
  .login { display: grid; gap: 0.75rem; background: var(--surface); border: 1px solid var(--line);
    border-radius: 8px; padding: 1.25rem; }
  .login input { padding: 0.55rem 0.7rem; border: 1px solid var(--line); border-radius: 6px; }
  .bar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 1rem; }
  .bar .spacer { flex: 1; }
  .tab[aria-selected="true"] { background: var(--window); color: #fff; border-color: var(--window); }
  .status { min-height: 1.5em; color: var(--muted); font-size: 0.9rem; margin: 0 0 0.75rem; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px;
    padding: 1rem 1.1rem; margin-bottom: 0.9rem; }
  .card.admin { border-left: 4px solid var(--gold); }
  .meta { display: flex; flex-wrap: wrap; gap: 0.2rem 1rem; font-size: 0.82rem; color: var(--muted); }
  .meta a { color: var(--grass); }
  .name { font-weight: 700; margin: 0.4rem 0 0.2rem; }
  .badge { font-size: 0.75rem; background: var(--gold); color: #000; padding: 0 0.4rem; border-radius: 3px; margin-left: 0.4rem; }
  .body { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 0.75rem; }
  .parent { font-size: 0.85rem; color: var(--muted); border-left: 3px solid var(--line);
    padding-left: 0.6rem; margin: 0.4rem 0 0.6rem; white-space: pre-wrap; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .reply { display: grid; gap: 0.5rem; margin-top: 0.75rem; }
  .reply textarea { width: 100%; min-height: 6rem; padding: 0.55rem 0.7rem; border: 1px solid var(--line); border-radius: 6px; }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>コメント管理</h1>

  <section class="login" id="login" hidden>
    <label for="token">管理パスワード（ADMIN_TOKEN）</label>
    <input id="token" type="password" autocomplete="current-password" />
    <div><button class="primary" id="login-btn" type="button">ログイン</button></div>
    <p class="status" id="login-status"></p>
  </section>

  <section id="app" hidden>
    <div class="bar" role="tablist">
      <button class="tab" role="tab" data-status="pending" type="button">承認待ち</button>
      <button class="tab" role="tab" data-status="approved" type="button">公開中</button>
      <span class="spacer"></span>
      <button id="reload" type="button">更新</button>
      <button id="logout" type="button">ログアウト</button>
    </div>
    <p class="status" id="status" role="status"></p>
    <div id="list"></div>
  </section>
</main>

<script>
(function () {
  const KEY = "bouken-admin-token";
  let token = "";
  try { token = localStorage.getItem(KEY) || ""; } catch (e) {}
  let current = "pending";

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function show(view) {
    $("login").hidden = view !== "login";
    $("app").hidden = view !== "app";
  }

  async function api(path, options) {
    const res = await fetch("/admin/api" + path, {
      ...(options || {}),
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    });
    if (res.status === 401) {
      try { localStorage.removeItem(KEY); } catch (e) {}
      token = "";
      show("login");
      $("login-status").textContent = "パスワードが違います。";
      throw new Error("unauthorized");
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function formatDate(ms) {
    return new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  }

  function card(c, siteUrl) {
    const box = el("article", "card" + (c.isAdmin ? " admin" : ""));

    const meta = el("div", "meta");
    const link = el("a", "", c.slug);
    link.href = siteUrl.replace(/\\/+$/, "") + "/articles/" + c.slug + "/#comments";
    link.target = "_blank";
    link.rel = "noopener";
    meta.append(link, el("span", "", formatDate(c.createdAt)));
    box.append(meta);

    const name = el("p", "name", c.name);
    if (c.isAdmin) name.append(el("span", "badge", "ブログ主"));
    box.append(name);

    if (c.parentName) box.append(el("p", "parent", c.parentName + " さんへの返信：" + (c.parentBody || "")));
    box.append(el("p", "body", c.body));

    const actions = el("div", "actions");
    if (c.status === "pending") {
      const approve = el("button", "primary", "承認して公開");
      approve.type = "button";
      approve.onclick = () => act(c.id, "approve", null, "承認しました。");
      actions.append(approve);
    }
    if (!c.isAdmin) {
      const replyBtn = el("button", "", c.status === "pending" ? "返信して公開" : "返信");
      replyBtn.type = "button";
      replyBtn.onclick = () => toggleReply(box, c);
      actions.append(replyBtn);
    }
    const del = el("button", "danger", "削除");
    del.type = "button";
    del.onclick = () => {
      if (confirm("このコメント（と、それへの返信）を削除しますか？元に戻せません。")) act(c.id, "delete", null, "削除しました。");
    };
    actions.append(del);
    box.append(actions);
    return box;
  }

  function toggleReply(box, c) {
    const existing = box.querySelector(".reply");
    if (existing) { existing.remove(); return; }
    const wrap = el("div", "reply");
    const area = el("textarea");
    area.maxLength = 1000;
    area.setAttribute("aria-label", c.name + " さんへの返信");
    const send = el("button", "primary", "返信を送る");
    send.type = "button";
    send.onclick = () => {
      const body = area.value.trim();
      if (!body) { area.focus(); return; }
      act(c.id, "reply", { body: body }, "返信しました。");
    };
    wrap.append(area, el("div", "", ""));
    wrap.lastChild.append(send);
    box.append(wrap);
    area.focus();
  }

  async function act(id, action, body, done) {
    $("status").textContent = "送信中…";
    try {
      await api("/comments/" + id + "/" + action, { method: "POST", body: JSON.stringify(body || {}) });
      $("status").textContent = done;
      await load(false);
    } catch (e) {
      if (e.message !== "unauthorized") $("status").textContent = "失敗しました（" + e.message + "）";
    }
  }

  async function load(clearStatus) {
    if (clearStatus !== false) $("status").textContent = "読み込み中…";
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.status === current)));
    try {
      const data = await api("/comments?status=" + current);
      const list = $("list");
      list.replaceChildren();
      if (!data.comments.length) {
        list.append(el("p", "empty", current === "pending" ? "承認待ちのコメントはありません。" : "公開中のコメントはありません。"));
      } else {
        data.comments.forEach((c) => list.append(card(c, data.siteUrl)));
      }
      if (clearStatus !== false) $("status").textContent = data.comments.length + "件";
      show("app");
    } catch (e) {
      if (e.message !== "unauthorized") $("status").textContent = "読み込めませんでした（" + e.message + "）";
    }
  }

  $("login-btn").onclick = () => {
    token = $("token").value.trim();
    if (!token) return;
    try { localStorage.setItem(KEY, token); } catch (e) {}
    $("token").value = "";
    $("login-status").textContent = "";
    load();
  };
  $("token").addEventListener("keydown", (e) => { if (e.key === "Enter") $("login-btn").click(); });
  document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => { current = t.dataset.status; load(); }));
  $("reload").onclick = () => load();
  $("logout").onclick = () => {
    try { localStorage.removeItem(KEY); } catch (e) {}
    token = "";
    show("login");
  };

  if (token) load(); else show("login");
})();
</script>
</body>
</html>`;
