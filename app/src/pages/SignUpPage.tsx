import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../types/database'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { ErrorText } from '../components/ui/ErrorText'

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
    <main className="flex min-h-svh items-center justify-center bg-canvas px-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="w-full max-w-sm rounded-lg border border-hairline bg-surface-1 p-6"
      >
        <h1 className="text-xl font-semibold text-ink">Sign up</h1>

        <fieldset className="mt-4 flex gap-4">
          <legend className="text-sm text-ink-subtle">I am a</legend>
          <label className="flex items-center gap-1.5 text-sm text-ink">
            <input
              type="radio"
              name="role"
              value="brand"
              checked={role === 'brand'}
              onChange={() => setRole('brand')}
              className="accent-primary"
            />
            Brand
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink">
            <input
              type="radio"
              name="role"
              value="provider"
              checked={role === 'provider'}
              onChange={() => setRole('provider')}
              className="accent-primary"
            />
            Fulfillment Provider
          </label>
        </fieldset>

        <div className="mt-4">
          <TextField
            label="Name"
            type="text"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </div>

        <div className="mt-4">
          <TextField
            label="Company name (optional)"
            type="text"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </div>

        <div className="mt-4">
          <TextField
            label="Email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="mt-4">
          <TextField
            label="Password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error && (
          <div className="mt-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}

        <div className="mt-6">
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </div>

        <p className="mt-4 text-center text-sm text-ink-subtle">
          Already have an account? <Link to="/sign-in" className="text-primary underline">Sign in</Link>
        </p>
      </form>
    </main>
  )
}
