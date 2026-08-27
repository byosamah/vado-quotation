/* Arabic to English, for the six fields that exist in both scripts.
 *
 * The Arabic is authoritative. The English is kept because the office
 * tracker maps to these names, and because an English edition of the deck
 * will want them back.
 *
 * VADO has a house habit and somebody got burned by it: **Al with a space,
 * no hyphen.** `Al Mulla`, `Al Thuqbah`, `Al Ahsa`. The old Excel form
 * called it out explicitly and `tools/presend.py` still warns on `AlMulla`.
 *
 * The tables are the skill's `arabic-english.md`, parsed. A district not on
 * the list is normal: this says so rather than inventing a spelling, and
 * the assistant proposes one and flags that it is guessing.
 */
import { knowledge } from './_knowledge.mjs';

const KIND_OF = {
  'Titles': 'title',
  'Cities': 'city',
  'Districts': 'district',
  'Project types': 'project_type',
};

let cached = null;

function tables() {
  if (cached) return cached;
  const doc = knowledge.find(k => k.id === 'arabic-english');
  const out = { title: {}, city: {}, district: {}, project_type: {} };
  let kind = null;
  for (const line of doc.text.split('\n')) {
    const head = line.match(/^##\s+(.+?)\s*$/);
    if (head) { kind = KIND_OF[head[1]] || null; continue; }
    if (!kind || !line.startsWith('|')) continue;
    const cells = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    if (cells.length < 2) continue;
    if (/^-+$/.test(cells[0]) || cells[0] === 'Arabic') continue;
    out[kind][cells[0]] = cells[1];
  }
  cached = out;
  return out;
}

export const KINDS = Object.keys(KIND_OF).map(k => KIND_OF[k]);

/* The English twin, or nothing. Nothing is an answer: it means propose a
 * transliteration and say out loud that it is a proposal. */
export function english(kind, arabic) {
  const table = tables()[kind];
  if (!table) return null;
  return table[String(arabic || '').trim()] || null;
}

export function all(kind) {
  return tables()[kind] || null;
}

/* The English twins that follow from the Arabic already in the job. Only
 * the ones the tables actually know; the rest stay for a human to confirm. */
export function twins(fields) {
  const out = {};
  const pairs = [['name_title_ar', 'name_title', 'title'],
                 ['city_ar', 'city', 'city'],
                 ['district_ar', 'district', 'district'],
                 ['project_type_ar', 'project_type', 'project_type']];
  for (const [ar, en, kind] of pairs) {
    if (!fields[ar] || fields[en]) continue;
    const found = english(kind, fields[ar]);
    if (found) out[en] = found;
  }
  return out;
}
