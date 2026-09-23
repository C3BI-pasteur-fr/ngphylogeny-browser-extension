// Run with: node test/orthodb.test.js
const assert = require('assert');
const O = require('../lib/orthodb.js');

let n = 0;
function test(name, fn) {
  fn();
  n += 1;
  console.log('ok  -', name);
}

test('resolveLevel: numeric taxid passed through', () => {
  assert.strictEqual(O.resolveLevel('9443'), '9443');
  assert.strictEqual(O.resolveLevel(' 40674 '), '40674');
});

test('resolveLevel: exact curated name, case-insensitive', () => {
  assert.strictEqual(O.resolveLevel('primates'), '9443');
  assert.strictEqual(O.resolveLevel('Primates'), '9443');
  assert.strictEqual(O.resolveLevel('MAMMALIA'), '40674');
});

test('resolveLevel: name with a parenthesised common name', () => {
  assert.strictEqual(O.resolveLevel('Aves'), '8782');
  assert.strictEqual(O.resolveLevel('aves (birds)'), '8782');
});

test('resolveLevel: substring fallback on the common name', () => {
  assert.strictEqual(O.resolveLevel('mosquitoes'), '7157');
});

test('resolveLevel: empty or unknown', () => {
  assert.strictEqual(O.resolveLevel(''), null);
  assert.strictEqual(O.resolveLevel('   '), null);
  assert.strictEqual(O.resolveLevel('not a real clade'), null);
});

test('searchUrl: query and level encoded', () => {
  const url = O.searchUrl('TRIM5', '9443', 20);
  assert.ok(url.startsWith('https://data.orthodb.org/v12/search?'));
  assert.ok(url.includes('query=TRIM5'));
  assert.ok(url.includes('level=9443'));
  assert.ok(url.includes('take=20'));
});

test('searchUrl: level omitted when not given', () => {
  const url = O.searchUrl('kinase', null, 20);
  assert.ok(!url.includes('level='));
});

test('fastaUrl: defaults to protein, accepts cds', () => {
  assert.ok(O.fastaUrl('4977at9604').includes('seqtype=protein'));
  assert.ok(O.fastaUrl('4977at9604', 'cds').includes('seqtype=cds'));
  assert.ok(O.fastaUrl('4977at9604').includes('id=4977at9604'));
});

test('parseSearchResults: normalises the bigdata array', () => {
  const rows = O.parseSearchResults({
    data: ['6632at9443'],
    count: '1',
    bigdata: [{ id: '6632at9443', name: 'TRIM5', gene_count: '55', level_name: 'Primates' }],
  });
  assert.deepStrictEqual(rows, [{ id: '6632at9443', name: 'TRIM5', geneCount: 55, levelName: 'Primates' }]);
});

test('parseSearchResults: missing bigdata does not throw', () => {
  assert.deepStrictEqual(O.parseSearchResults({}), []);
  assert.deepStrictEqual(O.parseSearchResults(null), []);
});

test('toCleanFasta: JSON header replaced by "Genus_species"', () => {
  const raw = '>9447_0:002149 {"pub_og_id":"6632at9443","organism_name":"Lemur catta"}\n' +
    'MASGILVNLKEEVTCPICLDLL\n\n' +
    '>9606_0:00abcd {"pub_og_id":"6632at9443","organism_name":"Homo sapiens"}\n' +
    'MASGILVNVKEEVTCPICLELL\n';
  const clean = O.toCleanFasta(raw);
  assert.ok(clean.startsWith('>Lemur_catta\nMASGILVNLKEEVTCPICLDLL\n>Homo_sapiens\n'));
});

test('toCleanFasta: falls back to the gene id when JSON is missing/broken', () => {
  const clean = O.toCleanFasta('>9606_0:00abcd not json here\nMKVLAAGIVGLLLAQPTEA\n');
  assert.ok(clean.startsWith('>9606_0:00abcd not json here\n'));
});

test('toCleanFasta: empty input', () => {
  assert.strictEqual(O.toCleanFasta(''), '');
});

console.log(`\n${n} tests passed`);
