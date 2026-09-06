/**
 * First-touch signup attribution (growth roadmap Faza 0).
 *
 * The web middleware writes a readable `lg_src` cookie the first time a visitor
 * arrives with `?ref=` or any `utm_*` param. These helpers read it back on the
 * client so the register / OAuth flows can forward it to the API, which persists
 * it on `User.signupSource`.
 */
const ATTRIB_COOKIE = 'lg_src'

/** Raw cookie payload (compact JSON string), or undefined when nothing was captured. */
export function getSignupSource(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${ATTRIB_COOKIE}=`))
  if (!match) return undefined
  const value = decodeURIComponent(match.slice(ATTRIB_COOKIE.length + 1))
  return value.trim() ? value.slice(0, 512) : undefined
}
