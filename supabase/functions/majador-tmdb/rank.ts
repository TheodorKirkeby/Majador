// Which TMDB matches to suggest, and in what order. Kept free of imports so
// the tests (tests/text.spec.ts) can load this same file.
//
// TMDB's own order follows how closely the text matches, which puts an
// obscure film whose title contains the typed word above the famous one
// everybody means ("Titani" -> "Arrivano i titani" before "Titanic"). Here
// the typed text still decides the group, but within a group the best-known
// title comes first.

export type TmdbResult = {
  id: number
  media_type: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  poster_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_count?: number
  popularity?: number
}

export type Suggestion = {
  tmdb_id: number
  kind: 'movie' | 'series'
  title: string
  year: number | null
  summary: string | null
  poster_path: string | null
}

const norm = (s: string | undefined) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9æøå]+/g, ' ')
    .trim()

/** 0 = a title is exactly what was typed, 1 = a title starts with it, 2 = the rest. */
function group(query: string, titles: string[]): number {
  if (titles.includes(query)) return 0
  if (titles.some((t) => t.startsWith(query))) return 1
  return 2
}

/**
 * `danish` and `english` are the same search asked in both languages. Danish
 * wins for title and summary; English fills in what Danish lacks (many titles
 * have no Danish summary) and adds matches only found under the English title.
 */
export function rank(
  query: string,
  danish: TmdbResult[],
  english: TmdbResult[],
  max: number,
): Suggestion[] {
  const q = norm(query)
  const key = (r: TmdbResult) => `${r.media_type}:${r.id}`
  const en = new Map(english.map((r) => [key(r), r]))
  const seen = new Set<string>()
  const all: { da: TmdbResult; en?: TmdbResult }[] = []
  for (const r of [...danish, ...english]) {
    if ((r.media_type !== 'movie' && r.media_type !== 'tv') || seen.has(key(r))) continue
    seen.add(key(r))
    all.push({ da: r, en: en.get(key(r)) })
  }

  return all
    .map(({ da, en }) => ({
      da,
      en,
      group: group(
        q,
        [da.title, da.name, da.original_title, da.original_name, en?.title, en?.name].map(norm),
      ),
      votes: Math.max(da.vote_count ?? 0, en?.vote_count ?? 0),
    }))
    .sort((a, b) => a.group - b.group || b.votes - a.votes)
    .slice(0, max)
    .map(({ da, en }) => ({
      tmdb_id: da.id,
      kind: da.media_type === 'tv' ? 'series' : 'movie',
      title: da.title ?? da.name ?? '',
      year: Number((da.release_date ?? da.first_air_date ?? '').slice(0, 4)) || null,
      summary: da.overview || en?.overview || null,
      poster_path: da.poster_path ?? en?.poster_path ?? null,
    }))
}
