// Browser test of the paste script on mock NGPhylogeny forms.
// Run with: NODE_PATH=$(npm root -g) node test/fill.harness.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, '../content/ngphylogeny.js'), 'utf8');
const FASTA = '>a\nATGC\n>b\nATGG\n>c\nATGA\n>d\nATGT\n';

const pages = {
  'A: labels + always-visible textarea': `
    <form id="f"><label for="in">Input file</label><input id="in" type="file">
    <label for="tx">Pasted text</label><textarea id="tx"></textarea>
    <label>Blast run</label><select><option>--</option></select>
    <button type="submit">Submit</button></form>`,
  'B: hidden textarea, revealed by a radio button': `
    <form id="f"><label><input type="radio" name="t" value="file" checked> Input file</label>
    <label><input type="radio" name="t" value="text" id="rt"> Pasted text</label>
    <div id="box" style="display:none"><textarea name="seqs"></textarea></div>
    <script>document.getElementById('rt').addEventListener('click',()=>{document.getElementById('box').style.display='block'})<\/script>
    <button type="submit">Submit</button></form>`,
  'C: textarea injected late (dynamic rendering)': `
    <form id="f"><div id="slot"></div><button type="submit">Submit</button></form>
    <script>setTimeout(()=>{document.getElementById('slot').innerHTML='<label>Pasted text</label><div><textarea></textarea></div>'},1500)<\/script>`,
  'D: no field (must fail gracefully)': `<form id="f"><input type="text"><button type="submit">Submit</button></form>`,
};

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const [name, html] of Object.entries(pages)) {
    for (const scenario of ['fresh', 'expired']) {
      if (scenario === 'expired' && !name.startsWith('A')) continue;
      const page = await browser.newPage();
      await page.addInitScript(({ fasta, scenario }) => {
        const store = { ngphyloPending: { fasta, count: 4, ts: scenario === 'expired' ? Date.now() - 10 * 60 * 1000 : Date.now() } };
        window.__submitted = false;
        window.browser = { storage: { local: {
          get: async (k) => ({ [k]: store[k] }),
          remove: async (k) => { delete store[k]; window.__removed = true; },
        } } };
        document.addEventListener('submit', () => { window.__submitted = true; }, true);
      }, { fasta: FASTA, scenario });
      await page.route('http://ngphylo.test/**', (route) => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><html><body>' + html + '</body></html>' }));
      await page.goto('http://ngphylo.test/workflows/oneclick/');
      await page.addScriptTag({ content: script });
      await page.waitForTimeout(name.startsWith('D') ? 16500 : 3500);
      const r = await page.evaluate(() => ({
        value: (document.querySelector('textarea') || {}).value || '',
        banner: (document.getElementById('seq2ngphylo-banner') || {}).textContent || '',
        submitted: window.__submitted, removed: !!window.__removed,
      }));
      let ok;
      if (scenario === 'expired') ok = r.value === '' && r.banner === '' && r.removed;
      else if (name.startsWith('D')) ok = r.banner.includes('not found') && r.banner.includes('Copy') && !r.submitted;
      else ok = r.value === FASTA && r.banner.includes('4 sequences pasted') && !r.submitted && r.removed;
      console.log((ok ? 'ok   ' : 'FAIL '), '-', name, scenario === 'expired' ? '(expired FASTA ignored)' : '');
      if (!ok) { failed++; console.log(r); }
      await page.close();
    }
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
