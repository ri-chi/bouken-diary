# ぼうけん日記

Airtableに書いた日記を、GitHub Actionsで静的サイトに変換してGitHub Pagesで公開するブログです。

```
Airtable（記事・スクショ）
   ↓ ビルド時に取得（トークンはGitHub Secretsに保管）
build/build.js（HTML生成・画像をWebP変換）
   ↓
dist/ → GitHub Pages
```

## フォルダ構成

```
build/
  airtable.js      Airtableから記事を取得（元サイトの airtable-service.js をスリム化）
  images.js        画像のダウンロードとWebP変換
  render-body.js   本文の変換ルール（元サイトの article.js から移植）
  templates.js     ページのHTMLテンプレート
  build.js         全体の処理
src/
  assets/          style.css / search.js / caption.js（そのままコピーされる）
  pages/           固定ページ（about / privacy / contact）
fixtures/          Airtableなしで試すためのサンプルデータ
site.config.js     ブログ名などの設定
```

## 1. Airtableの準備

テーブル名は `Articles`（変える場合は変数 `AIRTABLE_TABLE` で指定）。列名は英語・日本語どちらでも認識します。

| 列名 | 種類 | 内容 |
| --- | --- | --- |
| title（タイトル） | 1行テキスト | 記事タイトル |
| series（シリーズ） | 単一選択 | 連載名。例: `マイクラDQM6編`。単発の記事は空でOK |
| slug | 1行テキスト | URL用。空なら自動生成（シリーズ記事は `dqm6-day-001`、それ以外は `day-001` かレコードID） |
| day（日目） | 数値 | プレイ日数。空なら日目の表示なし |
| publishedAt（公開日） | 日付 | 並び順に使う |
| mod_version（バージョン） | 1行テキスト | 例: `0.28.50` |
| tags（タグ） | 複数選択 | 例: 序盤, 配合, 仲間 |
| excerpt（抜粋） | 長文テキスト | 一覧と検索結果・OGPに表示 |
| body（本文） | 長文テキスト | 下の記法で書く |
| visible（公開） | チェックボックス | チェックした記事だけ公開（publishedAt が未来なら、その日まで予約） |
| top image（トップ画像） | 添付ファイル | 記事の一番上と一覧のサムネ |
| image 1 〜 image 20（写真1〜） | 添付ファイル | 本文の【写真1】〜【写真20】に対応 |

### 予約投稿

`visible` にチェックを入れて、`publishedAt` に未来の日付を入れておくと、その日（日本時間）の朝5時の自動ビルドで公開されます。
それまでは記事ページ・一覧・検索・サイトマップのどこにも出ず、前後の記事のリンクも公開済みの記事だけでつながります。
Airtableの日付の列で時刻も使っている場合は、その時刻を過ぎたあとの最初のビルドで公開されます。

### シリーズ（連載）

`site.config.js` の `series` に、Airtableの series の選択肢と同じ名前でシリーズを登録すると、
シリーズページ（例: `/series/dqm6/`）のURLと説明文が設定されます。

```js
series: {
  "マイクラDQM6編": { slug: "dqm6", description: "シリーズの説明" },
},
```

- 記事ページの「まえの日／つぎの日」は、同じシリーズの記事どうしでつながります
- トップページには、シリーズごとに最新の日記と「はじめから読む」が表示されます
- 新しいシリーズを始めるときは、Airtableの選択肢と `site.config.js` の両方に追加してください

Airtableの個人アクセストークンは `data.records:read` の権限だけで、このベースだけを対象に作ってください。

## 2. 本文の書き方

```
空行で段落を区切ります。

## 見出し
### 小見出し

- 箇条書き
- 箇条書き

**太字** と *斜体*
[リンク](https://example.com)
[2日目の日記](/articles/dqm6-day-002/)   ← "/" から始めるとサイト内リンク

【写真1】                     image 1 の画像を差し込む
【写真2】>キャプション<        キャプション付き
>補足の注釈<                  小さめの補足
>>スライムが おきあがり<<      ドラクエ風のメッセージウィンドウ
```

`_文字_` は斜体にならないので、`iron_ingot` のようなアイテムIDもそのまま書けます。
image 1〜20 に入れたのに本文で使わなかった画像は、記事の最後に「その他のスクショ」として並びます。

## 3. 手元で試す

Node.js 20以上が必要です。

```bash
npm install
npm run build:sample   # サンプルデータでビルド（Airtable不要）
npm run serve          # http://localhost:3000 で確認
```

Airtableのデータで試すときは、環境変数を設定してから `npm run build` を実行します。

