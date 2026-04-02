import type { APIRoute } from 'astro'
import { createClient } from '@supabase/supabase-js'
import { brevoListIdForEmailType, classifyEmailDomain } from '../../lib/emailClassification'

export const prerender = false

const BREVO_URL = 'https://api.brevo.com/v3/contacts'

function parseEnvPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || String(raw).trim() === '') return fallback
  const n = Number.parseInt(String(raw), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  const brevoKey = import.meta.env.BREVO_API_KEY
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL

  if (!brevoKey || !serviceKey || !supabaseUrl) {
    return json(
      { ok: false, error: 'Server misconfigured: missing BREVO_API_KEY, SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_URL' },
      503
    )
  }

  let body: { email?: string; source_tool?: string; source_domain?: string; email_consent?: boolean }
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const source_tool = typeof body.source_tool === 'string' ? body.source_tool.trim() : ''
  const source_domain = typeof body.source_domain === 'string' ? body.source_domain.trim() : 'ghssymbols.com'
  const email_consent = body.email_consent !== false

  if (!email.includes('@') || !source_tool) {
    return json({ ok: false, error: 'email and source_tool are required' }, 400)
  }

  const email_type = classifyEmailDomain(email)
  const listIds = {
    personal: parseEnvPositiveInt(import.meta.env.BREVO_LIST_PERSONAL, 2),
    business: parseEnvPositiveInt(import.meta.env.BREVO_LIST_BUSINESS, 3),
  }
  const listId = brevoListIdForEmailType(email_type, listIds)

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: inserted, error: insertError } = await supabase
    .from('leads')
    .insert({
      email,
      source_tool,
      source_domain,
      email_consent,
      email_type,
    })
    .select('id')
    .maybeSingle()

  let leadId: string | null = inserted?.id ?? null

  if (insertError) {
    const code = (insertError as { code?: string }).code
    if (code === '23505') {
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('email', email)
        .eq('source_tool', source_tool)
        .maybeSingle()
      leadId = existing?.id ?? null
      if (leadId) {
        await supabase.from('leads').update({ email_type, email_consent }).eq('id', leadId)
      }
    } else {
      return json({ ok: false, error: insertError.message }, 500)
    }
  }

  if (!leadId) {
    return json({ ok: false, error: 'Could not resolve lead id' }, 500)
  }

  const brevoRes = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': brevoKey,
    },
    body: JSON.stringify({
      email,
      attributes: {
        SOURCE: source_tool,
        DOMAIN: source_domain,
      },
      listIds: [listId],
      updateEnabled: true,
    }),
  })

  const brevoJson = (await brevoRes.json().catch(() => ({}))) as { id?: number | string }

  if (!brevoRes.ok) {
    return json(
      {
        ok: false,
        error: 'Brevo API error',
        details: brevoJson,
        status: brevoRes.status,
        lead_id: leadId,
      },
      502
    )
  }

  const brevoId = brevoJson.id != null ? String(brevoJson.id) : null

  if (brevoId) {
    const { error: updateError } = await supabase
      .from('leads')
      .update({ brevo_contact_id: brevoId })
      .eq('id', leadId)

    if (updateError) {
      return json({ ok: false, error: updateError.message, lead_id: leadId, brevo_contact_id: brevoId }, 500)
    }
  }

  return json({ ok: true, lead_id: leadId, email_type, brevo_contact_id: brevoId })
}
