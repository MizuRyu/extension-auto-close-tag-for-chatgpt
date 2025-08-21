# ChatGPT Auto Close XML Tag — 仕様（確定版）

## 1. 概要
ChatGPT のチャット入力欄（unified-composer）で、`>` 入力時に直前の `<tag ...>` を検出し、必要に応じて `</tag>` を自動挿入する拡張（Manifest V3）。VSCode 風の操作感（重複抑止・ペア削除・Undo一体化）を実現する。

## 2. 対象範囲
- ドメイン: `https://chat.openai.com/*`, `https://chatgpt.com/*`
- エリア: `form[data-type="unified-composer"]` 配下の `[contenteditable="true"]` または `textarea`
- ブラウザ: Google Chrome（MV3）

## 3. 機能詳細
- 自動補完（>` 入力）
  - beforeinput の `insertText` かつ `data==='>'` をフック
  - 日本語IME中（`isComposing===true`）は非発火
  - 直前テキストの最後の `<` 以降を解析し、以下に一致した場合のみ対象
    - 開始タグ正規表現（属性許可・Unicode対応）: `^<\\s*([\\p{L}\\p{N}_:-][\\p{L}\\p{N}_\\-.:-]*)([^>]*)$`（uフラグ）
  - VOID タグ（`area, base, br, col, embed, hr, img, input, link, meta, param, source, track, wbr`）は補完しない
  - Self-closing 進行中（`... /` で終わる）場合は補完しない
  - 直後がすでに `</tag>` の場合は重複挿入しない（大小無視）
  - 文字挿入は1ハンドラ内で完結し、Undo/Redoは1操作となる
- ペア削除（Backspace）
  - 直前が `>` かつ、直前の開始タグが完結しており（`^<...>$`）、直後が対応する `</tag>` の場合、`>` と `</tag>` を一括削除（1操作）
  - textarea は `setRangeText`、contenteditable は `Range + execCommand('delete')`

## 4. オプション（拡張機能の設定）
- 設定は `chrome.storage.local`（キー: `acxt_prefs_v1`）に保存し、content script が読み込む
- オプションページ（`options.html`）から設定可能
- 項目:
  - Newline（既定: ON）: `>` 入力時に開閉タグの間へ空行を追加し、キャレットを空行の先頭へ移動
  - Uppercase（既定: ON）: 英字タグ名を大文字化（閉じタグは常に大文字化。開きタグ名は可能な範囲で大文字化）

## 5. 非機能要件
- 入力遅延ゼロ: 1フレーム内で完結、正規表現1回＋最小限の置換
- セキュリティ/プライバシー: 外部通信なし、収集データなし
- 権限: `storage` のみ

## 6. 制限・既知の注意
- ProseMirror 上の contenteditable では内部ノード分割の影響で、極端なケースでキャレット移動が期待どおりでない場合あり（MVP許容）
- `<>`（タグ名なし）は対象外
- Self-closing（`<tag .../>`）は対象外

## 7. ファイル構成
- `manifest.json`: MV3、content_scripts、optionsページ、permissions
- `content.js`: 自動補完、ペア削除、設定読み込み（storage / localStorage）
- `options.html`: 設定UI（Newline/Uppercase）
- `README.md`: セットアップ・使い方
- `docs/TESTING.md`: テスト手順（AC/オプション含む）
- `docs/design.md`: 本ドキュメント（仕様）
- `tests/harness.html`: 簡易ブラウザテストハーネス

## 8. 受け入れ基準（抜粋）
- `<tag` + `>` で `</tag>` が自動挿入、Newline ON なら `<tag>\n\n</tag>` となりキャレットは空行先頭
- 直後に既存 `</tag>` があれば重複しない（Newline も追加しない）
- `Backspace` で `>|</tag>` を1回で削除
- IME中・ペーストでは非発火
- VOIDタグは補完しない
