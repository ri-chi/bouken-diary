-- 何度実行しても大丈夫なように、すべて IF NOT EXISTS にしている

-- 記事ごとのいいね数
CREATE TABLE IF NOT EXISTS likes (
  slug  TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

-- 誰がどの記事にいいねしたか（同じ人の連打を防ぐため）
-- voter には IPアドレスそのものではなく、秘密の文字列と混ぜてハッシュ化した値だけを保存する
CREATE TABLE IF NOT EXISTS votes (
  slug       TEXT NOT NULL,
  voter      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (slug, voter)
);

-- コメント
--   status   : pending（承認待ち） / approved（公開中）
--   is_admin : 1 ならブログ主の返信
--   author   : 投稿者のIPをハッシュ化した値（連投の制限に使う。IPそのものは保存しない）
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  parent_id  INTEGER,
  name       TEXT NOT NULL,
  body       TEXT NOT NULL,
  is_admin   INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'pending',
  author     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments (slug, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments (status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments (author, created_at);
