/*
 * accession.js — turns an accession number into a list of candidate fetch
 * URLs (NCBI E-utilities, UniProt REST), and splits a batch of pasted
 * accessions. No DOM, no network I/O: the actual fetch() calls happen in
 * popup.js. Loaded by the popup (`<script>`) and `require()`-able from Node.
 */
(function (root) {
  'use strict';

  // https://www.uniprot.org/help/accession_numbers
  const UNIPROT_RE = new RegExp(
    '^(?:' +
      '[OPQ][0-9][A-Z0-9]{3}[0-9]' +                     // 6-char, O/P/Q-class
      '|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2}' +   // 6 or 10-char, other classes
    ')(?:-\\d+)?$', 'i');

  function splitAccessions(input) {
    return String(input || '')
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function looksLikeUniProt(acc) {
    return UNIPROT_RE.test(acc);
  }

  function ncbiUrl(db, acc) {
    return 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi' +
      '?db=' + db + '&id=' + encodeURIComponent(acc) +
      '&rettype=fasta&retmode=text&tool=seq2ngphylo';
  }

  function uniprotUrl(acc) {
    return 'https://rest.uniprot.org/uniprotkb/' + encodeURIComponent(acc) + '.fasta';
  }

  /**
   * Ordered list of {source, url} candidates to try for one accession,
   * most likely database first (based on the accession's shape). The
   * caller tries each in turn until one returns a FASTA record.
   */
  function fetchPlan(acc) {
    const clean = String(acc || '').trim();
    const uniprot = { source: 'UniProt', url: uniprotUrl(clean) };
    const ncbiProtein = { source: 'NCBI (protein)', url: ncbiUrl('protein', clean) };
    const ncbiNuccore = { source: 'NCBI (nucleotide)', url: ncbiUrl('nuccore', clean) };
    return looksLikeUniProt(clean)
      ? [uniprot, ncbiProtein, ncbiNuccore]
      : [ncbiProtein, ncbiNuccore, uniprot];
  }

  const api = { splitAccessions, looksLikeUniProt, fetchPlan };
  root.SeqAccession = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
