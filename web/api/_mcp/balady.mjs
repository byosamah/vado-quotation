/* Reading a بلدي plot panel that somebody pasted.
 *
 * Fifteen of the fields come from one place. Getting them in one move
 * instead of fifteen is the single biggest saving in the whole workflow,
 * and it is also the place where being clever does damage: slide 4 is a
 * restatement of what the municipality says, and a client may hold the page
 * next to the بلدي screen.
 *
 * So this matches on the Arabic label and takes what follows, verbatim. It
 * does not convert `60%` to `0.6`, does not turn `1/5 عرض الشارع` into a
 * number, and does not fill `غير محدد` with anything. The one thing it
 * removes is surrounding whitespace and a stray colon.
 *
 * The labels are not written here. They are the table in the skill's
 * `balady.md`, parsed out of it, because that file already records every
 * wording the panel uses and a second copy would go stale.
 */
import { knowledge } from './_knowledge.mjs';

/* Longest label first, so `الاستخدام لقطعة الأرض` is claimed before the
 * bare `الاستخدام` inside it can claim half of it. */
function labelTable() {
  const doc = knowledge.find(k => k.id === 'balady');
  const out = [];
  for (const line of doc.text.split('\n')) {
    const m = line.match(/^\|([^|]+)\|\s*`([a-z_]+)`\s*\|/);
    if (!m) continue;
    const alternatives = m[1].split('/')
      .map(s => s.replace(/`/g, '').trim()).filter(Boolean);
    for (const label of alternatives) out.push({ label, field: m[2] });
  }
  out.sort((a, b) => b.label.length - a.label.length);
  return out;
}

/* A pasted panel arrives in two shapes and both are common: the value on
 * the same line after a colon, or on the line below the label. */
function valueAfter(lines, at, from) {
  const rest = lines[at].slice(from).replace(/^[\s:：\-]+/, '').trim();
  if (rest) return rest;
  for (let i = at + 1; i < lines.length && i <= at + 2; i++) {
    const next = lines[i].trim();
    if (next) return next.replace(/^[\s:：\-]+/, '').trim();
  }
  return '';
}

/* Returns what was read and, just as importantly, what was not. Two
 * questions beat fifteen; a silent partial read beats nothing. */
export function readBalady(text) {
  const lines = String(text || '').split(/\r?\n/);
  const table = labelTable();
  const found = {}, matchedAt = {};
  const claimed = lines.map(() => 0);        /* how far along a line is used */

  for (const { label, field } of table) {
    if (found[field]) continue;
    for (let i = 0; i < lines.length; i++) {
      const at = lines[i].indexOf(label, claimed[i]);
      if (at < 0) continue;
      const value = valueAfter(lines, i, at + label.length);
      if (!value) continue;
      found[field] = value;
      matchedAt[field] = label;
      claimed[i] = at + label.length;
      break;
    }
  }

  const wanted = [...new Set(table.map(t => t.field))];
  return {
    fields: found,
    read: Object.keys(found).length,
    of: wanted.length,
    not_found: wanted.filter(f => !found[f]),
    matched_label: matchedAt,
  };
}
