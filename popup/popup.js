(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const NG_URLS = {
    oneclick: 'https://ngphylogeny.fr/workflows/oneclick/',
    blast: 'https://ngphylogeny.fr/blast/',
  };
  const MIN_SEQS = 4; // the One Click page says "more than 3 sequences"
  const PREVIEW_MAX = 30000;
  const KEY = 'ngphyloPending';

  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => n.toLocaleString('en-US');
  const plural = (n, one, many) => (n > 1 ? many : one);

  const TYPE_LABEL = { dna: ['DNA', 'nt'], rna: ['RNA', 'nt'], protein: ['protein', 'aa'] };

  const state = {
    sets: { selection: [], page: [] },
    mode: 'page',
    target: 'oneclick', // 'oneclick' (several sequences) | 'blast' (a single one)
    rows: [], // { header, seq, type, length, checked, name }
  };

  // ---------- list rows ----------

  function loadRows(preserveChecked) {
    const short = $('#opt-short').checked;
    const prev = state.rows;
    const single = state.target === 'blast';
    state.rows = state.sets[state.mode].map((rec, i) => {
      const base = rec.header || 'seq_' + (i + 1);
      const checked = preserveChecked && prev[i]
        ? prev[i].checked
        : (single ? i === 0 : true);
      return Object.assign({}, rec, {
        checked,
        name: short ? SeqParser.simplifyId(base) : base,
      });
    });
    renderList();
    update();
  }

  function renderList() {
    const list = $('#list');
    list.textContent = '';
    const single = state.target === 'blast';
    state.rows.forEach((row, i) => {
      const li = document.createElement('li');
      li.className = 'row' + (row.checked ? '' : ' off');

      const cb = document.createElement('input');
      cb.type = single ? 'radio' : 'checkbox';
      if (single) cb.name = 'row-pick';
      cb.checked = row.checked;
      cb.setAttribute('aria-label', (single ? 'Use sequence ' : 'Include sequence ') + row.name);
      cb.addEventListener('change', () => {
        if (single) {
          state.rows.forEach((r) => { r.checked = false; });
          row.checked = true;
          renderList();
        } else {
          row.checked = cb.checked;
          li.classList.toggle('off', !row.checked);
        }
        update();
      });

      const name = document.createElement('input');
      name.type = 'text';
      name.value = row.name;
      name.spellcheck = false;
      name.setAttribute('aria-label', 'Sequence name');
      name.addEventListener('input', () => {
        row.name = name.value;
        update();
      });

      const [label, unit] = TYPE_LABEL[row.type];
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `${label} · ${fmt(row.length)} ${unit}`;

      li.append(cb, name, meta);
      list.appendChild(li);
    });
  }

  // ---------- FASTA generation ----------

  function build() {
    const entries = state.rows
      .filter((r) => r.checked)
      .map((r) => ({ name: r.name, seq: r.seq }));
    const text = SeqParser.buildFasta(entries, { stripGaps: $('#opt-gaps').checked });
    const count = (text.match(/^>/gm) || []).length;
    return { text, count };
  }

  function update() {
    const single = state.target === 'blast';
    const selected = state.rows.filter((r) => r.checked);
    const total = state.rows.length;
    const { text, count } = build();

    $('#summary-text').textContent = single
      ? `1 of ${total} ${plural(total, 'sequence', 'sequences')} selected for Blast`
      : `${selected.length} of ${total} ${plural(total, 'sequence', 'sequences')}`;
    $('#select-all').hidden = single;
    if (!single) {
      const all = $('#select-all');
      all.checked = selected.length === total;
      all.indeterminate = selected.length > 0 && selected.length < total;
    }

    // Warnings
    const warnings = $('#warnings');
    warnings.textContent = '';
    const warn = (msg) => {
      const p = document.createElement('p');
      p.textContent = msg;
      warnings.appendChild(p);
    };
    if (!single) {
      const kinds = new Set(selected.map((r) => (r.type === 'protein' ? 'prot' : 'nuc')));
      if (kinds.size > 1) {
        warn('Nucleotides and proteins are mixed: a phylogenetic analysis needs a single sequence type.');
      }
      if (selected.length > 0 && selected.length < MIN_SEQS) {
        warn(`The One Click page asks for more than 3 sequences; ${selected.length} selected.`);
      }
    }

    // Preview
    $('#preview').value = text.length > PREVIEW_MAX
      ? text.slice(0, PREVIEW_MAX) + '\n[… preview truncated …]'
      : text;

    $('#send').disabled = count === 0;
    $('#copy').disabled = count === 0;
  }

  // ---------- actions ----------

  function setStatus(msg) { $('#status').textContent = msg; }

  async function copy() {
    const { text, count } = build();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`FASTA copied (${count} ${plural(count, 'sequence', 'sequences')}).`);
    } catch (e) {
      setStatus('Copy failed: ' + e.message);
    }
  }

  async function send() {
    const { text, count } = build();
    if (!text) return;
    $('#send').disabled = true;
    try {
      await api.storage.local.set({ [KEY]: { fasta: text, count, ts: Date.now() } });
      try { await navigator.clipboard.writeText(text); } catch (_) { /* optional safety net */ }
      await api.tabs.create({ url: NG_URLS[state.target] });
      window.close();
    } catch (e) {
      setStatus('Send failed: ' + e.message);
      $('#send').disabled = false;
    }
  }

  // ---------- startup ----------

  function showEmpty(msg) {
    const p = $('#empty');
    p.textContent = msg;
    p.hidden = false;
    $('#results').hidden = true;
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('#scope button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    loadRows();
  }

  function setTarget(target) {
    state.target = target;
    document.querySelectorAll('#target button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.target === target)));
    $('#send').textContent = target === 'blast' ? 'Send to Blast' : 'Send to NGPhylogeny';
    loadRows();
  }

  async function init() {
    let res;
    try {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      await api.tabs.executeScript(tab.id, { file: '/lib/parser.js' });
      const out = await api.tabs.executeScript(tab.id, { file: '/content/extract.js' });
      res = out && out[0];
    } catch (e) {
      showEmpty('Extraction is not possible on this page (browser-internal page, PDF viewer or restricted site).');
      return;
    }
    if (!res) {
      showEmpty('No response from the page. Reload it and reopen the extension.');
      return;
    }

    state.sets.selection = res.selection || [];
    state.sets.page = res.page || [];
    const nSel = state.sets.selection.length;
    const nPage = state.sets.page.length;

    if (nSel === 0 && nPage === 0) {
      showEmpty('No sequence detected. Select the text of a sequence (FASTA, GenBank, UniProt or raw sequence), then reopen the extension.');
      return;
    }

    $('#results').hidden = false;
    if (nSel > 0) {
      const scope = $('#scope');
      scope.hidden = false;
      scope.querySelector('[data-mode="selection"] .count').textContent = `(${nSel})`;
      scope.querySelector('[data-mode="page"] .count').textContent = `(${nPage})`;
      setMode('selection');
    } else {
      setMode('page');
    }
  }

  // ---------- events ----------

  document.querySelectorAll('#scope button').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.mode)));

  document.querySelectorAll('#target button').forEach((b) =>
    b.addEventListener('click', () => setTarget(b.dataset.target)));

  $('#select-all').addEventListener('change', (ev) => {
    state.rows.forEach((r) => { r.checked = ev.target.checked; });
    renderList();
    update();
  });
  $('#opt-short').addEventListener('change', () => loadRows(true));
  $('#opt-gaps').addEventListener('change', update);
  $('#copy').addEventListener('click', copy);
  $('#send').addEventListener('click', send);

  init();
})();
