# セットアップ手順書

## 1. 前提

以下をインストールしてください。

- Docker Desktop
- Visual Studio Code
- VS Code拡張機能「Dev Containers」
- Git
- GitHubアカウント
- Cloudflareアカウント

Mac側にNode.js、pnpm、Playwright、Wranglerを直接インストールする必要はありません。開発環境はDev Container内に作成します。

## 2. 配置するファイル

リポジトリのルートを次の構成にしてください。

```
repository-root/
├── .devcontainer/
│   ├── devcontainer.json
│   ├── Dockerfile
│   └── post-create.sh
├── CLAUDE.md
└── SETUP.md
```

この一式には上記ファイルが含まれています。なお、今回のハートビート、RSSトークンの再発行、管理画面認証の追加はアプリケーション層の変更であり、Dev Containerの構成は変更していません。

## 3. リポジトリを開く

既存のリポジトリを使用する場合は、そのルートへファイルを配置してVS Codeで開きます。

新しく始める場合は、ターミナルで実行します。

```
mkdir web-monitor-rss
cd web-monitor-rss
git init
code .
```

配布されたファイルを配置した後、VS Codeのコマンドパレットを開き、次を実行します。

```
Dev Containers: Reopen in Container
```

初回はDockerイメージの作成、Node.js関連設定、Playwright Chromiumの導入が行われるため、数分かかる場合があります。

## 4. Dev Containerの動作確認

コンテナ内のVS Codeターミナルで実行します。

```
node --version
pnpm --version
npx playwright --version
wrangler --version
```

初期リポジトリにまだpackage.jsonがない場合、pnpm installは自動実行されません。Claudeがモノレポの初期構成を作成した後、次を実行します。

```
pnpm install
pnpm ci
```

## 5. GitHubリポジトリの設定

GitHub上で空のプライベートリポジトリを作成し、ローカルにremoteを設定します。

```
git remote add origin git@github.com:YOUR_ACCOUNT/YOUR_REPOSITORY.git
git branch -M main
git push -u origin main
```

HTTPSを使用する場合は、SSH URLの代わりにHTTPS URLを指定してください。

Dev Containerはホスト側のGit認証情報を利用する構成です。コンテナ内で次を確認します。

```
git remote -v
git status
git ls-remote origin
```

CLAUDE.mdには、作業完了後に追加指示を待たず、安全確認後にcommitとpushを行う規則が記載されています。ただし、remote未設定、認証失敗、テスト失敗、秘密情報の検出、無関係な変更の混在などがある場合はpushを行わない規則です。

## 6. Cloudflareへログインする

コンテナ内で実行します。

```
wrangler login
```

ブラウザ認証が難しい場合は、Cloudflare API Tokenを環境変数として使用します。トークン値はファイルへ直接記載しないでください。

```
export CLOUDFLARE_API_TOKEN='your-token'
export CLOUDFLARE_ACCOUNT_ID='your-account-id'
```

恒久的に使用する場合も、Git管理対象外の.envや安全なシークレット管理を使用してください。

## 7. Cloudflare D1の作成

Workerプロジェクトが作成された後、コンテナ内で実行します。

```
wrangler d1 create web-monitor-rss
```

表示されたdatabase IDをapps/worker/wrangler.tomlのD1 bindingへ設定します。

ローカルDBへmigrationを適用します。

```
pnpm --filter @web-monitor/worker db:migrate:local
```

本番D1へ適用する場合は、内容を確認してから実行します。

```
pnpm --filter @web-monitor/worker db:migrate:remote
```

migrationには、監視用のテーブルに加えて、稼働監視用のsystem_stateと、管理画面ログイン用のadmin_sessionsが含まれます。feedsテーブルには、RSSトークンのハッシュ、発行日時、状態（active / revoked）などの列が含まれます。

## 8. Workerのシークレット

Worker側では、用途ごとに別の秘密値を用意します。少なくとも次を用意します。

- 管理画面ログイン用の管理者パスワードまたはログイントークン
- Chrome拡張機能用のExtension APIトークン
- GitHub Actions Runner用のRunner APIトークン

3つは互いに別の値とし、用途を越えて共用しないでください。

例：

