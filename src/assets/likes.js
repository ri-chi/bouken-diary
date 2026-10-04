// 記事ページのいいねボタン。数は Cloudflare Worker（likes-worker/）に保存する。
// 押したかどうかはサーバーが覚えているので、ブラウザ側では表示を切り替えるだけ。
(function () {
  const button = document.querySelector(".like-button");
  if (!button) return;

  const api = button.dataset.api;
  const slug = button.dataset.slug;
  const countEl = button.querySelector(".like-count");
  const message = document.querySelector(".like-message");
  const endpoint = `${api}/likes?slug=${encodeURIComponent(slug)}`;

  let state = { count: 0, liked: false };
  let busy = false;

  function render() {
    button.setAttribute("aria-pressed", String(state.liked));
    countEl.textContent = String(state.count);
    button.setAttribute("aria-label", state.liked ? `いいね済み（${state.count}）` : `いいね（${state.count}）`);
  }

  function showMessage(text) {
    if (message) message.textContent = text;
  }

  async function load() {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(res.status);
      state = await res.json();
      render();
      button.disabled = false;
    } catch (error) {
      showMessage("いいねの数を読み込めませんでした。");
    }
  }

  button.addEventListener("click", async () => {
    if (busy) return;
    busy = true;

    // 押した瞬間に見た目を変えて、失敗したら元に戻す
    const before = { ...state };
    state = { liked: !state.liked, count: Math.max(state.count + (state.liked ? -1 : 1), 0) };
    render();
    showMessage("");

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: before.liked ? "unlike" : "like" }),
      });
      if (!res.ok) throw new Error(res.status);
      state = await res.json();
      render();
      if (state.liked && !before.liked) showMessage("ありがとうございます！");
    } catch (error) {
      state = before;
      render();
      showMessage("うまく送れませんでした。時間をおいてもう一度お試しください。");
    } finally {
      busy = false;
    }
  });

  load();
})();
