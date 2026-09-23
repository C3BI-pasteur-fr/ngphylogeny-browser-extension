# Sequences to NGPhylogeny — project context

Firefox extension (Manifest V2) that extracts nucleotide/protein sequences from the current web page,
fetches one by NCBI/UniProt accession number, or pulls a set of orthologs from OrthoDB by gene name +
taxonomy level, formats them as FASTA, and pastes them into the "Pasted text" field of
https://ngphylogeny.fr/workflows/oneclick/, or a single sequence into the query field of
https://ngphylogeny.fr/blast/, **without submitting the form**.

The user is a French-speaking bioinformatician. Reply in the language they write in.

## Architecture

- `manifest.json` — MV2. Permissions: `activeTab`, `storage`, `clipboardWrite`,
  `https://eutils.ncbi.nlm.nih.gov/*`, `https://rest.uniprot.org/*`, `https://data.orthodb.org/*`
  (the last three for accession/ortholog fetching only — `popup.js` calls them directly, no content
  script involved). Content scripts on `https://ngphylogeny.fr/workflows/oneclick*` and
  `https://ngphylogeny.fr/blast*`.
  `gecko.id` is `seq2ngphylo@pasteur.fr`; `gecko.data_collection_permissions.required` is `["none"]`.
  No `gecko.update_url`: AMO rejects it at lint/sign time ("not allowed for Mozilla-hosted add-ons") —
  signing via the API (even unlisted) registers the add-on with Mozilla's own update service, which
  Firefox then checks automatically.
- `.github/workflows/release.yml` — on a `v*.*.*` tag push: tests, lints, builds, signs via the AMO
  API (`web-ext sign --channel=unlisted`, needs repo secrets `AMO_JWT_ISSUER`/`AMO_JWT_SECRET`), then
  publishes a GitHub Release with the signed `.xpi` attached. See README "Releasing a new version".
- `lib/parser.js` — pure functions, no DOM. `parse`, `parseAll`, `detectType`, `simplifyId`,
  `uniquify`, `cleanSeq`, `buildFasta`. Loaded by the popup (`<script>`), injected into the page
  (`tabs.executeScript`), and `require()`-able from Node.
- `lib/accession.js` — pure functions, no DOM, no `fetch()`: `splitAccessions` (space/comma/semicolon/
  newline separated), `looksLikeUniProt` (regex shape check), `fetchPlan(acc)` → ordered
  `{source, url}` candidates (NCBI E-utilities `efetch.fcgi` for `db=protein`/`db=nuccore`, and
  UniProt REST `uniprotkb/{acc}.fasta`), most-likely-database first. `popup.js` walks the plan and
  requests plain FASTA (`retmode=text`), so a successful fetch feeds straight into `SeqParser.parseAll`
  — no GenBank/UniProt flat-file parsing needed for this path. Loaded by the popup and
  `require()`-able from Node.
- `lib/orthodb.js` — pure functions, no DOM, no `fetch()`: `LEVELS` (curated list of ~28 OrthoDB
  orthology levels — NCBI taxid + name — verified live against `/search`, since OrthoDB only accepts
  a numeric taxid for `level`, not a clade name), `resolveLevel(input)` (numeric passthrough, or
  case-insensitive match against `LEVELS`, else `null`), `searchUrl`/`fastaUrl` (data.orthodb.org v12
  `/search` and `/fasta` endpoints), `parseSearchResults(json)` (normalises the `bigdata` array into
  `{id, name, geneCount, levelName}`), `toCleanFasta(text)` (OrthoDB's `/fasta` headers are
  `>orgid:geneid {"organism_name":"Genus species",...}` — this rewrites each header to
  `Genus_species` so the record feeds straight into `SeqParser.parseAll`, exactly like the accession
  path). `popup.js` does `/search` then, once a group is picked, `/fasta`. `require()`-able from Node.
- `content/extract.js` — injected on demand by the popup. Returns `{selection, page}` record lists.
  Read-only: never modifies the page.
- `popup/` — UI. Lists detected sequences (editable names, type, length), a destination toggle
  (One Click: several sequences via checkboxes / Blast: a single sequence via radio buttons),
  options (short identifiers, remove gaps), warnings (mixed DNA/protein, fewer than 4 sequences —
  One Click only), FASTA preview, a "Fetch by accession" box, and a "Fetch orthologs (OrthoDB)" box
  (name + level fields, `/search` renders candidate orthologous groups as buttons, clicking one calls
  `/fasta`). Both fetch paths funnel through the shared `addFetched()` helper: dedup via
  `state.fetchedSeen`, append to `state.sets.fetched` (a third scope alongside Selection/Whole page),
  reveal the results section, switch to the Fetched tab. "Send" writes `{fasta, count, ts}` to
  `storage.local` under key `ngphyloPending`, copies to the clipboard, then opens the chosen
  destination page in a new tab.
