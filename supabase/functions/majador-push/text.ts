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
  return {
    title: `${name} tilføjede ${count} ${count === 1 ? 'vare' : 'varer'}`,
    body: oneLine(items.map((item) => shorten(item))),
  }
}

/** As many parts as fit on one line, the rest counted: "kaffe, smør + 2 mere". */
function oneLine(parts: string[]): string {
  const shown: string[] = []
  let length = 0
  for (const part of parts) {
    if (shown.length > 0 && length + part.length + 2 > LINE_MAX) break
    shown.push(part)
    length += part.length + 2
  }
  const rest = parts.length - shown.length
  return shown.join(', ') + (rest > 0 ? ` + ${rest} mere` : '')
}

export type AddedMovie = { title: string; kind: 'movie' | 'series'; rating?: number | null }

/**
 * "Maja tilføjede 2 film" / "Dune (8,5), Druk (9)".
 * Same shape as addedText: the title counts, the body is one short line with
 * each title and the rating the person gave it.
 */
export function movieAddedText(name: string, movies: AddedMovie[]): { title: string; body: string } {
  const count = movies.length
  const series = movies.filter((m) => m.kind === 'series').length
  const noun =
    series === 0 ? 'film' : series < count ? 'titler' : count === 1 ? 'serie' : 'serier'
  return {
    title: `${name} tilføjede ${count} ${noun}`,
    body: oneLine(
      movies.map((m) =>
        m.rating == null
          ? shorten(m.title)
          : `${shorten(m.title)} (${String(m.rating).replace('.', ',')})`,
      ),
    ),
  }
}
