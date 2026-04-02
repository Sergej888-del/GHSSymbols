// Клиентский компонент страницы вещества
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { submitLeadCapture } from '../lib/submitLeadCapture'

interface Pictogram {
  code: string
  name_en: string
  svg_content: string | null
  signal_word_en: string | null
}

interface HStatement {
  code: string
  text_en: string
  text_ru: string | null
}

interface PStatement {
  code: string
  text_en: string
  text_ru: string | null
}

interface SubstanceData {
  id: string
  iupac_name: string
  common_name: string | null
  cas_number: string | null
  ec_number: string | null
  un_number: string | null
  molecular_formula: string | null
  molecular_weight: number | null
  flash_point: number | null
  boiling_point: number | null
  ate_oral: number | null
  ate_dermal: number | null
  ate_inhalation_vapour: number | null
  svhc_status: boolean
  svhc_reason: string | null
  h_statement_codes: string[] | null
  ghs_pictogram_codes: string[] | null
  signal_word: string | null
  p_statement_codes: string[] | null
}

const H_STATEMENT_STYLE = 'bg-red-50 border-red-200 text-red-800'

interface Props {
  initialCas?: string
}

export default function SubstancePage({ initialCas }: Props = {}) {
  const [substance, setSubstance] = useState<SubstanceData | null>(null)
  const [pictograms, setPictograms] = useState<Pictogram[]>([])
  const [hStatements, setHStatements] = useState<HStatement[]>([])
  const [pStatements, setPStatements] = useState<PStatement[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [emailModal, setEmailModal] = useState(false)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams(window.location.search)
      const cas = initialCas ?? params.get('cas')
      const id  = params.get('id')

      if (!cas && !id) { setNotFound(true); setLoading(false); return }

      let q = supabase.from('substances').select(
        'id, iupac_name, common_name, cas_number, ec_number, un_number, ' +
        'molecular_formula, molecular_weight, flash_point, boiling_point, ' +
        'ate_oral, ate_dermal, ate_inhalation_vapour, svhc_status, svhc_reason, ' +
        'h_statement_codes, ghs_pictogram_codes, signal_word, p_statement_codes'
      )
      q = cas ? q.eq('cas_number', cas) : q.eq('id', id!)
      const { data: sub } = await q.single()

      if (!sub) { setNotFound(true); setLoading(false); return }
      setSubstance(sub as SubstanceData)

      const picCodes = (sub as SubstanceData).ghs_pictogram_codes ?? []
      const hCodes   = (sub as SubstanceData).h_statement_codes   ?? []
      const pCodes   = (sub as SubstanceData).p_statement_codes   ?? []

      const [picRes, hRes, pRes] = await Promise.all([
        picCodes.length > 0
          ? supabase.from('pictograms_signals').select('code, name_en, svg_content, signal_word_en').in('code', picCodes)
          : Promise.resolve({ data: [] }),
        hCodes.length > 0
          ? supabase.from('h_statements').select('code, text_en, text_ru').in('code', hCodes)
          : Promise.resolve({ data: [] }),
        pCodes.length > 0
          ? supabase.from('p_statements').select('code, text_en, text_ru').in('code', pCodes)
          : Promise.resolve({ data: [] }),
      ])

      setPictograms(((picRes.data ?? []) as Pictogram[]).sort((a, b) => a.code.localeCompare(b.code)))
      setHStatements(((hRes.data ?? []) as HStatement[]).sort((a, b) => a.code.localeCompare(b.code)))
      setPStatements(((pRes.data ?? []) as PStatement[]).sort((a, b) => a.code.localeCompare(b.code)))
      setLoading(false)
    }
    load()
  }, [])

  const submitAndDownload = async () => {
    if (!email.includes('@')) { setEmailError('Enter a valid email address'); return }
    setSubmitting(true)
    setEmailError('')
    try {
      const result = await submitLeadCapture({
        email,
        source_tool: 'safety_summary',
        source_domain: 'ghssymbols.com',
        email_consent: true,
      })
      if (!result.ok) {
        setEmailError(result.error)
        setSubmitting(false)
        return
      }
    } catch {
      setEmailError('Network error. Try again.')
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    setEmailModal(false)
    setEmail('')
    downloadPdf()
  }

  const downloadPdf = () => {
    if (!substance) return
    const date = new Date().toLocaleDateString('en-GB')
    const name = substance.common_name ?? substance.iupac_name

    const hRows = hStatements.map(h =>
      `<tr><td style="font-weight:600;font-family:monospace;white-space:nowrap">${h.code}</td><td>${h.text_en}</td></tr>`
    ).join('')

    const pRows = pStatements.map(p =>
      `<tr><td style="font-weight:600;font-family:monospace;white-space:nowrap;color:#1a6b3c">${p.code}</td><td>${p.text_en}</td></tr>`
    ).join('')

    const picItems = pictograms.map(p => `
      <div style="display:inline-flex;flex-direction:column;align-items:center;gap:4px;width:80px;margin:4px">
        <div style="width:72px;height:72px;border:2px solid #111;border-radius:4px;display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden">
          ${p.svg_content
            ? `<div style="width:64px;height:64px;display:flex;align-items:center;justify-content:center">${p.svg_content}</div>`
            : `<span style="font-size:10px;font-weight:700;color:#555">${p.code}</span>`}
        </div>
        <span style="font-size:9px;text-align:center;color:#555;line-height:1.2">${p.name_en}</span>
        <span style="font-size:9px;font-family:monospace;color:#999">${p.code}</span>
      </div>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Safety Summary — ${name}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; margin: 40px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .sub { color: #555; font-size: 13px; margin-bottom: 4px; }
        .meta { color: #888; font-size: 11px; margin-bottom: 20px; }
        h2 { font-size: 13px; font-weight: 700; margin: 22px 0 8px;
             border-bottom: 1px solid #ddd; padding-bottom: 4px; text-transform: uppercase;
             letter-spacing: .04em; color: #444; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f5f5f5; text-align: left; padding: 5px 8px; border: 1px solid #ddd; }
        td { padding: 5px 8px; border: 1px solid #eee; vertical-align: top; }
        .props { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .prop { background: #f9f9f9; padding: 8px 10px; border-radius: 4px; }
        .prop-label { font-size: 10px; color: #888; margin-bottom: 2px; }
        .prop-value { font-weight: 600; }
        .signal { display: inline-block; font-size: 14px; margin-top: 4px; }
        .svhc { background: #fef2f2; border: 1px solid #fecaca; padding: 10px 14px;
                border-radius: 6px; color: #991b1b; font-size: 12px; margin-top: 8px; }
        .footer { margin-top: 32px; font-size: 10px; color: #aaa;
                  border-top: 1px solid #eee; padding-top: 10px; }
        @media print { body { margin: 20px; } }
        svg { max-width: 100%; max-height: 100%; }
      </style></head><body>

      <h1>${substance.iupac_name}</h1>
      ${substance.common_name ? `<div class="sub">${substance.common_name}</div>` : ''}
      <div class="meta">
        ${substance.cas_number ? `CAS: ${substance.cas_number} &nbsp;` : ''}
        ${substance.ec_number  ? `EC: ${substance.ec_number} &nbsp;`   : ''}
        ${substance.un_number  ? `UN: ${substance.un_number} &nbsp;`   : ''}
        ${substance.molecular_formula ? `Formula: ${substance.molecular_formula}` : ''}
      </div>
      ${substance.signal_word ? `<div class="signal" style="${substance.signal_word === 'Danger' ? 'color:#cc0000;font-weight:bold' : 'color:#e65c00;font-weight:bold'}">${substance.signal_word}</div>` : ''}

      ${pictograms.length > 0 ? `<h2>GHS Pictograms</h2>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${picItems}</div>` : ''}

      ${hRows ? `<h2>Hazard Statements</h2>
        <table><thead><tr><th style="width:70px">Code</th><th>Statement</th></tr></thead>
        <tbody>${hRows}</tbody></table>` : ''}

      ${pRows ? `<h2>Precautionary Statements</h2>
        <table><thead><tr><th style="width:70px">Code</th><th>Statement</th></tr></thead>
        <tbody>${pRows}</tbody></table>` : ''}

      ${(substance.molecular_weight || substance.flash_point !== null || substance.boiling_point) ? `
        <h2>Physical Properties</h2>
        <div class="props">
          ${substance.molecular_weight ? `<div class="prop"><div class="prop-label">Molecular Weight</div><div class="prop-value">${substance.molecular_weight} g/mol</div></div>` : ''}
          ${substance.flash_point !== null ? `<div class="prop"><div class="prop-label">Flash Point</div><div class="prop-value">${substance.flash_point}°C</div></div>` : ''}
          ${substance.boiling_point ? `<div class="prop"><div class="prop-label">Boiling Point</div><div class="prop-value">${substance.boiling_point}°C</div></div>` : ''}
        </div>` : ''}

      ${(substance.ate_oral || substance.ate_dermal || substance.ate_inhalation_vapour) ? `
        <h2>Acute Toxicity Estimates (ATE)</h2>
        <div class="props">
          ${substance.ate_oral ? `<div class="prop"><div class="prop-label">Oral (mg/kg)</div><div class="prop-value">${substance.ate_oral}</div></div>` : ''}
          ${substance.ate_dermal ? `<div class="prop"><div class="prop-label">Dermal (mg/kg)</div><div class="prop-value">${substance.ate_dermal}</div></div>` : ''}
          ${substance.ate_inhalation_vapour ? `<div class="prop"><div class="prop-label">Inhalation vapour (mg/L/4h)</div><div class="prop-value">${substance.ate_inhalation_vapour}</div></div>` : ''}
        </div>` : ''}

      ${substance.svhc_status ? `<h2>SVHC Status</h2>
        <div class="svhc">${substance.svhc_reason || 'Listed as SVHC under REACH. Suppliers must provide Safety Data Sheets and notify customers.'}</div>` : ''}

      <div class="footer">
        Generated: ${date} &nbsp;|&nbsp; ghssymbols.com &nbsp;|&nbsp;
        Data source: ECHA CLP Annex VI / UN GHS Rev.9. This summary is for informational purposes only.
      </div>
    </body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center text-gray-400 text-lg">Loading…</div>
  )

  if (notFound || !substance) return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center">
      <p className="text-gray-600 mb-4">Substance not found.</p>
      <a href="/hazards" className="text-orange-600 hover:underline">← Back to database</a>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

      {/* Заголовок */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{substance.iupac_name}</h1>
            {substance.common_name && (
              <p className="text-lg text-gray-500 mt-1">{substance.common_name}</p>
            )}
          </div>
          <button
            onClick={() => setEmailModal(true)}
            className="shrink-0 flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Download Safety Summary PDF
          </button>
        </div>
        <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-600">
          {substance.cas_number && <span><strong>CAS:</strong> {substance.cas_number}</span>}
          {substance.ec_number  && <span><strong>EC:</strong> {substance.ec_number}</span>}
          {substance.un_number  && <span><strong>UN:</strong> {substance.un_number}</span>}
          {substance.molecular_formula && <span><strong>Formula:</strong> {substance.molecular_formula}</span>}
        </div>
        {substance.signal_word && (
          <div className="mt-4">
            <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold ${
              substance.signal_word === 'Danger' ? 'bg-red-600 text-white' : 'bg-yellow-400 text-yellow-900'
            }`}>
              {substance.signal_word}
            </span>
          </div>
        )}
      </div>

      {/* GHS Пиктограммы */}
      {pictograms.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">GHS Pictograms</h2>
          <div className="flex flex-wrap gap-6">
            {pictograms.map(p => (
              <div key={p.code} className="flex flex-col items-center gap-2 w-20">
                <div className="w-20 h-20 border-2 border-black rounded flex items-center justify-center bg-white">
                  {p.svg_content
                    ? <div className="w-16 h-16 overflow-hidden [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: p.svg_content }} />
                    : <span className="text-xs font-bold text-gray-500">{p.code}</span>
                  }
                </div>
                <span className="text-xs text-center text-gray-500 leading-tight">{p.name_en}</span>
                <span className="text-xs font-mono text-gray-400">{p.code}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* H-фразы */}
      {(hStatements.length > 0 || (substance.h_statement_codes?.length ?? 0) > 0) && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Hazard Statements</h2>
          <div className="space-y-2">
            {hStatements.length > 0 ? (
              hStatements.map(h => {
                return (
                  <div key={h.code}
                    className={`flex gap-3 items-start px-4 py-3 rounded-lg border text-sm ${H_STATEMENT_STYLE}`}
                  >
                    <span className="font-bold font-mono shrink-0 w-14">{h.code}</span>
                    <p className="font-medium">{h.text_en}</p>
                  </div>
                )
              })
            ) : (
              <div className="flex flex-wrap gap-2">
                {substance.h_statement_codes!.map(code => (
                  <span key={code} className="bg-gray-100 text-gray-700 px-3 py-1 rounded font-mono text-sm">{code}</span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* P-фразы */}
      {(pStatements.length > 0 || (substance.p_statement_codes?.length ?? 0) > 0) && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Precautionary Statements</h2>
          <div className="space-y-2">
            {pStatements.length > 0 ? (
              pStatements.map(p => (
                <div key={p.code}
                  className="flex gap-3 items-start px-4 py-3 rounded-lg border text-sm bg-green-50 border-green-200 text-green-800"
                >
                  <span className="font-bold font-mono shrink-0 w-14">{p.code}</span>
                  <p className="font-medium">{p.text_en}</p>
                </div>
              ))
            ) : (
              <div className="flex flex-wrap gap-2">
                {substance.p_statement_codes!.map(code => (
                  <span key={code} className="bg-gray-100 text-gray-700 px-3 py-1 rounded font-mono text-sm">{code}</span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Физические свойства */}
      {(substance.flash_point !== null || substance.boiling_point || substance.molecular_weight) && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Physical Properties</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {substance.molecular_weight && (
              <div className="bg-gray-50 rounded-lg p-3">
                <dt className="text-xs text-gray-500">Molecular Weight</dt>
                <dd className="font-semibold">{substance.molecular_weight} g/mol</dd>
              </div>
            )}
            {substance.flash_point !== null && (
              <div className={`rounded-lg p-3 ${substance.flash_point < 23 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <dt className="text-xs text-gray-500">Flash Point</dt>
                <dd className="font-semibold">{substance.flash_point}°C</dd>
                {substance.flash_point < 23 && (
                  <dd className="text-xs text-red-600 mt-1">Highly flammable — special storage required</dd>
                )}
              </div>
            )}
            {substance.boiling_point && (
              <div className="bg-gray-50 rounded-lg p-3">
                <dt className="text-xs text-gray-500">Boiling Point</dt>
                <dd className="font-semibold">{substance.boiling_point}°C</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {/* ATE */}
      {(substance.ate_oral || substance.ate_dermal || substance.ate_inhalation_vapour) && (
        <section className="mb-8 bg-orange-50 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Acute Toxicity Estimates (ATE)</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
            {substance.ate_oral && (
              <div>
                <dt className="text-xs text-gray-500">Oral (mg/kg)</dt>
                <dd className="font-semibold">{substance.ate_oral}</dd>
              </div>
            )}
            {substance.ate_dermal && (
              <div>
                <dt className="text-xs text-gray-500">Dermal (mg/kg)</dt>
                <dd className="font-semibold">{substance.ate_dermal}</dd>
              </div>
            )}
            {substance.ate_inhalation_vapour && (
              <div>
                <dt className="text-xs text-gray-500">Inhalation vapour (mg/L/4h)</dt>
                <dd className="font-semibold">{substance.ate_inhalation_vapour}</dd>
              </div>
            )}
          </dl>
          <a href={`/tools/ate-calculator?substance=${substance.cas_number}`}
            className="text-sm font-medium text-orange-600 hover:text-orange-700">
            Use in ATE Calculator →
          </a>
        </section>
      )}

      {/* SVHC */}
      {substance.svhc_status && (
        <section className="mb-8 bg-red-50 border border-red-200 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-red-800 mb-2">SVHC — Substance of Very High Concern</h2>
          <p className="text-red-700 text-sm">
            {substance.svhc_reason || 'Listed as SVHC under REACH. Suppliers must provide Safety Data Sheets and notify customers.'}
          </p>
        </section>
      )}

      <a href="/hazards" className="text-sm text-gray-500 hover:text-orange-600">← Back to database</a>

      {/* Модалка email */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Download Safety Summary</h3>
            <p className="text-sm text-gray-500 mb-6">
              Enter your work email — the PDF will download instantly. No spam.
            </p>
            <input
              type="email"
              placeholder="your@company.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailError('') }}
              onKeyDown={e => e.key === 'Enter' && submitAndDownload()}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-orange-400"
              autoFocus
            />
            {emailError && <p className="text-red-500 text-xs mt-1 mb-2">{emailError}</p>}
            <div className="flex gap-3 mt-4">
              <button
                onClick={submitAndDownload}
                disabled={submitting}
                className="flex-1 bg-orange-600 text-white py-3 rounded-lg font-semibold text-sm hover:bg-orange-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Download PDF'}
              </button>
              <button
                onClick={() => { setEmailModal(false); setEmail(''); setEmailError('') }}
                className="px-4 py-3 text-gray-500 hover:text-gray-700 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}