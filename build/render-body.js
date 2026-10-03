// Airtableの本文（body）を記事ページ用のHTMLに変換する。
// 元サイトの article.js の本文ルールを、ブラウザ非依存の形で移植したもの。
//
// 使える記法（元サイトと同じ）
//   空行で段落を区切る
//   ## 見出し / ### 小見出し
//   - 箇条書き
//   **太字** / *斜体*
//   [リンク文字](URL)          ※ "/" から始まるURLはサイト内リンクとして扱う
//   >注釈<                     → 小さめの補足
//   >>囲み<<                   → ドラクエ風メッセージウィンドウ
//   【写真1】 / [写真1]         → image 1 の画像を差し込む
//   【写真1】>キャプション<     → キャプション付き写真
//
// 変更点
//   ・_文字_ の斜体は削除（iron_ingot などのアイテムIDが崩れるため）
//   ・article.html?id=... の自動リンクは削除（URLが /articles/slug/ 形式になったため）
//   ・オススメ記事の重複除去・人生シェアリング用の処理は削除
//   ・写真はローカルの WebP を width/height 付きで出力（読み込み時のガタつき防止）

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PHOTO_TOKEN_RE = /(?:【|\[)\s*写真\s*([0-9０-９]+)(?:\s*をここに挿入)?\s*(?:】|\])/g;
const PHOTO_ONLY_RE = /^\s*(?:【|\[)\s*写真\s*([0-9０-９]+)(?:\s*をここに挿入)?\s*(?:】|\])\s*$/;
const PHOTO_WITH_REST_RE = /^\s*(?:【|\[)\s*写真\s*([0-9０-９]+)(?:\s*をここに挿入)?\s*(?:】|\])(.*)$/s;

function normalizePhotoNumber(raw) {
  const half = String(raw).replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  const num = Number(half);
  return Number.isFinite(num) ? num : 0;
}

