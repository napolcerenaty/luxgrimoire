/** Password strength indicator — shared between register and reset-password pages */

export const PW_CHECKS = [
  { label: 'At least 8 characters',       test: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter (A–Z)',       test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter (a–z)',       test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number (0–9)',                 test: (p: string) => /\d/.test(p) },
  { label: 'Special character (!@#$…)',    test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
]

export function passwordStrong(p: string) {
  return PW_CHECKS.every(c => c.test(p))
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const passed = PW_CHECKS.filter(c => c.test(password)).length
  const pct = (passed / PW_CHECKS.length) * 100
  const color = passed <= 2 ? 'bg-red-500' : passed <= 3 ? 'bg-amber-500' : passed <= 4 ? 'bg-yellow-400' : 'bg-emerald-500'
  const labelColor = passed <= 2 ? 'text-red-400' : passed <= 3 ? 'text-amber-400' : passed <= 4 ? 'text-yellow-400' : 'text-emerald-400'
  const labelText = passed <= 2 ? 'Weak' : passed <= 3 ? 'Fair' : passed <= 4 ? 'Good' : 'Strong'
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-navy-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-xs font-medium ${labelColor}`}>{labelText}</span>
      </div>
      <ul className="space-y-0.5">
        {PW_CHECKS.map(c => (
          <li key={c.label} className={`text-xs flex items-center gap-1.5 ${c.test(password) ? 'text-emerald-400' : 'text-navy-500'}`}>
            <span>{c.test(password) ? '✓' : '○'}</span> {c.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
