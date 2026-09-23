// Browser test of the popup with a mocked `browser` API + screenshots.
// Run with: NODE_PATH=$(npm root -g) node test/popup.harness.js
const { chromium } = require('playwright');
const path = require('path');
const P = require('../lib/parser.js');

const prot = (seed) => {
  const aa = 'ACDEFGHIKLMNPQRSTVWY';
  let s = '', x = seed;
  for (let i = 0; i < 104; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += aa[x % 20]; }
  return s;
};
const names = ['sp|P99999|CYC_HUMAN Cytochrome c OS=Homo sapiens', 'sp|P00004|CYC_HORSE Cytochrome c OS=Equus caballus',
  'tr|Q9XYZ1|Q9XYZ1_MOUSE Cytochrome c, somatic OS=Mus musculus', 'NP_001275.1 cytochrome c [Rattus norvegicus]',
  'sp|P00004|CYC_HORSE Cytochrome c (duplicate name)'];
const text = names.map((n, i) => '>' + n + '\n' + prot(i + 7).replace(/(.{60})/g, '$1\n') + '\n').join('');
const page = P.parse(text);
const selection = page.slice(0, 2);
const dna = P.parse('>gene1\n' + 'ATGGCTAGCTAGCTAGGATCGATCGATCGATTAGC'.repeat(3) + '\n');

async function run(name, result, shot, act) {
  const browser = globalThis.__browser;
  const pg = await browser.newPage({ viewport: { width: 440, height: 700 }, colorScheme: shot.dark ? 'dark' : 'light' });
  await pg.addInitScript((result) => {
    window.__calls = { set: null, tabs: null, clip: null };
    window.browser = {
      tabs: {
        query: async () => [{ id: 1 }],
        executeScript: async (id, o) => (o.file.includes('extract') ? [result] : [undefined]),
        create: async (o) => { window.__calls.tabs = o; },
      },
      storage: { local: { set: async (o) => { window.__calls.set = o; } } },
    };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__calls.clip = t; } } });
    window.close = () => { window.__closed = true; };
  }, result);
  await pg.goto('file://' + path.join(__dirname, '../popup/popup.html'));
  await pg.waitForTimeout(300);
  if (act) await act(pg);
  await pg.screenshot({ path: `/tmp/popup-${name}.png`, fullPage: true });
  const calls = await pg.evaluate(() => window.__calls);
  await pg.close();
  return calls;
}

(async () => {
  globalThis.__browser = await chromium.launch();
  let bad = 0;
  const check = (label, cond) => { console.log(cond ? 'ok   -' : 'FAIL  -', label); if (!cond) bad++; };

  // 1. Whole page, selection present, click Send
  let c = await run('page', { selection, page }, { dark: false }, async (pg) => {
    await pg.click('[data-mode="page"]');
    await pg.click('#send');
    await pg.waitForTimeout(200);
  });
  check('send: FASTA stored', c.set && c.set.ngphyloPending.fasta.startsWith('>CYC_HUMAN\n'));
  check('send: unique names (_2)', c.set && c.set.ngphyloPending.fasta.includes('>CYC_HORSE_2\n'));
  check('send: 5 sequences', c.set && c.set.ngphyloPending.count === 5);
  check('send: NGPhylogeny tab opened', c.tabs && c.tabs.url === 'https://ngphylogeny.fr/workflows/oneclick/');
  check('send: copied to clipboard', c.clip && c.clip === c.set.ngphyloPending.fasta);

  // 2. Selection by default, warning < 4 sequences, dark theme
  await run('selection-dark', { selection, page }, { dark: true });

  // 3. Mixed proteins / DNA
  await run('mixte', { selection: [], page: page.concat(dna) }, { dark: false }, async (pg) => {
    await pg.click('#opt-short'); // original names
    await pg.click('summary');
  });

  // 4. Empty
  await run('vide', { selection: [], page: [] }, { dark: false });

  // 5. Blast target: single-sequence radio selection, second row picked
  let b = await run('blast', { selection: [], page }, { dark: false }, async (pg) => {
    await pg.click('[data-target="blast"]');
    const radios = await pg.$$('#list input[type=radio]');
    await radios[1].check();
    await pg.click('#send');
    await pg.waitForTimeout(200);
  });
  check('blast: exactly one sequence sent', b.set && b.set.ngphyloPending.count === 1);
  check('blast: second sequence chosen', b.set && b.set.ngphyloPending.fasta.startsWith('>CYC_HORSE\n'));
  check('blast: Blast tab opened', b.tabs && b.tabs.url === 'https://ngphylogeny.fr/blast/');

  // 6. Fetch by accession on an otherwise empty page
  let f = await run('accession', { selection: [], page: [] }, { dark: false }, async (pg) => {
    await pg.route('https://eutils.ncbi.nlm.nih.gov/**', (route) => route.fulfill({
      contentType: 'text/plain',
      body: '>NP_999999.1 test protein [Test organism]\nMKVLAAGIVGLLLAQPTEALSDEFGHIKLMNPQRSTVWY\n',
    }));
    await pg.fill('#accession-input', 'NP_999999.1');
    await pg.click('#accession-fetch');
    await pg.waitForFunction(() => (document.getElementById('fetch-status').textContent || '').includes('fetched'));
    await pg.click('#send');
    await pg.waitForTimeout(200);
  });
  check('accession: fetched sequence sent', f.set && f.set.ngphyloPending.fasta.startsWith('>NP_999999.1\n'));
  check('accession: 1 sequence', f.set && f.set.ngphyloPending.count === 1);

  await globalThis.__browser.close();
  process.exit(bad ? 1 : 0);
})();
