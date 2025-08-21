(() => {
  'use strict';

  // 閉じタグ不要のVOID element
  const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  // 開始タグ検出（Attr, Unicode は対応）
  const OPENING_TAG_FRAGMENT_RE = new RegExp('^<\\s*([\\p{L}\\p{N}_:-][\\p{L}\\p{N}_\\-.:-]*)([^>]*)$', 'u');
  const OPEN_TAG_COMPLETE_RE = new RegExp('^<\\s*([\\p{L}\\p{N}_:-][\\p{L}\\p{N}_\\-.:-]*)([^>]*)>$', 'u');

  // 直近のeditable要素を取得
  function getNearestEditable(el) {
    if (!el) return null;
    let node = el.nodeType === Node.ELEMENT_NODE ? el : el.parentElement;
    while (node && node !== document.documentElement) {
      if (node.tagName === 'TEXTAREA') return { type: 'textarea', el: node };
      if (node.isContentEditable) return { type: 'contenteditable', el: node };
      node = node.parentElement;
    }
    return null;
  }

  // unified-composer 配下かどうか
  function isInChatGPTComposer(editableEl) {
    const form = editableEl.closest && editableEl.closest('form[data-type="unified-composer"]');
    if (!form) return false;
    const targetEditable = editableEl.closest && editableEl.closest('[contenteditable="true"], textarea');
    return !!targetEditable;
  }

  // local Storage から設定読み込み
  const LS_KEY = 'acxt_prefs_v1';
  const defaultPrefs = { autoNewline: true, uppercaseEn: true };
  let prefs = { ...defaultPrefs };
  (function loadPrefs() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(LS_KEY, (obj) => {
          const v = obj && obj[LS_KEY];
          if (v && typeof v === 'object') prefs = Object.assign({}, defaultPrefs, v);
        });
        chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes[LS_KEY]) {
            const v = changes[LS_KEY].newValue;
            if (v && typeof v === 'object') prefs = Object.assign({}, defaultPrefs, v);
          }
        });
      } else {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) prefs = Object.assign({}, defaultPrefs, JSON.parse(raw));
      }
    } catch (_) { }
  })();

  // '>' で自動クローズ
  function onBeforeInput(e) {
    if (e.isComposing) return;
    if (e.inputType !== 'insertText') return;
    if (e.data !== '>') return;

    const editable = getNearestEditable(e.target);
    if (!editable) return;
    if (!isInChatGPTComposer(editable.el)) return;

    if (editable.type === 'textarea') {
      const ta = editable.el;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);

      const lt = before.lastIndexOf('<');
      if (lt === -1) return;
      const openTail = before.slice(lt);
      const m = OPENING_TAG_FRAGMENT_RE.exec(openTail);
      if (!m) return;
      const origName = m[1];
      let name = origName;
      const attrs = m[2] || '';
      if (/\/\s*$/.test(attrs)) return; // self-closing 進行中
      if (VOID_TAGS.has(name.toLowerCase())) return;

      // 直後に重複閉じタグがあればスキップ
      const hasDup = after.toLowerCase().startsWith(`</${origName.toLowerCase()}>`);

      // option: 英字タグのみ大文字化
      if (prefs.uppercaseEn && /[A-Za-z]/.test(name)) name = name.toUpperCase();

      e.preventDefault();
      e.stopPropagation();

      const rebuiltOpen = `<${name}${attrs}`; // <TAG id=""
      // '<' から選択末尾までを置換し、'>' を挿入
      ta.setRangeText(rebuiltOpen + '>', lt, end, 'preserve');
      const caretAfterGt = lt + rebuiltOpen.length + 1;
      // option: 改行, 閉じタグ付加
      if (!hasDup) {
        const tail = (prefs.autoNewline ? '\n\n' : '') + `</${name}>`;
        ta.setRangeText(tail, caretAfterGt, caretAfterGt, 'preserve');
      }
      // Newline ON: 空行の先頭、OFF: '>' 直後にカーソルを移動
      const caretPos = caretAfterGt + (prefs.autoNewline && !hasDup ? 1 : 0);
      ta.setSelectionRange(caretPos, caretPos);
      return;
    }

    if (editable.type === 'contenteditable') {
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed) return;
      const anchorNode = sel.anchorNode;
      let ctxText = null;
      let afterText = '';
      if (anchorNode && anchorNode.nodeType === Node.TEXT_NODE) {
        const t = anchorNode.textContent || '';
        ctxText = t.slice(0, sel.anchorOffset);
        afterText = t.slice(sel.anchorOffset);
      }
      if (ctxText == null) return;

      const lt = ctxText.lastIndexOf('<');
      if (lt === -1) return;
      const openTail = ctxText.slice(lt);
      const m = OPENING_TAG_FRAGMENT_RE.exec(openTail);
      if (!m) return;
      const origName = m[1];
      let name = origName;
      const attrs = m[2] || '';
      if (/\/\s*$/.test(attrs)) return;
      if (VOID_TAGS.has(name.toLowerCase())) return;

      const hasDup = afterText.toLowerCase().startsWith(`</${origName.toLowerCase()}>`);
      if (prefs.uppercaseEn && /[A-Za-z]/.test(name)) name = name.toUpperCase();

      e.preventDefault();
      e.stopPropagation();

      const rebuiltOpen = `<${name}${attrs}`;
      try {
        // 1) 開始タグを置換し、'>' を挿入
        const r = document.createRange();
        r.setStart(anchorNode, lt);
        r.setEnd(anchorNode, sel.anchorOffset);
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand('insertText', false, rebuiltOpen);
        // 2) '>' をタイプして現在位置を保存
        document.execCommand('insertText', false, '>');
        const savedSel = window.getSelection();
        let savedRange = null;
        if (savedSel && savedSel.rangeCount) savedRange = savedSel.getRangeAt(0).cloneRange();
        // 3) 必要なら改行と閉じタグを追記
        if (!hasDup) {
          const tail = (prefs.autoNewline ? '\n\n' : '') + `</${name}>`;
          document.execCommand('insertText', false, tail);
        }
        // 4) '>' 直後に復帰（Newline ON時は1文字進めて空行先頭へ）
        if (savedRange) {
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(savedRange);
          if (prefs.autoNewline && !hasDup) {
            try { s.modify && s.modify('move', 'forward', 'character'); } catch (_) { }
          }
        }
      } catch (_) {
        // まとめて挿入
        const insert = '>' + (!hasDup ? (prefs.autoNewline ? '\n\n' : '') + `</${name}>` : '');
        document.execCommand('insertText', false, insert);
      }
    }
  }

  // Backspace: Delete Pair Tag
  function onKeydown(e) {
    if (e.key !== 'Backspace' || e.isComposing) return;
    const editable = getNearestEditable(e.target);
    if (!editable) return;
    if (!isInChatGPTComposer(editable.el)) return;

    if (editable.type === 'textarea') {
      const ta = editable.el;
      if (ta.selectionStart !== ta.selectionEnd) return;
      const pos = ta.selectionStart;
      if (pos <= 0) return;
      const v = ta.value;
      if (v[pos - 1] !== '>') return;
      const lt = v.lastIndexOf('<', pos - 1);
      if (lt === -1) return;
      const openFrag = v.slice(lt, pos);
      const m = OPEN_TAG_COMPLETE_RE.exec(openFrag);
      if (!m) return;
      const name = m[1];
      const attrs = m[2] || '';
      if (/\/\s*$/.test(attrs)) return;
      if (VOID_TAGS.has(name.toLowerCase())) return;
      const close = `</${name}>`;
      const after = v.slice(pos);
      if (!after.startsWith(close)) return;

      e.preventDefault();
      e.stopPropagation();
      // '>' 直前から閉じタグ末尾までを一括削除（1操作）
      ta.setRangeText('', pos - 1, pos + close.length, 'start');
      return;
    }

    if (editable.type === 'contenteditable') {
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed) return;
      const node = sel.anchorNode;
      const off = sel.anchorOffset;
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      const text = node.textContent || '';
      if (off <= 0 || text[off - 1] !== '>') return;
      const lt = text.lastIndexOf('<', off - 1);
      if (lt === -1) return;
      const openFrag = text.slice(lt, off);
      const m = OPEN_TAG_COMPLETE_RE.exec(openFrag);
      if (!m) return;
      const name = m[1];
      const attrs = m[2] || '';
      if (/\/\s*>$/.test(openFrag)) return;
      if (VOID_TAGS.has(name.toLowerCase())) return;
      const close = `</${name}>`;
      const after = text.slice(off);
      if (!after.startsWith(close)) return;

      e.preventDefault();
      e.stopPropagation();
      try {
        const r = document.createRange();
        r.setStart(node, off - 1);
        r.setEnd(node, off + close.length);
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand('delete');
      } catch (_) { }
    }
  }

  // Listener登録（capture: true で他拡張より先に hook する）
  document.addEventListener('beforeinput', onBeforeInput, { capture: true });
  document.addEventListener('keydown', onKeydown, { capture: true });
})();
