// Thin re-export over the shared API client (@og/api-client). The WebAuthn ceremony that used
// to live here is gone — sign-in is Google-only now.
export { api, ApiError, setAuthHandlers, googleLogin, logout, logoutAll } from '@og/api-client'
export { api as default } from '@og/api-client'
