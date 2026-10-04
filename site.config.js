// サイト全体の設定。秘密ではない値はここに書き、環境変数で上書きもできる。
// APIトークンなどの秘密の値は、ここではなく GitHub の Secrets に入れる。
module.exports = {
  // ブログ名・説明（<title> や OGP、トップページに使う）
  siteName: process.env.SITE_NAME || "ぼうけん日記",
  description:
    process.env.SITE_DESCRIPTION ||
    "ゲームや気になったことを、のんびり冒険するように記録するブログ。いまはマイクラのドラクエMOD「DQM6」のプレイ日記を連載中です。",

  // 公開URL（末尾スラッシュなし）。sitemap.xml や OGP の絶対URLに使う。
  siteUrl: (process.env.SITE_URL || "https://example.com").replace(/\/+$/, ""),

  // サイトを置くパス。独自ドメインなら "/"。
  // 独自ドメインなしで https://ユーザー名.github.io/リポジトリ名/ に置くなら "/リポジトリ名/"。
  basePath: process.env.BASE_PATH || "/",

  // 独自ドメイン（設定すると dist/CNAME を書き出す）。例: "dqm6-diary.com"
  customDomain: process.env.CUSTOM_DOMAIN || "",

  // Googleアナリティクス測定ID（例: "G-XXXXXXX"）。空なら読み込まない。
  gaId: process.env.GA_ID || "",

  // AdSenseのクライアントID（例: "ca-pub-1234567890"）。空なら読み込まない。
  // 設定すると自動広告のタグと ads.txt を出力する。
  adsenseClient: process.env.ADSENSE_CLIENT || "",

  // シリーズ（連載）の設定。キーはAirtableの series 列の選択肢と同じ名前にする。
  //   slug        : シリーズページのURL（/series/dqm6/）と、記事URLの自動生成（dqm6-day-001）に使う
  //   description : シリーズページの冒頭に表示する説明
  // ここに書いていないシリーズも表示はされるが、URLが日本語になる。
  series: {
    "マイクラDQM6編": {
      slug: "dqm6",
      description:
        "マイクラのドラクエMOD「DQM6」を、初見でのんびり遊ぶプレイ日記です。仲間になったモンスターとの冒険や、配合・建築で試したことを1日ずつ記録しています。",
    },
  },

  // いいね・コメントのAPI（Cloudflare Worker のURL）。例: "https://bouken-api.xxxx.workers.dev"
  // 空なら、いいねボタンとコメント欄を表示しない。
  blogApi: (process.env.BLOG_API || "").replace(/\/+$/, ""),

  // コメント欄を出すかどうか（APIを設定していても、コメントだけ止めたいときは false にする）
  comments: true,

  // SNSのアカウント（IDだけを書く。空にすると表示しない）
  //   x    : Xのユーザー名（@の後ろ）。例: "bouken_diary"
  //   note : noteのID（note.com/ の後ろ）。例: "bouken_diary"
  social: {
    x: "bouken_diary",
    note: "bouken_diary",
  },

  // 記事一覧でタグとして表示する順番（ここにないタグは後ろに並ぶ）
  tagOrder: ["序盤", "配合", "仲間", "建築", "ボス", "アップデート"],
};
