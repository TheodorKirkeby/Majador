// Notification wording. Kept free of imports so the dev playground
// (demo/demo.js) can load this same file and always shows the real text.

/** Longest a single item may be in a notification before it is cut. */
const ITEM_MAX = 24
/** Roughly one line on a phone; items that do not fit become "+ 2 mere". */
const LINE_MAX = 60

/**
 * Makes a long item fit. People put the explanation in brackets ("Bind (de
 * gode der med 3 dråber og vinger på)"), so the brackets go first: that
 * usually leaves just the item ("Bind"). Only if it is still too long is it
 * cut, at a word boundary, with an ellipsis. Short items are never touched.
 */
export function shorten(text: string, max = ITEM_MAX): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= max) return clean
  // Bracketed details, also an unclosed one at the end.
  const core = clean.replace(/\s*[([{][^)\]}]*[)\]}]?/g, '').trim() || clean
  if (core.length <= max) return core
  const cut = core.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  const kept = space > max / 2 ? cut.slice(0, space) : cut
  return `${kept.replace(/[\s,;:.\-–]+$/, '')}…`
}

/**
 * "Maja tilføjede 3 varer" / "kaffe, smør, Bind".
 * The title only counts, so a long item can never make the notification
 * bigger than the others; the body is one short line at most.
 */
export function addedText(name: string, items: string[]): { title: string; body: string } {
  const count = items.length
  const shown: string[] = []
  let length = 0
  for (const item of items) {
    const short = shorten(item)
    if (shown.length > 0 && length + short.length + 2 > LINE_MAX) break
    shown.push(short)
    length += short.length + 2
  }
  const rest = count - shown.length
  return {
    title: `${name} tilføjede ${count} ${count === 1 ? 'vare' : 'varer'}`,
    body: shown.join(', ') + (rest > 0 ? ` + ${rest} mere` : ''),
  }
}
