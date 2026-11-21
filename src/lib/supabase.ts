import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY in .env')
}

// The shared Supabase project keeps each app in its own schema; MajaDor's is
// `majador`. A distinct storageKey keeps this login apart from any other app
// using the same project.
export const supabase = createClient(url, key, {
  db: { schema: 'majador' },
  auth: { storageKey: 'majador-auth' },
})
