import type { MovieKind } from './store'
import { supabase } from './supabase'

/** A film or series found in The Movie Database. */
export type Match = {
  tmdb_id: number
  kind: MovieKind
  title: string
  year: number | null
  summary: string | null
  poster_path: string | null
}

/** Looks a title up through the majador-tmdb Edge Function (needs a connection). */
export async function searchTmdb(query: string): Promise<Match[]> {
  const { data, error } = await supabase.functions.invoke<{ results: Match[] }>('majador-tmdb', {
    body: { query },
  })
  if (error) throw new Error(error.message)
  return data?.results ?? []
}

/** Posters are loaded straight from TMDB's image host. */
export function posterUrl(path: string, size: 'w92' | 'w154' = 'w154'): string {
  return `https://image.tmdb.org/t/p/${size}${path}`
}
