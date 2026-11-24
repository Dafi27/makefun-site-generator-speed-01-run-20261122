// solve.js — fast drop-in for makefun-site 1.0.0 (site-generator-speed bounty).
//
// Written fresh from the prose specification in baselines/makefun-site/vendor/
// makefun-site/README.md (plus the practice reference outputs). The reference
// implementation's source was never read. Pure JavaScript, Node stdlib only,
// no network, no clock, no randomness, no file access. `run(input)` returns
// the output tree as an object { path: text }.
//
// All caches are created fresh inside each run() call: nothing is carried
// from one case to the next.

'use strict';

// ---------------------------------------------------------------- utilities

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESC_RE = /[&<>"']/g;

function esc(s) {
  return s.replace(ESC_RE, (ch) => ESC_MAP[ch]);
}

// Slug: NFKD, drop combining marks (\p{M}), lower-case, each run of
// non-[a-z0-9] becomes one '-', none at either end, cut to 64 chars (a '-'
// left at the cut dropped), 'untitled' when nothing is left.
const COMBINING_RE = /\p{M}/gu;
const NON_ALNUM_RUN_RE = /[^a-z0-9]+/g;

function slugify(text, cache) {
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let v = text.normalize('NFKD').replace(COMBINING_RE, '').toLowerCase().replace(NON_ALNUM_RUN_RE, '-');
  let a = 0;
  let b = v.length;
  while (a < b && v.charCodeAt(a) === 45) a++;
  while (b > a && v.charCodeAt(b - 1) === 45) b--;
  v = v.slice(a, b);
  if (v.length > 64) {
    v = v.slice(0, 64);
    if (v.charCodeAt(63) === 45) v = v.slice(0, 63);
  }
  if (v === '') v = 'untitled';
  cache.set(text, v);
  return v;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// '2026-11-09' -> '9 November 2026' (from the string alone).
function dateLong(d) {
  return (+d.slice(8, 10)) + ' ' + MONTHS[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4);
}

// ---------------------------------------------------------------- front matter

const KEY_RE = /^[a-z_]+$/;
const LAYOUT_RE = /^[a-z0-9-]+$/;
const SLUG_VALUE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(y) {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}

function validDate(val) {
  const m = DATE_RE.exec(val);
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1) return false;
  const dim = mo === 2 ? (isLeap(y) ? 29 : 28) : DAYS_IN_MONTH[mo - 1];
  return d <= dim;
}

// Parse a quoted or bare string value. Returns the string, or null with the
// reason set on the returned object.
function parseStringValue(val, key) {
  if (val.charCodeAt(0) === 34) { // '"'
    let out = '';
    let i = 1;
    const n = val.length;
    while (i < n) {
      const ch = val.charCodeAt(i);
      if (ch === 92) { // backslash
        const nx = val[i + 1];
        if (nx === '"' || nx === '\\') {
          out += nx;
          i += 2;
          continue;
        }
        return { error: `key "${key}": a quoted string is not closed` };
      }
      if (ch === 34) {
        if (i !== n - 1) return { error: `key "${key}": a quoted string is not closed` };
        return { value: out };
      }
      out += val[i];
      i++;
    }
    return { error: `key "${key}": a quoted string is not closed` };
  }
  if (val.charCodeAt(0) === 91) { // '['
    return { error: `key "${key}": a bare string opens on [` };
  }
  return { value: val };
}

// Validate one front-matter key's value and store it in fm.
// Returns null on success, or a refusal reason string.
function setFmKey(fm, key, val) {
  switch (key) {
    case 'title': {
      const r = parseStringValue(val, key);
      if (r.error) return r.error;
      fm.title = r.value;
      return null;
    }
    case 'summary': {
      const r = parseStringValue(val, key);
      if (r.error) return r.error;
      fm.summary = r.value;
      return null;
    }
    case 'date': {
      if (!validDate(val)) return 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)';
      fm.date = val;
      return null;
    }
    case 'tags': {
      if (val.charCodeAt(0) !== 91 || val.charCodeAt(val.length - 1) !== 93) {
        return 'key "tags": not a list [a, b]';
      }
      const inner = val.slice(1, -1);
      const tags = [];
      if (inner.trim() !== '') {
        const parts = inner.split(',');
        for (let p = 0; p < parts.length; p++) {
          const t = parts[p].trim();
          if (t === '' || t.indexOf('"') !== -1 || t.indexOf('[') !== -1 || t.indexOf(']') !== -1) {
            return 'key "tags": an empty tag, or one holding " [ or ]';
          }
          tags.push(t);
        }
      }
      fm.tags = tags;
      return null;
    }
    case 'draft': {
      if (val === 'true') { fm.draft = true; return null; }
      if (val === 'false') { fm.draft = false; return null; }
      return 'key "draft": true or false';
    }
    case 'layout': {
      if (!LAYOUT_RE.test(val)) return 'key "layout": not a template name';
      fm.layout = val;
      return null;
    }
    case 'slug': {
      if (val.length > 64 || !SLUG_VALUE_RE.test(val)) return 'key "slug": not a slug';
      fm.slug = val;
      return null;
    }
    default:
      return `unknown key "${key}"`;
  }
}

