// Airtableから記事を取得し、ビルドで扱いやすい形にそろえる。
// 元サイトの airtable-service.js をベースに、日記ブログ用にスリム化したもの。
// （Vercel用のメモリキャッシュ・fallbackテーブル・人生シェアリング用の項目は削除）

const fs = require("fs/promises");
const path = require("path");

const MAX_IMAGE_SLOTS = 10;

// ---------------------------------------------------------------
// フィールド名のゆれ吸収（元コードから流用）
// ---------------------------------------------------------------

// Airtableのフィールド名は表記ゆれがあるため、比較しやすい形にそろえる。
function normalizeFieldName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[\s_\-　]+/g, "");
}

// 複数の候補名から、実際にAirtableに存在するフィールド値を探す。
function findFieldValue(fields, aliases) {
  const aliasSet = new Set(aliases.map(normalizeFieldName));
  for (const [key, value] of Object.entries(fields || {})) {
    if (aliasSet.has(normalizeFieldName(key))) return value;
  }
  return null;
}

// 添付ファイルフィールドから、ダウンロードに必要な情報だけを取り出す。
// URLは数時間で期限切れになるので、ここでは「ビルド中に1回使うもの」として扱う。
function attachmentsByAliases(fields, aliases) {
  const value = findFieldValue(fields, aliases);
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && item.url)
    .map((item) => ({
      id: String(item.id || item.url),
      url: item.url,
      filename: item.filename || "",
    }));
}

// 「image 1」「写真1」などの番号付き画像フィールドを、本文の【写真1】と対応させる。
function collectImageGroups(fields) {
  const groups = {};
  for (let i = 1; i <= MAX_IMAGE_SLOTS; i += 1) {
    const list = attachmentsByAliases(fields, [
      `image ${i}`,
      `image${i}`,
      `photo ${i}`,
      `photo${i}`,
      `画像${i}`,
      `写真${i}`,
    ]);
    if (list.length) groups[i] = list;
  }
  return groups;
}

// タグは複数選択でもカンマ区切り文字列でも受け付ける。
function normalizeTags(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(/[,、\n]+/);
  return [...new Set(list.map((t) => String(t).trim()).filter(Boolean))];
}

