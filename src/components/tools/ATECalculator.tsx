// Калькулятор ATE смесей (Инструмент 1)
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Substance, MixtureComponent } from '../../lib/supabase'

const ATE_CATEGORIES = {
  oral: [
    { cat: 1, max: 5 },
    { cat: 2, max: 50 },
    { cat: 3, max: 300 },
    { cat: 4, max: 2000 },
  ],
  dermal: [
    { cat: 1, max: 50 },
    { cat: 2, max: 200 },
    { cat: 3, max: 1000 },
    { cat: 4, max: 2000 },
  ],
  inhalation_vapour: [
    { cat: 1, max: 0.5 },
    { cat: 2, max: 2.0 },
    { cat: 3, max: 10.0 },
    { cat: 4, max: 20.0 },
  ],
}

// H-фразы по маршруту и категории
const H_CODES: Record<string, Record<number, string>> = {
  oral:              { 1: 'H300', 2: 'H300', 3: 'H301', 4: 'H302' },
  dermal:            { 1: 'H310', 2: 'H310', 3: 'H311', 4: 'H312' },
  inhalation_vapour: { 1: 'H330', 2: 'H330', 3: 'H331', 4: 'H332' },
}

// Пиктограммы по категории острой токсичности
function getPictogramCode(minCat: number | null): string[] {
  if (!minCat) return []
  if (minCat <= 3) return ['GHS06']
  if (minCat === 4) return ['GHS07']
  return []
}

function getCategory(ate: number, type: keyof typeof ATE_CATEGORIES): number | null {
  for (const { cat, max } of ATE_CATEGORIES[type]) {
    if (ate <= max) return cat
  }
  return null
}

function calculateATEmix(components: MixtureComponent[], field: keyof MixtureComponent): number | null {
  const valid = components.filter(c => {
    const v = c[field]
    return typeof v === 'number' && v > 0 && c.concentration >= 1
  })
  if (valid.length === 0) return null
  const totalKnown = valid.reduce((sum, c) => sum + c.concentration, 0)
  if (totalKnown === 0) return null
  const sumRatio = valid.reduce((sum, c) => sum + (c.concentration / (c[field] as number)), 0)
  if (sumRatio === 0) return null
  return totalKnown / sumRatio
}

interface Pictogram {
  code: string
  name_en: string
  svg_content: string | null
}

interface HStatement {
  code: string
  text_en: string
}

interface PStatement {
  code: string
  text_en: string
}

type CalcResult = {
  ate_oral: number | null
  ate_dermal: number | null
  ate_inhalation_vapour: number | null
  cat_oral: number | null
  cat_dermal: number | null
  cat_inhalation: number | null
  signal_word: string
  pictogram_codes: string[]
  h_codes: string[]
}

