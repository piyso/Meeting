// Type declarations for Deno runtime
// These allow TypeScript IDE to understand Deno APIs in Edge Function files

declare namespace Deno {
  const env: {
    get(key: string): string | undefined
    set(key: string, value: string): void
    delete(key: string): void
    toObject(): Record<string, string>
  }
}

// Supabase Edge Function serve() from Deno std
declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (req: Request) => Promise<Response> | Response): void
}

// ESM imports for Supabase client
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export { createClient, SupabaseClient } from '@supabase/supabase-js'
}
