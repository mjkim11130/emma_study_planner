import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardHeader, Input } from '../components/ui'
import { getSupabase, supabaseConfigOk } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

function normalizeEmail(input: string) {
  return input.trim().toLowerCase()
}

export function LoginView() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    const e = normalizeEmail(email)
    return e.length > 3 && e.includes('@') && password.length >= 6
  }, [email, password])

  if (!isLoading && user) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pt-8">
        <Card>
          <CardHeader title="로그인 완료" subtitle="이미 로그인되어 있어요." />
          <div className="px-4 pb-4">
            <Button onClick={() => navigate('/', { replace: true })}>계속하기</Button>
          </div>
        </Card>
      </div>
    )
  }

  if (!supabaseConfigOk) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pt-8">
        <Card>
          <CardHeader title="설정 필요" subtitle="Supabase 환경변수가 설정되지 않았습니다." />
          <div className="px-4 pb-4 text-sm text-slate-700">
            GitHub Pages 배포라면 GitHub Actions Secrets에 <code>VITE_SUPABASE_URL</code>,{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>를 추가한 뒤 다시 배포하세요.
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 pt-8">
      <Card>
        <CardHeader
          title={mode === 'signin' ? '로그인' : '회원가입'}
          subtitle="이메일 + 비밀번호만 입력하면 됩니다."
        />
        <div className="flex flex-col gap-2 px-4 py-3">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">이메일</div>
            <Input value={email} onChange={setEmail} placeholder="you@example.com" />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">비밀번호</div>
            <Input value={password} onChange={setPassword} placeholder="6자 이상" type="password" />
          </div>

          {message ? <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}

          <Button
            onClick={async () => {
              if (!canSubmit || busy) return
              setBusy(true)
              setMessage(null)
              const e = normalizeEmail(email)

              try {
                const supabase = getSupabase()
                if (mode === 'signin') {
                  const { error } = await supabase.auth.signInWithPassword({ email: e, password })
                  if (error) throw error
                  navigate('/', { replace: true })
                } else {
                  // Supabase may create a session immediately depending on project settings.
                  // To avoid accidentally carrying over an existing session, explicitly sign out first.
                  await supabase.auth.signOut()
                  const { error } = await supabase.auth.signUp({ email: e, password })
                  if (error) throw error
                  setMessage('가입이 완료되었습니다. 자동으로 로그인될 수 있어요. 계속하기를 눌러주세요.')
                  navigate('/', { replace: true })
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : '로그인/가입에 실패했습니다.'
                setMessage(msg)
              } finally {
                setBusy(false)
              }
            }}
            disabled={!canSubmit || busy}
          >
            {busy ? '처리중…' : mode === 'signin' ? '로그인' : '회원가입'}
          </Button>

          <button
            className="text-left text-sm text-slate-700 hover:underline"
            onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
            type="button"
          >
            {mode === 'signin' ? '처음이신가요? 회원가입' : '이미 계정이 있나요? 로그인'}
          </button>
        </div>
      </Card>
    </div>
  )
}
