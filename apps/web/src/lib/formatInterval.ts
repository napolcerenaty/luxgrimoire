export function formatInterval(intervalMonths: number): string {
  if (intervalMonths === 1) return 'Monthly';
  if (intervalMonths === 2) return 'Bimonthly';
  if (intervalMonths === 3) return 'Quarterly';
  return `Every ${intervalMonths} months`;
}
