// 写真キャプションが複数行になったときだけ is-multiline クラスを付ける。
// （元サイト article.js の bindInlinePhotoCaptionLayout を移植。表示後にサイズを測る必要があるのでブラウザ側に残す）
(function () {
  const root = document.querySelector(".article .body");
  if (!root) return;

  function lineHeight(el) {
    const style = window.getComputedStyle(el);
    const lh = Number.parseFloat(style.lineHeight);
    if (Number.isFinite(lh)) return lh;
    const fs = Number.parseFloat(style.fontSize);
    return Number.isFinite(fs) ? fs * 1.2 : 14.4;
  }

  function update() {
    root.querySelectorAll(".inline-photo-caption").forEach((caption) => {
      caption.classList.toggle("is-multiline", caption.scrollHeight > lineHeight(caption) * 1.5);
    });
  }

  const refresh = () => window.requestAnimationFrame(update);
  refresh();

  root.querySelectorAll(".inline-photo-block img").forEach((img) => {
    if (img.complete) return;
    img.addEventListener("load", refresh, { once: true });
    img.addEventListener("error", refresh, { once: true });
  });

  let timer = null;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 150);
  });
})();
