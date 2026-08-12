# CLAUDE.md

## 1. プロジェクトの目的

個人専用のWebページ監視サービスを構築する。

本サービスは、Chrome拡張機能でDistillに近い操作性のVisual Selectorを提供し、選択したWebページの範囲をMonitorごとに設定した間隔（既定1日1回、最短1時間）で確認する。確認はGitHub Actions側のサーバー実行、または拡張機能によるローカル実行のいずれかをMonitorごとに選べる。前回から変更された場合は、状態と変更履歴を保存し、RSSフィードとして配信する。

利用者のMacを常時起動しておく必要がない構成とする。開発はDockerを利用したVS Code Dev Container内で行う。本番環境の定期確認はGitHub ActionsとPlaywrightで実行する。Cloudflare WorkersとD1は、API、管理画面、永続データ保存、RSS配信を担当する。

さらに、GitHub Actionsのscheduleが無音で停止しても利用者が気づけるように、Cloudflare Workerのcronによる独立した稼働監視（ハートビート）を備える。RSS配信用トークンは失効および再発行できる設計とし、管理画面は拡張機能やRunnerとは別方式の認証で保護する。

## 2. Claudeが必ず守る作業規則

- 変更作業を始める前に、必ずこのファイルを読むこと。
- 要件が明確な場合は、通常の確認質問をせずに実装を進めること。
- 現在の依頼を完全に満たす、必要最小限で一貫した変更を行うこと。
- 動作する実装を、仮実装、モック、途中省略、TODOだけの実装へ置き換えないこと。
- 実質的な変更を行った後は、関係するフォーマッター、リンター、型検査、テストを実行すること。
- 自分の変更によって発生したエラーは、作業を終了する前に修正すること。
- 認証情報、Cookie、トークン、.envの内容、Cloudflare Secrets、GitHub Secretsを表示または記録しないこと。
- RSSトークン、管理画面のパスワードおよびセッション値を、平文でログへ出力しないこと。作成時および再発行時に利用者へ一度だけ提示する場合を除き、平文を保持しないこと。
- 後の要件で明示的に許可されない限り、ページ全体のHTML、Cookie、ログイン情報、認証セッションを保存しないこと。
- CAPTCHA回避、アクセス制御の回避、ペイウォール回避、サイト側の制限を回避する目的のステルス機能を実装しないこと。
- 利用者向けの画面と文書は英語にすること。
- ソースコードの識別子、データベース識別子、commitメッセージ、コードコメントは英語にすること。
- 必要であり、実際に使用する依存関係だけを追加すること。
- migrationを用意しない限り、保存済みMonitor定義およびRSS URLとの互換性を維持すること。
- データベーススキーマを変更する場合は、必ずD1 migrationを追加すること。
- APIを変更する場合は、入力検査、エラー処理、テストを追加すること。
- Chrome拡張機能の変更は、静的なfixtureページと動的描画のfixtureページでテストすること。
- 監視失敗をコンテンツ変更として記録しないこと。
- 最初の取得成功は基準値の設定とし、既定では変更項目を作成しないこと。
- Selectorの自動修復によって別の要素へ無断で切り替えないこと。Selectorが失敗した場合はSELECTOR_NOT_FOUNDとして記録すること。
- ハートビートの停止検知は、コンテンツ変更の履歴とは分離し、システム用Feedへ出すこと。稼働監視の警告をコンテンツ変更として記録しないこと。
- 完了した作業は、利用者から追加指示を待たずにGitHubへcommitおよびpushすること。push前に必要な検査をすべて実行すること。ただし、テスト失敗、秘密情報の検出、利用者による無関係な変更の混在、remote未設定、認証不能、保護ブランチへの直接push不可のいずれかに該当する場合はpushしないこと。この場合、安全であればcommitまでを行い、妨げとなった理由を具体的に報告すること。--force、公開履歴の書き換え、remoteブランチの削除、他者のcommitのamendは、明示的な指示がない限り行わないこと。
- pushだけでは本番環境（Cloudflare Worker）には反映されない。apps/worker配下（D1 migration、Worker API、管理画面、RSS生成等）に実質的な変更を加えた場合は、pushに続けて利用者から追加指示を待たずに本番へ反映すること：D1 migrationがあればまず`wrangler d1 migrations apply <db> --remote`を実行し、その後`wrangler deploy`でWorkerをデプロイする。デプロイ直後はCloudflareエッジへの伝播に数十秒かかることがあるため、確認は少し間を置いてから行うこと。認証情報が使えない、または明確な理由でデプロイを見送る場合は、その理由を具体的に報告すること。Chrome拡張機能側（apps/extension）に変更がある場合は、ビルド済みdist/をcommitに含めるとともに、利用者自身がChromeで拡張機能を再読み込みする必要がある旨を明示すること（Claude側からは自動配布できない）。
- commitメッセージは簡潔なConventional Commits形式にすること。例：feat: add visual selector overlay、fix: prevent failed checks from creating changes、feat: add heartbeat watchdog。
- .env、.dev.vars、生成した認証情報、ブラウザプロファイル、機密情報を含むPlaywright trace、Cloudflareのローカル状態ディレクトリをcommitしないこと。

