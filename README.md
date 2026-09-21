# Sequences to NGPhylogeny (Firefox)

A browser extension that detects sequences (nucleotide or protein) on a web page, formats them as FASTA,
and pastes them into the **Pasted text** field of the
[One Click](https://ngphylogeny.fr/workflows/oneclick/) page of NGPhylogeny.fr, or a single sequence
into the query field of the [Blast](https://ngphylogeny.fr/blast/) page.
**The form is never submitted**: you check it, then start the analysis yourself.

## Installation

### Permanent (recommended)

Download the latest signed `.xpi` from the
[Releases page](https://github.com/C3BI-pasteur-fr/ngphylogeny_browser_extension/releases/latest) and
open it in Firefox (drag it into a Firefox window, or `File > Open File…`). Firefox will ask to confirm
the install; the extension is signed by Mozilla, so this works in regular Firefox with no special flags,
and it will auto-update itself when a new release is published (see below).

### Temporary, for testing a local checkout

1. In Firefox, open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on…"
3. Pick `manifest.json`.

The add-on disappears when Firefox restarts; it does not auto-update. Use this for trying out changes,
not for day-to-day use.

Since Firefox 109, new extensions are not pinned to the toolbar automatically: click the puzzle-piece
icon (Extensions), then the pin next to "Sequences to NGPhylogeny".

## Usage

1. Open a page containing sequences (NCBI, UniProt, an online FASTA file, an article…).
2. Optional: select the text you want. The selection is then offered first;
   a button switches to the whole page.
3. Click the extension icon: the detected sequences are listed (editable name,
   DNA/RNA/protein type, length). Untick anything you don't want.
4. Pick a destination: **One Click** (several sequences, checkboxes) or **Blast**
   (a single sequence, picked with a radio button).
5. "Send to NGPhylogeny" / "Send to Blast": a new tab opens and the field is filled in
   (the FASTA is also copied to the clipboard as a safety net).

### Example: extracting a protein from NCBI

1. Open [NP_149023.2](https://www.ncbi.nlm.nih.gov/protein/NP_149023.2/) on NCBI Protein — the human
   TRIM5 alpha isoform. The page shows a GenPept record: `LOCUS` / `DEFINITION` / `VERSION` lines,
   then an `ORIGIN` block with the 493-residue sequence in lowercase, numbered and grouped by 10
   (recognised the same way as GenBank nucleotide records).
2. Click the extension icon without selecting anything: the "Whole page" scope finds it and lists one
   entry — `protein · 493 aa` — named after the record's version + definition line
   (`NP_149023.2 tripartite motif-containing protein 5 isoform alpha [Homo sapiens].`).
3. With **Short identifiers** on (default), the name is shortened from the full definition line to
   `NP_149023.2`. Pick **One Click** or **Blast** and send it.
4. The generated FASTA (wrapped at 60 characters) is:

   ```
   >NP_149023.2
   MASGILVNVKEEVTCPICLELLTQPLSLDCGHSFCQACLTANHKKSMLDKGESSCPVCRI
   SYQPENIRPNRHVANIVEKLREVKLSPEGQKVDHCARHGEKLLLFCQEDGKVICWLCERS
   QEHRGHHTFLTEEVAREYQVKLQAALEMLRQKQQEAEELEADIREEKASWKTQIQYDKTN
   VLADFEQLRDILDWEESNELQNLEKEEEDILKSLTNSETEMVQQTQSLRELISDLEHRLQ
   GSVMELLQGVDGVIKRTENVTLKKPETFPKNQRRVFRAPDLKGMLEVFRELTDVRRYWVD
   VTVAPNNISCAVISEDKRQVSSPKPQIIYGARGTRYQTFVNFNYCTGILGSQSITSGKHY
   WEVDVSKKTAWILGVCAGFQPDAMCNIEKNENYQPKYGYWVIGLEEGVKCSAFQDSSFHT
   PSVPFIVPLSVIICPDRVGVFLDYEACTVSFFNITNHGFLIYKFSHCSFSQPVFPYLNPR
   KCGVPMTLCSPSS
   ```

   Sent to Blast, this single record is pasted as-is into the query field. Sent to One Click, it would
   need at least 3 more sequences selected (e.g. from other tabs' selections) before the "fewer than 4
   sequences" warning clears.

### Recognised formats

FASTA (wrapped or single-line), GenBank (`ORIGIN … //`), EMBL / UniProt flat file (`SQ … //`),
and "bare" sequences (a long line, or blocks of 10 with line numbers).

### Options

- **Short identifiers** (default): `sp|P99999|CYC_HUMAN Cytochrome c` becomes `CYC_HUMAN`.
  Spaces, `:` `,` `(` `)` etc. break the Newick tree format; duplicates get `_2`, `_3`…
- **Remove gaps** (`-`) and the trailing `*`.

Warnings on One Click: mixed nucleotides / proteins, fewer than 4 sequences (the page says "more than 3").
Blast only ever sends one sequence, so these warnings don't apply there.

## What has been tested, and what has not

- `node test/parser.test.js`: 15 parser tests (formats, false positives on running text, names).
- `test/fill.harness.js`, `test/blast.fill.harness.js` and `test/popup.harness.js` (Playwright /
  Chromium): pasting into four mock forms per destination (visible field, field hidden behind a radio
  button, field injected late, no field), the absence of form submission, and the popup with a
  mocked `browser` API (including the One Click / Blast destination toggle).
- **Not tested: the real site, on either page.** The HTML of ngphylogeny.fr could not be inspected,
  so each field is found heuristically (a label, then attributes, then a lone `<textarea>`).
  If that fails, a banner offers to copy the FASTA. To pin the behaviour down:
  right-click the field > Inspect, then set `CONFIG.textareaSelector` at the top of
  `content/ngphylogeny.js` (One Click) or `content/blast.js` (Blast) (e.g. `'#id_xxx'`).

## Known limits

- Only the top frame of the page is analysed (not iframes).
- No extraction on Firefox internal pages, addons.mozilla.org, or in the PDF viewer.
- Sequences rendered as images or on a canvas cannot be read.
- Manifest V2, chosen for Firefox (no host permission to grant). A Chrome port will need MV3
  (`chrome.scripting.executeScript`; no service worker needed here).

## Releasing a new version (maintainers)

The extension is self-distributed: signed by Mozilla (so Firefox accepts the install) but not listed on
addons.mozilla.org, and updated via its own `updates.json` rather than AMO's update mechanism.
`.github/workflows/release.yml` automates this on every version tag push.

**One-time setup:**

1. Create an API key/secret at
   [addons.mozilla.org/developers/addon/api/key/](https://addons.mozilla.org/developers/addon/api/key/)
   (any Firefox account; no need to have published anything yet).
2. Add them as repository secrets (Settings > Secrets and variables > Actions):
   `AMO_JWT_ISSUER` (the API key) and `AMO_JWT_SECRET` (the API secret).

**Each release:**

1. Bump `"version"` in `manifest.json` (and, for consistency, `package.json`).
2. Commit, then tag and push: `git tag v0.3.0 && git push origin v0.3.0` — the tag's version must match
   `manifest.json`, or the workflow fails fast before signing anything.
3. The workflow runs the parser tests, lints and builds the extension, signs it via the AMO API
   (`--channel=unlisted`, i.e. self-distribution, no public review queue), and publishes a GitHub Release
   with two assets: the signed `.xpi` and an `updates.json` pointing to it.
4. Because `manifest.json`'s `update_url` always points at
   `.../releases/latest/download/updates.json`, every previously installed copy of the extension picks
   up the new version automatically (Firefox checks roughly once a day).

To sign a build locally instead (e.g. to test signing before tagging), run
`AMO_JWT_ISSUER=... AMO_JWT_SECRET=... npm run sign`.

## Privacy

Permissions: `activeTab` (reads the page only when you click), `storage` (temporary hand-off of the
FASTA, deleted as soon as it is consumed or after 5 min), `clipboardWrite`, and content scripts
limited to `https://ngphylogeny.fr/workflows/oneclick*` and `https://ngphylogeny.fr/blast*`.
No data is sent anywhere else, except that Firefox itself periodically checks
`manifest.json`'s `update_url` (a static file on GitHub) to see if a newer signed build is available.