// Parse the front matter of a normalized (LF-only) source.
// Returns { fm, body } or { error } (a refusal reason string).
function parseFrontMatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return { error: 'no front matter' };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { close = i; break; }
  }
  if (close === -1) return { error: 'the front matter is not closed' };
  const fm = { title: '', summary: '', date: '', tags: [], draft: false, layout: '', slug: '' };
  const seen = new Set();
  for (let i = 1; i < close; i++) {
    const line = lines[i];
    if (/^[ \t]*$/.test(line)) continue;
    if (line.charCodeAt(0) === 35) continue; // '#': a comment line
    const ci = line.indexOf(':');
    const n = i + 1; // line number, the opening '---' is line 1
    if (ci <= 0) return { error: `line ${n} is not "key: value"` };
    const key = line.slice(0, ci);
    if (!KEY_RE.test(key)) return { error: `line ${n} is not "key: value"` };
    let val = line.slice(ci + 1);
    if (val.charCodeAt(0) === 32) val = val.slice(1); // one space after the colon
    val = val.replace(/[ \t]+$/, '');
    if (val === '') return { error: `key "${key}" has no value` };
    if (seen.has(key)) return { error: `key "${key}" is given twice` };
    seen.add(key);
    const err = setFmKey(fm, key, val);
    if (err) return { error: err };
  }
  if (!fm.title) return { error: 'no title' };
  return { fm, body: lines.slice(close + 1).join('\n') };
}

// ---------------------------------------------------------------- markdown

// Characters a backslash may escape in inline text.
const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);

function isEscapable(ch) {
  return ESCAPABLE.has(ch);
}

// Find the next unescaped backtick at an index >= from. -1 when there is
// none. (The caller guarantees the character at from - 1 is not a backtick,
// so a span found here always has at least one character between its fences.)
function findCodeClose(s, from) {
  const n = s.length;
  let j = from;
  while (j < n) {
    const c = s[j];
    if (c === '\\' && j + 1 < n && isEscapable(s[j + 1])) { j += 2; continue; }
    if (c === '`') return j;
    j++;
  }
  return -1;
}

// Find the next unescaped '**' with at least one character after `from`.
// -1 when there is none.
function findStrongClose(s, from) {
  const n = s.length;
  let j = from;
  while (j + 1 < n) {
    const c = s[j];
    if (c === '\\' && j + 1 < n && isEscapable(s[j + 1])) { j += 2; continue; }
    if (c === '*' && s[j + 1] === '*') {
      if (j > from) return j;
      j += 2;
      continue;
    }
    j++;
  }
  return -1;
}

// Find the next unescaped single '*' with at least one character after
// `from`. A '**' pair is a strong delimiter, never an emphasis closer, so a
// pair is skipped whole: the closer is the first '*' that is not the first
// star of a '**' pair. (That is why '***quick***' closes an emphasis at its
// final star, while the '**' of '**turn**' does not close one at all.)
// -1 when there is none.
function findEmClose(s, from) {
  const n = s.length;
  let j = from;
  while (j < n) {
    const c = s[j];
    if (c === '\\' && j + 1 < n && isEscapable(s[j + 1])) { j += 2; continue; }
    if (c === '*') {
      if (s[j + 1] === '*') { j += 2; continue; }
      if (j > from) return j;
      j++;
      continue;
    }
    j++;
  }
  return -1;
}