## 3. 対象範囲

### 3.1 初期版に含める機能

- 個人専用、単一利用者のサービス
- Chrome Manifest V3拡張機能
- ページ全体またはページの一部分を選択するDistillに近いVisual Selector
- マウスを重ねた要素の強調表示
- 要素の選択、削除、再選択
- 親要素、子要素、前の兄弟要素、次の兄弟要素への移動
- 一つのMonitor内での複数範囲選択
- 安定性を考慮したCSS Selector生成
- 選択内容のプレビュー
- テキスト、HTML、リンクURL、画像URL、指定属性値の取得
- 単一要素モードと繰り返し一覧モード
- Monitor名、Feed、比較方法、抽出規則、有効・無効の設定
- Monitorごとに設定可能な確認間隔（既定1日1回、最短1時間）と、サーバー側（GitHub Actions）／ローカル側（Chrome拡張機能のバックグラウンドタブ）の実行方式選択
- 正確な実行時刻を前提としない運用
- GitHub Actions上のPlaywrightによる取得
- Cloudflare Worker APIおよび管理画面
- Cloudflare D1への永続保存
- 安定したGUIDを持つRSS 2.0出力
- 現在状態、確認履歴、変更履歴、エラー状態
- GitHub Actionsのworkflow_dispatchを利用した手動確認
- ログインを必要としない公開ページ
- Cloudflare Worker cronによる独立したハートビート監視と、無音停止の検知
- システム用Feedへの稼働警告および回復通知
- Cookieセッションによる管理画面のログイン認証
- RSSトークンの発行、失効、再発行（ローテーション）

### 3.2 初期版に含めない機能

- 複数利用者、チーム、課金、一般公開登録
- メール、SMS、モバイルPush、Slack、Discord通知
- 認証情報、ログインセッション、非公開ページの監視
- CAPTCHA対応またはBot対策の回避
- マクロの記録と再生
- Selectorの自動修復
- AIによる意味解析
- スクリーンショット履歴
- 画像ファイル自体の保存
- 1時間未満の高頻度確認（最短間隔は1時間）
- 正確な時刻での実行
- Cloudflare Queues
- 初期版でのXPathおよび任意JavaScript Selector
- 複数の管理者アカウントおよび権限分離

## 4. システム構成

```
Chrome拡張機能
    |  監視範囲の選択とMonitor登録
    |  execution_mode=localのMonitorはバックグラウンドタブで確認も実行
    v
Cloudflare Worker API + 管理画面
    |
    v
Cloudflare D1
    ^
    |  日次確認結果および手動確認結果
GitHub Actions Scheduler
    |
    v
Playwright Monitor Runner

Cloudflare Worker Cron（ハートビートwatchdog）
    |  最終正常実行時刻を監視し、stale時に警告
    v
Cloudflare D1（system_state / heartbeat）

RSS Reader
    |
    v
Cloudflare Worker RSS Endpoint
```

### 4.1 各構成要素の役割

#### Chrome拡張機能

- 選択モードを開始および終了する。
- 対象ページのレイアウトを変更せず、マウス位置の要素を強調表示する。
- ページ全体または一つ以上の要素を選択する。
- 複数のSelector候補を生成し、検証後に最も安定した候補を選択する。
- 選択内容と該当件数を表示する。
- 親、子、兄弟要素へ移動できるようにする。
- 抽出方法と比較条件を設定する。
- Monitor定義をWorker APIへ送信する。
- 簡易Watchlistと直近の状態を表示する。
- execution_modeがlocalに設定されたMonitorについて、Chromeが起動している間、確認期限が来たものをバックグラウンド（非アクティブ）タブで確認し、結果をWorker APIへ送信する。タブはフォーカスを奪わず、確認後に閉じる。

Chrome拡張機能は、execution_modeがlocalに設定されたMonitorに限り、Monitorごとの確認間隔に従ってバックグラウンドタブで定期確認を実行してよい。それ以外の目的の定期監視は行わないこと。拡張機能は専用のExtension APIトークンで認証し、管理画面のCookieセッションを使用しないこと。

