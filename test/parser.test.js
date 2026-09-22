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

test('GenBank CDS: /translation named after /protein_id, first line included', () => {
  const gb = [
    'LOCUS       AJ697866                 667 bp    RNA     linear   VRL 26-JUL-2016',
    'DEFINITION  Influenza A virus partial H3 gene for hemagglutinin.',
    'VERSION     AJ697866.1',
    'FEATURES             Location/Qualifiers',
    '     source          1..667',
    '                     /organism="Influenza A virus',
    '                     (A/Nightingale/France/95125/95 (H3N2))"',
    '                     /mol_type="genomic RNA"',
    '     CDS             <1..>667',
    '                     /gene="H3"',
    '                     /product="hemagglutinin"',
    '                     /protein_id="CAG27342.1"',
    '                     /translation="QSSSTGKIRNNPHRILDGRDCTLIDALLGDPHCDVFQDETWDLF',
    '                     VERSNAFSNCYPYDVPDYASLRSLVASSGTLEFITEGFTWTGVTQNGGSNACKRGPAS',
    '                     TGKT"',
    'ORIGIN',
    '        1 atggctagct agctaggatc gatcgatcga ttagctagct aggctagcta gctagcatcg',
    '//',
  ].join('\n');
  const r = P.parse(gb);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].header, 'CAG27342.1 hemagglutinin');
  assert.strictEqual(r[0].type, 'protein');
  assert.ok(r[0].seq.startsWith('QSSSTGKIRNNPHRILDGRDCTLIDALLGDPHCDVFQDETWDLFVERSNAF'));
  assert.ok(r[0].seq.endsWith('TGKT'));
  assert.strictEqual(r[0].length, 106);
  assert.strictEqual(P.simplifyId(r[0].header), 'CAG27342.1');
  assert.strictEqual(r[1].type, 'dna');           // the ORIGIN block is still read
  assert.strictEqual(r[1].length, 60);
});

test('GenBank: several CDS, qualifiers do not leak between features', () => {
  const gb = [
    'LOCUS       TEST',
    'FEATURES             Location/Qualifiers',
    '     CDS             1..39',
    '                     /protein_id="AAA00001.1"',
    '                     /translation="MKVLAAGIVGLLLAQPTEA"',
    '     CDS             complement(40..99)',
    '                     /locus_tag="b0002"',
    '                     /translation="MSDEFGHIKLMNPQRSTVW',
    '                     YACDEFGHIK"',
    '//',
  ].join('\n');
  const r = P.parse(gb);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].header, 'AAA00001.1');
  assert.strictEqual(r[0].seq, 'MKVLAAGIVGLLLAQPTEA');
  assert.strictEqual(r[1].header, 'b0002');       // no /protein_id: falls back to /locus_tag
  assert.strictEqual(r[1].seq, 'MSDEFGHIKLMNPQRSTVWYACDEFGHIK');
});

test('EMBL feature table (FT lines): /translation extracted', () => {
  const embl = [
    'ID   AJ697866; SV 1; linear; genomic RNA; STD; VRL; 667 BP.',
    'FH   Key             Location/Qualifiers',
    'FT   CDS             <1..>667',
    'FT                   /product="hemagglutinin"',
    'FT                   /protein_id="CAG27342.1"',
    'FT                   /translation="QSSSTGKIRNNPHRILDGRDCTLIDALLGDPHCDVFQDETWDLFV',
    'FT                   ERSNAFSNCYPYDVPDYASLRSLVASSGTLEFITEGFTWTGVTQNGGSNACKRGPAST"',
    '//',
  ].join('\n');
  const r = P.parse(embl);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].header, 'CAG27342.1 hemagglutinin');
  assert.strictEqual(r[0].type, 'protein');
  assert.strictEqual(
    r[0].seq,
    'QSSSTGKIRNNPHRILDGRDCTLIDALLGDPHCDVFQDETWDLFV' +
    'ERSNAFSNCYPYDVPDYASLRSLVASSGTLEFITEGFTWTGVTQNGGSNACKRGPAST'  // no "FT" prefix left
  );
});

test('a CDS block without its FEATURES header is still read, prose ignored', () => {
  const t = [
    '     CDS             1..39',
    '                     /gene="tiny"',
    '                     /translation="MKVLAAGIVGLLLAQPTEALSDEFG',
    '                     HIKLMNPQRSTVWY"',
    'Related sequences and other links',
  ].join('\n');
  const r = P.parse(t);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].header, 'tiny');
  assert.strictEqual(r[0].seq, 'MKVLAAGIVGLLLAQPTEALSDEFGHIKLMNPQRSTVWY');
});

console.log(`\n${n} tests passed`);