// Inline rendering. `ctx` carries the link resolver:
//   ctx.resolveLink(target) -> href string, or null when the link is broken
//   ctx.broken(target)      -> records a broken link (deduplicated by caller)
function inlineHTML(s, ctx) {
  let out = '';
  let i = 0;
  const n = s.length;
  let cs = 0; // start of the current plain-text chunk
  const flush = (to) => { if (to > cs) out += esc(s.slice(cs, to)); };
  while (i < n) {
    const c = s[i];
    if (c === '\\' && i + 1 < n && isEscapable(s[i + 1])) {
      flush(i);
      out += s[i + 1];
      i += 2;
      cs = i;
      continue;
    }
    if (c === '`') {
      // A backtick opens a code span only when the next character is not
      // another backtick (a pair of adjacent backticks is literal text; the
      // second one may open a span of its own).
      if (s[i + 1] === '`') {
        i++;
        continue;
      }
      const j = findCodeClose(s, i + 1);
      if (j !== -1) {
        flush(i);
        out += '<code>' + esc(s.slice(i + 1, j)) + '</code>';
        i = j + 1;
        cs = i;
        continue;
      }
      i++;
      continue;
    }
    if (c === '*' && s[i + 1] === '*') {
      // A '**' opens strong only when it is not immediately followed by
      // another '**' (a run of four or more stars: the first pair is
      // literal, the next pair is judged on its own).
      if (s[i + 2] === '*' && s[i + 3] === '*') {
        i += 2;
        continue;
      }
      const j = findStrongClose(s, i + 2);
      if (j !== -1) {
        flush(i);
        out += '<strong>' + inlineHTML(s.slice(i + 2, j), ctx) + '</strong>';
        i = j + 2;
        cs = i;
        continue;
      }
      i += 2;
      continue;
    }
    if (c === '*') {
      const j = findEmClose(s, i + 1);
      if (j !== -1) {
        flush(i);
        out += '<em>' + inlineHTML(s.slice(i + 1, j), ctx) + '</em>';
        i = j + 1;
        cs = i;
        continue;
      }
      i++;
      continue;
    }
    if (c === '[') {
      // [text](target): first unescaped ']' closes the text, '(' must follow
      // at once, the next ')' closes the target; the target must not be
      // empty or hold whitespace.
      let j = i + 1;
      let close = -1;
      while (j < n) {
        if (s[j] === '\\' && j + 1 < n && isEscapable(s[j + 1])) { j += 2; continue; }
        if (s[j] === ']') { close = j; break; }
        j++;
      }
      if (close !== -1 && s[close + 1] === '(') {
        let k = close + 2;
        while (k < n && s[k] !== ')') k++;
        if (k < n) {
          const target = s.slice(close + 2, k);
          if (target !== '' && !/[\s]/.test(target)) {
            const text = inlineHTML(s.slice(i + 1, close), ctx);
            const href = ctx.resolveLink(target);
            if (href === null) ctx.broken(target);
            flush(i);
            out += '<a href="' + esc(href === null ? target : href) + '">' + text + '</a>';
            i = k + 1;
            cs = i;
            continue;
          }
        }
      }
      i++;
      continue;
    }
    i++;
  }
  flush(n);
  return out;
}

