// 記事ページのコメント欄。コメントは Cloudflare Worker（blog-api/）に保存する。
// 投稿されたコメントは承認待ちになり、管理ページで承認すると表示される。
(function () {
  const section = document.getElementById("comments");
  if (!section) return;

  const api = section.dataset.api;
  const slug = section.dataset.slug;
  const endpoint = `${api}/comments?slug=${encodeURIComponent(slug)}`;

  const list = section.querySelector(".comment-list");
  const form = section.querySelector(".comment-form");
  const status = section.querySelector(".comment-status");
  const submit = section.querySelector(".comment-submit");
  const replying = section.querySelector(".comment-replying");
  const replyingText = section.querySelector(".comment-replying-text");
  const cancelReply = section.querySelector(".comment-reply-cancel");
  const nameInput = form.elements.name;
  const bodyInput = form.elements.body;

  const NAME_KEY = "bouken-comment-name";
  let parentId = null;

  const ERRORS = {
    name_required: "名前を入れてください。",
    body_required: "コメントを入れてください。",
    name_reserved: "その名前は使えません。別の名前にしてください。",
    too_many_links: "リンク（URL）は2つまでにしてください。",
    rate_limited: "短い時間にたくさん送られています。少し時間をおいてから送ってください。",
  };

  // 前に使った名前を入れておく
  try {
    nameInput.value = localStorage.getItem(NAME_KEY) || "";
  } catch (e) {}

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatDate(ms) {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    }).format(new Date(ms));
  }

  // 1件分。文字は textContent で入れるので、HTMLとして解釈されることはない
  function commentItem(c, isReply) {
    const item = el("li", `comment${c.isAdmin ? " is-admin" : ""}${isReply ? " is-reply" : ""}`);
    item.id = `comment-${c.id}`;

    const head = el("p", "comment-head");
    head.append(el("span", "comment-name", c.name));
    // ブログ主の返信には印を付ける（名前がすでに「ブログ主」なら重ねて出さない）
    if (c.isAdmin && c.name !== "ブログ主") head.append(el("span", "comment-badge", "ブログ主"));
    const time = el("time", "comment-date", formatDate(c.createdAt));
    time.dateTime = new Date(c.createdAt).toISOString();
    head.append(time);

    item.append(head, el("p", "comment-body", c.body));

    const replyBtn = el("button", "comment-reply-button", "返信する");
    replyBtn.type = "button";
    replyBtn.addEventListener("click", () => startReply(c));
    item.append(replyBtn);
    return item;
  }

  function render(comments) {
    list.replaceChildren();
    if (!comments.length) {
      list.append(el("p", "comment-empty", "まだコメントはありません。最初のコメントをどうぞ！"));
      return;
    }

    const roots = comments.filter((c) => !c.parentId);
    const replies = comments.filter((c) => c.parentId);
    const ol = el("ol", "comment-thread");

    roots.forEach((root) => {
      const item = commentItem(root, false);
      const children = replies.filter((r) => r.parentId === root.id);
      if (children.length) {
        const sub = el("ol", "comment-replies");
        children.forEach((child) => sub.append(commentItem(child, true)));
        item.append(sub);
      }
      ol.append(item);
    });
    list.append(ol);
  }

  function startReply(c) {
    parentId = c.id;
    replyingText.textContent = `${c.name} さんへの返信`;
    replying.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    bodyInput.focus({ preventScroll: true });
  }

  function stopReply() {
    parentId = null;
    replying.hidden = true;
  }

  cancelReply.addEventListener("click", stopReply);

  async function load() {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      render(data.comments || []);
    } catch (e) {
      list.replaceChildren(el("p", "comment-empty", "コメントを読み込めませんでした。時間をおいて開き直してください。"));
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";

    const name = nameInput.value.trim();
    const body = bodyInput.value.trim();
    if (!name) {
      status.textContent = ERRORS.name_required;
      nameInput.focus();
      return;
    }
    if (!body) {
      status.textContent = ERRORS.body_required;
      bodyInput.focus();
      return;
    }

    submit.disabled = true;
    status.textContent = "送信中…";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, body, parentId, website: form.elements.website.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || String(res.status));

      try {
        localStorage.setItem(NAME_KEY, name);
      } catch (e) {}
      bodyInput.value = "";
      stopReply();
      status.textContent = "コメントを受け付けました！確認してから表示しますので、少しお待ちください。";
    } catch (e) {
      status.textContent = ERRORS[e.message] || "うまく送れませんでした。時間をおいてもう一度お試しください。";
    } finally {
      submit.disabled = false;
    }
  });

  load();
})();
