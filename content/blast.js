/*
 * blast.js — runs on https://ngphylogeny.fr/blast*
 *
 * If the popup left a pending FASTA (a single sequence), this script pastes
 * it into the query field of the Blast form. It NEVER clicks a submit
 * button: the user checks the form, then starts the search themselves.
 */
(async () => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;

  // ---- Settings: adjust if the site changes ---------------------------------
  const CONFIG = {
    // If the heuristic cannot find the field, inspect it (right-click >
    // Inspect) and put its CSS selector here, e.g. '#id_input_data'.
    textareaSelector: null,
    labelPattern: /s(e|é)quence|query|pasted\s*text/i, // label of the query field
    timeoutMs: 15000,               // max time to wait for the form
    maxAgeMs: 5 * 60 * 1000,        // a pending FASTA expires after 5 min
  };
  // ---------------------------------------------------------------------------

  const KEY = 'ngphyloPending';

  const visible = (el) => !!el && el.getClientRects().length > 0;

  function nearestTextarea(el) {
    let node = el;
    for (let i = 0; i < 4 && node; i += 1, node = node.parentElement) {
      const ta = node.querySelector && node.querySelector('textarea');
      if (ta) return ta;
    }
    return null;
  }

  function findTextarea() {
    // 1. Explicit selector
    if (CONFIG.textareaSelector) {
      const el = document.querySelector(CONFIG.textareaSelector);
      if (el) return el;
    }
    // 2. "Sequence" / "Query" label
    const labels = document.querySelectorAll('label, legend, strong, span, h4, h5, h6, th, dt');
    for (const lab of labels) {
      const txt = (lab.textContent || '').trim();
      if (txt.length > 40 || !CONFIG.labelPattern.test(txt)) continue;
      if (lab.control && lab.control.tagName === 'TEXTAREA') return lab.control;
      const ta = nearestTextarea(lab);
      if (ta) return ta;
    }
    // 3. id / name / placeholder attributes
    const all = Array.from(document.querySelectorAll('textarea'));
    const byAttr = all.find((t) =>
      /seq|query|blast|fasta|past|input|data|text/i.test(`${t.id} ${t.name} ${t.placeholder}`));
    if (byAttr) return byAttr;
    // 4. A single <textarea> on the page
    return all.length === 1 ? all[0] : null;
  }

  /** If the field is hidden (tab, radio button, dropdown), reveal it. */
  function revealPastedText() {
    const P = CONFIG.labelPattern;

    for (const r of document.querySelectorAll('input[type=radio]')) {
      const lab = (r.labels && r.labels[0]) ? r.labels[0].textContent
        : (r.parentElement ? r.parentElement.textContent : '');
      if (P.test(lab) && !r.checked) { r.click(); return true; }
    }
    for (const sel of document.querySelectorAll('select')) {
      for (const opt of sel.options) {
        if (P.test(opt.textContent) && !opt.selected) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
    }
    // Tabs / toggle buttons (never a submit button, never a real link)
    const toggles = document.querySelectorAll(
      '[role=tab], [data-toggle], [data-bs-toggle], a[href^="#"], button:not([type=submit])');
    for (const el of toggles) {
      const txt = (el.textContent || '').trim();
      if (txt.length <= 30 && P.test(txt)) { el.click(); return true; }
    }
    return false;
  }

  function attemptFill(fasta) {
    let ta = findTextarea();
    if (!ta || !visible(ta)) {
      revealPastedText();
      ta = findTextarea();
    }
    if (!ta || !visible(ta)) return false;

    ta.value = fasta;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    if (ta.value !== fasta) return false;

    ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const prev = ta.style.outline;
    ta.style.outline = '3px solid #0a6c74';
    setTimeout(() => { ta.style.outline = prev; }, 4000);
    return true;
  }

  function waitFor(fn, timeoutMs, everyMs = 400) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        let ok = false;
        try { ok = fn(); } catch (e) { console.warn('[seq2ngphylo]', e); }
        if (ok) return resolve(true);
        if (Date.now() - t0 >= timeoutMs) return resolve(false);
        setTimeout(tick, everyMs);
      };
      tick();
    });
  }

  function banner(message, { copyText, ok } = {}) {
    const old = document.getElementById('seq2ngphylo-banner');
    if (old) old.remove();

    const box = document.createElement('div');
    box.id = 'seq2ngphylo-banner';
    box.setAttribute('role', 'status');
    box.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px', 'z-index:2147483647', 'max-width:380px',
      'padding:12px 14px', 'border-radius:6px', 'font:14px/1.4 system-ui,sans-serif',
      'box-shadow:0 4px 18px rgba(0,0,0,.25)', 'color:#fff',
      `background:${ok ? '#0a6c74' : '#8a4b00'}`,
    ].join(';');

    const p = document.createElement('div');
    p.textContent = message;
    box.appendChild(p);

    const row = document.createElement('div');
    row.style.cssText = 'margin-top:8px;display:flex;gap:8px;justify-content:flex-end';
    const mk = (label, onClick) => {
      const b = document.createElement('button');
      b.type = 'button'; // never type=submit
      b.textContent = label;
      b.style.cssText = 'cursor:pointer;border:1px solid #fff;background:transparent;' +
        'color:#fff;border-radius:4px;padding:3px 10px;font:inherit';
      b.addEventListener('click', onClick);
      return b;
    };
    if (copyText) {
      row.appendChild(mk('Copy FASTA', async (ev) => {
        try {
          await navigator.clipboard.writeText(copyText);
          ev.target.textContent = 'Copied';
        } catch (e) {
          ev.target.textContent = 'Copy failed';
        }
      }));
    }
    row.appendChild(mk('Close', () => box.remove()));
    box.appendChild(row);
    document.body.appendChild(box);
  }

  // ---- Entry point ----------------------------------------------------------
  const store = await api.storage.local.get(KEY);
  const pending = store && store[KEY];
  if (!pending || !pending.fasta) return;

  await api.storage.local.remove(KEY); // consumed exactly once, whatever happens
  if (Date.now() - pending.ts > CONFIG.maxAgeMs) return;

  const ok = await waitFor(() => attemptFill(pending.fasta), CONFIG.timeoutMs);

  if (ok) {
    banner(
      'Sequence pasted into the query field. ' +
      'Check the parameters, then start the search yourself: the form has not been submitted.',
      { ok: true });
  } else {
    banner(
      'Query field not found on this page. The sequence can be copied here and pasted manually.',
      { ok: false, copyText: pending.fasta });
  }
})();