// URLに使えるslugにそろえる。英小文字・数字・ハイフンだけにする。
function sanitizeSlug(raw) {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// ---------------------------------------------------------------
// 1レコード → 記事オブジェクト
// ---------------------------------------------------------------

function normalizeRecord(record) {
  const fields = record.fields || {};
  const day = toNumberOrNull(findFieldValue(fields, ["day", "日目", "プレイ日数"]));

  // シリーズ（Single select）。空ならシリーズに属さない単発の記事として扱う。
  const series = String(findFieldValue(fields, ["series", "シリーズ"]) || "").trim();

  // slugが空のときの自動生成は、シリーズ設定を使うので fetchArticles 側で行う。
  const slug = sanitizeSlug(findFieldValue(fields, ["slug"]));

  // Airtableはチェックが外れたチェックボックスを返さないので、無い＝非公開として扱う。
  const visible = Boolean(findFieldValue(fields, ["visible", "公開"]));

  return {
    id: record.id,
    title: String(findFieldValue(fields, ["title", "タイトル"]) || "タイトル未設定"),
    slug,
    series,
    day,
    publishedAt:
      findFieldValue(fields, ["publishedAt", "published at", "date", "公開日"]) ||
      record.createdTime ||
      "",
    modVersion: String(findFieldValue(fields, ["mod_version", "modVersion", "version", "バージョン"]) || ""),
    tags: normalizeTags(findFieldValue(fields, ["tags", "tag", "タグ"])),
    excerpt: String(findFieldValue(fields, ["excerpt", "抜粋", "概要"]) || ""),
    body: String(findFieldValue(fields, ["body", "本文", "content"]) || ""),
    visible,
    topImage: attachmentsByAliases(fields, ["top image", "top_image", "thumbnail", "トップ画像"])[0] || null,
    imageGroups: collectImageGroups(fields),
  };
}

// ---------------------------------------------------------------
// 取得
// ---------------------------------------------------------------

function getConfig() {
  return {
    baseId: process.env.AIRTABLE_BASE_ID || "",
    token: process.env.AIRTABLE_TOKEN || "",
    tableName: process.env.AIRTABLE_TABLE || "Articles",
    view: process.env.AIRTABLE_VIEW || "",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Airtableの1テーブルから全ページ分のレコードを取得する。
// 429（レート制限）は30秒待ってから最大3回までやり直す。
async function fetchTableRecords(config) {
  const records = [];
  let offset = "";

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}`
    );
    url.searchParams.set("pageSize", "100");
    if (config.view) url.searchParams.set("view", config.view);
    if (offset) url.searchParams.set("offset", offset);

    let res;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      res = await fetch(url, { headers: { Authorization: `Bearer ${config.token}` } });
      if (res.status !== 429) break;
      console.warn(`  Airtableのレート制限に達しました。30秒待って再試行します（${attempt}/3）`);
      await sleep(30_000);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Airtable API error ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || "";
  } while (offset);

  return records;
}

// ローカル確認用：Airtableの代わりにJSONファイルからレコードを読む。
// 画像のurlにはファイルパス（JSONからの相対パス）を書ける。
async function loadFixtureRecords(fixturePath) {
  const abs = path.resolve(fixturePath);
  const data = JSON.parse(await fs.readFile(abs, "utf8"));
  const dir = path.dirname(abs);

  const resolveUrl = (att) =>
    /^https?:\/\//.test(att.url) ? att : { ...att, url: path.resolve(dir, att.url) };

  return (data.records || []).map((record) => {
    const fields = { ...(record.fields || {}) };
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value) && value.length && value[0] && typeof value[0] === "object" && value[0].url) {
        fields[key] = value.map(resolveUrl);
      }
    }
    return { ...record, fields };
  });
}

function sortKey(article) {
  const time = Date.parse(article.publishedAt);
  return Number.isNaN(time) ? 0 : time;
}

// 公開記事を古い順（第1話→最新話）で返す。
// slugが空の記事にURLを割り当てる。
//   シリーズ＋日目あり → 「シリーズのslug-day-001」（例: dqm6-day-001）
//   日目だけあり       → 「day-001」
//   どちらもない       → レコードID
function fillSlug(article, seriesConfig) {
  if (article.slug) return;
  const seriesSlug = sanitizeSlug(seriesConfig[article.series] && seriesConfig[article.series].slug);
  if (article.day !== null) {
    const daySlug = `day-${String(article.day).padStart(3, "0")}`;
    article.slug = seriesSlug ? `${seriesSlug}-${daySlug}` : daySlug;
  } else {
    article.slug = sanitizeSlug(article.id);
  }
}

async function fetchArticles({ fixture, seriesConfig = {} } = {}) {
  let records;
  if (fixture) {
    console.log(`  サンプルデータを使用: ${fixture}`);
    records = await loadFixtureRecords(fixture);
  } else {
    const config = getConfig();
    if (!config.baseId) throw new Error("環境変数 AIRTABLE_BASE_ID がありません");
    if (!config.token) throw new Error("環境変数 AIRTABLE_TOKEN がありません");
    records = await fetchTableRecords(config);
  }

  const all = records.map(normalizeRecord);
  const hidden = all.filter((a) => !a.visible).length;
  if (hidden) console.log(`  非公開（visible未チェック）の記事: ${hidden}件はスキップ`);

  const articles = all.filter((a) => a.visible);
  articles.forEach((a) => fillSlug(a, seriesConfig));

  // slugの重複はURLが衝突するので、後から来た方に番号を付けて警告する。
  const used = new Set();
  for (const article of articles) {
    let slug = article.slug;
    let n = 2;
    while (used.has(slug)) slug = `${article.slug}-${n++}`;
    if (slug !== article.slug) {
      console.warn(`  ⚠ slug「${article.slug}」が重複しているため「${slug}」に変更しました（${article.title}）`);
      article.slug = slug;
    }
    used.add(slug);
  }

  articles.sort((a, b) => sortKey(a) - sortKey(b) || (a.day ?? 0) - (b.day ?? 0));
  return articles;
}

module.exports = { fetchArticles, normalizeRecord, sanitizeSlug };