function isBlankLine(l) {
  for (let i = 0; i < l.length; i++) {
    const c = l.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

const FENCE_RE = /^```([A-Za-z0-9_+\-]*)[ \t]*$/;
const FENCE_CLOSE_RE = /^```[ \t]*$/;
const HEADING_RE = /^(#{1,6})[ \t]+(.*)$/;
const HR_RE = /^(---|\*\*\*)[ \t]*$/;
const BULLET_RE = /^[-*] /;
const ORDERED_RE = /^(\d+)\. /;
const CONTINUATION_RE = /^ {2,}\S/;

// Render a body's Markdown. Returns { html, toc, excerpt }.
// `ctx` is the inline context (link resolution + broken-link reporting).
// `slugCache` and `headingSlugs` (a Map for this page) back the heading ids.
function renderMarkdown(body, ctx, slugCache, headingSlugs) {
  const lines = body.split('\n');
  const n = lines.length;
  const out = [];
  const toc = [];
  let excerpt = '';
  let haveExcerpt = false;
  let i = 0;
  while (i < n) {
    const line = lines[i];
    if (isBlankLine(line)) { i++; continue; }

    // Fence: three backticks + optional language, then spaces/tabs only.
    const fm = FENCE_RE.exec(line);
    if (fm) {
      const lang = fm[1];
      i++;
      const buf = [];
      while (i < n && !FENCE_CLOSE_RE.test(lines[i])) {
        buf.push(esc(lines[i]) + '\n');
        i++;
      }
      if (i < n) i++; // consume the closing fence
      out.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' +
        buf.join('') + '</code></pre>\n');
      continue;
    }

    // Heading: 1-6 '#', at least one space/tab, then text.
    const hm = HEADING_RE.exec(line);
    if (hm) {
      const text = hm[2].replace(/[ \t]+$/, '');
      if (text !== '') {
        const level = hm[1].length;
        const base = slugify(text, slugCache);
        let id = base;
        let k = 2;
        while (headingSlugs.has(id)) { id = base + '-' + k; k++; }
        headingSlugs.set(id, true);
        const inner = inlineHTML(text, ctx);
        if (level === 2 || level === 3) toc.push({ level, id, html: inner });
        out.push('<h' + level + ' id="' + id + '">' + inner + '</h' + level + '>\n');
        i++;
        continue;
      }
      // No text after the '#'s: not a heading, fall through to a paragraph.
    }

    // Thematic break.
    if (HR_RE.test(line)) {
      out.push('<hr>\n');
      i++;
      continue;
    }

    // Blockquote: lines opening on '>'.
    if (line.charCodeAt(0) === 62) { // '>'
      const parts = [];
      while (i < n && lines[i].charCodeAt(0) === 62) {
        let l = lines[i].slice(1);
        if (l.charCodeAt(0) === 32) l = l.slice(1);
        l = l.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
        if (l !== '') parts.push(l);
        i++;
      }
      if (parts.length) {
        out.push('<blockquote>\n<p>' + inlineHTML(parts.join('\n'), ctx) + '</p>\n</blockquote>\n');
      } else {
        out.push('<blockquote>\n</blockquote>\n');
      }
      continue;
    }

    // List: bullet '- ' / '* ', or ordered 'digits. '.
    const bm = BULLET_RE.exec(line);
    const om = bm ? null : ORDERED_RE.exec(line);
    if (bm || om) {
      const ordered = !!om;
      const startNum = ordered ? parseInt(om[1], 10) : 0;
      const items = [];
      while (i < n) {
        const l = lines[i];
        const m2 = ordered ? ORDERED_RE.exec(l) : BULLET_RE.exec(l);
        if (m2) {
          items.push(l.slice(m2[0].length));
          i++;
          continue;
        }
        if (CONTINUATION_RE.test(l) && items.length) {
          items[items.length - 1] += '\n' + l.trim();
          i++;
          continue;
        }
        break;
      }
      out.push(ordered && startNum !== 1
        ? '<ol start="' + startNum + '">\n'
        : (ordered ? '<ol>\n' : '<ul>\n'));
      for (let t = 0; t < items.length; t++) {
        out.push('<li>' + inlineHTML(items[t], ctx) + '</li>\n');
      }
      out.push(ordered ? '</ol>\n' : '</ul>\n');
      continue;
    }

    // Paragraph: this line and the lines after it, up to a blank line, a
    // fence, a heading or a thematic break. (A list or blockquote line does
    // NOT end a paragraph; it continues it.) Each line trimmed, joined
    // by '\n'.
    const parts = [line.trim()];
    i++;
    while (i < n) {
      const l = lines[i];
      if (isBlankLine(l)) break;
      if (FENCE_RE.test(l)) break;
      const hm2 = HEADING_RE.exec(l);
      if (hm2 && hm2[2].replace(/[ \t]+$/, '') !== '') break;
      if (HR_RE.test(l)) break;
      parts.push(l.trim());
      i++;
    }
    const inner = inlineHTML(parts.join('\n'), ctx);
    out.push('<p>' + inner + '</p>\n');
    if (!haveExcerpt) {
      excerpt = inner;
      haveExcerpt = true;
    }
  }
  return { html: out.join(''), toc, excerpt };
}

// ---------------------------------------------------------------- templates

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR_RE = /^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/;
const INCLUDE_RE = /^include\s+"([^"]*)"$/;

