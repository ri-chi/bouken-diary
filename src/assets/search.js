// トップページの日記検索。元サイト app.js の matchesSearch をベースに、
// ビルド時に書き出した search-index.json（本文入り）を対象に検索する。
(function () {
  const input = document.getElementById("search-input");
  const list = document.getElementById("entry-list");
  const status = document.getElementById("search-status");
  if (!input || !list) return;

  const indexUrl = new URL("../search-index.json", document.currentScript.src);
  const items = Array.from(list.querySelectorAll(".entry"));
  let index = null;
  let loading = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch(indexUrl)
        .then((res) => {
          if (!res.ok) throw new Error(res.status);
          return res.json();
        })
        .then((data) => {
          index = new Map(
            data.map((a) => [a.slug, [a.title, a.series || "", (a.tags || []).join(" "), a.text].join("\n").toLowerCase()])
          );
          return index;
        });
    }
    return loading;
  }

  function syncUrl(query) {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState({}, "", url);
  }

  async function run() {
    const query = input.value.trim();
    syncUrl(query);

    if (!query) {
      items.forEach((li) => (li.hidden = false));
      status.textContent = "";
      return;
    }

    try {
      const data = await loadIndex();
      const q = query.toLowerCase();
      let count = 0;
      items.forEach((li) => {
        const hit = (data.get(li.dataset.slug) || "").includes(q);
        li.hidden = !hit;
        if (hit) count += 1;
      });
      status.textContent = count
        ? `「${query}」が出てくる記事：${count}件`
        : `「${query}」が出てくる記事はありません。別の言葉でさがしてみてください。`;
    } catch (error) {
      status.textContent = "検索データを読み込めませんでした。ページを再読み込みしてください。";
    }
  }

  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(run, 150);
  });

  // ?q= 付きで開かれたときは、その言葉で検索した状態にする
  const initial = new URLSearchParams(window.location.search).get("q");
  if (initial) {
    input.value = initial;
    run();
  }
})();
