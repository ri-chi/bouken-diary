// ビルドのメイン処理。
//   1. Airtableから公開記事を取得
//   2. 画像をダウンロードしてWebPに変換
//   3. トップ・記事・タグ・固定ページのHTMLを dist/ に書き出す
//   4. 検索用JSON・sitemap.xml・robots.txt などを書き出す
//
// 使い方
//   npm run build                                 Airtableから取得（環境変数が必要）
//   npm run build:sample                          fixtures/sample.json で確認
//   node build/build.js --fixture path/to.json    任意のサンプルで確認

const fs = require("fs/promises");
const path = require("path");

const config = require("../site.config");
const { fetchArticles } = require("./airtable");
const { processArticleImages } = require("./images");
const { createBodyRenderer, bodyToPlainText } = require("./render-body");
const { createTemplates } = require("./templates");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist");
const SRC_DIR = path.join(ROOT, "src");
const CACHE_DIR = path.join(ROOT, ".cache", "images");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--fixture") args.fixture = argv[++i];
  }
  if (!args.fixture && process.env.AIRTABLE_FIXTURE) args.fixture = process.env.AIRTABLE_FIXTURE;
  return args;
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

// icon.png から、Google検索などが使うサイズのアイコンを作る
//   favicon.ico（48px・サイトの一番上） / icon-48・96・192.png / apple-touch-icon.png（180px）
async function writeFavicons(iconFile) {
  const sharp = require("sharp");
  const sizes = { "icon-48.png": 48, "icon-96.png": 96, "icon-192.png": 192, "apple-touch-icon.png": 180 };
  for (const [name, size] of Object.entries(sizes)) {
    await sharp(iconFile).resize(size, size).png().toFile(path.join(OUT_DIR, "assets", name));
  }

  // favicon.ico は、中身がPNGのICO形式で作る（1枚・48px）
  const png = await sharp(iconFile).resize(48, 48).png().toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // 予約
  header.writeUInt16LE(1, 2); // 種類: アイコン
  header.writeUInt16LE(1, 4); // 画像の数
  header.writeUInt8(48, 6); // 幅
  header.writeUInt8(48, 7); // 高さ
  header.writeUInt8(0, 8); // 色数
  header.writeUInt8(0, 9); // 予約
  header.writeUInt16LE(1, 10); // カラープレーン
  header.writeUInt16LE(32, 12); // ビット数
  header.writeUInt32LE(png.length, 14); // データの大きさ
  header.writeUInt32LE(22, 18); // データの開始位置
  await fs.writeFile(path.join(OUT_DIR, "favicon.ico"), Buffer.concat([header, png]));
}

async function writePage(relPath, html) {
  const file = path.join(OUT_DIR, relPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html);
}

// "articles/day-001/" → "articles/day-001/index.html"
function toFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  return decoded.endsWith("/") ? `${decoded}index.html` : decoded;
}

// タグごとに記事をまとめ、site.config.js の tagOrder の順に並べる。
function groupTags(articles) {
  const map = new Map();
  for (const article of articles) {
    for (const tag of article.tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(article);
    }
  }
  const order = config.tagOrder || [];
  return [...map.entries()]
    .map(([name, list]) => ({ name, articles: list }))
    .sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return b.articles.length - a.articles.length;
    });
}

// 記事をシリーズごとにまとめる（古い順のまま）。シリーズなしはキー "" に入る。
function groupSeries(articles) {
  const map = new Map();
  for (const article of articles) {
    const key = article.series || "";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(article);
  }
  return map;
}

// シリーズページを作る対象を並べる。site.config.js に書いた順、その後は更新が新しい順。
function orderSeries(bySeries) {
  const order = Object.keys(config.series || {});
  const list = [...bySeries.entries()]
    .filter(([name]) => name)
    .map(([name, articles]) => ({ name, articles }));
  const latestTime = (s) => Date.parse(s.articles[s.articles.length - 1].publishedAt) || 0;
  return list.sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return latestTime(b) - latestTime(a);
  });
}

// src/pages/*.html を固定ページとして読み込む。1行目の <!-- title: ... --> をタイトルに使う。
async function loadStaticPages() {
  const dir = path.join(SRC_DIR, "pages");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".html"));
  const pages = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    const titleMatch = raw.match(/<!--\s*title:\s*(.+?)\s*-->/);
    pages.push({
      slug: path.basename(file, ".html"),
      title: titleMatch ? titleMatch[1] : path.basename(file, ".html"),
      html: raw.replace(/<!--\s*title:[\s\S]*?-->\s*/, ""),
    });
  }
  return pages;
}