// Parse a template source into an AST.
// Returns { nodes } or { error } (a reason string for the report).
//
// A {% %} tag alone on its line (only spaces/tabs beside it) takes the whole
// line with it, its newline included. Text, {{ }} and {{{ }}} never do.
function parseTemplate(src) {
  const root = { t: 'root', body: [] };
  const stack = [{ t: 'root', body: root.body }];
  let current = root.body;

  const pushNode = (node) => { current.push(node); };

  const parsePath = (text) => {
    const p = text.trim();
    if (!PATH_RE.test(p)) return null;
    return p.split('.');
  };

  // Handle one {% %} tag's inner text (already trimmed).
  const handleTag = (inner) => {
    if (inner === 'endfor') {
      const top = stack[stack.length - 1];
      if (!top || top.t !== 'for') return 'endfor without for';
      stack.pop();
      current = stack[stack.length - 1].body;
      return null;
    }
    if (inner === 'endif') {
      const top = stack[stack.length - 1];
      if (!top || top.t !== 'if') return 'endif without if';
      stack.pop();
      current = stack[stack.length - 1].body;
      return null;
    }
    if (inner === 'else') {
      const top = stack[stack.length - 1];
      if (!top || top.t !== 'if' || top.branch === 'else') return 'else without if';
      top.branch = 'else';
      top.body = top.node.els;
      current = top.body;
      return null;
    }
    const fm = FOR_RE.exec(inner);
    if (fm) {
      const path = parsePath(fm[2]);
      if (!path) return 'for needs a path';
      const node = { t: 'for', varName: fm[1], path, body: [] };
      pushNode(node);
      const frame = { t: 'for', node, body: node.body };
      stack.push(frame);
      current = node.body;
      return null;
    }
    if (inner === 'if' || inner.startsWith('if ') || inner.startsWith('if not ')) {
      let neg = false;
      let rest = inner.slice(2).trim();
      if (rest.startsWith('not ')) {
        neg = true;
        rest = rest.slice(4).trim();
      }
      const path = parsePath(rest);
      if (!path) return 'if needs a path';
      const node = { t: 'if', neg, path, then: [], els: [] };
      pushNode(node);
      const frame = { t: 'if', node, branch: 'then', body: node.then };
      stack.push(frame);
      current = node.then;
      return null;
    }
    const im = INCLUDE_RE.exec(inner);
    if (im) {
      pushNode({ t: 'include', name: im[1] });
      return null;
    }
    return `unknown tag "${inner}"`;
  };

  // Tokenize one line's content (no standalone handling here).
  const tokenizeLine = (line) => {
    let i = 0;
    const n = line.length;
    while (i < n) {
      const jVar = line.indexOf('{{', i);
      const jTag = line.indexOf('{%', i);
      let j = -1;
      let kind = 0; // 1 = var, 2 = raw var, 3 = tag
      if (jVar !== -1 && (jTag === -1 || jVar < jTag)) {
        j = jVar;
        kind = line[j + 2] === '{' ? 2 : 1;
      } else if (jTag !== -1) {
        j = jTag;
        kind = 3;
      }
      if (j === -1) {
        pushNode({ t: 'text', s: line.slice(i) });
        return null;
      }
      if (j > i) pushNode({ t: 'text', s: line.slice(i, j) });
      if (kind === 1) {
        const end = line.indexOf('}}', j + 2);
        if (end === -1) return 'unclosed {{';
        const path = parsePath(line.slice(j + 2, end));
        if (!path) return 'not a path';
        pushNode({ t: 'var', path, raw: false });
        i = end + 2;
      } else if (kind === 2) {
        const end = line.indexOf('}}}', j + 3);
        if (end === -1) return 'unclosed {{{';
        const path = parsePath(line.slice(j + 3, end));
        if (!path) return 'not a path';
        pushNode({ t: 'var', path, raw: true });
        i = end + 3;
      } else {
        const end = line.indexOf('%}', j + 2);
        if (end === -1) return 'unclosed {%';
        const err = handleTag(line.slice(j + 2, end).trim());
        if (err) return err;
        i = end + 2;
      }
    }
    return null;
  };

  // Walk the source line by line so the standalone-tag rule can apply.
  let pos = 0;
  const total = src.length;
  while (pos < total) {
    let eol = src.indexOf('\n', pos);
    let line;
    let hadNewline = true;
    if (eol === -1) {
      line = src.slice(pos);
      hadNewline = false;
    } else {
      line = src.slice(pos, eol);
    }
    // A {% %} tag alone on its line (only spaces/tabs beside it).
    const trimmed = line.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
    if (trimmed.startsWith('{%') && trimmed.endsWith('%}') && trimmed.indexOf('{%', 2) === -1) {
      const err = handleTag(trimmed.slice(2, -2).trim());
      if (err) return { error: err };
      // The whole line, newline included, is taken by the tag.
    } else {
      const err = tokenizeLine(line);
      if (err) return { error: err };
      if (hadNewline) pushNode({ t: 'text', s: '\n' });
    }
    pos = eol === -1 ? total : eol + 1;
  }

  if (stack.length > 1) {
    const top = stack[stack.length - 1];
    return { error: top.t === 'for' ? 'for is not closed' : 'if is not closed' };
  }
  return { nodes: root.body };
}

function truthy(v) {
  if (v === undefined || v === null || v === false) return false;
  if (v === '' || v === 0 || v !== v) return false; // '' / 0 / NaN
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

// A value written as: a string itself; a number in JavaScript's own digits;
// true/false; an array as its items written and joined by ', '; anything
// else ''.
function writeValue(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    let s = '';
    for (let i = 0; i < v.length; i++) {
      if (i) s += ', ';
      s += writeValue(v[i]);
    }
    return s;
  }
  return '';
}

