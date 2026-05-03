import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function normalizeSupabaseUrl(url: string) {
  const trimmed = url.trim()
  // Users sometimes copy the REST endpoint (…/rest/v1/). Supabase client expects the project root URL.
  const withoutRest = trimmed.replace(/\/rest\/v1\/?$/i, '')
  return withoutRest.replace(/\/+$/, '')
}

export const supabaseConfigOk = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = supabaseConfigOk
  ? createClient(normalizeSupabaseUrl(supabaseUrl!), supabaseAnonKey!)
  : null

export function getSupabase() {
  if (!supabase) {
    throw new Error('Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
  return supabase
}