#### Cloudflare Worker

- 管理画面、Chrome拡張機能、Runnerからの要求を認証する。認証方式は要求元ごとに分ける（管理画面はCookieセッション、拡張機能はExtensionトークン、RunnerはRunnerトークン）。
- Monitor定義とRunner結果を検証する。
- Feed、Monitor、Selection、現在状態、確認履歴、変更履歴をD1へ保存する。
- GitHub Actions RunnerおよびChrome拡張機能それぞれへ、execution_modeとcheck_interval_secに基づき確認期限が来たMonitor定義のみを返す。
- 正常取得した正規化済み値を前回値と比較する。
- 初回の基準値を設定する。
- 同じ変更を重複せずに記録する。
- Chrome拡張機能からのローカル確認結果を、Runner結果と同じ検証・変更検出処理で受け付ける（ただしRunnerハートビートは更新しない）。
- 正しいRSS 2.0 XMLを生成する。
- 管理画面を配信する。
- RSSトークンを発行、検証、失効、再発行する。トークンは平文を保存せず、ハッシュで照合する。
- cron trigger実行時に、GitHub Actions Runnerの最終正常実行時刻を確認し、閾値を超えて更新がない場合はシステム用Feedへ稼働警告を出す。

#### GitHub ActionsおよびPlaywright

- 毎時のscheduleおよび手動要求時に実行する。実際の確認頻度はMonitorごとのcheck_interval_secで決まる（Worker側の間引き、§8.1）。
- Worker APIから確認期限が来たMonitor（execution_modeがserverのもの）を取得する。
- Chromiumを一定のlocale、timezone、viewportで起動する。
- 設定されたすべてのSelectionを抽出する。
- 値を正規化する。ただし、データベース上の変更判定はWorker側で行う。
- 状態、取得値、所要時間、HTTP情報、エラー分類をWorker APIへ返す。
- 実行の開始時と完了時に、run単位のハートビート信号をWorker APIへ送信する。
- Monitorは順番に、または少数の上限付き並列処理で実行する。

#### Cloudflare Worker Cron（ハートビートwatchdog）

- GitHub Actionsとは独立して定期実行する。
- system_stateに記録されたRunnerの最終正常実行時刻を参照する。
- 現在時刻との差が閾値を超える場合、システム用Feedへ稼働警告イベントを一つだけ作成する。
- Runnerが回復した場合、稼働警告を終了し、回復イベントを一度だけ作成する。
- この処理はコンテンツ監視とは独立させ、対象サイトへアクセスしないこと。

#### Cloudflare D1

- 設定、現在状態、履歴、RSS項目、システム稼働状態の正本とする。
- KVを現在状態の正本として使用しない。

## 5. リポジトリ構成

