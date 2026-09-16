import { auth } from '@/lib/auth'
import { AuthForm } from '@/components/auth-form'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Sign in — Kojiki' }

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/')

  return (
    <main className="kojiki-grid flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-serif text-3xl tracking-tight text-foreground">古事記</p>
          <h1 className="mt-2 font-serif text-xl text-foreground">Kojiki</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ontology workspace
          </p>
        </div>
        <AuthForm mode="sign-in" />
      </div>
    </main>
  )
}
