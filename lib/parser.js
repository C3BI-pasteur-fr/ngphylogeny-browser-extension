/*
 * parser.js — detects sequences in plain text and formats them as FASTA.
 *
 * Recognised formats:
 *   - FASTA (">" header lines followed by residue lines)
 *   - GenBank (ORIGIN ... // block), EMBL / UniProt flat file (SQ ... // block)
 *   - "bare" sequences (one long line, or blocks of 10 with line numbers)
 *
 * This file is loaded both in the popup (<script>) and injected into the page
 * (tabs.executeScript); it can also be tested under Node (module.exports).
 */
(function (root) {
  'use strict';

  const MIN_LEN_HEADED = 8;   // sequence introduced by a header (>, ORIGIN, SQ)
  const MIN_LEN_LOOSE = 30;   // sequence without a header: stricter threshold (avoids running text)
  const WRAP = 60;

  // ---------- composition helpers ----------

  function nucFraction(s) {
    if (!s.length) return 0;
    return s.replace(/[^ACGTUNRYKMSWBDHV-]/gi, '').length / s.length;
  }

  function caseOf(s) {
    const hasLower = /[a-z]/.test(s);
    const hasUpper = /[A-Z]/.test(s);
    if (hasLower && hasUpper) return 'mixed';
    return hasLower ? 'lower' : 'upper';
  }

  function residueCount(seq) {
    return seq.replace(/[-*\s]/g, '').length;
  }

  /** 'dna' | 'rna' | 'protein' */
  function detectType(seq) {
    if (nucFraction(seq) >= 0.9) {
      return /U/i.test(seq) && !/T/i.test(seq) ? 'rna' : 'dna';
    }
    return 'protein';
  }

  // ---------- line analysis ----------

  /**
   * A sequence line: groups of letters, optionally preceded and/or followed by
   * a number (GenBank / EMBL / UniProt formats). Returns null otherwise.
   */
  function residueLine(line) {
    const tokens = line.trim().split(/\s+/);
    if (/^\d+$/.test(tokens[0])) tokens.shift();
    if (tokens.length && /^\d+$/.test(tokens[tokens.length - 1])) tokens.pop();
    if (!tokens.length) return null;
    for (const t of tokens) {
      if (!/^[A-Za-z*-]+$/.test(t)) return null;
    }
    return { tokens, seq: tokens.join('') };
  }

  /** Start of a headerless block: strict criteria so that prose is not picked up. */
  function looseStart(r) {
    const s = r.seq;
    if (s.length < MIN_LEN_LOOSE) return false;
    if (caseOf(s) === 'mixed' && nucFraction(s) < 0.9) return false;
    if (r.tokens.length === 1) return true;
    const L = r.tokens[0].length;
    const last = r.tokens[r.tokens.length - 1].length;
    return (
      r.tokens.length >= 3 && L >= 5 && L <= 12 && last <= L &&
      r.tokens.slice(0, -1).every((t) => t.length === L)
    );
  }

  // ---------- record being built ----------

  function newRec(kind, header) {
    return { kind, header, parts: [], width: 0, closed: false, cse: 'upper', nuc: false };
  }

  /**
   * Adds a line to the record if it is consistent with the previous ones
   * (line width, case, composition). A line shorter than the first one must be
   * the last: this avoids swallowing the prose that follows a sequence.
   */
  function tryAppend(rec, r) {
    const s = r.seq;
    if (rec.parts.length === 0) {
      const nuc = nucFraction(s) >= 0.9;
      if (!nuc && caseOf(s) === 'mixed') return false; // "Hello world" is not a sequence
      rec.width = s.length;
      rec.cse = caseOf(s);
      rec.nuc = nuc;
      rec.parts.push(s);
      return true;
    }
    if (rec.closed || s.length > rec.width) return false;
    if (rec.cse === 'upper' && /[a-z]/.test(s)) return false;
    if (rec.cse === 'lower' && /[A-Z]/.test(s)) return false;
    if (rec.nuc && nucFraction(s) < 0.9) return false;
    if (s.length < rec.width) rec.closed = true;
    rec.parts.push(s);
    return true;
  }

  function finalize(rec, out, seen) {
    const seq = rec.parts.join('');
    const min = rec.kind === 'loose' ? MIN_LEN_LOOSE : MIN_LEN_HEADED;
    if (seq.length < min) return;
    const key = rec.header + '\u0000' + seq;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      header: rec.header,
      seq: seq,
      type: detectType(seq),
      length: residueCount(seq),
    });
  }

  // ---------- extraction ----------

  /**
   * @param {string} text
   * @param {Set<string>} [seen] to deduplicate across several texts
   * @returns {{header:string, seq:string, type:'dna'|'rna'|'protein', length:number}[]}
   */
  function parse(text, seen) {
    seen = seen || new Set();
    const out = [];
    let cur = null;
    let meta = { name: '', def: '' };
    let lastText = '';
    let looseN = 0;

    const flush = () => {
      if (cur) finalize(cur, out, seen);
      cur = null;
    };

    const lines = String(text).replace(/\r/g, '').split('\n');
    for (const raw of lines) {
      const line = raw.trim();

      if (!line) {
        if (cur && cur.kind === 'loose') flush(); // a headerless block ends at the first blank line
        continue;
      }

      let m;
      if (line[0] === '>') {
        flush();
        cur = newRec('fasta', line.slice(1).trim());
        continue;
      }

      // Metadata of flat-file formats (GenBank, EMBL, UniProt)
      if ((m = /^LOCUS\s+(\S+)/.exec(raw))) { flush(); meta = { name: m[1], def: '' }; continue; }
      if ((m = /^ID {3}([^\s;]+)/.exec(raw))) { flush(); meta = { name: m[1], def: '' }; continue; }
      if ((m = /^VERSION\s+(\S+)/.exec(raw))) { meta.name = m[1]; continue; }
      if ((m = /^DEFINITION\s+(.+)/.exec(raw))) { meta.def = m[1].trim(); continue; }
      if ((m = /^DE {3}(.+)/.exec(raw))) { if (!meta.def) meta.def = m[1].trim(); continue; }
      if (/^(ORIGIN\b|SQ {3}\S)/.test(raw)) {
        flush();
        cur = newRec('origin', (meta.name + ' ' + meta.def).trim() || lastText);
        continue;
      }
      if (line === '//') { flush(); meta = { name: '', def: '' }; continue; }

      // Residue line?
      const r = residueLine(line);
      if (cur) {
        if (r && tryAppend(cur, r)) continue;
        flush(); // incompatible line: the record is finished
      }
      if (r && looseStart(r)) {
        looseN += 1;
        cur = newRec('loose', lastText || 'seq_' + looseN);
        tryAppend(cur, r);
        lastText = '';
        continue;
      }
      if (line.length <= 150) lastText = line;
    }
    flush();
    return out;
  }

  /** Parses several texts, deduplicating the results. */
  function parseAll(texts) {
    const seen = new Set();
    const out = [];
    for (const t of texts) out.push.apply(out, parse(t, seen));
    return out;
  }

  // ---------- FASTA formatting ----------

  /**
   * Short identifier, safe for phylogeny software (Newick):
   * first word of the header, special characters replaced by "_".
   *   "sp|P99999|CYC_HUMAN Cytochrome c" -> "CYC_HUMAN"
   *   "NP_000001.1 protein [Homo sapiens]" -> "NP_000001.1"
   */
  function simplifyId(header) {
    let tok = String(header || '').trim().split(/\s+/)[0] || '';
    const m = /^(?:sp|tr)\|([^|]*)\|(.+)$/.exec(tok);
    if (m) tok = m[2] || m[1];
    tok = tok
      .replace(/[^A-Za-z0-9_.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return tok || 'seq';
  }

  /** Adds _2, _3… suffixes to duplicate names. */
  function uniquify(names) {
    const used = new Set();
    return names.map((n) => {
      let cand = n;
      let i = 2;
      while (used.has(cand)) cand = n + '_' + i++;
      used.add(cand);
      return cand;
    });
  }

  function cleanSeq(seq, opts) {
    let s = String(seq).toUpperCase().replace(/\s+/g, '').replace(/\*+$/, '');
    if (!opts || opts.stripGaps !== false) s = s.replace(/-/g, '');
    return s;
  }

  function wrap(seq, width) {
    const w = width || WRAP;
    const lines = [];
    for (let i = 0; i < seq.length; i += w) lines.push(seq.slice(i, i + w));
    return lines.join('\n');
  }

  /**
   * @param {{name:string, seq:string}[]} entries
   * @param {{stripGaps?:boolean}} [opts]
   * @returns {string} FASTA text (ending with a newline), '' if nothing
   */
  function buildFasta(entries, opts) {
    const names = uniquify(
      entries.map((e) => String(e.name || 'seq').replace(/[\r\n>]+/g, ' ').trim() || 'seq')
    );
    const blocks = [];
    entries.forEach((e, i) => {
      const s = cleanSeq(e.seq, opts);
      if (s) blocks.push('>' + names[i] + '\n' + wrap(s));
    });
    return blocks.length ? blocks.join('\n') + '\n' : '';
  }

  const api = { parse, parseAll, detectType, simplifyId, uniquify, cleanSeq, buildFasta };
  root.SeqParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