// Resolve a path's first name: from the innermost loop that binds it
// (`loop` before the element variable), else from the page's values. Each
// next name is an own property of the value so far, or the path is undefined.
function resolvePath(path, frames) {
  const first = path[0];
  let v;
  let found = false;
  for (let fi = frames.length - 1; fi >= 0; fi--) {
    const fr = frames[fi];
    if (first === 'loop' && fr.loop !== undefined) {
      v = fr.loop;
      found = true;
      break;
    }
    if (fr.vars && Object.hasOwn(fr.vars, first)) {
      v = fr.vars[first];
      found = true;
      break;
    }
    if (fr.root && Object.hasOwn(fr.root, first)) {
      v = fr.root[first];
      found = true;
      break;
    }
  }
  if (!found) return undefined;
  for (let k = 1; k < path.length; k++) {
    if (v === null || v === undefined) return undefined;
    if (!Object.hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

// Render parsed nodes into `out` (an array of string chunks).
// `templates` maps a template name to its parsed nodes (or undefined when it
// does not parse). `depth` is the include nesting level (0 at the top).
function renderNodes(nodes, frames, out, templates, depth) {
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    if (node.t === 'text') {
      out.push(node.s);
      continue;
    }
    if (node.t === 'var') {
      const w = writeValue(resolvePath(node.path, frames));
      out.push(node.raw ? w : esc(w));
      continue;
    }
    if (node.t === 'for') {
      const v = resolvePath(node.path, frames);
      if (Array.isArray(v)) {
        for (let k = 0; k < v.length; k++) {
          frames.push({
            vars: { [node.varName]: v[k] },
            loop: { index: k + 1, first: k === 0, last: k === v.length - 1, length: v.length },
          });
          renderNodes(node.body, frames, out, templates, depth);
          frames.pop();
        }
      }
      continue;
    }
    if (node.t === 'if') {
      let cond = truthy(resolvePath(node.path, frames));
      if (node.neg) cond = !cond;
      renderNodes(cond ? node.then : node.els, frames, out, templates, depth);
      continue;
    }
    if (node.t === 'include') {
      const tpl = templates[node.name];
      if (tpl && depth < 8) {
        renderNodes(tpl, frames, out, templates, depth + 1);
      }
      continue;
    }
  }
}

// ---------------------------------------------------------------- the build

const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

// Resolve a relative link target from a source directory ('', 'posts/2018',
// 'docs/guides', ...). '.' and '..' steps are applied, never above the root.
function resolveRelative(dir, target) {
  const out = dir === '' ? [] : dir.split('/');
  const segs = target.split('/');
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length) out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

// The entrypoint: build one site from one input case and return the output
// tree as an object { outputPath: text }.
function run(input) {
  const site = input.site;
  const base = site.base_url.replace(/\/+$/, '');
  const perPage = site.per_page;
  const recentN = site.recent;

  // Fresh caches for this case only.
  const slugCache = new Map();
  const reports = [];
  const broken = new Map(); // 'source\0target' -> 'broken-link source -> target'

  // Templates, parsed in code-unit order of name. Unparseable ones are
  // reported and left out.
  const templates = {};
  const templateNames = Object.keys(input.templates).sort();
  for (let i = 0; i < templateNames.length; i++) {
    const name = templateNames[i];
    const parsed = parseTemplate(input.templates[name]);
    if (parsed.error) {
      reports.push(`template "${name}": ${parsed.error}`);
    } else {
      templates[name] = parsed.nodes;
    }
  }

  // Files, sorted by path in code-unit order.
  const files = input.files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // Pass 1: front-matter checks, in source order. A source is kept only when
  // every check passes.
  const kept = []; // { path, fm, body, isPost, dir, slug, url, outPath }
  const taken = new Map(); // directory -> Set of slugs already used there
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.path.endsWith('.md')) continue;
    const content = file.content.replace(/\r\n?/g, '\n');
    const parsed = parseFrontMatter(content);
    if (parsed.error) {
      reports.push(`refused ${file.path}: ${parsed.error}`);
      continue;
    }
    const fm = parsed.fm;
    const isPost = file.path.startsWith('posts/');
    const slashAt = file.path.lastIndexOf('/');
    const dir = isPost ? 'posts' : (slashAt === -1 ? '' : file.path.slice(0, slashAt));
    if (file.path.startsWith('tags/') || file.path.startsWith('page/')) {
      reports.push(`refused ${file.path}: ${file.path.startsWith('tags/') ? 'tags/' : 'page/'} is the generator's own`);
      continue;
    }
    if (isPost && !fm.date) {
      reports.push(`refused ${file.path}: a post needs a date`);
      continue;
    }
    const layout = fm.layout || (isPost ? 'post' : 'page');
    if (!templates[layout]) {
      reports.push(`refused ${file.path}: layout "${layout}" is no template that parses`);
      continue;
    }
    if (fm.draft) {
      reports.push(`draft ${file.path}`);
      continue;
    }
    // Slug, made unique in its directory in source order. At the root,
    // 'posts', 'tags' and 'page' are taken from the start.
    let set = taken.get(dir);
    if (!set) {
      set = new Set();
      if (dir === '') { set.add('posts'); set.add('tags'); set.add('page'); }
      taken.set(dir, set);
    }
    const baseSlug = fm.slug || slugify(fm.title, slugCache);
    let slug = baseSlug;
    let k = 2;
    while (set.has(slug)) { slug = baseSlug + '-' + k; k++; }
    set.add(slug);
    const url = dir === ''
      ? base + '/' + slug + '/'
      : base + '/' + dir + '/' + slug + '/';
    const outPath = dir === ''
      ? slug + '/index.html'
      : dir + '/' + slug + '/index.html';
    kept.push({ path: file.path, fm, body: parsed.body, isPost, dir, slug, url, outPath });
  }

  // Link resolution needs the page map (source path -> url) and the static
  // set, both known now.
  const pageMap = new Map();
  for (let i = 0; i < kept.length; i++) pageMap.set(kept[i].path, kept[i].url);
  const staticSet = new Set();
  for (let i = 0; i < files.length; i++) {
    if (!files[i].path.endsWith('.md')) staticSet.add(files[i].path);
  }

  // Pass 2: render each kept source's Markdown once.
  for (let i = 0; i < kept.length; i++) {
    const src = kept[i];
    const slashAt = src.path.lastIndexOf('/');
    const srcDir = slashAt === -1 ? '' : src.path.slice(0, slashAt);
    const inlineCtx = {
      resolveLink(target) {
        if (SCHEME_RE.test(target) || target.charCodeAt(0) === 47 || target.charCodeAt(0) === 35) {
          return target; // a scheme, '/...' or '#...' is kept as written
        }
        const hashAt = target.indexOf('#');
        const pathPart = hashAt === -1 ? target : target.slice(0, hashAt);
        const frag = hashAt === -1 ? null : target.slice(hashAt + 1);
        const resolved = resolveRelative(srcDir, pathPart);
        const pageUrl = pageMap.get(resolved);
        if (pageUrl !== undefined) return pageUrl + (frag !== null ? '#' + frag : '');
        if (staticSet.has(resolved)) return base + '/' + resolved + (frag !== null ? '#' + frag : '');
        return null;
      },
      broken(target) {
        const key = src.path + '\0' + target;
        if (!broken.has(key)) broken.set(key, `broken-link ${src.path} -> ${target}`);
      },
    };
    const headingSlugs = new Map();
    const rendered = renderMarkdown(src.body, inlineCtx, slugCache, headingSlugs);
    src.html = rendered.html;
    src.toc = rendered.toc;
    src.excerpt = rendered.excerpt;
    // Reading minutes: the body's words (runs of non-whitespace) over 200,
    // rounded up, at least 1.
    let words = 0;
    let inWord = false;
    const body = src.body;
    for (let j = 0; j < body.length; j++) {
      const c = body.charCodeAt(j);
      const ws = c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12;
      if (ws) inWord = false;
      else if (!inWord) { words++; inWord = true; }
    }
    src.readingMinutes = Math.max(1, Math.ceil(words / 200));
  }

  // Collections: posts newest date first, equal dates by slug in code-unit
  // order. Each post's newer is the one before it, older the one after.
  const posts = kept.filter((s) => s.isPost);
  posts.sort((a, b) => {
    if (a.fm.date !== b.fm.date) return a.fm.date < b.fm.date ? 1 : -1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  for (let i = 0; i < posts.length; i++) {
    posts[i].newer = i === 0 ? null : posts[i - 1];
    posts[i].older = i === posts.length - 1 ? null : posts[i + 1];
  }

  // Tags: each post's tags, each slug once (first spelling kept), in its own
  // order. A tag is all the posts whose tags have its slug, named as first
  // met walking the posts in collection order. Ordered by post count desc,
  // then slug in code-unit order.
  const tagBySlug = new Map();
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const seen = new Set();
    for (let t = 0; t < post.fm.tags.length; t++) {
      const name = post.fm.tags[t];
      const slug = slugify(name, slugCache);
      if (seen.has(slug)) continue;
      seen.add(slug);
      let tag = tagBySlug.get(slug);
      if (!tag) {
        tag = { name, slug, url: base + '/tags/' + slug + '/', count: 0, posts: [] };
        tagBySlug.set(slug, tag);
      }
      tag.posts.push(post);
      tag.count++;
    }
  }
  const tags = [...tagBySlug.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });

  // Cards, and the page object each layout renders. A card is built once per
  // source and reused wherever it appears (its own page, the recent list,
  // index pages, tag pages).
  function cardOf(src) {
    if (src.card) return src.card;
    const tagsOut = [];
    const seen = new Set();
    for (let t = 0; t < src.fm.tags.length; t++) {
      const name = src.fm.tags[t];
      const slug = slugify(name, slugCache);
      if (seen.has(slug)) continue;
      seen.add(slug);
      const tag = tagBySlug.get(slug);
      // The tag's name is the tag's own name (first met in collection
      // order); a page's own spelling is used only where no post has it.
      tagsOut.push({ name: tag ? tag.name : name, slug, url: tag ? tag.url : '' });
    }
    const card = {
      title: src.fm.title,
      url: src.url,
      date: src.fm.date,
      date_long: src.fm.date ? dateLong(src.fm.date) : '',
      summary: src.fm.summary,
      excerpt: src.excerpt,
      reading_minutes: src.readingMinutes,
      tags: tagsOut,
    };
    src.card = card;
    return card;
  }
  function neighbourOf(post) {
    if (!post) return null;
    return { title: post.fm.title, url: post.url, date: post.fm.date,
      date_long: post.fm.date ? dateLong(post.fm.date) : '' };
  }
  // The templates see site.base_url with its trailing slashes dropped
  // (the same <base> used for every built url).
  const siteCtx = { title: site.title, base_url: base };
  const tagsCtx = tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.count }));
  const recentCtx = posts.slice(0, recentN).map(cardOf);
  for (let i = 0; i < kept.length; i++) {
    const src = kept[i];
    const card = cardOf(src);
    const page = { ...card };
    page.slug = src.slug;
    page.content = src.html;
    page.toc = src.toc;
    page.newer = src.isPost ? neighbourOf(src.newer) : null;
    page.older = src.isPost ? neighbourOf(src.older) : null;
    page.is_post = src.isPost;
    src.pageCtx = page;
  }

  // Render every page through its layout.
  const output = {};
  let pageCount = 0;
  let postCount = 0;
  for (let i = 0; i < kept.length; i++) {
    const src = kept[i];
    const layout = src.fm.layout || (src.isPost ? 'post' : 'page');
    const nodes = templates[layout];
    const out = [];
    renderNodes(nodes, [{ root: { site: siteCtx, tags: tagsCtx, recent: recentCtx, page: src.pageCtx } }], out, templates, 0);
    output[src.outPath] = out.join('');
    if (src.isPost) postCount++; else pageCount++;
  }

  // Index pages: `index` through the site's per_page posts a page.
  if (templates.index) {
    const totalPages = Math.max(1, Math.ceil(posts.length / perPage));
    for (let p = 1; p <= totalPages; p++) {
      const slice = posts.slice((p - 1) * perPage, p * perPage);
      const pager = {
        number: p,
        total: totalPages,
        url: p === 1 ? base + '/' : base + '/page/' + p + '/',
        newer_url: p === 1 ? '' : (p === 2 ? base + '/' : base + '/page/' + (p - 1) + '/'),
        older_url: p === totalPages ? '' : base + '/page/' + (p + 1) + '/',
      };
      const out = [];
      renderNodes(templates.index,
        [{ root: { site: siteCtx, tags: tagsCtx, recent: recentCtx, posts: slice.map(cardOf), pager } }],
        out, templates, 0);
      output[p === 1 ? 'index.html' : 'page/' + p + '/index.html'] = out.join('');
    }
  }

  // Tag pages, then the tags index.
  if (templates.tag) {
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const tagCtx = { name: tag.name, slug: tag.slug, url: tag.url, count: tag.count,
        posts: tag.posts.map(cardOf) };
      const out = [];
      renderNodes(templates.tag,
        [{ root: { site: siteCtx, tags: tagsCtx, recent: recentCtx, tag: tagCtx } }],
        out, templates, 0);
      output['tags/' + tag.slug + '/index.html'] = out.join('');
    }
  }
  if (templates.tags) {
    const out = [];
    renderNodes(templates.tags,
      [{ root: { site: siteCtx, tags: tagsCtx, recent: recentCtx } }],
      out, templates, 0);
    output['tags/index.html'] = out.join('');
  }

  // Static files at their own path, unless a built page has that path.
  let staticCount = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.path.endsWith('.md')) continue;
    if (Object.hasOwn(output, file.path)) {
      reports.push(`shadowed ${file.path}: a built page has its path`);
      continue;
    }
    output[file.path] = file.content;
    staticCount++;
  }

  // The report: every reported line plus each broken link, sorted in
  // code-unit order, then the built line. Every line ends in '\n'.
  const reportLines = reports.concat([...broken.values()]).sort();
  reportLines.push(`built ${pageCount} pages, ${postCount} posts, ${tags.length} tags and ${staticCount} static files`);
  output['build-report.txt'] = reportLines.map((l) => l + '\n').join('');

  return output;
}

module.exports = { run };