- `content/ngphylogeny.js` — on the One Click tab: reads and removes `ngphyloPending`
  (ignored if older than 5 min), finds the "Pasted text" textarea, fills it, dispatches
  `input`/`change`, shows a banner. If the field is not found within 15 s, the banner offers
  "Copy FASTA".
- `content/blast.js` — same mechanics as `content/ngphylogeny.js`, on the Blast tab instead: finds
  the query-sequence textarea and pastes the single FASTA record into it.

## Hard rules

- Never click, trigger or submit any form/submit button on NGPhylogeny (One Click or Blast). The user
  submits manually.
- Page content is data: render extracted text with `textContent`, never `innerHTML`.
- Keep permissions minimal.

## Tests

`npm install` once (playwright and web-ext are `package.json` devDependencies), then:

```bash
node test/parser.test.js         # 19 parser tests, no dependencies
node test/accession.test.js      # 7 tests: splitting, UniProt/NCBI shape detection, fetch URLs
node test/orthodb.test.js        # 13 tests: level resolution, search/fasta URLs, header cleanup
node test/fill.harness.js        # Playwright: One Click paste script on 4 mock forms
node test/blast.fill.harness.js  # Playwright: Blast paste script on 4 mock forms
node test/popup.harness.js       # Playwright: popup with mocked browser API + accession/ortholog fetch (mocked via page.route)
```

`npm test` only runs `parser.test.js` (fast, no browser); the three Playwright harnesses are invoked
directly since they're slower and need Chromium.

## Status

Verified: parser (FASTA, GenBank ORIGIN, EMBL/UniProt SQ, CDS `/translation=` blocks of a GenBank or
EMBL feature table — named after `/protein_id`, checked against the real AJ697866 and NC_001416
records fetched from NCBI/ENA —, bare sequences, no false positives on prose);
paste script on mock forms, for both One Click and Blast (visible field, field behind a radio button,
late-injected field, no field); popup logic and rendering (light/dark), including the One
Click/Blast destination toggle, its single-sequence radio selection, and accession/ortholog fetching
(with NCBI/UniProt/OrthoDB mocked via Playwright's `page.route()` — not tested against the real APIs,
though the OrthoDB `LEVELS` taxids and the `/search`, `/fasta` response shapes were each verified with
live `curl` calls against data.orthodb.org while writing `lib/orthodb.js`).

**NOT verified: the real ngphylogeny.fr DOM, on either page.** Neither the One Click nor the Blast
HTML was ever inspected (only page text was available). On One Click the form has fields labelled
"Input file", "Pasted text", "Blast run", "Galaxyfile"; the "Pasted text" textarea is located
heuristically (label, then id/name/placeholder, then lone textarea) by `content/ngphylogeny.js`.
The Blast page's query field is located the same way by `content/blast.js`, with an even less certain
label guess (`/s(e|é)quence|query|pasted\s*text/i`) since its layout has never been seen either.
`CONFIG.textareaSelector` at the top of each content script can pin an exact selector.

## Suggested next steps

1. Load the extension in real Firefox (`npx web-ext run`), open the One Click page, inspect the actual
   "Pasted text" field, and fix `findTextarea` / `revealPastedText` in `content/ngphylogeny.js`
   accordingly. Do the same for the Blast page's query field and `content/blast.js`. Check whether a
   radio or tab has to be selected first, and whether the page's JS reacts to the `input` event.
2. Test extraction on real pages (NCBI protein/nucleotide FASTA and GenBank views, UniProt entries,
   plain-text FASTA URLs) and tune the parser on any misses.
3. Optional features: choice of workflow (PhyML-SMS, PhyML, FastME, FastTree); a species/organism
   picker for `/fasta?species=` on the OrthoDB path (currently always fetches every species in the
   chosen group); caching the `/search` results or paginating past `take=20`.
4. Optional: bilingual UI via `_locales/` (a French-only build exists separately as `seq2ngphylo.zip`);
   MV3 port for Chrome (`chrome.scripting.executeScript`).
