import { useStore } from '../store/useStore.js'
import { googleLogin } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'

// Google-only sign-in. The OAuth round-trip happens in a full-page redirect to the API
// (/api/auth/google), which bounces back to `next` with the session cookie set.
export default function Login() {
  const head = <>
    <div className="text-[54px] flex justify-center text-acc"><Icon name="dumbbell" /></div>
    <h1 className="text-[34px] font-bold tracking-[-.028em] mt-2.5 mb-1">openGym</h1>
  </>
  const wrap = 'max-w-[560px] mx-auto flex flex-col justify-center min-h-[78vh] text-center px-6'

  return (
    <div className={wrap}>
      {head}
      <div className="text-label-2 mb-[34px]">{t('Your gym. Your workouts. Your progress.')}</div>
      <button onClick={() => googleLogin('/home')}
        className="flex items-center justify-center gap-3 w-full max-w-[320px] mx-auto bg-white text-[#1f1f1f] rounded-xl py-[13px] px-4 text-[16px] font-semibold tracking-[-.01em] transition-transform duration-150 active:scale-[.97] no-tap">
        <GoogleG />
        {t('Continue with Google')}
      </button>
      <div className="text-label-3 text-[13px] leading-[1.5] mt-[26px]">
        {t('New here? Sign in — the front desk approves your account, then you are in.')}<br />
      </div>
    </div>
  )
}

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.3 5.3C41.4 35.4 44 30.1 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  )
}

// Full-screen states for accounts that exist but may not use the app yet.
export function AccountWall({ user }) {
  const pending = user.status === 'PENDING'
  return (
    <div className={wrap}>
      {head}
      <div className="bg-surface rounded-[16px] p-5 mt-6 max-w-[420px] mx-auto w-full">
        <div className={'text-[40px] mb-2 ' + (pending ? 'text-label-3' : 'text-acc')}>
          <Icon name={pending ? 'hourglass' : 'lock'} />
        </div>
        <h2 className="text-[20px] font-semibold tracking-[-.02em]">
          {pending ? t('Waiting for approval') : t('Account disabled')}
        </h2>
        <p className="text-label-2 text-[14px] leading-[1.45] mt-1.5">
          {pending
            ? t('{0} is on the approval list. The gym team activates new members — this screen unlocks automatically once you are approved.', user.name)
            : t('This account has been deactivated by the gym. Contact the front desk if you think this is a mistake.')}
        </p>
        <p className="text-label-3 text-[13px] mt-3">{user.email}</p>
        <SignOutLink />
      </div>
    </div>
  )
}

export function RenewWall({ membership }) {
  return (
    <div className={wrap}>
      {head}
      <div className="bg-surface rounded-[16px] p-5 mt-6 max-w-[420px] mx-auto w-full">
        <div className="text-[40px] mb-2 text-label-3"><Icon name="hourglass" /></div>
        <h2 className="text-[20px] font-semibold tracking-[-.02em]">{t('Membership expired')}</h2>
        <p className="text-label-2 text-[14px] leading-[1.45] mt-1.5">
          {t('Renew to book slots and log new workouts. Your history and stats stay right here, untouched.')}
        </p>
        {membership && <p className="text-label-3 text-[13px] mt-3">
          {t('Expired {0}', membership.endDate)}
        </p>}
        <a href="/membership" className="block bg-acc text-white rounded-xl py-[13px] mt-4 font-semibold no-underline">{t('Renew membership')}</a>
        <SignOutLink />
      </div>
    </div>
  )
}

function SignOutLink() {
  const signOut = useStore(s => s.signOut)
  return (
    <button className="text-label-3 text-[13px] underline mt-5 bg-transparent border-0 cursor-pointer"
      onClick={() => signOut()}>{t('Use a different account')}</button>
  )
}