```
.
├── .devcontainer/
│   ├── devcontainer.json
│   ├── Dockerfile
│   └── post-create.sh
├── .github/
│   └── workflows/
│       ├── daily-monitor.yml
│       └── ci.yml
├── apps/
│   ├── extension/
│   │   ├── manifest.json
│   │   ├── src/
│   │   └── tests/
│   ├── worker/
│   │   ├── src/
│   │   ├── migrations/
│   │   ├── tests/
│   │   └── wrangler.toml
│   └── runner/
│       ├── src/
│       └── tests/
├── packages/
│   ├── selector-engine/
│   ├── shared/
│   └── test-fixtures/
├── scripts/
├── CLAUDE.md
├── SETUP.md
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

TypeScriptのmonorepoとし、pnpm workspacesで管理する。

## 6. 使用技術

- Node.js 22
- strict modeを有効にしたTypeScript
- pnpm workspaces
- Chrome Manifest V3
- PlaywrightおよびChromium
- Cloudflare Workers（Cron Triggersを含む）
- Cloudflare D1
- Wrangler
- Vitest
- Playwright Test
- ESLint
- Prettier
- API境界の実行時検証にZod
- XMLエスケープを行うサーバー側RSS 2.0生成

管理画面または拡張機能の画面が複雑になり、導入する根拠が明確になるまではReactを使用しないこと。初期版は依存関係の少ない構成を優先すること。

## 7. Visual Selectorの要件

### 7.1 Overlay

- 拡張機能専用のoverlay rootを一つだけ挿入する。
- 拡張機能側のUIとCSSはShadow DOMで分離することを優先する。
- 対象ページのclassおよびinline styleを変更しない。
- ページ上に固定表示するhighlight layerを使用する。
- scroll、resize、DOM位置変更時にhighlight領域を再計算する。
- hit testingでは拡張機能自身のUIを除外する。
- 選択モード終了時に、すべてのevent listenerとUIを確実に削除する。

### 7.2 選択操作

- Hover：現在の候補要素を強調表示する。
- Click：現在のモードに従ってSelectionを追加または置換する。
- Escape：キャンセルして選択モードを終了する。
- Enter：現在の候補を確定する。
- ArrowUp：親要素へ移動する。
- ArrowDown：移動履歴上の子要素へ戻る。
- ArrowLeftおよびArrowRight：前後の兄弟要素へ移動する。
- Delete：現在選択中の保存済みSelectionを削除する。
- ラベル付きの複数Selectionを登録できるようにする。
- ページ全体の監視は壊れやすいCSS Selectorを生成せず、document.documentElementを表す特別なselection typeとして保存する。

### 7.3 Selector生成

複数のCSS Selector候補を作り、次の優先順位で採点および検証する。

- 自動生成された値ではない、安定した一意のid
- data-testid、data-test、data-qa、業務上の識別子など、安定した一意のdata-*属性
- 意味が適切で安定しているARIA属性
- tag名と安定したclassの短い組み合わせ
- 安定した親要素と子要素の組み合わせ
- 他に安定した一意候補がない場合のみ:nth-of-type()

長いhash、UUIDに似た値、timestampに似た値、ページ再読み込みで変化する値など、自動生成された可能性が高いidまたはclass tokenは除外するか、大幅に減点する。

すべての候補をdocument.querySelectorAll()で検証する。

単一要素モードでは、該当件数が1件の候補を優先する。一覧モードでは、繰り返し構造を表す共通Selectorを作り、該当する全要素を表示する。

次の情報を保存する。

- 採用したCSS Selector
- Selector候補一覧
- 該当件数
- tag名
- 安定した属性
- class token
- 短いtext fingerprint
- 親要素のfingerprint
- 抽出方法
- 現在のプレビュー値

fingerprintは診断用とし、Selector失敗時に別の要素へ自動的に切り替える目的では使用しない。

### 7.4 抽出方法

- text：正規化したtextContent
- html：選択要素のinnerHTML。既定では無効とし、サイズ上限を設ける。
- attribute：明示的に選択した属性値
- link：絶対URLへ変換したhref
- image：絶対URLへ変換したsrcまたはcurrentSrc
- list：順序を保持した抽出項目の配列

### 7.5 正規化

テキストの既定処理は次のとおりとする。

- 改行されない空白を通常の空白へ変換する。
- ゼロ幅文字を削除する。
- 前後の空白を削除する。
- 連続する空白を一つにまとめる。比較用の値は改行も空白としてまとめるが、画面表示・RSS配信用の値は元のマークアップにある改行（一覧項目や段落の区切りなど）を保持し、行内の連続する空白だけをまとめる。ページの再描画による改行だけの差異が変更として誤検出されないようにするための区別であり、RSS descriptionや管理画面ではその改行を`<br/>`として表示する。
- 意味のある項目順を維持する。

追加設定として次を用意する。

- 最初の数値を抽出する。
- 通貨情報を保持しながら価格を解析する。
- 長さ制限を付けた正規表現を適用する。
- 指定した固定文字列を削除する。
- 大文字と小文字を区別せず比較する。

保存前に、画面表示値と比較用の正規化済み値を両方表示する。

## 8. 監視処理

### 8.1 実行頻度

- 確認間隔はMonitorごとに設定する（check_interval_sec、既定24時間=1日1回、最短1時間）。
- サーバー側（GitHub Actions Runner）とローカル側（Chrome拡張機能のバックグラウンドタブ）のどちらで確認するかをMonitorごとにexecution_modeで選択する。既定はserver。
- GitHub Actionsのscheduleは毎時実行し、Worker側（GET /api/runner/monitors）で確認期限が来たexecution_mode=serverのMonitorだけを実際に確認する間引き方式とする。
- execution_mode=localのMonitorは、Chromeが起動している間、拡張機能が同様の期限判定でバックグラウンドタブから確認する（GET /api/extension/monitors）。GitHub Actions Runnerはこれらを取得しない。
- 正確な実行時刻を保証しない。
- 手動実行用にサーバー側はworkflow_dispatchを用意する。ローカル側のMonitorは拡張機能のポップアップから個別に即時実行できる。
- 必要であれば0～30分のランダム遅延を設定可能にするが、既定では無効とする。

### 8.2 Browser設定

- 初期版はChromiumだけを使用する。
- 既定viewportは1440 x 1000とする。
- 既定localeはja-JPとする。
- 既定timezoneはAsia/Tokyoとする。
- 一般的で明示的なUser-Agentを使用し、stealth pluginを追加しない。
- domcontentloadedまで待機した後、設定されたSelectorが現れるまで上限付きで待機する。
- 1ページ当たりの既定timeoutは45秒とする。
- response sizeと全体実行時間に上限を設ける。
- 使用後はpageとbrowser contextを確実に閉じる。

### 8.3 状態コード

次の状態コードを全体で統一して使用する。

```
SUCCESS
HTTP_ERROR
TIMEOUT
BLOCKED
RATE_LIMITED
SELECTOR_NOT_FOUND
SELECTOR_NOT_UNIQUE
LOGIN_REQUIRED
CONTENT_TOO_LARGE
PARSER_ERROR
ERROR
```

取得失敗時は、確認情報と連続失敗回数だけを更新する。直近の正常値を上書きせず、変更履歴も作成しない。

### 8.4 基準値と変更判定

- 最初の正常結果は状態をBASELINEDとして保存し、RSS変更項目を作らない。
- 前回と同じ正常結果は、last_checked_atとlast_success_atだけを更新する。
- 前回と異なる正常結果は、変更履歴作成と現在状態更新を同一処理内で行う。
- 一意なresult keyまたはchange fingerprintを使用し、同じ結果の再送信でも重複登録しない。
- Selectionごとの旧値と新値を個別に記録する。
- 複数SelectionのMonitorでは、変更されたSelectionだけを含む一つの変更イベントを作成する。

### 8.5 取得失敗の通知

- 1回目の連続失敗：履歴へ保存するだけとする。
- 2回目の連続失敗：コンテンツ用Feedとは別のシステム用Feedへ警告を出せるようにする。
- 3回目以降：有効な警告を一つだけ維持し、毎日同じ警告を追加しない。
- 失敗後に正常取得へ戻った場合：警告を終了し、必要に応じて回復項目を一度だけ出す。

### 8.6 ハートビートと無音停止の検知

GitHub Actionsのscheduleは、リポジトリの活動が一定期間ないと自動的に停止する場合がある。監視自体が静かに止まると利用者が気づけないため、GitHub Actions側の実行に依存しない独立した稼働監視を設ける。

- Runnerは、日次実行および手動実行のたびに、実行の開始と完了をWorker APIへ通知する。Workerはsystem_stateにRunnerの最終正常実行時刻（last_runner_success_at）と最終実行時刻（last_runner_run_at）を記録する。
- Cloudflare WorkerのCron Triggerを、GitHub Actionsとは独立したwatchdogとして定期実行する。watchdogは対象サイトへアクセスせず、system_stateの時刻だけを確認する。
- 現在時刻とlast_runner_success_atの差が閾値（既定は26時間）を超える場合、システム用Feedへ稼働警告イベントを一つだけ作成する。閾値は1日1回運用に余裕を持たせた値とし、設定で変更できるようにする。
- 稼働警告が有効な間は、同じ警告を毎回追加しない。有効な警告を一つだけ維持する。
- Runnerが回復し、last_runner_success_atが再び新しくなった場合、稼働警告を終了し、回復イベントを一度だけ作成する。
- 稼働状態は`/health`でも返す。healthyまたはstaleを機械判定可能な形で示し、最終正常実行時刻を含める。
- ハートビートの停止検知は、コンテンツ変更の変更履歴（changes）とは別に扱う。稼働警告をコンテンツ変更として記録しないこと。

## 9. データモデル

D1 migrationで、少なくとも次のテーブルを作成する。

### feeds

```
id
name
slug
kind                     -- content または system
rss_token_hash           -- 平文は保存しない。ハッシュのみ保存する
rss_token_prefix         -- 表示用の短い先頭数文字（識別用途のみ）
rss_token_issued_at      -- 現行トークンの発行日時
rss_token_last_used_at   -- RSS取得時に更新
rss_token_status         -- active または revoked
enabled
created_at
updated_at
```

RSSトークンの平文は保存しない。発行時および再発行時にのみ利用者へ提示する。照合はハッシュで行う。1つのFeedにつき有効なトークンは常に1つとする。

### monitors

```
id
feed_id
name
url
monitor_mode
comparison_rule
execution_mode           -- server または local（既定server）
check_interval_sec       -- 確認間隔（秒）。既定86400、最短3600
group_name               -- 任意の分類名（NULL=未分類）
enabled
order_index
created_at
updated_at
```

### selections

```
id
monitor_id
label
selector_type
selector
selector_candidates_json
extraction_mode
attribute_name
normalization_json
match_mode
order_index
created_at
updated_at
```

### monitor_state

```
monitor_id
status
current_value_json
current_hash
last_checked_at
last_success_at
last_changed_at
consecutive_failures
last_error_code
last_error_message
updated_at
```

### checks

```
id
monitor_id
run_id
started_at
finished_at
status
duration_ms
http_status
result_hash
error_code
error_message
```

詳細な確認履歴は、既定で90日間保存する。

### changes

```
id
monitor_id
detected_at
change_type              -- CHANGED、ADDED、UPDATED、REMOVED、SYSTEM_ALERT、SYSTEM_RECOVERY
old_value_json
new_value_json
changed_selection_ids_json
change_fingerprint
guid
source_url
published
```

Monitor履歴、Feed変更一覧、GUIDおよびchange fingerprintの一意性に必要なindexを作成する。

### system_state

稼働監視の正本とする。単一行または少数行の状態テーブルとする。

```
id
last_runner_run_at        -- Runnerが最後に実行を通知した時刻
last_runner_success_at    -- Runnerが最後に正常完了した時刻
last_runner_run_id
heartbeat_threshold_sec   -- 無音停止とみなす閾値（既定26時間）
alert_status              -- healthy または stale
active_alert_change_id    -- 有効な稼働警告イベントのid
last_watchdog_checked_at  -- Worker cronが最後に確認した時刻
updated_at
```

### admin_sessions

管理画面のログインセッションを管理する。

```
id                        -- セッションid（ランダム値）
session_token_hash        -- セッショントークンのハッシュ。平文は保存しない
csrf_token_hash           -- CSRFトークンのハッシュ
created_at
last_seen_at
expires_at
revoked
user_agent_hash           -- 任意。診断用
```

セッショントークンおよびCSRFトークンの平文はCookieおよびレスポンスにのみ載せ、D1にはハッシュで保存する。

## 10. API要件

RSS以外のすべてのendpointは認証を必要とする。認証は要求元ごとに方式を分ける。

- 管理画面：HttpOnly Cookieのセッション。状態変更を伴う要求はCSRFトークンを検証する。
- Chrome拡張機能：Extension APIトークン（Bearer）。
- GitHub Actions Runner：Runner APIトークン（Bearer）。
- 3種類の秘密値は互いに別のものとし、用途を越えて共用しない。

初期endpointは次のとおりとする。

```
POST   /api/auth/login          -- 管理者ログイン。成功時にセッションCookieを発行
POST   /api/auth/logout         -- セッション失効
GET    /api/auth/session        -- 現在のセッション状態とCSRFトークンを返す