```bash
# Mac / Linux
AIRTABLE_TOKEN=xxx AIRTABLE_BASE_ID=appXXX npm run build

# Windows (PowerShell)
$env:AIRTABLE_TOKEN="xxx"; $env:AIRTABLE_BASE_ID="appXXX"; npm run build
```

### 下書き・予約中の記事を手元で確認する（プレビュー）

1. `.env.example` をコピーして `.env` という名前にし、Airtableのトークンとベースを入れる（最初の1回だけ）
2. ターミナルで次を実行する

```bash
npm run preview
```

3. ブラウザで `http://localhost:3000` を開く。止めるときはターミナルで Control＋C

`visible` が付いていない記事や、`publishedAt` が未来の記事も表示され、「下書き（非公開）」「予約中」の目印が付きます。
プレビューは自分のMacの中だけで表示され、本番のブログには影響しません。
いいね・コメント・アクセス解析は、プレビューでは動きません（本物のデータが増えないようにするため）。

## 4. GitHub Pagesで公開する

1. このフォルダをGitHubのリポジトリにpushする
2. リポジトリの Settings → Pages → Source を **GitHub Actions** にする
3. Settings → Secrets and variables → Actions で以下を登録する

| 種類 | 名前 | 値 |
| --- | --- | --- |
| Secret | `AIRTABLE_TOKEN` | Airtableの個人アクセストークン |
| Secret | `AIRTABLE_BASE_ID` | `app` から始まるベースID |
| Variable | `SITE_URL` | 例: `https://dqm6-diary.com`（末尾スラッシュなし） |
| Variable | `CUSTOM_DOMAIN` | 独自ドメインを使う場合。例: `dqm6-diary.com` |
| Variable | `BASE_PATH` | 独自ドメインなしで `ユーザー名.github.io/リポジトリ名/` に置く場合のみ `/リポジトリ名/` |
| Variable | `GA_ID` | Googleアナリティクスの測定ID（任意） |
| Variable | `ADSENSE_CLIENT` | AdSense合格後に `ca-pub-...` を設定（任意。ads.txt も自動出力） |

4. Actions タブで「Build and deploy」を手動実行（Run workflow）

以降は毎朝5時（日本時間）に自動でビルドされます。すぐ反映したいときは Actions タブから手動実行してください（スマホのGitHubアプリからもできます）。

## 5. 公開前にやること

- `site.config.js` のブログ名・説明を書き換える
- `src/pages/` の about / privacy / contact を自分用に書き換える（privacy はひな形です）
- MOD公式サイトの規約と、スクウェア・エニックスの著作物利用ガイドラインを確認する

## Cloudflare Pagesへ移るとき

`npm run build` で `dist/` を出力するだけなので、Cloudflare Pages側でビルドコマンドを `npm run build`、出力先を `dist` にして、同じ環境変数を設定すれば移行できます。独自ドメインを使っていれば、DNSの向き先を変えるだけでURLは変わりません。

## いいね・コメント（Cloudflare Workers）

いいねの数とコメントは、`blog-api/` の小さなプログラムを Cloudflare Workers（無料枠）で動かして保存します。
最初に1回だけ、Macのターミナルで次の手順を行います（コマンドは1行ずつ実行）。

```bash
cd blog-api
npm install
npx wrangler login                    # ブラウザが開くので Cloudflare にログインして許可
npx wrangler d1 create bouken-api     # 表示された database_id を wrangler.toml に貼る
npm run db:init                       # テーブルを作る
npx wrangler secret put SALT          # ランダムな文字列を入力
npx wrangler secret put ADMIN_TOKEN   # 管理ページのパスワードを入力
npm run deploy                        # 公開。https://bouken-api.〇〇.workers.dev のURLが表示される
```

ランダムな文字列は `openssl rand -hex 32` で作れます。SALT と ADMIN_TOKEN には別々の値を使ってください。

表示されたURLを、GitHubの Variables に `BLOG_API` として登録し、Actionsでビルドし直すと、記事にいいねボタンとコメント欄が出ます。

### コメントの管理

`https://bouken-api.〇〇.workers.dev/admin` を開いて ADMIN_TOKEN を入れると、承認待ちのコメントを
「承認して公開」「返信して公開」「削除」できます。「いいね」タブでは、記事ごとのいいね数とコメント数を
多い順のランキングで見られます。スマホでも使えるので、ホーム画面に追加しておくと便利です。

新しいコメントをDiscordに通知したい場合は、DiscordのチャンネルでWebhookを作り、そのURLを登録します。

```bash
npx wrangler secret put DISCORD_WEBHOOK_URL
```

### 設定を変えたとき

`blog-api/` の中身を変えたときは、`npm run deploy` でもう一度公開します（GitHubにpushしただけでは反映されません）。
