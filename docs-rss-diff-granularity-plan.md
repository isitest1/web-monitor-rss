# RSS / 履歴の差分粒度を distill 相当にする改修計画

決定日: 2026-09-14 / 状態: 未着手（方針合意済み）

## 背景・症状

RSS の `<description>` で、実際は 1 単語 / 1 行しか変わっていないのに、
セクションや段落がまるごと「変更あり」として赤黒く表示される。

実例:
- `…/rss/3dHS3lnWYNnxpamRQzmAtTJkCoO1cm-zuDiIG51vsFw.xml`（パーティアニマルズ）
- `…/rss/PAnEdjbIv2TR03VareoW03eVZNWeOi55PdQC3yurzHw.xml`（EMA GVP）

## 原因

`packages/shared/src/diff-scalar.ts` の `diffScalarText()` は
**共通接頭辞と共通接尾辞をトリムするだけ**の実装で、変更箇所を
1 つの連続ブロックとしてしか表現できない。

```
old: AAAA XXXX BBBB YYYY CCCC
new: AAAA ZZZZ BBBB YYYY CCCC   実際に変わったのは XXXX→ZZZZ だけ
     ^^^^                ^^^^^  共通接頭/接尾はここまでしか伸びない
     → removed = "XXXX BBBB YYYY" / added = "ZZZZ BBBB YYYY"
```

付随する問題:

1. `normalizeDisplay()` は改行を保存しているのに、diff 側が `\n` を無視して
   1 本の文字列として扱っており、「行」という使える単位を捨てている。
   イベント一覧から 1 ブロック消えて以降がシフトすると、間の数十行が
   丸ごと 1 つの Removed になる（パーティアニマルズの症状）。
2. 改行を含まない長文（EMA GVP）では文の区切りすら見ていないので、
   段落まるごと 1 ブロック扱いになる。
3. 語単位の粒度が一切ない。
4. list モード (`diffArrayValues`) は完全一致の集合差分なので、
   項目内の 1 文字変更が「項目まるごと削除 + まるごと追加」になる。

## 方針: 階層 diff（distill 相当）

### 段階 1 — 行単位 LCS diff
`displayValue` を `\n` で分割し、真の LCS（Myers 差分）を取る。
変更のある hunk だけを出力し、未変更の連続行は `… (N 行省略)` に畳む。
改行が 1 つも無いテキストは、代わりに文区切り（`。！？.!?`）で
疑似的な行に分割してから同じ処理へ。

**前後コンテキストは 5 行**（ユーザー決定 2026-09-14）。

### 段階 2 — hunk 内の行ペアリング + 語単位 diff
同じ hunk 内の削除行と追加行を類似度（共通トークン率）で 1:1 にマッチさせ、
似ている組は 2 行に分けず 1 行として表示し、変わった語だけをハイライトする。
これが distill の見た目そのもの。

### 段階 3 — 日本語対応トークナイザ
`Intl.Segmenter('ja', { granularity: 'word' })`（Workers ランタイムで利用可）を
第一候補に、無い環境向けに「CJK は 1 文字 / ラテンは単語 / 空白・記号は区切り」の
正規表現フォールバック。jsdiff の `diffWords` は空白分割なので日本語では
1 トークンになり使えない。

### 実装形
汎用の `diffSequence<T>(a, b): Op[]`（Myers O(ND)、約 80 行）を 1 つ書いて、
**行にもトークンにも使い回す**。依存追加なし。

Worker の CPU 時間対策:
- 先に共通接頭/接尾をトリム
- トークン数と編集距離 D に上限を設け、超えたら現行の粗い表示へフォールバック

### 副次的な改善
`new_only` モードは現在「新しい値の全文」を出しているが、行 diff 導入後は
「追加された行だけ」になり大幅に見やすくなる。

## 影響範囲

- 新規 `packages/shared/src/diff-text.ts`（sequence diff + tokenizer + hunk 構築）
- `packages/shared/src/diff-scalar.ts` を置き換え
- `packages/shared/src/change-line.ts` の `formatScalarDiffHtml` を書き直し
- RSS (`apps/worker/src/rss/generate.ts`) と管理画面履歴
  (`apps/worker/src/admin/pages/monitor-history.ts`) は既に共有関数
  `formatChangeLineHtml` 経由なので **両方同時に直る**
- テスト: `diff-text.test.ts` 新規、`diff-scalar.test.ts` /
  `change-line.test.ts` / `apps/worker/tests/rss-xml.test.ts` を更新

## 移行

RSS は D1 に保存済みの old/new displayValue から **リクエスト時に** 生成しているため
マイグレーション不要。デプロイした瞬間に過去アイテムも新表示になる。
guid は不変なのでリーダーが再通知することもない。

デプロイ手順は CLAUDE.md §2 のとおり
（`wrangler d1 migrations apply --remote` + `:production` スクリプトで deploy）。

## 対象外（決定 2026-09-15）

- **list モード (`diffArrayValues`) は変更しない。** 完全一致の集合差分のままとし、
  項目内の 1 文字変更が「項目まるごと削除 + まるごと追加」になる挙動も現状維持。
  今回の改修は scalar（`displayValue` が文字列）の Selection のみを対象とする。
  `formatChangeLineHtml` の配列分岐には手を入れないこと。
