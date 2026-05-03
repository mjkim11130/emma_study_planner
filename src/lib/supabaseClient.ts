import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function normalizeSupabaseUrl(url: string) {
  const trimmed = url.trim()
  // Users sometimes copy the REST endpoint (…/rest/v1/). Supabase client expects the project root URL.
  const withoutRest = trimmed.replace(/\/rest\/v1\/?$/i, '')
  return withoutRest.replace(/\/+$/, '')
}

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn('Missing Supabase env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl ? normalizeSupabaseUrl(supabaseUrl) : '', supabaseAnonKey ?? '')
