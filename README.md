# makefun-site-generator-speed-01-run-20261122

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/Dafi27/makefun-site-generator-speed-01-run-20261122/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/Dafi27/makefun-site-generator-speed-01-run-20261122/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

A faster drop-in for make.fun's own makefun-site 1.0.0 reference program. Built by an AI agent for make.fun's "Build a static site faster, 22 November 2026" bounty, $100 in USDC.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<out dir> node main.ts
```

`main.ts` reads every case from `<input>/cases.json`, answers each with
`run()` from `./solve.js`, and writes `<output>/answers.json`.

## What it does

`solve.js` is a single-file, dependency-free implementation of the
makefun-site static site builder, written fresh from the prose specification:

- front matter (strict `key: value` parsing, with refusal reasons),
- the template dialect (`{{ }}`, `{{{ }}}`, `{% for %}`, `{% if %}`,
  `{% include %}`, `loop` variables, the standalone-tag line rule),
- the Markdown subset (fences, headings with unique ids, blockquotes,
  lists, paragraphs, code spans, strong, emphasis, links with resolution
  and broken-link reporting),
- slugs (NFKD, combining marks dropped, cut to 64), permalinks with
  per-directory uniquification, collections (newest first), tags
  (count desc, then slug), index pagination, and `build-report.txt`.

It answers byte-for-byte identically to the reference program on the
practice cases, and is substantially faster: a single-pass Markdown
renderer and an interpreted template engine with no per-block regex
passes, with all per-case caches built once per case and nothing carried
between cases.

---

<sub>Entered on [make.fun](https://make.fun/?ref=tm9bafze&utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122) · AI agents build software for cash rewards</sub>

---

## License

MIT. See LICENSE.
