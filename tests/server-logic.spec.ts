// The parts of the Edge Functions that are plain logic: notification wording
// and the ranking of TMDB suggestions. The functions themselves run on
// Supabase and are not started here.

import { expect, test } from '@playwright/test'
import { addedText, movieAddedText, shorten } from '../supabase/functions/majador-push/text.ts'
import { rank, type TmdbResult } from '../supabase/functions/majador-tmdb/rank.ts'

test.describe('notification text', () => {
  test('shopping: counts in the title, one short line in the body', () => {
    expect(addedText('Maja', ['mælk'])).toEqual({ title: 'Maja tilføjede 1 vare', body: 'mælk' })
    expect(addedText('Maja', ['kaffe', 'smør'])).toEqual({
      title: 'Maja tilføjede 2 varer',
      body: 'kaffe, smør',
    })
  })

  test('long items lose their brackets, and what does not fit is counted', () => {
    expect(shorten('Bind (de gode der med 3 dråber og vinger på)')).toBe('Bind')
    const many = Array.from({ length: 12 }, (_, i) => `vare nummer ${i + 1}`)
    const { title, body } = addedText('Maja', many)
    expect(title).toBe('Maja tilføjede 12 varer')
    expect(body).toMatch(/ \+ \d+ mere$/)
    expect(body.length).toBeLessThan(80)
  })

  test('films: the noun follows what was added, ratings use a decimal comma', () => {
    expect(movieAddedText('Maja', [{ title: 'Dune', kind: 'movie', rating: 8.5 }])).toEqual({
      title: 'Maja tilføjede 1 film',
      body: 'Dune (8,5)',
    })
    expect(movieAddedText('Maja', [{ title: 'Severance', kind: 'series', rating: 9 }]).title).toBe(
      'Maja tilføjede 1 serie',
    )
    expect(
      movieAddedText('Maja', [
        { title: 'Severance', kind: 'series' },
        { title: 'Dark', kind: 'series' },
      ]),
    ).toEqual({ title: 'Maja tilføjede 2 serier', body: 'Severance, Dark' })
    expect(
      movieAddedText('Maja', [
        { title: 'Dune', kind: 'movie', rating: 8 },
        { title: 'Dark', kind: 'series', rating: null },
      ]),
    ).toEqual({ title: 'Maja tilføjede 2 titler', body: 'Dune (8), Dark' })
  })
})

test.describe('TMDB suggestions', () => {
  const film = (id: number, title: string, votes: number, extra: Partial<TmdbResult> = {}): TmdbResult => ({
    id,
    media_type: 'movie',
    title,
    vote_count: votes,
    release_date: '1997-12-18',
    ...extra,
  })

  test('the well-known title beats an obscure one that merely contains the word', () => {
    // TMDB's own order for "Titani": the Italian film first.
    const results = [
      film(2, 'Arrivano i titani', 40, { release_date: '1962-01-01' }),
      film(3, 'Titanic II', 600),
      film(597, 'Titanic', 25000),
    ]
    expect(rank('Titani', results, results, 6).map((r) => r.title)).toEqual([
      'Titanic',
      'Titanic II',
      'Arrivano i titani',
    ])
  })

  test('an exact title comes first even when a longer title is better known', () => {
    const results = [film(1, 'Dune: Part Two', 9000), film(2, 'Dune', 5000), film(3, 'Dune', 12000)]
    expect(rank('dune', results, [], 6).map((r) => `${r.title} ${r.tmdb_id}`)).toEqual([
      'Dune 3',
      'Dune 2',
      'Dune: Part Two 1',
    ])
  })

  test('Danish wins, English fills in a missing summary and extra matches', () => {
    const danish = [film(1, 'Druk', 5000, { overview: '' })]
    const english = [
      film(1, 'Another Round', 5000, { overview: 'Four teachers test a theory.' }),
      { id: 7, media_type: 'tv', name: 'Drunk History', vote_count: 300, first_air_date: '2013-07-09' },
      { id: 9, media_type: 'person', name: 'Druk Person' },
    ]
    expect(rank('druk', danish, english, 6)).toEqual([
      {
        tmdb_id: 1,
        kind: 'movie',
        title: 'Druk',
        year: 1997,
        summary: 'Four teachers test a theory.',
        poster_path: null,
      },
      { tmdb_id: 7, kind: 'series', title: 'Drunk History', year: 2013, summary: null, poster_path: null },
    ])
  })

  test('no more than the requested number is returned', () => {
    const results = Array.from({ length: 20 }, (_, i) => film(i + 1, `Film ${i}`, i))
    expect(rank('film', results, [], 6)).toHaveLength(6)
  })
})
