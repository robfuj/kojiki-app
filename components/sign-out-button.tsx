'use client'

import { signOut } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await signOut({ fetchOptions: { onSuccess: () => router.push('/sign-in') } })
      }}
      className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground disabled:opacity-60"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