GET    /api/feeds
POST   /api/feeds               -- 作成時に平文RSSトークンを一度だけ返す
GET    /api/feeds/:id
PUT    /api/feeds/:id
DELETE /api/feeds/:id
POST   /api/feeds/:id/rotate-token   -- 現行トークンを失効し新トークンを発行。平文を一度だけ返す
POST   /api/feeds/:id/revoke-token   -- 現行トークンを失効する（新規発行しない）

GET    /api/monitors
POST   /api/monitors
GET    /api/monitors/:id
PUT    /api/monitors/:id
DELETE /api/monitors/:id
POST   /api/monitors/:id/enable
POST   /api/monitors/:id/disable
GET    /api/monitors/:id/history

GET    /api/runner/monitors
POST   /api/runner/results
POST   /api/runner/heartbeat    -- 実行の開始と完了を通知する

GET    /api/extension/monitors  -- execution_mode=localで確認期限が来たMonitor定義を返す
POST   /api/extension/results   -- 拡張機能によるローカル確認結果を送信する（Runner結果と同じ検証・変更検出処理）

GET    /rss/:token.xml
GET    /health                  -- 稼働状態（healthy / stale）と最終正常実行時刻を返す
```

- requestおよびresponseの構造を共通schemaで検証する。
- request bodyにサイズ上限を設ける。
- logから秘密値と機密headerを除外する。
- 保存時刻はUTCとし、表示時だけ必要なtimezoneへ変換する。
- 機械判定可能で安定したerror codeを返す。
- 秘密値の比較では、必要に応じてconstant-time comparisonを使用する。
- 管理用秘密値をRSS URLへ含めない。
- RSS tokenには十分に長いrandom valueを使用する。
- 認証失敗時は、方式ごとに一貫したステータスを返す。管理画面は401でログインへ誘導し、Bearer方式は401を返す。
- ログイン試行には簡易なレート制限を設ける。

## 11. RSS要件

- RSS 2.0形式とする。
- XML特殊文字を正しくescapeする。
- UTF-8を使用する。
- channelのtitle、link、description、last build dateを設定する。
- 変更イベントごとに一つのitemを作成する。
- GUIDはurn:web-monitor:change:<id-or-uuid>形式の安定した値とする。
- item titleにはMonitor名と変更種別を含める。
- descriptionには変更されたラベル、旧値、新値を含める。
- linkは元ページへ向ける。
- pubDateはRFC 822互換形式とする。
- 既定では最新20件を返す。
- ETag、Last-Modified、適切なCache-Controlを設定する。
- channelに`<ttl>`および`sy:updatePeriod`/`sy:updateFrequency`（Syndicationモジュール）を設定し、Feedに属する有効なMonitorのうち最短のcheck_interval_secに基づいた巡回間隔の目安をRSSリーダーへ示す（Monitorがない場合は既定値86400秒、システム用Feedはwatchdog cronと同じ1時間を用いる）。これらはRSSリーダー側の対応状況に依存するヒントであり、巡回頻度を保証するものではない。
- 条件に合う場合は304 Not Modifiedを返す。
- ページ全体HTML、Cookie、認証情報、機密性のあるrequest情報を含めない。
- 失効したトークンでのRSS取得は配信を拒否する。有効なトークンでの取得時はrss_token_last_used_atを更新する。
- システム用Feedでは、稼働警告と回復、および取得失敗の警告をitemとして配信する。稼働警告itemのGUIDはurn:web-monitor:system:<id-or-uuid>形式とする。

## 12. 管理画面およびWatchlist

管理画面はログイン後にのみ操作できる。未ログイン時はログイン画面へ誘導する。

次の情報と操作を表示する。

- Monitor名
- Feed
- 現在値の要約
- 現在状態
- 最終確認日時
- 最終成功日時
- 最終変更日時
- 連続失敗回数
- 実行方式（サーバー／ローカル）の切り替え
- 確認間隔の設定
- グループ（任意の分類名）の設定と、グループによる絞り込み
- 有効・無効の切り替え
- 元ページを開く
- 選択範囲を編集する（Chrome拡張機能のポップアップから対象ページを開いて編集する。Watchlist自体はSelectorの選び直しを行わない）
- 複数Monitorを選択した一括操作（有効化・無効化・実行方式変更・確認間隔変更・削除）
- 手動確認を要求する
- 変更履歴を表示する
- RSS URLをコピーする
- RSSトークンの再発行および失効
- システム稼働状態（healthy / stale）と最終正常実行時刻

次の状態を明確に区別して表示する。

- No change
- Not checked yet
- Check failed
- Selector not found
- Monitor disabled
- Possible outage（ハートビートがstale）

RSSトークンの再発行を行った場合、新しい平文トークンを一度だけ表示し、旧トークンは即時に無効になる旨を明示する。

## 13. セキュリティおよびプライバシー

個人専用であっても、次の対策を行う。

- 管理画面およびAPIを認証で保護する。
- 管理画面はHttpOnly、Secure、SameSite=LaxのCookieセッションで保護する。セッションには十分に長いrandom valueを使用し、有効期限を設ける。（当初はSameSite=Strictとしていたが、Chrome拡張機能のポップアップからのリンク遷移がcross-site起点のtop-level navigationとして扱われCookieが送られない問題があり、Laxへ変更した。Laxも状態変更を伴うリクエストへは付与されないためCSRF対策としては引き続き有効。）
- 状態変更を伴う管理画面の要求には、CSRFトークンの検証を行う。
- 管理者の認証情報（パスワードまたはログイントークン）はハッシュで保持し、平文を保存しない。ログイン試行にはレート制限を設ける。
- CORSは拡張機能originと設定済み管理画面originへ限定する。
- 拡張機能用tokenとRunner用tokenを検証し、互いに共用しない。
- RSSトークンはハッシュで照合し、平文を保存しない。失効したトークンは配信を拒否する。
- Monitor URLはhttp:およびhttps:だけを許可する。
- API検証でlocalhost、loopback、private、link-local、metadata addressを可能な範囲で拒否する。
- Runnerではredirect先も再検証する。
- 初期版では認証が必要なページを監視しない。
- 拡張機能から文書全体のHTMLを送信しない。
- 拡張機能のローカル確認は、execution_modeがlocalに設定されたMonitorのURLだけを対象とし、host_permissionsで許可された任意ページへの汎用的なアクセスを他の目的に使わない。
- Cookieおよびbrowser profileを保存しない。
- 通常logへ抽出内容を記録しない。
- GitHubおよびCloudflareの秘密値は、それぞれのsecret storeへ保存する。
- 実用上可能であればCIへsecret scanningを追加する。

## 14. 開発要件

### 14.1 共通command

rootのpackage.jsonに次を用意する。

```
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm ci
```

pnpm ciは、format確認、lint、型検査、unit test、build、安定したintegration testを実行する。

### 14.2 ローカル環境

- Worker開発ではWranglerのlocal D1を使用する。
- Selector testには結果が一定のlocal fixtureページを使用する。
- testを任意の外部Webサイトへ依存させない。
- 一つのFeedと代表的なMonitorのseed dataを用意する。
- Worker cron（watchdog）はローカルでも起動して動作を確認できるようにする。

### 14.3 必須test

- Selector候補生成
- 自動生成tokenの除外
- 一意要素および繰り返し一覧の判定
- 親、子、兄弟要素への移動
- 複数Selection
- テキスト正規化
- 価格および数値の正規化
- APIの入力検証と認証
- 管理画面のログイン、ログアウト、セッション失効、CSRF検証
- Extensionトークン、Runnerトークン、Cookieセッションの分離
- 基準値設定
- 変更履歴作成
- 同じ結果の再送信に対する重複防止
- 取得失敗時に直近正常値を上書きしないこと
- RSSトークンの発行、失効、再発行、失効トークンでの配信拒否
- ハートビート通知の記録と、閾値超過時の稼働警告作成
- 稼働警告の重複防止と、回復時の警告終了
- 稼働警告をコンテンツ変更として記録しないこと
- healthエンドポイントのhealthy / stale判定
- RSS XMLの妥当性、escape、安定GUID、ETag、304 response
- 空のD1に対するmigration
- Runnerのエラー分類
- Monitorごとの確認間隔（check_interval_sec）による間引き（due判定）の境界値
- execution_modeによるRunner向け・拡張機能向けMonitor一覧の振り分けと、それぞれのtoken分離
- 拡張機能のDOM抽出とRunnerのPlaywright抽出の結果整合性（同じstatus code・正規化）
- Monitor編集時、既存Selectionのidが保持され、編集していないSelectionが次回チェックで誤って変更ありと判定されないこと
- 一覧（配列）差分表示（追加・削除）がRSSと管理画面で一致すること

## 15. GitHub Actions

### 15.1 ci.yml

pull requestおよびpush時に次を実行する。

- Checkout
- Corepack有効化
- frozen lockfileを使用したpnpm依存関係の導入
- Playwright Chromiumと必要なsystem dependencyの導入
- pnpm ci

### 15.2 daily-monitor.yml

- cronで毎時実行する。実際のMonitorごとの確認頻度はWorker側の間引き（check_interval_sec）で決まる（§8.1）。
- 任意のMonitor IDを指定できるworkflow_dispatchを用意する。
- API base URLとRunner tokenはGitHub Secretsから読み込む。
- 同じschedule実行が重ならないようconcurrency groupを設定する。
- workflow全体にtimeoutを設定する。
- traceは失敗時だけ短期間保存する。
- 抽出したコンテンツを一般的なartifactとして保存しない。
- 実行の開始時にRunner APIへ開始ハートビートを送信し、完了時に完了ハートビートを送信する。
- 成功・失敗を含むすべての結果をRunner APIへ送信する。

GitHub scheduleの開始が指定時刻より遅れることは許容し、障害として扱わない。ただし、長期間にわたる無音停止はCloudflare Worker cronのwatchdogが検知する。

## 16. 実装順序

利用者から別の順序を指定されない限り、次の順序で実装する。

- Monorepo、Dev Container、format、lint、test、CI
- 共通schemaと型
- D1 migrationとWorker API
- 管理画面のCookieセッション認証と、拡張機能・Runnerのトークン認証
- RSSトークンの発行、失効、再発行
- RSS生成とtest
- fixtureページを使用するPlaywright Runner
- Runnerハートビートと、Worker cronによる稼働監視
- 基本的なChrome拡張機能と認証
- Visual Selector overlay
- Selector engineと候補採点
- 複数Selectionと一覧モード
- 管理画面とWatchlist（稼働状態表示とトークン操作を含む）
- 手動および日次GitHub Actions workflow
- Selection定義からRSS item生成までのend-to-end test

## 17. 完了条件

作業は、次のすべてを満たした場合にだけ完了とする。

- 依頼された動作を完全に実装している。
- 関係するtestを追加し、すべて成功している。
- format、lint、型検査が成功している。
- schema変更にはmigrationが含まれている。
- 認証、RSSトークン、ハートビートに関する変更にはテストが含まれている。
- 関係する文書が更新されている。
- 秘密情報および無関係な変更が含まれていない。
- このファイルの規則に従い、安全にcommitおよびpushしている。
- 最終報告に、変更内容、実行したtest、commit hash、push先branchを記載する。commitまたはpushができなかった場合は、その具体的な理由を記載する。
