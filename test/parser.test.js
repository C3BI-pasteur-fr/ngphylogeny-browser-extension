// Run with: node test/parser.test.js
const assert = require('assert');
const P = require('../lib/parser.js');

let n = 0;
function test(name, fn) {
  fn();
  n += 1;
  console.log('ok  -', name);
}

const DNA1 = 'ATGGCTAGCTAGCTAGGATCGATCGATCGATTAGCTAGCTAGGCTAGCTAGCTAGCATCG';
const DNA2 = 'ATGGCTAGCTAGCTAGGATCGATCG';
const PROT = 'MKVLAAGIVGLLLAQPTEALSDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWY';

test('multi-sequence FASTA, wrapped lines', () => {
  const t = `>seq1 first\n${DNA1}\n${DNA2}\n>seq2\n${DNA1}\n`;
  const r = P.parse(t);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].header, 'seq1 first');
  assert.strictEqual(r[0].seq, DNA1 + DNA2);
  assert.strictEqual(r[0].type, 'dna');
});

test('protein FASTA detected as protein', () => {
  const r = P.parse('>sp|P99999|CYC_HUMAN Cytochrome c\n' + PROT + '\n');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].type, 'protein');
});

test('RNA detected', () => {
  const r = P.parse('>rna1\nAUGGCUAGCUAGCUAGGAUCGAUCGAUCGAUUAGC\n');
  assert.strictEqual(r[0].type, 'rna');
});

test('prose after a sequence is not swallowed (single line)', () => {
  const r = P.parse(`>s1\n${DNA1}\nRelated sequences\nDownload\n`);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].seq, DNA1);
});

test('prose after an uppercase sequence: short mixed-case word rejected', () => {
  const r = P.parse(`>p1\n${PROT}\nRelated\n`);
  assert.strictEqual(r[0].seq, PROT);
});

test('header followed by prose: no sequence', () => {
  assert.strictEqual(P.parse('>titre\nHello world, this is text\n').length, 0);
});

test('GenBank ORIGIN with line numbers and blocks of 10', () => {
  const gb = [
    'LOCUS       AB000001    120 bp    DNA     linear   BCT 01-JAN-2000',
    'DEFINITION  Test organism gene, complete cds.',
    'VERSION     AB000001.1',
    'ORIGIN',
    '        1 atggctagct agctaggatc gatcgatcga ttagctagct aggctagcta gctagcatcg',
    '       61 atggctagct agctaggatc gatcgatcga',
    '//',
  ].join('\n');
  const r = P.parse(gb);
  assert.strictEqual(r.length, 1);
  assert.ok(r[0].header.startsWith('AB000001.1 Test organism'));
  assert.strictEqual(r[0].seq.length, 60 + 30);
});

test('UniProt flat file (SQ)', () => {
  const up = [
    'ID   CYC_HUMAN     Reviewed;   105 AA.',
    'DE   RecName: Full=Cytochrome c;',
    'SQ   SEQUENCE   60 AA;  12000 MW;  ABCDEF CRC64;',
    '     MKVLAAGIVG LLLAQPTEAL SDEFGHIKLM NPQRSTVWYA CDEFGHIKLM NPQRSTVWYX',
    '//',
  ].join('\n');
  const r = P.parse(up);
  assert.strictEqual(r.length, 1);
  assert.ok(r[0].header.startsWith('CYC_HUMAN'));
  assert.strictEqual(r[0].seq.length, 60);
});

test('bare sequence in blocks of 10 with numbers (selection)', () => {
  const t = 'Sequence\n  1 MKVLAAGIVG LLLAQPTEAL SDEFGHIKLM\n 31 NPQRSTVWYA CDEFG\n';
  const r = P.parse(t);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].header, 'Sequence');
  assert.strictEqual(r[0].seq.length, 45);
});

test('bare single-line sequence, name = previous line', () => {
  const r = P.parse(`My gene\n${DNA1}\n`);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].header, 'My gene');
});

test('running prose: no false positive', () => {
  const t = [
    'Welcome to the database of protein families and their annotations.',
    'Pneumonoultramicroscopicsilicovolcanoconiosis is a long word.',
    'state-of-the-art tools are available',
    'Contact us at info@example.org',
    'Copyright 2026',
    'ABCDEF',
  ].join('\n');
  assert.strictEqual(P.parse(t).length, 0);
});

test('deduplication across texts', () => {
  const t = `>a\n${DNA1}\n`;
  assert.strictEqual(P.parseAll([t, t]).length, 1);
});

test('simplifyId', () => {
  assert.strictEqual(P.simplifyId('sp|P99999|CYC_HUMAN Cytochrome c'), 'CYC_HUMAN');
  assert.strictEqual(P.simplifyId('NP_000001.1 protein [Homo sapiens]'), 'NP_000001.1');
  assert.strictEqual(P.simplifyId('gi|123|ref|NP_1.1|'), 'gi_123_ref_NP_1.1');
  assert.strictEqual(P.simplifyId('a:b,c(d)'), 'a_b_c_d');
  assert.strictEqual(P.simplifyId(''), 'seq');
});

test('buildFasta: unique names, gaps removed, wrapped at 60', () => {
  const out = P.buildFasta([
    { name: 'x', seq: 'atg-c'.repeat(30) },
    { name: 'x', seq: 'MKV*' },
  ]);
  const lines = out.trim().split('\n');
  assert.strictEqual(lines[0], '>x');
  assert.ok(lines[1].length === 60);
  assert.ok(out.includes('>x_2\nMKV\n'));
  assert.ok(!out.includes('-'));
});

test('buildFasta: nothing to write', () => {
  assert.strictEqual(P.buildFasta([]), '');
});

console.log(`\n${n} tests passed`);