function bodyToParagraphs(body) {
  return String(body || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// 【写真1】の直後にある >キャプション< または >>キャプション<< を取り出す。
function extractPhotoCaption(text) {
  const src = String(text || "");
  const doubleMatch = src.match(/^(?:\s|\r|\n)*>>\s*([\s\S]+?)\s*<</);
  if (doubleMatch) return { caption: doubleMatch[1], raw: doubleMatch[0] };
  const singleMatch = src.match(/^(?:\s|\r|\n)*>\s*([\s\S]+?)\s*</);
  if (singleMatch) return { caption: singleMatch[1], raw: singleMatch[0] };
  return null;
}

function slugifyHeading(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w぀-ヿ一-龯]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 本文中のタグやマークアップを除いた素のテキスト（検索用・抜粋用）
function bodyToPlainText(body) {
  return String(body || "")
    .replace(new RegExp(PHOTO_TOKEN_RE.source, "g"), " ")
    .replace(/\[([^\]]+)]\s*\(([^)]+)\)/g, "$1")
    .replace(/^\s*#{2,3}\s*/gm, "")
    .replace(/^\s*-\s+/gm, "")
    .replace(/\*\*|>>|<<|[*]/g, "")
    .replace(/^\s*>\s*|\s*<\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

// basePath（"/" や "/repo/"）を受け取り、本文変換の関数一式を作る。
function createBodyRenderer({ basePath = "/" } = {}) {
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;

  // ---------- インライン記法 ----------

  function applyInlineTextStyles(raw) {
    let out = String(raw || "");
    out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em class="md-italic">$2</em>');
    return out;
  }

  function applyInlineTextStylesOutsideTags(html) {
    return String(html || "")
      .split(/(<[^>]+>)/g)
      .map((part) => (part.startsWith("<") ? part : applyInlineTextStyles(part)))
      .join("");
  }

  // [文字](URL) をリンクにする。"/" 始まりはサイト内リンクとして basePath を付ける。
  // javascript: などの危険なスキームはリンクにしない。
  function renderMarkdownLinks(text) {
    return String(text || "").replace(/\[([^\]]+)]\s*\(([^)]+)\)/g, (m, label, rawUrl) => {
      const url = String(rawUrl || "").trim();
      const labelHtml = applyInlineTextStyles(label);
      if (!url || /^(javascript|data|vbscript):/i.test(url)) return labelHtml;

      if (/^https?:\/\//i.test(url)) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`;
      }
      const href = url.startsWith("/") ? `${base}${url.replace(/^\/+/, "")}` : url;
      return `<a href="${href}">${labelHtml}</a>`;
    });
  }

  // 呼び出し側で esc() 済みの文字列を受け取る前提
  function renderInlineMarkdown(escapedText) {
    return applyInlineTextStylesOutsideTags(renderMarkdownLinks(escapedText));
  }

  // ---------- 写真 ----------

  function getPhotosForToken(num, imageGroups) {
    const list = imageGroups && imageGroups[String(num)];
    return Array.isArray(list) ? list : [];
  }

  function photoHtml(photo, alt) {
    return (
      `<figure class="inline-photo">` +
      `<img src="${esc(photo.src)}" width="${photo.width}" height="${photo.height}" alt="${esc(alt)}" loading="lazy" decoding="async" />` +
      `</figure>`
    );
  }

  function photoGroupHtml(photos, title, num) {
    if (!photos.length) {
      // 画像が未設定のときは公開ページでは何も出さず、ビルドログで気づけるようにする
      console.warn(`  ⚠ 【写真${num}】に対応する画像がありません（${title}）`);
      return "";
    }
    return photos.map((p, i) => photoHtml(p, `${title} 写真${num}${photos.length > 1 ? `-${i + 1}` : ""}`)).join("");
  }

  function photoWithCaptionHtml(photos, title, num, caption) {
    const photosHtml = photoGroupHtml(photos, title, num);
    const captionHtml = renderInlineMarkdown(esc(caption)).replace(/\n+/g, "<br>");
    if (!photosHtml) return `<p class="inline-photo-caption">${captionHtml}</p>`;
    return `<div class="inline-photo-block">${photosHtml}<p class="inline-photo-caption">${captionHtml}</p></div>`;
  }

  // ---------- 行・段落 ----------

  function renderSingleLine(line) {
    const plain = String(line || "").trim();
    if (!plain) return "";

    const boxed = plain.match(/^>>\s*([\s\S]+?)\s*<<$/);
    if (boxed) {
      return `<p class="body-boxed-note">${renderInlineMarkdown(esc(boxed[1])).replace(/\n+/g, "<br>")}</p>`;
    }

    const legacyBoxed = plain.match(/^\\?##\s*(.+?)\s*##$/);
    if (legacyBoxed) return `<h2>${renderInlineMarkdown(esc(legacyBoxed[1]))}</h2>`;

    const aside = plain.match(/^>\s*(.+?)\s*<$/);
    if (aside) return `<p class="body-aside-note">${renderInlineMarkdown(esc(aside[1]))}</p>`;

    const h3 = plain.match(/^\\?###\s*(.+)/);
    if (h3) return `<h3>${renderInlineMarkdown(esc(h3[1]))}</h3>`;

    const h2 = plain.match(/^\\?##\s*(.+)/);
    if (h2) return `<h2>${renderInlineMarkdown(esc(h2[1]))}</h2>`;

    return `<p>${renderInlineMarkdown(esc(plain))}</p>`;
  }

  // 複数行の段落：「- 」で始まる行は箇条書き、それ以外は1行ずつ変換する。
  function renderTextParagraph(text) {
    const plain = String(text || "").trim();
    if (!plain) return "";

    const lines = plain.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return renderSingleLine(plain);

    const chunks = [];
    let currentList = null;
    for (const line of lines) {
      if (/^-\s+/.test(line)) {
        if (!currentList) {
          currentList = [];
          chunks.push({ type: "list", items: currentList });
        }
        currentList.push(line.replace(/^-+\s+/, ""));
      } else {
        currentList = null;
        chunks.push({ type: "text", value: line });
      }
    }

    return chunks
      .map((chunk) =>
        chunk.type === "list"
          ? `<ul>${chunk.items.map((item) => `<li>${renderInlineMarkdown(esc(item))}</li>`).join("")}</ul>`
          : renderSingleLine(chunk.value)
      )
      .join("");
  }

  // 段落の途中に >>囲み<< がある場合、前後の文と分けて描画する。
  function renderTextParagraphWithBoxedNote(text) {
    const src = String(text || "");
    const regex = />>\s*([\s\S]+?)\s*<</g;
    const parts = [];
    let lastIndex = 0;
    let matched = false;
    let m;

    while ((m = regex.exec(src)) !== null) {
      matched = true;
      const beforeHtml = renderTextParagraph(src.slice(lastIndex, m.index));
      if (beforeHtml) parts.push(beforeHtml);
      parts.push(`<p class="body-boxed-note">${renderInlineMarkdown(esc(m[1])).replace(/\n+/g, "<br>")}</p>`);
      lastIndex = m.index + m[0].length;
    }

    if (!matched) return renderTextParagraph(src);

    const afterHtml = renderTextParagraph(src.slice(lastIndex));
    if (afterHtml) parts.push(afterHtml);
    return parts.join("");
  }

  // 【写真N】>キャプション< だけの段落
  function renderPhotoCaptionParagraph(paragraph, imageGroups, title) {
    const match = paragraph.match(PHOTO_WITH_REST_RE);
    if (!match) return "";
    const num = normalizePhotoNumber(match[1]);
    const captionMatch = extractPhotoCaption(match[2]);
    if (!captionMatch) return "";

    const html = photoWithCaptionHtml(getPhotosForToken(num, imageGroups), title, num, captionMatch.caption);
    // キャプションの後ろに続く文章があれば、それも段落として描画する
    const rest = match[2].slice(captionMatch.raw.length).trim();
    return rest ? html + renderTextParagraphWithBoxedNote(rest) : html;
  }

  // 【写真N】だけの段落
  function renderOnlyPhotoParagraph(paragraph, imageGroups, title) {
    const match = paragraph.match(PHOTO_ONLY_RE);
    if (!match) return null;
    const num = normalizePhotoNumber(match[1]);
    return photoGroupHtml(getPhotosForToken(num, imageGroups), title, num);
  }

  // 文章の途中に【写真N】がある段落
  function renderParagraphWithPhotoTokens(paragraph, imageGroups, title) {
    const regex = new RegExp(PHOTO_TOKEN_RE.source, "g");
    const parts = [];
    let lastIndex = 0;
    let matched = false;
    let m;

    while ((m = regex.exec(paragraph)) !== null) {
      matched = true;
      const num = normalizePhotoNumber(m[1]);
      const beforeHtml = renderTextParagraphWithBoxedNote(paragraph.slice(lastIndex, m.index));
      if (beforeHtml) parts.push(beforeHtml);

      let nextIndex = m.index + m[0].length;
      const captionMatch = extractPhotoCaption(paragraph.slice(nextIndex));
      if (captionMatch) {
        parts.push(photoWithCaptionHtml(getPhotosForToken(num, imageGroups), title, num, captionMatch.caption));
        nextIndex += captionMatch.raw.length;
        regex.lastIndex = nextIndex;
      } else {
        parts.push(photoGroupHtml(getPhotosForToken(num, imageGroups), title, num));
      }
      lastIndex = nextIndex;
    }

    if (!matched) return null;

    const afterHtml = renderTextParagraphWithBoxedNote(paragraph.slice(lastIndex));
    if (afterHtml) parts.push(afterHtml);
    return parts.join("");
  }

  function paragraphToHtml(paragraph, imageGroups, title) {
    const photoCaptionHtml = renderPhotoCaptionParagraph(paragraph, imageGroups, title);
    if (photoCaptionHtml) return photoCaptionHtml;

    const onlyPhotoHtml = renderOnlyPhotoParagraph(paragraph, imageGroups, title);
    if (onlyPhotoHtml !== null) return onlyPhotoHtml;

    const photoTokenHtml = renderParagraphWithPhotoTokens(paragraph, imageGroups, title);
    if (photoTokenHtml !== null) return photoTokenHtml;

    return renderTextParagraphWithBoxedNote(paragraph);
  }

  // h2/h3 に id を付け、目次用に見出し一覧も返す。
  function withHeadingAnchors(html) {
    const used = new Set();
    const headings = [];
    const out = html.replace(/<(h2|h3)>([\s\S]*?)<\/\1>/g, (_, tag, inner) => {
      const plain = inner.replace(/<[^>]*>/g, "");
      const baseId = slugifyHeading(plain) || "section";
      let id = baseId;
      let i = 2;
      while (used.has(id)) id = `${baseId}-${i++}`;
      used.add(id);
      headings.push({ level: tag === "h2" ? 2 : 3, id, text: plain });
      return `<${tag} id="${id}">${inner}</${tag}>`;
    });
    return { html: out, headings };
  }

  // ---------- 公開API ----------

  // 本文HTMLと見出し一覧を返す
  function buildBodyHtml(article) {
    const paragraphs = bodyToParagraphs(article.body);
    if (!paragraphs.length) return { html: "", headings: [] };
    const html = paragraphs.map((p) => paragraphToHtml(p, article.imageGroups || {}, article.title)).join("\n");
    return withHeadingAnchors(html);
  }

  // h2が3つ以上ある記事だけ目次を出す
  function buildTocHtml(headings) {
    const h2s = headings.filter((h) => h.level === 2);
    if (h2s.length < 3) return "";
    const items = headings
      .map((h) => `<li class="toc-h${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`)
      .join("");
    return `<nav class="toc" aria-label="目次"><p class="toc-title">目次</p><ul>${items}</ul></nav>`;
  }

  // 本文の【写真N】で使われなかった画像だけ、記事末尾のギャラリーに出す。
  function buildGalleryHtml(article) {
    const used = new Set();
    const regex = new RegExp(PHOTO_TOKEN_RE.source, "g");
    let m;
    while ((m = regex.exec(String(article.body || ""))) !== null) {
      getPhotosForToken(normalizePhotoNumber(m[1]), article.imageGroups).forEach((p) => used.add(p.src));
    }

    const remaining = (article.gallery || []).filter((p) => !used.has(p.src));
    if (!remaining.length) return "";

    const imgs = remaining
      .map(
        (p, i) =>
          `<a href="${esc(p.src)}"><img src="${esc(p.thumb)}" width="${p.thumbWidth}" height="${p.thumbHeight}" alt="${esc(article.title)} その他の写真${i + 1}" loading="lazy" decoding="async" /></a>`
      )
      .join("");
    return `<section class="gallery" aria-label="その他の写真"><h2 class="gallery-title">その他のスクショ</h2><div class="gallery-grid">${imgs}</div></section>`;
  }

  return { buildBodyHtml, buildTocHtml, buildGalleryHtml };
}

module.exports = { createBodyRenderer, bodyToPlainText, esc };
