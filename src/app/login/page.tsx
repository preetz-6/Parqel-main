import { redirect } from 'next/navigation'
import { getActor } from '@/server/dal'
import { ssoConfigured } from '@/server/auth/google'
import { LoginForm } from './login-form'

const SSO_ERRORS: Record<string, string> = {
  sso_unconfigured: 'Google sign-in is not configured yet. Use your employee ID instead.',
  sso_cancelled: 'Google sign-in was cancelled.',
  sso_failed: 'Google sign-in failed. Try again.',
  bad_state: 'That sign-in link expired. Try again.',
  token_exchange_failed: 'Google sign-in failed. Try again.',
  invalid_token: 'Google sign-in failed. Try again.',
  unverified_email: 'That Google account has an unverified email address.',
  domain_not_allowed: 'Use your organisation Google account to sign in.',
  not_on_roster: 'That account is not on the parking roster. Contact the parking office.',
  inactive: 'That account is not active. Contact the parking office.',
}

export default async function LoginPage(props: PageProps<'/login'>) {
  // Already signed in — no reason to show the form.
  if (await getActor()) redirect('/')

  const { error } = await props.searchParams
  const errorKey = Array.isArray(error) ? error[0] : error
  const errorMessage = errorKey ? (SSO_ERRORS[errorKey] ?? 'Sign-in failed. Try again.') : null

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Parqel
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Campus parking accountability
          </p>
        </div>

        <LoginForm
          ssoEnabled={ssoConfigured()}
          initialError={errorMessage}
        />

        <p className="mt-8 text-center text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
          Accounts are created by the parking office from the staff roster.
          There is no self sign-up.
        </p>
      </div>
    </main>
  )
}
