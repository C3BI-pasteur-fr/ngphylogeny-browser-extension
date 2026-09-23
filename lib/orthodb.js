/*
 * orthodb.js — turns a gene/protein name + taxonomy level into OrthoDB
 * (data.orthodb.org) search/fasta URLs, and reshapes OrthoDB's FASTA
 * output (JSON-ish headers, one record per organism) into plain FASTA
 * with a clean "Genus_species" header per record, ready for
 * SeqParser.parseAll(). No DOM, no network I/O: fetch() calls happen in
 * popup.js. Loaded by the popup (`<script>`) and `require()`-able from
 * Node.
 *
 * API docs: https://www.ezlab.org/orthodb_v12_userguide.html
 * `level` must be the NCBI taxid of one of OrthoDB's ~2000 built-in
 * "levels" (major phylogenetic radiations) — arbitrary NCBI taxids are
 * not accepted, hence the curated LEVELS list below (verified live
 * against /search) rather than a free-text clade name.
 */
(function (root) {
  'use strict';

  const API = 'https://data.orthodb.org/v12';

  // A curated subset of OrthoDB's orthology levels (NCBI taxid), spanning
  // the tree of life. Anything else can still be reached by typing its
  // numeric NCBI taxid directly in the level field.
  const LEVELS = [
    { id: 2, name: 'Bacteria' },
    { id: 2157, name: 'Archaea' },
    { id: 2759, name: 'Eukaryota' },
    { id: 33630, name: 'Alveolata' },
    { id: 4751, name: 'Fungi' },
    { id: 4890, name: 'Ascomycota' },
    { id: 33090, name: 'Viridiplantae (green plants)' },
    { id: 3193, name: 'Embryophyta (land plants)' },
    { id: 3699, name: 'Brassicales' },
    { id: 33208, name: 'Metazoa (animals)' },
    { id: 6231, name: 'Nematoda' },
    { id: 6447, name: 'Mollusca' },
    { id: 6656, name: 'Arthropoda' },
    { id: 50557, name: 'Insecta' },
    { id: 7147, name: 'Diptera (flies)' },
    { id: 7157, name: 'Culicidae (mosquitoes)' },
    { id: 7088, name: 'Lepidoptera (moths, butterflies)' },
    { id: 7742, name: 'Vertebrata' },
    { id: 7898, name: 'Actinopterygii (ray-finned fish)' },
    { id: 8457, name: 'Sauria (reptiles, birds)' },
    { id: 8782, name: 'Aves (birds)' },
    { id: 9126, name: 'Passeriformes (songbirds)' },
    { id: 40674, name: 'Mammalia' },
    { id: 91561, name: 'Cetartiodactyla' },
    { id: 314146, name: 'Euarchontoglires' },
    { id: 9989, name: 'Rodentia' },
    { id: 9443, name: 'Primates' },
    { id: 9604, name: 'Hominidae (great apes)' },
  ];

  /**
   * Resolves a level field's raw text to an NCBI taxid: a plain number
   * is used as-is (so any level not in LEVELS is still reachable);
   * otherwise it is matched against LEVELS by name (case-insensitive,
   * ignoring a parenthesised common name). Returns null if empty or
   * unresolved.
   */
  function resolveLevel(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return s;
    const needle = s.toLowerCase();
    const hit = LEVELS.find((lv) => lv.name.toLowerCase() === needle) ||
      LEVELS.find((lv) => lv.name.toLowerCase().split(' (')[0] === needle) ||
      LEVELS.find((lv) => lv.name.toLowerCase().includes(needle));
    return hit ? String(hit.id) : null;
  }

  function searchUrl(name, levelId, take) {
    const params = new URLSearchParams({ query: name, take: String(take || 20) });
    if (levelId) params.set('level', String(levelId));
    return API + '/search?' + params.toString();
  }

  function fastaUrl(ogId, seqtype) {
    const params = new URLSearchParams({ id: ogId, seqtype: seqtype === 'cds' ? 'cds' : 'protein' });
    return API + '/fasta?' + params.toString();
  }

  /** Normalises a raw /search JSON response into a simple candidate list. */
  function parseSearchResults(json) {
    const rows = (json && json.bigdata) || [];
    return rows.map((g) => ({
      id: g.id,
      name: g.name || g.id,
      geneCount: Number(g.gene_count) || 0,
      levelName: g.level_name || '',
    }));
  }

  /**
   * OrthoDB's /fasta header looks like:
   *   >9447_0:002149 {"pub_og_id":"...","organism_name":"Lemur catta",...}
   * This extracts organism_name and turns each record's header into a
   * clean "Genus_species" identifier (falling back to the raw gene id
   * if the JSON is missing or unparsable).
   */
  function cleanHeader(raw) {
    const brace = raw.indexOf('{');
    if (brace === -1) return raw.trim();
    try {
      const meta = JSON.parse(raw.slice(brace));
      const species = meta.organism_name && String(meta.organism_name).trim().replace(/\s+/g, '_');
      return species || raw.slice(0, brace).trim() || raw.trim();
    } catch (e) {
      return raw.slice(0, brace).trim() || raw.trim();
    }
  }

  /** Reshapes OrthoDB FASTA text into plain FASTA, ready for SeqParser.parseAll(). */
  function toCleanFasta(text) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    const blocks = [];
    let header = null;
    let seq = [];
    const flush = () => {
      if (header !== null) blocks.push('>' + header + '\n' + seq.join('\n'));
      header = null;
      seq = [];
    };
    for (const line of lines) {
      if (line.startsWith('>')) {
        flush();
        header = cleanHeader(line.slice(1));
      } else if (line.trim()) {
        seq.push(line);
      }
    }
    flush();
    return blocks.length ? blocks.join('\n') + '\n' : '';
  }

  const api = { LEVELS, resolveLevel, searchUrl, fastaUrl, parseSearchResults, toCleanFasta };
  root.OrthoDB = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
