import { getLocale } from '@/app/actions/settings'
import { AuthForm } from '@/components/auth-form'
import { LanguageSelector } from '@/components/i18n/language-selector'
import { getDictionary } from '@/lib/i18n'
import { getSessionUser } from '@/lib/session'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Sign in — Kojiki' }

export default async function SignInPage() {
  const [user, locale] = await Promise.all([getSessionUser(), getLocale()])
  if (user) redirect('/')

  const t = getDictionary(locale)

  return (
    <main className="kojiki-grid flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-serif text-3xl tracking-tight text-foreground">古事記</p>
          <h1 className="mt-2 font-serif text-xl text-foreground">
            {t.auth.signInHeading}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.auth.tagline}</p>
        </div>

        <AuthForm mode="sign-in" />

        {/* The language control sits under the form rather than in a header: a
            visitor who cannot read the interface has to be able to find it
            without understanding anything else on the screen. */}
        <div className="mt-6 flex justify-center">
          <LanguageSelector />
        </div>
      </div>
    </main>
  )
}
