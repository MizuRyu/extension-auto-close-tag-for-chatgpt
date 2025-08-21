// Options page script (MV3 CSP-safe, no inline script)
(function() {
  'use strict';

  const LS_KEY = 'acxt_prefs_v1';
  const defaults = { autoNewline: true, uppercaseEn: true };

  function hasChromeStorage() {
    return (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local);
  }

  function load(cb) {
    if (hasChromeStorage()) {
      try {
        chrome.storage.local.get(LS_KEY, (obj) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.warn('storage.get error', chrome.runtime.lastError);
            cb(defaults);
            return;
          }
          const v = (obj && obj[LS_KEY]) || defaults;
          cb(v);
        });
      } catch (e) {
        console.warn('storage.get exception', e);
        cb(defaults);
      }
    } else {
      try { cb(JSON.parse(localStorage.getItem(LS_KEY)) || defaults); } catch (e) { cb(defaults); }
    }
  }

  function save(v, cb) {
    if (hasChromeStorage()) {
      try {
        chrome.storage.local.set({ [LS_KEY]: v }, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.warn('storage.set error', chrome.runtime.lastError);
          }
          cb && cb();
        });
      } catch (e) {
        console.warn('storage.set exception', e);
        cb && cb(e);
      }
    } else {
      try { localStorage.setItem(LS_KEY, JSON.stringify(v)); cb && cb(); } catch (e) { cb && cb(e); }
    }
  }

  function $(id) { return document.getElementById(id); }

  const $newline = $('opt-newline');
  const $uppercase = $('opt-uppercase');
  const $save = $('save');
  const $toast = $('toast');

  function showToast() {
    $toast.classList.add('show');
    setTimeout(() => { $toast.classList.remove('show'); }, 1400);
  }

  load((v) => {
    $newline.checked = !!v.autoNewline;
    $uppercase.checked = !!v.uppercaseEn;
  });

  $save.addEventListener('click', () => {
    const v = { autoNewline: !!$newline.checked, uppercaseEn: !!$uppercase.checked };
    save(v, () => { showToast(); });
  });
})();
