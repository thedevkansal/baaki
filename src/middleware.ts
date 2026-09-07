import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Keep the session alive.
 *
 * Supabase access tokens are short lived, and only a response can set the
 * refreshed cookies. Without this, a signed-in person quietly becomes signed
 * out an hour later and every seat they own stops answering to them.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return response

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  await supabase.auth.getUser()
  return response
}

export const config = {
  /**
   * Everything except static assets and the generated icons. Refreshing a
   * session on a favicon request is pure cost.
   */
  matcher: ['/((?!_next/static|_next/image|icon|apple-icon|manifest.webmanifest).*)'],
}
