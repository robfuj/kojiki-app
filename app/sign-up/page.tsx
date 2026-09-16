import { getLocale } from '@/app/actions/settings'
import { AuthForm } from '@/components/auth-form'
import { LanguageSelector } from '@/components/i18n/language-selector'
import { getDictionary } from '@/lib/i18n'
import { getSessionUser } from '@/lib/session'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Create account — Kojiki' }

export default async function SignUpPage() {
  const [user, locale] = await Promise.all([getSessionUser(), getLocale()])
  if (user) redirect('/')

  const t = getDictionary(locale)

  return (
    <main className="kojiki-grid flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-serif text-3xl tracking-tight text-foreground">古事記</p>
          <h1 className="mt-2 font-serif text-xl text-foreground">
            {t.auth.signUpHeading}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.auth.signUpTagline}
          </p>
        </div>

        <AuthForm mode="sign-up" />

        <div className="mt-6 flex justify-center">
          <LanguageSelector />
        </div>
      </div>
    </main>
  )
}
