/** POST /api/leads — Supabase + Brevo (серверный ключ, не из браузера) */
export async function submitLeadCapture(payload: {
  email: string
  source_tool: string
  source_domain?: string
  email_consent?: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: payload.email,
      source_tool: payload.source_tool,
      source_domain: payload.source_domain ?? 'ghssymbols.com',
      email_consent: payload.email_consent !== false,
    }),
  })
  const data = (await res.json()) as { ok?: boolean; error?: string }
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: typeof data.error === 'string' ? data.error : 'Could not save lead. Try again.',
    }
  }
  return { ok: true }
}
