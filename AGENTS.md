## 制約
適切な粒度でコミットするようにしてください。
- 粒度：**1論理変更=1コミット**（例：バグ修正1件、仕様追加1件、リファクタ1件は分割）。
    
- メッセージ：`type(scope): subject`（英語/日本語どちらでもOK、**主語省略の命令形**推奨、72字以内）。
    
- タイプ（許可）：`feat, fix, perf, refactor, docs, test, build, ci, chore, style, revert`
    
    - ＊`add` は使わず **`feat:`** に寄せる（「追加」は新機能扱い）。
        
- スコープ（推奨）：`content, manifest, composer, textarea, ce, infra, docs, test, ci`
    
# requirements.md

# ChatGPT Auto Close XML Tag — 要件定義

## 0. 概要
ChatGPT のチャット入力欄で `<tag>` とタイプした瞬間に `</tag>` を自動挿入する Chrome 拡張（Manifest V3）のMVP。  
VSCode の *Auto Close Tag* に近い体験を、ChatGPTの「入力欄」だけに限定して提供する。

## 1. スコープ
- 対象サイト: `https://chat.openai.com/*` および `https://chatgpt.com/*`
- 対象エリア: **チャット入力欄のみ**（ChatGPTの unified-composer 配下、ProseMirror か fallback textarea）
- 対象ブラウザ: **Google Chrome**（Edge/Firefoxは将来対応）
- 対象記法: **XML/HTML風タグのみ**（MVPでは属性なし `<tag>` のみを対象）

## 2. ユースケース（ユーザーストーリー）
- U1: ユーザーが `… <xml>` とタイプして `>` を押すと、即座に `</xml>` が自動挿入され、キャレットは `>` の直後に置かれる。
- U2: すでに直後に `</xml>` が存在する場合、**重複挿入しない**。
- U3: `Backspace` で直前の `<xml>` を削除すると、**直後の `</xml>` も一括削除**される（VSCode風）。
- U4: **ペースト**や**日本語IME変換中**では**発火しない**（予期せぬ補完を防ぐ）。
- U5: `br`/`img`/`input` 等の **空要素（void elements）** には閉じタグを挿入しない。
- U6: Markdown コードブロック内でも **有効**（ChatGPT入力は自由記述であり、抑止しない）。

## 3. 機能要件（Functional Requirements）
- FR-1: `beforeinput` の `insertText` かつ `data === '>'` のときのみ発火。
- FR-2: 直前テキスト末尾が **`<([A-Za-z][\w:-]*)$`** にマッチした場合のみ対象（= 属性なし）。
- FR-3: VOID_TAGS（`area, base, br, col, embed, hr, img, input, link, meta, param, source, track, wbr`）は**補完しない**。
- FR-4: 直後に `</tag>` が連続している場合は**補完をスキップ**。
- FR-5: カーソルは必ず `>` の直後に移動。
- FR-6: `Backspace` 押下時、直前が `>` で、`<tag>` 完了直後 + 後続が `</tag>` なら、**`>` と `</tag>` をまとめて削除**。
- FR-7: 対象DOMは **ChatGPTの入力欄に限定**（`form[data-type="unified-composer"]` 直下の `[contenteditable="true"]` or `textarea`）。
- FR-8: 拡張は**外部通信なし**、テレメトリなし。

## 4. 非機能要件（NFR）
- NFR-1: 入力遅延ゼロ（処理は1フレーム内・軽量正規表現1回）。
- NFR-2: Undo/Redo: `>` 挿入と `</tag>` 追加を**1操作**として取り消せる体感（OS/ブラウザ標準の履歴に沿う）。
- NFR-3: セキュリティ: 最小 `host_permissions` のみ、Storageは未使用（MVP）。
- NFR-4: プライバシー: 取得・送信データなし。

## 5. 制約・前提
- ProseMirror配下では内部DOMが分割される可能性があるため、MVPでは**簡易実装**（テキストベースの近似・`execCommand` 併用）を許容。
- 将来、DOM構造が変更されるリスクに備え、必要に応じて `MutationObserver` を導入可能。

## 6. 受け入れ基準（Acceptance Criteria）
- AC-1: `<xml>` タイプ後の `>` 入力で即時に `</xml>` が自動追記される（キャレットは `>` の直後）。
- AC-2: `<xml/>` のような自己終了のケースでは**追加しない**（= 属性対応外によりそもそも対象外）。
- AC-3: 直後が既に `</xml>` のときは**重複しない**。
- AC-4: `Backspace` で `<xml>` を消すと、**隣接の `</xml>` も同時に消える**。
- AC-5: IME変換中（`isComposing === true`）やペーストでは**発火しない**。
- AC-6: VOID_TAGS は閉じタグを出さない。
- AC-7: 対象エリア外（別入力欄など）では発火しない。