export default function ATECalculator() {
  const [components, setComponents] = useState<MixtureComponent[]>([
    { substance_id: '', cas_number: '', name: '', concentration: 0, ate_oral: null, ate_dermal: null, ate_inhalation_vapour: null, ate_inhalation_dust: null }
  ])
  const [searchTexts, setSearchTexts] = useState<Record<number, string>>({})
  const [searchResults, setSearchResults] = useState<Substance[]>([])
  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null)
  const [result, setResult] = useState<CalcResult | null>(null)
  const [pictograms, setPictograms] = useState<Pictogram[]>([])
  const [hStatements, setHStatements] = useState<HStatement[]>([])
  const [pStatements, setPStatements] = useState<PStatement[]>([])
  const [emailModal, setEmailModal] = useState(false)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const cas = new URLSearchParams(window.location.search).get('substance')
    if (!cas) return
    supabase
      .from('substances')
      .select('id, iupac_name, common_name, cas_number, ate_oral, ate_dermal, ate_inhalation_vapour, ate_inhalation_dust')
      .eq('cas_number', cas)
      .single()
      .then(({ data }) => {
        if (!data) return
        const s = data as Substance
        const displayName = s.common_name ?? s.iupac_name
        setComponents([{
          substance_id: s.id,
          cas_number: s.cas_number ?? '',
          name: displayName,
          concentration: 0,
          ate_oral: s.ate_oral,
          ate_dermal: s.ate_dermal,
          ate_inhalation_vapour: s.ate_inhalation_vapour,
          ate_inhalation_dust: s.ate_inhalation_dust,
        }])
        setSearchTexts({ 0: displayName })
      })
  }, [])

  const searchSubstance = async (query: string, idx: number) => {
    setSearchTexts(prev => ({ ...prev, [idx]: query }))
    setActiveSearchIdx(idx)
    if (query.length < 2) { setSearchResults([]); return }
    const sel = 'id, iupac_name, common_name, cas_number, ate_oral, ate_dermal, ate_inhalation_vapour, ate_inhalation_dust'
    const [r1, r2, r3] = await Promise.all([
      supabase.from('substances').select(sel).ilike('iupac_name', `%${query}%`).limit(6),
      supabase.from('substances').select(sel).ilike('common_name', `%${query}%`).limit(6),
      supabase.from('substances').select(sel).eq('cas_number', query).limit(3),
    ])
    const seen = new Set<string>()
    const merged: Substance[] = []
    for (const row of [...(r1.data ?? []), ...(r2.data ?? []), ...(r3.data ?? [])]) {
      const s = row as Substance
      if (!seen.has(s.id)) { seen.add(s.id); merged.push(s) }
      if (merged.length >= 8) break
    }
    setSearchResults(merged)
  }

  const selectSubstance = (substance: Substance, idx: number) => {
    const displayName = substance.common_name ?? substance.iupac_name
    setComponents(prev => prev.map((c, i) => i !== idx ? c : {
      ...c,
      substance_id: substance.id,
      cas_number: substance.cas_number ?? '',
      name: displayName,
      ate_oral: substance.ate_oral,
      ate_dermal: substance.ate_dermal,
      ate_inhalation_vapour: substance.ate_inhalation_vapour,
      ate_inhalation_dust: substance.ate_inhalation_dust,
    }))
    setSearchTexts(prev => ({ ...prev, [idx]: displayName }))
    setSearchResults([])
    setActiveSearchIdx(null)
  }

  const updateConcentration = (idx: number, value: string) => {
    setComponents(prev => prev.map((c, i) =>
      i === idx ? { ...c, concentration: parseFloat(value) || 0 } : c
    ))
  }

  const addComponent = () => {
    setComponents(prev => [...prev, {
      substance_id: '', cas_number: '', name: '', concentration: 0,
      ate_oral: null, ate_dermal: null, ate_inhalation_vapour: null, ate_inhalation_dust: null
    }])
  }

  const removeComponent = (idx: number) => {
    setComponents(prev => prev.filter((_, i) => i !== idx))
    setSearchTexts(prev => {
      const next: Record<number, string> = {}
      Object.entries(prev).forEach(([k, v]) => {
        const n = Number(k)
        if (n < idx) next[n] = v
        else if (n > idx) next[n - 1] = v
      })
      return next
    })
  }

  const totalConcentration = components.reduce((s, c) => s + c.concentration, 0)

  const calculate = async () => {
    const ate_oral = calculateATEmix(components, 'ate_oral')
    const ate_dermal = calculateATEmix(components, 'ate_dermal')
    const ate_inhalation_vapour = calculateATEmix(components, 'ate_inhalation_vapour')
    const cat_oral = ate_oral ? getCategory(ate_oral, 'oral') : null
    const cat_dermal = ate_dermal ? getCategory(ate_dermal, 'dermal') : null
    const cat_inhalation = ate_inhalation_vapour ? getCategory(ate_inhalation_vapour, 'inhalation_vapour') : null

    const minCat = Math.min(...[cat_oral, cat_dermal, cat_inhalation].filter(Boolean) as number[])
    const signal_word = isFinite(minCat) ? (minCat <= 2 ? 'DANGER' : 'WARNING') : 'Not classified'

    // Собираем H-коды
    const hCodesSet = new Set<string>()
    if (cat_oral)    hCodesSet.add(H_CODES.oral[cat_oral])
    if (cat_dermal)  hCodesSet.add(H_CODES.dermal[cat_dermal])
    if (cat_inhalation) hCodesSet.add(H_CODES.inhalation_vapour[cat_inhalation])
    const h_codes = Array.from(hCodesSet).sort()

    // Пиктограммы
    const pictogram_codes = getPictogramCode(isFinite(minCat) ? minCat : null)

    setResult({ ate_oral, ate_dermal, ate_inhalation_vapour, cat_oral, cat_dermal, cat_inhalation, signal_word, pictogram_codes, h_codes })

    // Загружаем SVG пиктограмм из БД
    if (pictogram_codes.length > 0) {
      const { data } = await supabase
        .from('pictograms_signals')
        .select('code, name_en, svg_content')
        .in('code', pictogram_codes)
      setPictograms((data ?? []) as Pictogram[])
    } else {
      setPictograms([])
    }

    // Загружаем H-statements
    if (h_codes.length > 0) {
      const { data } = await supabase
        .from('h_statements')
        .select('code, text_en')
        .in('code', h_codes)
      setHStatements(((data ?? []) as HStatement[]).sort((a, b) => a.code.localeCompare(b.code)))
    } else {
      setHStatements([])
    }

    // P-statements для острой токсичности по категории
    const pCodes: string[] = ['P101', 'P102', 'P103', 'P260', 'P264', 'P270', 'P501']
    if (isFinite(minCat)) {
      if (minCat <= 2) pCodes.push('P280', 'P301', 'P310', 'P330')
      if (minCat === 3) pCodes.push('P280', 'P301', 'P311', 'P330')
      if (minCat === 4) pCodes.push('P270', 'P301', 'P312', 'P330')
    }
    const uniquePCodes = [...new Set(pCodes)].sort()
    const { data: pData } = await supabase
      .from('p_statements')
      .select('code, text_en')
      .in('code', uniquePCodes)
    setPStatements(((pData ?? []) as PStatement[]).sort((a, b) => a.code.localeCompare(b.code)))
  }

  const submitAndDownload = async () => {
    if (!email.includes('@')) { setEmailError('Enter a valid email address'); return }
    setSubmitting(true)
    setEmailError('')
    await supabase.from('leads').insert({
      email,
      source_tool: 'ate_calculator',
      source_domain: 'ghssymbols.com',
      email_consent: true,
    })
    setSubmitting(false)
    setEmailModal(false)
    setEmail('')
    downloadPdf()
  }

  const downloadPdf = () => {
    if (!result) return
    const date = new Date().toLocaleDateString('en-GB')

    const rows = components
      .filter(c => c.name)
      .map(c => `
        <tr>
          <td>${c.name}</td>
          <td>${c.cas_number || '—'}</td>
          <td>${c.concentration.toFixed(1)}%</td>
          <td>${c.ate_oral ?? '—'}</td>
          <td>${c.ate_dermal ?? '—'}</td>
          <td>${c.ate_inhalation_vapour ?? '—'}</td>
        </tr>`).join('')

    const picItems = pictograms.map(p => `
      <div style="display:inline-flex;flex-direction:column;align-items:center;gap:4px;width:80px;margin:4px">
        <div style="width:72px;height:72px;border:2px solid #111;border-radius:4px;display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden">
          ${p.svg_content ? `<div style="width:64px;height:64px">${p.svg_content}</div>` : `<span style="font-size:10px;font-weight:700">${p.code}</span>`}
        </div>
        <span style="font-size:9px;text-align:center;color:#555">${p.name_en}</span>
        <span style="font-size:9px;font-family:monospace;color:#999">${p.code}</span>
      </div>`).join('')

    const hRows = hStatements.map(h =>
      `<tr><td style="font-weight:600;font-family:monospace;color:#991b1b">${h.code}</td><td>${h.text_en}</td></tr>`
    ).join('')

    const pRows = pStatements.map(p =>
      `<tr><td style="font-weight:600;font-family:monospace;color:#1a6b3c">${p.code}</td><td>${p.text_en}</td></tr>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>ATE Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; margin: 40px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { color: #666; font-size: 11px; margin-bottom: 20px; }
        h2 { font-size: 13px; font-weight:700; margin: 22px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; text-transform:uppercase; letter-spacing:.04em; color:#444; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f5f5f5; text-align: left; padding: 6px 8px; border: 1px solid #ddd; }
        td { padding: 6px 8px; border: 1px solid #eee; vertical-align:top; }
        .results { display:flex; gap:20px; flex-wrap:wrap; margin-bottom:12px; }
        .res-box { background:#f9f9f9; padding:10px 14px; border-radius:6px; min-width:130px; }
        .res-label { font-size:10px; color:#888; margin-bottom:2px; }
        .res-value { font-weight:bold; font-size:18px; }
        .res-unit { font-size:10px; color:#888; }
        .res-cat { display:inline-block; margin-top:6px; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:10px; }
        .cat-danger { background:#fee2e2; color:#991b1b; }
        .cat-warning { background:#fef9c3; color:#92400e; }
        .signal { display:inline-block; margin:12px 0; padding:6px 20px; border-radius:20px; font-weight:bold; font-size:15px;
                  background:${result.signal_word === 'DANGER' ? '#dc2626' : result.signal_word === 'WARNING' ? '#facc15' : '#e5e7eb'};
                  color:${result.signal_word === 'DANGER' ? '#fff' : '#111'}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .formula { margin-top:28px; font-size:11px; color:#888; border-top:1px solid #eee; padding-top:12px; }
        @media print { body { margin: 20px; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
        svg { max-width:100%; max-height:100%; }
      </style></head><body>

      <h1>ATE Mixture Calculation Report</h1>
      <div class="meta">Generated: ${date} &nbsp;|&nbsp; ghssymbols.com &nbsp;|&nbsp; Method: UN GHS Rev.9, Section 3.1.3.6</div>

      <div class="signal">${result.signal_word}</div>

      ${picItems ? `<h2>GHS Pictograms</h2><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${picItems}</div>` : ''}

      <h2>Mixture Components</h2>
      <table>
        <thead><tr>
          <th>Component</th><th>CAS</th><th>Conc.</th>
          <th>ATE oral (mg/kg)</th><th>ATE dermal (mg/kg)</th><th>ATE inhal. (mg/L)</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <h2>Calculation Results</h2>
      <div class="results">
        ${result.ate_oral ? `<div class="res-box"><div class="res-label">ATEmix Oral</div><div class="res-value">${result.ate_oral.toFixed(0)}</div><div class="res-unit">mg/kg bw</div>${result.cat_oral ? `<div class="res-cat ${result.cat_oral <= 2 ? 'cat-danger' : 'cat-warning'}">Category ${result.cat_oral}</div>` : ''}</div>` : ''}
        ${result.ate_dermal ? `<div class="res-box"><div class="res-label">ATEmix Dermal</div><div class="res-value">${result.ate_dermal.toFixed(0)}</div><div class="res-unit">mg/kg bw</div>${result.cat_dermal ? `<div class="res-cat ${result.cat_dermal <= 2 ? 'cat-danger' : 'cat-warning'}">Category ${result.cat_dermal}</div>` : ''}</div>` : ''}
        ${result.ate_inhalation_vapour ? `<div class="res-box"><div class="res-label">ATEmix Inhalation</div><div class="res-value">${result.ate_inhalation_vapour.toFixed(3)}</div><div class="res-unit">mg/L/4h</div>${result.cat_inhalation ? `<div class="res-cat ${result.cat_inhalation <= 2 ? 'cat-danger' : 'cat-warning'}">Category ${result.cat_inhalation}</div>` : ''}</div>` : ''}
      </div>

      ${hRows ? `<h2>Hazard Statements</h2><table><thead><tr><th style="width:70px">Code</th><th>Statement</th></tr></thead><tbody>${hRows}</tbody></table>` : ''}
      ${pRows ? `<h2>Precautionary Statements</h2><table><thead><tr><th style="width:70px">Code</th><th>Statement</th></tr></thead><tbody>${pRows}</tbody></table>` : ''}

      <div class="formula">
        Formula: 100 / ATE<sub>mix</sub> = &Sigma;(C<sub>i</sub> / ATE<sub>i</sub>) for all components &ge; 1%<br>
        Reference: UN GHS Rev.9, Chapter 3.1. This report is for informational purposes only.
      </div>
    </body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div className="space-y-6">
      {/* Компоненты смеси */}
      <div className="space-y-3">
        {components.map((comp, idx) => (
          <div key={idx} className="relative border border-gray-200 rounded-xl p-4 bg-white">
            <div className="flex gap-2 items-start">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search chemical name or CAS..."
                  value={searchTexts[idx] ?? ''}
                  onChange={e => searchSubstance(e.target.value, idx)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                {activeSearchIdx === idx && searchResults.length > 0 && (
                  <ul className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {searchResults.map(s => (
                      <li key={s.id}>
                        <button
                          onClick={() => selectSubstance(s, idx)}
                          className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm"
                        >
                          <span className="font-medium">{s.common_name ?? s.iupac_name}</span>
                          {s.cas_number && <span className="text-gray-400 ml-2">CAS {s.cas_number}</span>}
                          {s.ate_oral && <span className="text-green-600 ml-2 text-xs">ATE oral: {s.ate_oral}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {components.length > 1 && (
                <button onClick={() => removeComponent(idx)} className="text-gray-400 hover:text-red-500 p-2 transition-colors shrink-0">✕</button>
              )}
            </div>

            <div className="border-t border-gray-100 mt-3 pt-3">
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Concentration</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range" min="0" max="100" step="0.1"
                value={comp.concentration}
                onChange={e => updateConcentration(idx, e.target.value)}
                className="flex-1 accent-orange-500 cursor-pointer h-2"
              />
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden shrink-0">
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={comp.concentration || ''}
                  onChange={e => updateConcentration(idx, e.target.value)}
                  className="w-14 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <span className="px-1.5 text-gray-400 text-sm bg-gray-50 self-stretch flex items-center border-l border-gray-300">%</span>
              </div>
            </div>
            {comp.name && (
              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                {comp.ate_oral && <span>Oral: {comp.ate_oral} mg/kg</span>}
                {comp.ate_dermal && <span>Dermal: {comp.ate_dermal} mg/kg</span>}
                {comp.ate_inhalation_vapour && <span>Inhal.: {comp.ate_inhalation_vapour} mg/L</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Сумма концентраций */}
      <div className={`text-sm font-medium ${Math.abs(totalConcentration - 100) > 0.1 ? 'text-orange-600' : 'text-green-600'}`}>
        Total: {totalConcentration.toFixed(1)}%
        {Math.abs(totalConcentration - 100) > 0.1 && ' (should equal 100%)'}
      </div>

      {/* Кнопки */}
      <div className="flex gap-3">
        <button onClick={addComponent} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:border-orange-400 hover:text-orange-600 transition-colors">
          + Add Component
        </button>
        <button
          onClick={calculate}
          disabled={components.every(c => !c.name || c.concentration === 0)}
          className="bg-orange-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Calculate ATE
        </button>
      </div>

      {/* Результаты */}
      {result && (
        <div className="border border-orange-200 rounded-2xl p-6 bg-orange-50 space-y-6">
          <h3 className="text-lg font-bold text-gray-900">Calculation Results</h3>

          {/* Сигнальное слово */}
          <div className={`inline-block px-5 py-2 rounded-full font-bold text-sm ${
            result.signal_word === 'DANGER' ? 'bg-red-600 text-white' :
            result.signal_word === 'WARNING' ? 'bg-yellow-400 text-yellow-900' :
            'bg-gray-200 text-gray-600'
          }`}>
            {result.signal_word}
          </div>

          {/* Пиктограммы */}
          {pictograms.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">GHS Pictograms</h4>
              <div className="flex flex-wrap gap-4">
                {pictograms.map(p => (
                  <div key={p.code} className="flex flex-col items-center gap-1 w-20">
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
            </div>
          )}

          {/* ATE значения */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {result.ate_oral && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">ATEmix Oral</div>
                <div className="text-2xl font-bold text-gray-900">{result.ate_oral.toFixed(0)}</div>
                <div className="text-xs text-gray-400">mg/kg bw</div>
                {result.cat_oral && (
                  <div className={`mt-2 text-xs font-bold px-2 py-1 rounded inline-block ${result.cat_oral <= 2 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    Category {result.cat_oral}
                  </div>
                )}
              </div>
            )}
            {result.ate_dermal && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">ATEmix Dermal</div>
                <div className="text-2xl font-bold text-gray-900">{result.ate_dermal.toFixed(0)}</div>
                <div className="text-xs text-gray-400">mg/kg bw</div>
                {result.cat_dermal && (
                  <div className={`mt-2 text-xs font-bold px-2 py-1 rounded inline-block ${result.cat_dermal <= 2 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    Category {result.cat_dermal}
                  </div>
                )}
              </div>
            )}
            {result.ate_inhalation_vapour && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">ATEmix Inhalation</div>
                <div className="text-2xl font-bold text-gray-900">{result.ate_inhalation_vapour.toFixed(3)}</div>
                <div className="text-xs text-gray-400">mg/L/4h vapour</div>
                {result.cat_inhalation && (
                  <div className={`mt-2 text-xs font-bold px-2 py-1 rounded inline-block ${result.cat_inhalation <= 2 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    Category {result.cat_inhalation}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* H-statements */}
          {hStatements.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Hazard Statements</h4>
              <div className="space-y-2">
                {hStatements.map(h => (
                  <div key={h.code} className="flex gap-3 items-start px-4 py-3 rounded-lg border text-sm bg-red-50 border-red-200 text-red-800">
                    <span className="font-bold font-mono shrink-0 w-14">{h.code}</span>
                    <p className="font-medium">{h.text_en}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* P-statements */}
          {pStatements.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Precautionary Statements</h4>
              <div className="space-y-2">
                {pStatements.map(p => (
                  <div key={p.code} className="flex gap-3 items-start px-4 py-3 rounded-lg border text-sm bg-green-50 border-green-200 text-green-800">
                    <span className="font-bold font-mono shrink-0 w-14">{p.code}</span>
                    <p className="font-medium">{p.text_en}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Кнопка PDF */}
          <div className="bg-white rounded-xl p-4 border border-orange-200">
            <p className="text-sm font-medium text-gray-900 mb-3">Download a PDF report for your SDS documentation</p>
            <button
              onClick={() => setEmailModal(true)}
              className="bg-orange-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors"
            >
              Download PDF Report
            </button>
          </div>
        </div>
      )}

      {/* Модалка email */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Get your PDF Report</h3>
            <p className="text-sm text-gray-500 mb-6">Enter your work email — the report will download instantly. No spam.</p>
            <input
              type="email"
              placeholder="your@company.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailError('') }}
              onKeyDown={e => e.key === 'Enter' && submitAndDownload()}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-orange-400"
              autoFocus
            />
            {emailError && <p className="text-red-500 text-xs mb-3">{emailError}</p>}
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