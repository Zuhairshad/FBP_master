import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../types/database'

export function SignUpPage() {
  const navigate = useNavigate()
  const [role, setRole] = useState<Extract<UserRole, 'brand' | 'provider'>>('brand')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          display_name: displayName,
          company_name: companyName || undefined,
        },
      },
    })

    setSubmitting(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    navigate('/', { replace: true })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-white px-4 dark:bg-slate-950">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="w-full max-w-sm rounded-lg border border-slate-200 p-6 dark:border-slate-800"
      >
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Sign up</h1>

        <fieldset className="mt-4 flex gap-4">
          <legend className="text-sm text-slate-500 dark:text-slate-400">I am a</legend>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="role"
              value="brand"
              checked={role === 'brand'}
              onChange={() => setRole('brand')}
            />
            Brand
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="role"
              value="provider"
              checked={role === 'provider'}
              onChange={() => setRole('provider')}
            />
            Fulfillment Provider
          </label>
        </fieldset>

        <label className="mt-4 block text-sm">
          Name
          <input
            type="text"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <label className="mt-4 block text-sm">
          Company name (optional)
          <input
            type="text"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <label className="mt-4 block text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <label className="mt-4 block text-sm">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded bg-slate-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account? <Link to="/sign-in" className="underline">Sign in</Link>
        </p>
      </form>
    </main>
  )
}