```
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Workerへ登録します。

```
wrangler secret put ADMIN_LOGIN_SECRET --config apps/worker/wrangler.toml
wrangler secret put EXTENSION_API_TOKEN --config apps/worker/wrangler.toml
wrangler secret put RUNNER_API_TOKEN --config apps/worker/wrangler.toml
```

セッション署名やトークンのハッシュ化に鍵が必要な場合は、次も登録します。

```
wrangler secret put SESSION_SIGNING_SECRET --config apps/worker/wrangler.toml
```

RSS URLにはこれらの管理用トークンを使用しません。RSSごとに別のランダムなトークンをアプリケーション側で発行し、D1にはハッシュのみを保存します。平文はFeed作成時および再発行時に一度だけ表示されます。

## 9. Worker cron（ハートビート）の設定

無音停止を検知するため、Cloudflare WorkerのCron Triggerを、GitHub Actionsとは独立したwatchdogとして設定します。apps/worker/wrangler.tomlにcron triggerを設定します。

```
[triggers]
crons = ["0 * * * *"]
```

これは一例として1時間ごとに稼働状態を確認する設定です。watchdogは対象サイトへアクセスせず、system_stateに記録されたRunnerの最終正常実行時刻だけを確認します。閾値（既定26時間）を超えて更新がない場合、システム用Feedへ稼働警告を出します。

閾値を変更する場合は、system_stateのheartbeat_threshold_secを更新します。

## 10. GitHub ActionsのSecrets

GitHubリポジトリの次の画面を開きます。

```
Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

以下を登録します。

```
MONITOR_API_BASE_URL
RUNNER_API_TOKEN
```

RUNNER_API_TOKENは、Workerへ登録した値と同じものを使用します。この値は日次実行の結果送信と、実行開始・完了のハートビート送信の両方に使用されます。

Cloudflareへの自動deployをGitHub Actionsで行う場合のみ、次も登録します。

```
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

## 11. ローカル開発

モノレポ構成が作成された後、通常は次を使用します。

```
pnpm install
pnpm dev
```

個別に起動する場合の想定コマンドです。

```
pnpm --filter @web-monitor/worker dev
pnpm --filter @web-monitor/extension dev
pnpm --filter @web-monitor/runner test
```

Workerのローカル開発ではWranglerのローカルD1を使用します。Worker cron（watchdog）の動作は、ローカルでcronを手動起動して確認できます。

## 12. 管理画面へのログイン確認

Workerを起動した後、ブラウザで管理画面を開きます。

```
https://YOUR_WORKER_DOMAIN/
```

以下を確認します。

- 未ログイン時はログイン画面へ誘導されること。
- ADMIN_LOGIN_SECRETに対応する認証情報でログインできること。
- ログイン後にHttpOnly、Secure、SameSite=StrictのセッションCookieが発行されること。
- 状態変更を伴う操作でCSRFトークンが検証されること。
- ログアウトでセッションが失効すること。
- 誤った認証情報の連続入力にレート制限がかかること。

管理画面のCookieセッションは、Chrome拡張機能やRunnerのトークンとは別方式です。拡張機能はExtension APIトークンを使用します。

## 13. Chrome拡張機能の読み込み

拡張機能をbuildします。

```
pnpm --filter @web-monitor/extension build
```

Chromeで次を開きます。

```
chrome://extensions/
```

次の手順で読み込みます。

- 「デベロッパーモード」を有効にします。
- 「パッケージ化されていない拡張機能を読み込む」を押します。
- apps/extension/distを選択します。
- 拡張機能をツールバーへ固定します。

MacのChromeからDev Container内のファイルを直接選択しにくい場合は、リポジトリがMac側にも通常のフォルダとして存在することを確認し、Mac側のパスからapps/extension/distを選択してください。

拡張機能には、Worker APIへ接続するためのExtension APIトークンを設定します。トークン値は拡張機能の設定画面へ入力し、ソースコードへ直接記載しないでください。

## 14. Visual Selectorの確認

テスト用ページを起動します。

```
pnpm --filter @web-monitor/test-fixtures dev
```

Chromeで表示し、次を確認します。

- マウスを重ねた要素が枠で表示されること。
- クリックで選択できること。
- 親、子、前後の兄弟へ移動できること。
- 複数範囲を選択できること。
- 選択内容と正規化後の値を確認できること。
- 単一要素と一覧を区別できること。
- Escで選択モードを終了できること。
- 保存したMonitorがWorker APIとD1へ登録されること。

## 15. RSSトークンの発行と再発行の確認

管理画面でFeedを作成し、RSSトークンの動作を確認します。

- Feed作成時に平文のRSSトークンが一度だけ表示されること。
- 表示されたトークンを含むRSS URLでフィードを取得できること。
- 「トークンを再発行」を実行すると、新しい平文トークンが一度だけ表示され、旧トークンでの取得が拒否されること。
- 「トークンを失効」を実行すると、以降の取得が拒否されること。
- RSS取得時にrss_token_last_used_atが更新されること。

RSS URLの形式は次のとおりです。

```
https://YOUR_WORKER_DOMAIN/rss/RANDOM_TOKEN.xml
```

## 16. GitHub Actionsの日次実行とハートビート

.github/workflows/daily-monitor.ymlが作成された後、GitHubのActions画面から手動実行します。

```
Actions
→ Daily monitor
→ Run workflow
```

以下を確認します。

- Playwrightが起動すること。
- 実行開始時にRunner APIへ開始ハートビートが送信されること。
- Worker APIからMonitorを取得すること。
- 結果がD1へ保存されること。
- 初回成功時は基準値のみが保存されること。
- 2回目以降に値が変化した場合だけchangesへ登録されること。
- 取得失敗が変更として登録されないこと。
- 実行完了時にsystem_stateのlast_runner_success_atが更新されること。

GitHubのschedule実行は指定時刻から遅れる場合があります。このサービスでは1日1回実行されればよいため、正確な開始時刻は要件に含めません。長期間の無音停止はWorker cronのwatchdogが検知します。

## 17. ハートビートと稼働警告の確認

無音停止の検知が機能することを確認します。

- Worker cron（watchdog）が定期実行され、system_stateのlast_watchdog_checked_atが更新されること。
- last_runner_success_atが閾値（既定26時間）より古い状態を作ると、システム用Feedへ稼働警告itemが一つだけ作成されること。
- 稼働警告が有効な間、同じ警告が重複して追加されないこと。
- 日次実行が回復すると、稼働警告が終了し、回復itemが一度だけ作成されること。
- 稼働警告がコンテンツ変更（changes）として登録されないこと。
- /healthを開き、healthyまたはstaleと最終正常実行時刻が返ること。

```
https://YOUR_WORKER_DOMAIN/health
```

## 18. RSSの確認

管理画面でFeedを作成し、RSS URLを取得します。ブラウザまたはRSS Readerで開き、次を確認します。

- XMLが正しく表示されること。
- 最新20件が新しい順に表示されること。
- 変更前と変更後が表示されること。
- 元ページへのリンクがあること。
- 同じ変更が重複して新着にならないこと。
- ETagとLast-Modifiedが設定されること。
- システム用Feedで、稼働警告、回復、取得失敗の警告がitemとして配信されること。
- 失効したトークンでは配信が拒否されること。

## 19. 品質確認コマンド

変更をcommitする前に実行します。

```
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