## 7. アウトオブスコープ（MVPでは非対応）
- `<tag attr="…">` の**属性ありタグ**検知・補完
- 括弧/クォートの自動補完
- ドメイン拡張、Edge/Firefox対応
- 設定UI（オプションページ）

## 8. メタ情報
- 製品名: **ChatGPT Auto Close XML Tag**
- バージョン: 0.1.0
- ライセンス: MIT（予定）

---

# architect.md

## 0. 目的
ChatGPT の入力欄（unified-composer）でのみ、`>` 入力時に直前の `<tag>` を検出して `</tag>` を自動付与。VSCode風操作感（重複抑止・ペア削除・Undo一体化）をMVPで再現する。

## 1. アーキテクチャ概要
- **Manifest V3 / Content Script 単体**
  - `manifest.json` … 権限最小、対象ドメイン限定
  - `content.js` … 入力欄のイベントをフックし、補完/削除を実行
- **データ保存/外部通信なし**（完全ローカル）

### 1.1 ディレクトリ構成（例）
```
/ (root)
  ├─ manifest.json
  ├─ content.js
  ├─ icons/              # 任意
  └─ README.md
```

## 2. 対象DOMの特定
- 祖先に `form[data-type="unified-composer"]` を持つ要素のみ対象。
- 編集領域（2025-08 時点）:
  - ProseMirror: `[contenteditable="true"]`（`#prompt-textarea` or `.ProseMirror`）
  - Fallback: `textarea._fallbackTextarea_*`
- `inChatComposer(target)` 判定:
  1. `target.closest('form[data-type="unified-composer"]')` が存在  
  2. かつ `target.closest('[contenteditable="true"], textarea')` が存在

## 3. イベント設計
### 3.1 自動補完（`>` 入力）
- `document.addEventListener('beforeinput', handler, { capture: true })`
- 条件:
  - `e.inputType === 'insertText' && e.data === '>'`
  - `!e.isComposing`
  - `inChatComposer(e.target)`
- 検出ルール（属性なしタグのみ）:
  - 直前テキストの最後の `<` 以降に `^<([A-Za-z][\w:-]*)$` が合致
- VOID判定:
  - `area, base, br, col, embed, hr, img, input, link, meta, param, source, track, wbr` は補完しない
- 重複抑止:
  - 直後テキストが `</tag>` と一致すれば `>` のみ挿入
- 挿入 & キャレット:
  - textarea: `setRangeText('>' + closing, start, end, 'end')` → `setSelectionRange(start+1, start+1)`
  - contenteditable: Range に `>` と `</tag>` を TextNode で挿入し、選択を `>` 直後へ

### 3.2 ペア削除（`Backspace`）
- `document.addEventListener('keydown', handler, { capture: true })`
- 条件:
  - `e.key === 'Backspace'`
  - `!e.isComposing`
  - `inChatComposer(e.target)`
- textarea:
  - 直前が `>`、かつ直前の `<tag>` が完結、直後が `</tag>` → `>` + `</tag>` を一括削除
- contenteditable:
  - ProseMirrorのDOM分割を考慮し、MVPは `document.execCommand('delete')` を利用した簡易連続削除
  - 将来は Range を正確に再構築して安全に削除

### 3.3 Undo/Redo の一体化
- 自動補完は `beforeinput` で **1回の `preventDefault` + 自前挿入** にまとめる
- ペア削除は `keydown` で **1操作**に集約

### 3.4 IME/ペースト
- `isComposing === true` の間は**処理しない**
- ペースト（`insertFromPaste`）は今回のフック条件外（将来拡張時に弾くガードを追加可能）

## 4. 解析アルゴリズム
### 4.1 タグ検出（MVP）
- caret直前テキストから最後の `<` を見つけ、以降に `^<([A-Za-z][\w:-]*)$` を適用
- 空白が含まれる（属性の兆候）場合は**対象外**

### 4.2 重複抑止
- 直後テキスト `N = len(</tag>)` 文字を読み、完全一致ならスキップ

## 5. VOID タグ
- `area, base, br, col, embed, hr, img, input, link, meta, param, source, track, wbr`
- 比較は小文字化したタグ名で行う（`tag.toLowerCase()`）

## 6. セキュリティ/権限
- `host_permissions`: `https://chat.openai.com/*`, `https://chatgpt.com/*`
- `permissions`: なし（MVP）
- 外部通信: なし（完全ローカル）

## 7. パフォーマンス
- 1キー押下あたり: 末尾 `<` 探索 + 短い正規表現1回 + 近接文字列比較
- DOM操作は `>` と `</tag>` の挿入/削除のみ（最小限）

