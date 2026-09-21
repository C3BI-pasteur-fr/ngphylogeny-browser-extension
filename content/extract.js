/*
 * extract.js — injected on demand into the active tab (after lib/parser.js).
 * Returns the sequences found in the selection and in the whole page.
 * Never modifies the page.
 */
(function () {
  'use strict';

  function selectedText() {
    let text = '';
    const sel = window.getSelection && window.getSelection();
    if (sel) text = sel.toString();
    if (!text) {
      // Selection inside a <textarea> or an <input>
      const el = document.activeElement;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') &&
          typeof el.selectionStart === 'number' && el.selectionEnd > el.selectionStart) {
        text = el.value.substring(el.selectionStart, el.selectionEnd);
      }
    }
    return text;
  }

  function pageTexts() {
    const texts = [];
    if (document.body) texts.push(document.body.innerText || '');
    // FASTA is sometimes inside a <textarea> (forms, "copy" boxes)
    document.querySelectorAll('textarea').forEach((ta) => {
      if (ta.value && ta.value.length > 20) texts.push(ta.value);
    });
    return texts;
  }

  const selection = SeqParser.parse(selectedText());
  const page = SeqParser.parseAll(pageTexts());

  return {
    title: document.title,
    url: location.href,
    selection: selection,
    page: page,
  };
})();
