/** Личные почтовые домены — сегментация Brevo (список id=2) */
const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'mail.ru',
  'yandex.ru',
  'icloud.com',
])

export type EmailLeadType = 'personal' | 'business'

export function classifyEmailDomain(email: string): EmailLeadType {
  const at = email.lastIndexOf('@')
  if (at < 0) return 'business'
  const domain = email.slice(at + 1).toLowerCase().trim()
  return PERSONAL_DOMAINS.has(domain) ? 'personal' : 'business'
}

/** listIds — ID списков в Brevo (по умолчанию 2 = personal, 3 = business); переопределяются через env в API */
export function brevoListIdForEmailType(
  t: EmailLeadType,
  listIds: { personal: number; business: number } = { personal: 2, business: 3 }
): number {
  return t === 'personal' ? listIds.personal : listIds.business
}
