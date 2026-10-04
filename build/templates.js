// ページのHTMLテンプレート。元サイトの index.html / article.html のヘッダー・フッター構成を
// 日記ブログ向けにまとめ直したもの。すべて文字列を返す関数なので、ビルド時にそのまま書き出せる。

const { esc } = require("./render-body");

function createTemplates(config) {
  const base = config.basePath.endsWith("/") ? config.basePath : `${config.basePath}/`;
  const url = (p = "") => `${base}${String(p).replace(/^\/+/, "")}`;
  const absUrl = (p = "") => `${config.siteUrl}${url(p)}`;

  const seriesConfig = config.series || {};
  const articlePath = (article) => `articles/${article.slug}/`;
  const tagPath = (tag) => `tags/${encodeURIComponent(tag)}/`;
  const seriesPath = (name) => {
    const slug = seriesConfig[name] && seriesConfig[name].slug;
    return `series/${slug ? slug : encodeURIComponent(name)}/`;
  };

  function formatDate(raw) {
    const date = new Date(raw);
    if (!raw || Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Tokyo",
    }).format(date);
  }

  function isoDate(raw) {
    const date = new Date(raw);
    return !raw || Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  // ---------- 共通パーツ ----------

  function analyticsTags() {
    let html = "";
    if (config.gaId) {
      html += `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${esc(config.gaId)}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${esc(config.gaId)}');
    </script>`;
    }
    if (config.adsenseClient) {
      html += `
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsenseClient)}" crossorigin="anonymous"></script>`;
    }
    return html;
  }

  function header() {
    return `
    <header class="site-header">
      <a class="site-title" href="${url()}">${esc(config.siteName)}</a>
      <nav class="site-nav" aria-label="サイト内">
        <a href="${url()}">記事一覧</a>
        <a href="${url("about/")}">このブログについて</a>
      </nav>
    </header>`;
  }

  function footer() {
    const year = new Date().getFullYear();
    return `
    <footer class="site-footer">
      <nav class="footer-links" aria-label="サイト情報">
        <a href="${url("about/")}">このブログについて</a>
        <a href="${url("privacy/")}">プライバシーポリシー</a>
        <a href="${url("contact/")}">お問い合わせ</a>
      </nav>
      <p class="footer-note">ゲームのプレイ日記はファンによる非公式の記録です。ドラゴンクエストは株式会社スクウェア・エニックスの登録商標です。</p>
      <p class="footer-copy">© ${year} ${esc(config.siteName)}</p>
    </footer>`;
  }

  function layout({
    title,
    description,
    path,
    ogImage,
    ogType = "website",
    content,
    scripts = [],
    externalScripts = [],
    noindex = false,
  }) {
    const fullTitle = title ? `${title}｜${config.siteName}` : config.siteName;
    const desc = description || config.description;
    // 記事の画像がなければ、サイト共通のリンク画像（src/assets/ogp.png）を使う
    const imagePath = ogImage || (config.defaultOgImage ? url(config.defaultOgImage) : "");
    const image = imagePath ? `${config.siteUrl}${imagePath}` : "";
    const scriptTags = [
      ...scripts.map((s) => `<script src="${url(s)}" defer></script>`),
      ...externalScripts.map((s) => `<script src="${esc(s)}" defer></script>`),
    ].join("\n    ");

    return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(fullTitle)}</title>
    <meta name="description" content="${esc(desc)}" />
    ${noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${esc(absUrl(path))}" />`}
    <meta property="og:site_name" content="${esc(config.siteName)}" />
    <meta property="og:title" content="${esc(fullTitle)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${esc(absUrl(path))}" />
    ${image ? `<meta property="og:image" content="${esc(image)}" />\n    <meta name="twitter:card" content="summary_large_image" />` : '<meta name="twitter:card" content="summary" />'}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DotGothic16&family=Zen+Kaku+Gothic+New:wght@400;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${url("assets/style.css")}" />
    ${
      config.iconImage
        ? `<link rel="icon" type="image/png" href="${url(config.iconImage)}" />\n    <link rel="apple-touch-icon" href="${url(config.iconImage)}" />`
        : '<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🗡️</text></svg>" />'
    }
    ${analyticsTags()}
    ${scriptTags}
  </head>
  <body>
    <a class="skip-link" href="#main">本文へ移動</a>
    ${header()}
    <main id="main">
${content}
    </main>
    ${footer()}
  </body>
</html>
`;
  }

  // 「12日目」。日目のない記事は空文字。
  function dayLabel(article) {
    return article.day !== null && article.day !== undefined ? `${article.day}日目` : "";
  }

  // 「マイクラDQM6編 12日目」のように、シリーズ名と日目をつなげたもの。
  function fullLabel(article) {
    return [article.series, dayLabel(article)].filter(Boolean).join(" ");
  }

  // 「マイクラDQM6編 12日目「タイトル」」。ラベルがなければタイトルだけ。
  function labeledTitle(article) {
    const label = fullLabel(article);
    return label ? `${label}「${article.title}」` : article.title;
  }

  function tagLinks(tags) {
    if (!tags || !tags.length) return "";
    return `<ul class="tag-list">${tags
      .map((t) => `<li><a href="${url(tagPath(t))}">${esc(t)}</a></li>`)
      .join("")}</ul>`;
  }

  // ---------- 一覧 ----------

  function entryItem(article, showSeries = true) {
    const img = article.topImage || (article.gallery && article.gallery[0]);
    const thumb = img
      ? `<img src="${esc(img.thumb)}" width="${img.thumbWidth}" height="${img.thumbHeight}" alt="" loading="lazy" decoding="async" />`
      : `<span class="entry-thumb-empty" aria-hidden="true">${esc(dayLabel(article) || config.siteName)}</span>`;

    const day = dayLabel(article);
    const meta =
      showSeries && article.series
        ? `<span class="entry-series">${esc(article.series)}</span>`
        : "";

    return `
        <li class="entry" data-slug="${esc(article.slug)}">
          <a class="entry-link" href="${url(articlePath(article))}">
            <span class="entry-thumb">${thumb}</span>
            <span class="entry-text">
              ${day || meta ? `<span class="entry-labels">${day ? `<span class="entry-day">${esc(day)}</span>` : ""}${meta}</span>` : ""}
              <span class="entry-title">${esc(article.title)}</span>
              ${article.excerpt ? `<span class="entry-excerpt">${esc(article.excerpt)}</span>` : ""}
              <time class="entry-date" datetime="${isoDate(article.publishedAt)}">${formatDate(article.publishedAt)}</time>
            </span>
          </a>
        </li>`;
  }

  function entryList(articles, { showSeries = true } = {}) {
    return `<ol class="entry-list" id="entry-list">${articles.map((a) => entryItem(a, showSeries)).join("")}
      </ol>`;
  }

  function indexPage({ articles, tags, seriesList }) {
    const newestFirst = [...articles].reverse();

    // 連載中のシリーズごとに「最新」と「1日目から」への案内を出す
    const seriesLines = seriesList
      .map((s) => {
        const latest = s.articles[s.articles.length - 1];
        const first = s.articles[0];
        return `
          <div class="intro-series">
            <p class="intro-series-name"><a href="${url(seriesPath(s.name))}">${esc(s.name)}</a></p>
            <p>さいしん：<a href="${url(articlePath(latest))}">${esc(labeledTitle({ ...latest, series: "" }))}</a></p>
            ${s.articles.length > 1 ? `<p><a href="${url(articlePath(first))}">▶ はじめから読む</a></p>` : ""}
          </div>`;
      })
      .join("");

    const content = `
      <section class="intro">
        <div class="msg-window">
          <p>${esc(config.description)}</p>
          ${seriesLines}
        </div>
      </section>

      <section class="list-section" aria-labelledby="list-heading">
        <div class="list-head">
          <h1 id="list-heading">記事一覧</h1>
          <div class="search">
            <label for="search-input">記事をさがす</label>
            <input id="search-input" type="search" placeholder="モンスター名・アイテム名など" autocomplete="off" />
          </div>
        </div>
        ${tags.length ? `<nav class="tag-nav" aria-label="タグ">${tagLinks(tags.map((t) => t.name))}</nav>` : ""}
        <p class="search-status" id="search-status" aria-live="polite"></p>
        ${articles.length ? entryList(newestFirst) : '<p class="empty">まだ公開された記事はありません。Airtableで visible にチェックを入れると、次のビルドでここに並びます。</p>'}
      </section>`;

    return layout({ path: "", content, scripts: ["assets/search.js"] });
  }

  // シリーズページ：連載なので1日目から順番に並べる
  function seriesPage({ name, articles }) {
    const info = seriesConfig[name] || {};
    const first = articles[0];
    const latest = articles[articles.length - 1];

    const content = `
      <section class="list-section">
        <p class="breadcrumb"><a href="${url()}">記事一覧</a> ／ シリーズ</p>
        <div class="series-head msg-window">
          <h1 class="series-title">${esc(name)}</h1>
          ${info.description ? `<p>${esc(info.description)}</p>` : ""}
          <p class="series-links">
            <a href="${url(articlePath(first))}">▶ はじめから読む</a>
            ${articles.length > 1 ? `<a href="${url(articlePath(latest))}">▶ さいしんの日記へ</a>` : ""}
          </p>
        </div>
        <p class="series-count">${articles.length}件の日記</p>
        ${entryList(articles, { showSeries: false })}
      </section>`;

    return layout({
      title: name,
      description: info.description || `${config.siteName}の連載「${name}」の記事一覧です。`,
      path: seriesPath(name),
      content,
    });
  }

  function tagPage({ tag, articles }) {
    const content = `
      <section class="list-section">
        <p class="breadcrumb"><a href="${url()}">記事一覧</a> ／ タグ</p>
        <h1>「${esc(tag)}」の記事 <span class="count">${articles.length}件</span></h1>
        ${entryList([...articles].reverse())}
      </section>`;
    return layout({
      title: `「${tag}」の記事`,
      description: `${config.siteName}の「${tag}」に関する記事の一覧です。`,
      path: tagPath(tag),
      content,
    });
  }

  // ---------- 記事 ----------

  function pagerLink(article, rel, label) {
    if (!article) return `<span class="pager-empty"></span>`;
    const day = dayLabel(article);
    return `<a class="pager-link pager-${rel}" rel="${rel}" href="${url(articlePath(article))}">
            <span class="pager-label">${label}</span>
            <span class="pager-title">${day ? `${esc(day)}「${esc(article.title)}」` : esc(article.title)}</span>
          </a>`;
  }

  // いいねボタン（APIのURLが設定されているときだけ）
  function likeButton(article) {
    if (!config.blogApi) return "";
    return `
        <div class="reactions">
          <button type="button" class="like-button" data-api="${esc(config.blogApi)}" data-slug="${esc(article.slug)}" aria-pressed="false" disabled>
            <span class="like-heart" aria-hidden="true">♥</span>
            <span class="like-label">いいね</span>
            <span class="like-count" aria-live="polite"></span>
          </button>
          <p class="like-message" role="status"></p>
        </div>`;
  }

  // コメント欄（APIのURLが設定されているときだけ）。表示と投稿は assets/comments.js が行う
  function commentSection(article) {
    if (!config.blogApi || config.comments === false) return "";
    return `
        <section class="comments" id="comments" aria-labelledby="comments-heading" data-api="${esc(config.blogApi)}" data-slug="${esc(article.slug)}">
          <h2 id="comments-heading">コメント</h2>
          <div class="comment-list" aria-live="polite"><p class="comment-empty">コメントを読み込んでいます…</p></div>

          <form class="comment-form" novalidate>
            <h3 class="comment-form-title">コメントを書く</h3>
            <p class="comment-replying" hidden>
              <span class="comment-replying-text"></span>
              <button type="button" class="comment-reply-cancel">返信をやめる</button>
            </p>
            <p class="comments-note">コメントは確認してから表示します。本名・住所・学校名など、だれかが特定できることは書かないでください。</p>
            <label class="comment-field">
              <span>名前（ニックネーム）</span>
              <input name="name" type="text" maxlength="30" autocomplete="nickname" required />
            </label>
            <label class="comment-field">
              <span>コメント</span>
              <textarea name="body" rows="5" maxlength="1000" required></textarea>
            </label>
            <div class="comment-hp" aria-hidden="true">
              <label>この欄は空のままにしてください <input name="website" type="text" tabindex="-1" autocomplete="off" /></label>
            </div>
            <button type="submit" class="comment-submit">コメントを送る</button>
            <p class="comment-status" role="status"></p>
          </form>
        </section>`;
  }

  function articlePage({ article, bodyHtml, tocHtml, galleryHtml, prev, next }) {
    const hero = article.topImage
      ? `<figure class="article-hero"><img src="${esc(article.topImage.src)}" width="${article.topImage.width}" height="${article.topImage.height}" alt="" decoding="async" fetchpriority="high" /></figure>`
      : "";

    const meta = [
      `<time datetime="${isoDate(article.publishedAt)}">${formatDate(article.publishedAt)}</time>`,
      article.modVersion ? `<span>DQM6 ${esc(article.modVersion)}</span>` : "",
    ]
      .filter(Boolean)
      .join("");

    const content = `
      <article class="article">
        <header class="article-header msg-window">
          ${fullLabel(article) ? `<p class="article-day">${article.series ? `<a href="${url(seriesPath(article.series))}">${esc(article.series)}</a>` : ""}${dayLabel(article) ? `<span>${esc(dayLabel(article))}</span>` : ""}</p>` : ""}
          <h1 class="article-title">${esc(article.title)}</h1>
          <p class="article-meta">${meta}</p>
        </header>
        ${tagLinks(article.tags)}
        ${hero}
        ${tocHtml}
        <div class="body">
${bodyHtml || '<p class="empty">本文がまだありません。Airtableの body 列に書くとここに表示されます。</p>'}
        </div>
        ${galleryHtml}
        ${likeButton(article)}
        ${commentSection(article)}
        ${prev || next ? `<nav class="pager" aria-label="前後の記事">
          ${pagerLink(prev, "prev", article.series ? "◀ まえの日" : "◀ まえの記事")}
          ${pagerLink(next, "next", article.series ? "つぎの日 ▶" : "つぎの記事 ▶")}
        </nav>` : ""}
      </article>`;

    return layout({
      title: labeledTitle(article),
      description: article.excerpt,
      path: articlePath(article),
      ogImage: article.topImage ? article.topImage.src : article.gallery[0] && article.gallery[0].src,
      ogType: "article",
      content,
      scripts: [
        "assets/caption.js",
        ...(config.blogApi ? ["assets/likes.js"] : []),
        ...(config.blogApi && config.comments !== false ? ["assets/comments.js"] : []),
      ],
    });
  }

  // ---------- 固定ページ ----------

  function staticPage({ slug, title, html }) {
    const content = `
      <article class="article static-page">
        <h1 class="static-title">${esc(title)}</h1>
        <div class="body">
${html}
        </div>
      </article>`;
    return layout({ title, path: `${slug}/`, content });
  }

  function notFoundPage() {
    const content = `
      <section class="not-found msg-window">
        <p>しかし ページは みつからなかった！</p>
        <p>URLが変わったか、削除された可能性があります。</p>
        <p><a href="${url()}">▶ 記事一覧へもどる</a></p>
      </section>`;
    return layout({ title: "ページが見つかりません", path: "404.html", content, noindex: true });
  }

  return {
    indexPage,
    seriesPage,
    tagPage,
    articlePage,
    staticPage,
    notFoundPage,
    articlePath,
    tagPath,
    seriesPath,
    url,
    absUrl,
  };
}

module.exports = { createTemplates };