まとめて実行できる構成にした後は、次を使用します。

```
pnpm ci
```

## 20. 秘密情報をcommitしないための確認

commit前に確認します。

```
git status --short
git diff --cached
```

次のファイルや内容をcommitしないでください。

```
.env
.env.*
.dev.vars
.wrangler/
playwright-report/
test-results/
認証トークン
Cookie
セッショントークン
RSSトークンの平文
管理者パスワードおよびログイントークン
Cloudflare API Token
GitHub Personal Access Token
```

## 21. Dev Containerを作り直す場合

.devcontainerを変更した場合は、VS Codeのコマンドパレットから実行します。

```
Dev Containers: Rebuild Container
```

Dockerキャッシュを使わずに完全に作り直す必要がある場合は、次を使用します。

```
Dev Containers: Rebuild Container Without Cache
```

## 22. トラブル時の確認

### PlaywrightのChromiumが起動しない

```
npx playwright install --with-deps chromium
```

### pnpmが見つからない

```
corepack enable
corepack prepare pnpm@latest --activate
```

### Wranglerの認証を確認したい

```
wrangler whoami
```

### GitHub remoteまたは認証を確認したい

```
git remote -v
git ls-remote origin
```

### D1のmigration状況を確認したい

```
wrangler d1 migrations list web-monitor-rss --config apps/worker/wrangler.toml
```

### Worker cron（watchdog）が動作しているか確認したい

```
wrangler tail --config apps/worker/wrangler.toml
```

system_stateのlast_watchdog_checked_atが更新されているかも確認します。

### 稼働警告が出続ける、または出ない

system_stateのheartbeat_threshold_sec、last_runner_success_at、alert_statusを確認します。日次実行が正常に完了しているか、Runnerのハートビートが届いているかを確認します。
