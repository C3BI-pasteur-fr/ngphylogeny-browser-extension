// Run with: node test/accession.test.js
const assert = require('assert');
const A = require('../lib/accession.js');

let n = 0;
function test(name, fn) {
  fn();
  n += 1;
  console.log('ok  -', name);
}

test('splitAccessions: space, comma, semicolon and newline separated', () => {
  assert.deepStrictEqual(
    A.splitAccessions(' NP_149023.2, P0DTD1;Q9Y6K9\nAJ697866 '),
    ['NP_149023.2', 'P0DTD1', 'Q9Y6K9', 'AJ697866']
  );
});

test('splitAccessions: empty input', () => {
  assert.deepStrictEqual(A.splitAccessions(''), []);
  assert.deepStrictEqual(A.splitAccessions('   '), []);
  assert.deepStrictEqual(A.splitAccessions(undefined), []);
});

test('looksLikeUniProt: 6 and 10-char accessions', () => {
  assert.ok(A.looksLikeUniProt('P0DTD1'));
  assert.ok(A.looksLikeUniProt('Q9Y6K9'));
  assert.ok(A.looksLikeUniProt('O43521'));
  assert.ok(A.looksLikeUniProt('A0A0U1RQL9'));
  assert.ok(A.looksLikeUniProt('p0dtd1')); // case-insensitive
  assert.ok(A.looksLikeUniProt('P0DTD1-2')); // isoform suffix
});

test('looksLikeUniProt: NCBI-style accessions rejected', () => {
  assert.ok(!A.looksLikeUniProt('NP_149023.2'));
  assert.ok(!A.looksLikeUniProt('AJ697866'));
  assert.ok(!A.looksLikeUniProt('NC_001416.1'));
});

test('fetchPlan: UniProt tried first for a UniProt-shaped accession', () => {
  const plan = A.fetchPlan('P0DTD1');
  assert.strictEqual(plan[0].source, 'UniProt');
  assert.strictEqual(plan[0].url, 'https://rest.uniprot.org/uniprotkb/P0DTD1.fasta');
  assert.ok(plan.some((c) => c.source === 'NCBI (protein)'));
  assert.ok(plan.some((c) => c.source === 'NCBI (nucleotide)'));
});

test('fetchPlan: NCBI protein tried first for an NCBI-shaped accession', () => {
  const plan = A.fetchPlan('NP_149023.2');
  assert.strictEqual(plan[0].source, 'NCBI (protein)');
  assert.ok(plan[0].url.includes('db=protein'));
  assert.ok(plan[0].url.includes('id=NP_149023.2'));
  assert.ok(plan.some((c) => c.source === 'UniProt'));
});

test('fetchPlan: accession is URL-encoded', () => {
  const plan = A.fetchPlan('weird id/with space');
  assert.ok(plan.every((c) => !c.url.includes(' ') && !c.url.includes('/with')));
});

console.log(`\n${n} tests passed`);
