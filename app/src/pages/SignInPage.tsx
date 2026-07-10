import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { ErrorText } from '../components/ui/ErrorText'

export function SignInPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    setSubmitting(false)

    if (signInError) {
      setError(signInError.message)
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
        <h1 className="text-xl font-semibold text-ink">Sign in</h1>

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
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>

        <p className="mt-4 text-center text-sm text-ink-subtle">
          Don't have an account? <Link to="/sign-up" className="text-primary underline">Sign up</Link>
        </p>
      </form>
    </main>
  )
}