## 8. テスト戦略
- 手動E2E（受け入れ基準に対応）
  - `<xml>` → `>` で `</xml>` 付与 & カーソル位置
  - 重複抑止・VOIDタグ非付与
  - Backspace の一括削除（textarea / contenteditable）
  - IME中・ペースト時に非発火
  - Markdown 内でも発火すること
- DOM変更時の回帰チェック：主要セレクタの見直し

## 9. 将来拡張
- 属性ありタグ解析（`<tag attr="…">`）、自己終了タグ
- 括弧/クォート補完・一時無効化ショートカット
- オプションページ（ドメイン追加、VOID_TAGS編集）
- MutationObserver によるエディタ差し替え検出
- Edge/Firefox 対応（MV3互換）

## 10. メタ
- 名称: **ChatGPT Auto Close XML Tag**
- バージョン: 0.1.0
- ライセンス: MIT（予定）


# tasks.md

# ChatGPT Auto Close XML Tag — タスク分解

## 0. ゴール
MVPを実装・動作確認できる Chrome 拡張（MV3）を作成し、ChatGPT入力欄で VSCode風の自動閉じタグ体験を提供する。

## 1. 作業ブレークダウン（WBS）
### M1. プロジェクト雛形
- [ ] `manifest.json`（MV3）作成
  - `host_permissions`: `https://chat.openai.com/*`, `https://chatgpt.com/*`
  - `content_scripts`: `matches`・`content.js`・`run_at: document_idle`
- [ ] ディレクトリ構成作成
  - `/src/content.ts`（任意）→ `/dist/content.js`（ビルドなしなら `/content.js`）
  - アイコン（任意）

### M2. DOM スコープ検出
- [ ] 入力対象の限定ロジックを実装
  - 祖先に `form[data-type="unified-composer"]` を持つか
  - `[contenteditable="true"]`（`#prompt-textarea` や `.ProseMirror`）または `textarea._fallbackTextarea…`
- [ ] 将来変更に備え、セレクタは複数併用（ID/クラス/属性）

### M3. 自動閉じタグ（`>` 入力時）
- [ ] `beforeinput` で `insertText` かつ `data === '>'` をフック
- [ ] 直前テキストに対し `<([A-Za-z][\w:-]*)$` を評価（属性なしのみ）
- [ ] VOID_TAGS の場合は補完スキップ
- [ ] 直後のテキストが `</tag>` と一致すれば重複スキップ
- [ ] `>` と `</tag>` を挿入、キャレットを `>` の直後へ

### M4. ペア削除（`Backspace`）
- [ ] `keydown` で `Backspace` をフック
- [ ] テキストエリア: 直前が `>` かつ `<tag>` 完了・直後が `</tag>` なら `>` + `</tag>` を一括削除
- [ ] contenteditable: ProseMirror考慮の簡易実装（`execCommand('delete')` 連続）でMVP対応
- [ ] Undo/Redo を1操作に収めるよう、**1ハンドラ内で一括処理**

### M5. IME/ペースト対策
- [ ] `e.isComposing` を必ず考慮（IME変換中は非発火）
- [ ] `beforeinput` の `insertFromPaste` などは無視（今回の条件ではそもそも入らない前提）

### M6. QA（受入テスト）
- [ ] 受け入れ基準（AC-1〜AC-7）に沿って手動テスト
- [ ] textarea / contenteditable 両方で確認
- [ ] 各種タグ（通常/void）ケース確認
- [ ] 直後に `</tag>` があるケース、IME中、ペースト時、Markdown内を確認

### M7. 配布準備
- [ ] `README.md`（使い方: `chrome://extensions` での読み込み手順）
- [ ] アイコン（任意）・バージョニング・MIT LICENSE

## 2. リスク & 対応
- R1: ChatGPT の DOM 変更 → セレクタの複線化と将来の `MutationObserver` 導入余地を確保
- R2: ProseMirror のテキスト境界差異 → MVPは `execCommand` 併用、将来は Range 精密化
- R3: 他拡張との競合 → `capture:true` のイベント優先度や短絡 return の徹底

## 3. 将来の拡張タスク（任意）
- [ ] 属性あり `<tag attr>` 対応
- [ ] 括弧/クォート自動補完
- [ ] 一時無効化ショートカット（例: `Alt+M`）
- [ ] オプションページ（対象ドメインの追加、VOID_TAGS 編集）
- [ ] Edge/Firefox 互換調整（MV3互換・API差分吸収）

## 4. Done の定義
- [ ] AC-1〜AC-7を満たす
- [ ] 手元で ChatGPT 入力欄にて動作確認済み
- [ ] 外部送信なし・権限最小で審査に耐える構成


