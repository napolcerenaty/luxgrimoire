// Shared currency and platform constants — single source of truth for the whole app.

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF']

export const SALE_PLATFORMS = [
  { value: 'ebay', label: 'eBay' },
  { value: 'facebook', label: 'Facebook Marketplace' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'vinted', label: 'Vinted' },
  { value: 'depop', label: 'Depop' },
  { value: 'discord', label: 'Discord' },
  { value: 'other', label: 'Other' },
]

/** Labeled currency tuples `[code, displayLabel]` — used in preference selectors. */
export const CURRENCIES_LABELED: [string, string][] = [
  ['EUR', 'EUR - Euro'],
  ['USD', 'USD - US Dollar'],
  ['GBP', 'GBP - British Pound'],
  ['PLN', 'PLN - Polish Zloty'],
  ['CHF', 'CHF - Swiss Franc'],
  ['CZK', 'CZK - Czech Koruna'],
  ['SEK', 'SEK - Swedish Krona'],
  ['NOK', 'NOK - Norwegian Krone'],
  ['DKK', 'DKK - Danish Krone'],
  ['HUF', 'HUF - Hungarian Forint'],
  ['RON', 'RON - Romanian Leu'],
  ['CAD', 'CAD - Canadian Dollar'],
  ['AUD', 'AUD - Australian Dollar'],
  ['JPY', 'JPY - Japanese Yen'],
]
