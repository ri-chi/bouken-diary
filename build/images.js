// Airtableの添付画像をビルド時にダウンロードし、WebPに変換してサイト内に保存する。
// Airtableの画像URLは数時間で期限切れになるため、URLを直接記事に埋め込まないのが目的。
//
// 変換済み画像は .cache/images に「添付ID」単位で保存し、次回のビルドでは再ダウンロードしない。
// （GitHub Actions では actions/cache でこのフォルダを使い回す）

const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const FULL_WIDTH = 1600; // 記事本文用の最大幅
const THUMB_WIDTH = 640; // 一覧カード用の幅
const CONCURRENCY = 4;

function safeKey(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function loadSource(url) {
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`画像のダウンロードに失敗 (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  // サンプルデータ用：ローカルファイル
  return fs.readFile(url.replace(/^file:\/\//, ""));
}

// 1枚の添付画像を、キャッシュ確認 → 変換 → dist へコピー の順で処理する。
async function processAttachment(attachment, { cacheDir, outDir, publicPrefix, name }) {
  const key = safeKey(attachment.id);
  const cacheFull = path.join(cacheDir, `${key}.webp`);
  const cacheThumb = path.join(cacheDir, `${key}-thumb.webp`);
  const cacheMeta = path.join(cacheDir, `${key}.json`);

  let meta;
  if ((await exists(cacheFull)) && (await exists(cacheThumb)) && (await exists(cacheMeta))) {
    meta = JSON.parse(await fs.readFile(cacheMeta, "utf8"));
  } else {
    const source = await loadSource(attachment.url);
    const base = sharp(source).rotate(); // スマホ写真の向き情報を反映

    const full = await base
      .clone()
      .resize({ width: FULL_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    const thumb = await base
      .clone()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer({ resolveWithObject: true });

    meta = {
      width: full.info.width,
      height: full.info.height,
      thumbWidth: thumb.info.width,
      thumbHeight: thumb.info.height,
    };

    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFull, full.data);
    await fs.writeFile(cacheThumb, thumb.data);
    await fs.writeFile(cacheMeta, JSON.stringify(meta));
  }

  const destFull = path.join(outDir, "images", `${name}.webp`);
  const destThumb = path.join(outDir, "images", `${name}-thumb.webp`);
  await fs.mkdir(path.dirname(destFull), { recursive: true });
  await fs.copyFile(cacheFull, destFull);
  await fs.copyFile(cacheThumb, destThumb);

  return {
    src: `${publicPrefix}images/${name}.webp`,
    thumb: `${publicPrefix}images/${name}-thumb.webp`,
    width: meta.width,
    height: meta.height,
    thumbWidth: meta.thumbWidth,
    thumbHeight: meta.thumbHeight,
  };
}

// 同時実行数を絞って順番に処理する（Airtableや回線に負荷をかけすぎないため）
async function runPool(tasks, limit) {
  const results = new Array(tasks.length);
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const current = index++;
      results[current] = await tasks[current]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// 全記事の画像を処理し、topImage / imageGroups / gallery をローカル画像に置き換えた記事を返す。
// 1枚失敗してもビルド全体は止めず、警告を出してその画像だけ外す。
async function processArticleImages(articles, { cacheDir, outDir, publicPrefix }) {
  const jobs = [];
  const processed = articles.map((article) => ({
    ...article,
    topImage: null,
    imageGroups: {},
    gallery: [],
  }));

  const addJob = (article, attachment, name, assign) => {
    jobs.push(async () => {
      try {
        const image = await processAttachment(attachment, { cacheDir, outDir, publicPrefix, name });
        assign(image);
      } catch (error) {
        console.warn(`  ⚠ 画像を処理できませんでした（${article.title} / ${attachment.filename || name}）: ${error.message}`);
      }
    });
  };

  articles.forEach((article, i) => {
    const target = processed[i];

    if (article.topImage) {
      addJob(article, article.topImage, `${article.slug}/top`, (img) => {
        target.topImage = img;
      });
    }

    for (const [num, attachments] of Object.entries(article.imageGroups || {})) {
      target.imageGroups[num] = new Array(attachments.length).fill(null);
      attachments.forEach((attachment, j) => {
        addJob(article, attachment, `${article.slug}/${num}-${j + 1}`, (img) => {
          target.imageGroups[num][j] = img;
        });
      });
    }
  });

  await runPool(jobs, CONCURRENCY);

  // 失敗した画像（null）を取り除き、ギャラリー用の一覧を作る。
  for (const article of processed) {
    for (const num of Object.keys(article.imageGroups)) {
      article.imageGroups[num] = article.imageGroups[num].filter(Boolean);
      if (!article.imageGroups[num].length) delete article.imageGroups[num];
    }
    article.gallery = Object.keys(article.imageGroups)
      .sort((a, b) => Number(a) - Number(b))
      .flatMap((num) => article.imageGroups[num]);
  }

  return { articles: processed, imageCount: jobs.length };
}

module.exports = { processArticleImages };