function sitemapXml(entries, templates) {
  const urls = entries
    .map(
      ({ path: p, lastmod }) =>
        `  <url><loc>${templates.absUrl(p)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function main() {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  // src/assets に ogp.png / icon.png があれば、リンク画像とアイコンに使う
  config.defaultOgImage = (await fileExists(path.join(SRC_DIR, "assets", "ogp.png"))) ? "assets/ogp.png" : "";
  config.iconImage = (await fileExists(path.join(SRC_DIR, "assets", "icon.png"))) ? "assets/icon.png" : "";
  const templates = createTemplates(config);
  const renderer = createBodyRenderer({ basePath: config.basePath });

  console.log("▶ 記事を取得しています");
  const rawArticles = await fetchArticles({ fixture: args.fixture, seriesConfig: config.series || {} });
  console.log(`  公開記事: ${rawArticles.length}件`);

  console.log("▶ 出力フォルダを準備しています");
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log("▶ 画像を処理しています");
  const { articles, imageCount } = await processArticleImages(rawArticles, {
    cacheDir: CACHE_DIR,
    outDir: OUT_DIR,
    publicPrefix: templates.url(),
  });
  console.log(`  画像: ${imageCount}枚`);

  console.log("▶ ページを書き出しています");
  const sitemap = [{ path: "", lastmod: "" }];

  // 前後リンクは同じシリーズの中でつなぐ（シリーズなしの記事どうしは、シリーズなしの中でつなぐ）
  const bySeries = groupSeries(articles);
  for (const list of bySeries.values()) {
    list.forEach((article, i) => {
      article.prev = list[i - 1] || null;
      article.next = list[i + 1] || null;
    });
  }

  for (const article of articles) {
    const { html, headings } = renderer.buildBodyHtml(article);
    article.renderedBody = html;
    article.headings = headings;
  }

  for (const article of articles) {
    const page = templates.articlePage({
      article,
      bodyHtml: article.renderedBody,
      tocHtml: renderer.buildTocHtml(article.headings),
      galleryHtml: renderer.buildGalleryHtml(article),
      prev: article.prev,
      next: article.next,
    });
    const urlPath = templates.articlePath(article);
    await writePage(toFilePath(urlPath), page);
    const lastmod = new Date(article.publishedAt);
    sitemap.push({ path: urlPath, lastmod: Number.isNaN(lastmod.getTime()) ? "" : lastmod.toISOString().slice(0, 10) });
  }

  // タグページ
  const tags = groupTags(articles);
  for (const tag of tags) {
    const urlPath = templates.tagPath(tag.name);
    await writePage(toFilePath(urlPath), templates.tagPage({ tag: tag.name, articles: tag.articles }));
    sitemap.push({ path: urlPath });
  }

  // シリーズページ
  const seriesList = orderSeries(bySeries);
  for (const series of seriesList) {
    const urlPath = templates.seriesPath(series.name);
    await writePage(toFilePath(urlPath), templates.seriesPage(series));
    sitemap.push({ path: urlPath });
  }

  // トップページ
  await writePage("index.html", templates.indexPage({ articles, tags, seriesList }));

  // 固定ページ（about / privacy / contact）
  for (const page of await loadStaticPages()) {
    await writePage(`${page.slug}/index.html`, templates.staticPage(page));
    sitemap.push({ path: `${page.slug}/` });
  }

  await writePage("404.html", templates.notFoundPage());

  console.log("▶ 検索データ・サイト情報を書き出しています");

  // 検索用JSON（本文はマークアップを除いた素のテキスト）
  const searchIndex = articles.map((a) => ({
    slug: a.slug,
    title: a.title,
    series: a.series,
    tags: a.tags,
    text: `${a.excerpt} ${bodyToPlainText(a.body)}`.trim(),
  }));
  await writePage("search-index.json", JSON.stringify(searchIndex));

  if (config.siteUrl.includes("example.com")) {
    console.warn("  ⚠ SITE_URL が未設定です。sitemap.xml と OGP のURLが example.com になっています");
  }
  await writePage("sitemap.xml", sitemapXml(sitemap, templates));
  await writePage("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${templates.absUrl("sitemap.xml")}\n`);

  if (config.adsenseClient) {
    const pub = config.adsenseClient.replace(/^ca-/, "");
    await writePage("ads.txt", `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
  }
  if (config.customDomain) await writePage("CNAME", `${config.customDomain}\n`);
  await writePage(".nojekyll", ""); // GitHub PagesのJekyll処理を止める

  // CSS・JS
  await fs.cp(path.join(SRC_DIR, "assets"), path.join(OUT_DIR, "assets"), { recursive: true });

  // アイコンから、検索結果やスマホのホーム画面用のサイズを作る
  if (config.iconImage) await writeFavicons(path.join(SRC_DIR, "assets", "icon.png"));

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`✔ 完了（${seconds}秒）→ dist/`);
}

main().catch((error) => {
  console.error("✖ ビルドに失敗しました");
  console.error(error);
  process.exit(1);
});
