// Калькулятор ATE смесей (Инструмент 1)
// Алгоритм: 100 / ATEmix = Σ(Ci / ATEi) для всех компонентов ≥ 1%
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Substance, MixtureComponent } from '../../lib/supabase'

// Категории острой токсичности по GHS (мг/кг, перорально)
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

type CalcResult = {
  ate_oral: number | null
  ate_dermal: number | null
  ate_inhalation_vapour: number | null
  cat_oral: number | null
  cat_dermal: number | null
  cat_inhalation: number | null
  signal_word: string
}

export default function ATECalculator() {
  const [components, setComponents] = useState<MixtureComponent[]>([
    { substance_id: '', cas_number: '', name: '', concentration: 0, ate_oral: null, ate_dermal: null, ate_inhalation_vapour: null, ate_inhalation_dust: null }
  ])
  const [searchTexts, setSearchTexts] = useState<Record<number, string>>({})
  const [searchResults, setSearchResults] = useState<Substance[]>([])
  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null)
  const [result, setResult] = useState<CalcResult | null>(null)
  const [emailModal, setEmailModal] = useState(false)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Авто-загрузка вещества из URL параметра ?substance=CAS
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

  // Поиск вещества в Supabase (три отдельных запроса — .or() с ilike падает)
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

    // Объединяем и дедуплицируем по id
    const seen = new Set<string>()
    const merged: Substance[] = []
    for (const row of [...(r1.data ?? []), ...(r2.data ?? []), ...(r3.data ?? [])]) {
      const s = row as Substance
      if (!seen.has(s.id)) { seen.add(s.id); merged.push(s) }
      if (merged.length >= 8) break
    }
    setSearchResults(merged)
  }

  // Выбор вещества из дропдауна
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

  const calculate = () => {
    const ate_oral = calculateATEmix(components, 'ate_oral')
    const ate_dermal = calculateATEmix(components, 'ate_dermal')
    const ate_inhalation_vapour = calculateATEmix(components, 'ate_inhalation_vapour')
    const cat_oral = ate_oral ? getCategory(ate_oral, 'oral') : null
    const cat_dermal = ate_dermal ? getCategory(ate_dermal, 'dermal') : null
    const cat_inhalation = ate_inhalation_vapour ? getCategory(ate_inhalation_vapour, 'inhalation_vapour') : null
    const minCat = Math.min(...[cat_oral, cat_dermal, cat_inhalation].filter(Boolean) as number[])
    const signal_word = minCat <= 2 ? 'DANGER' : minCat <= 4 ? 'WARNING' : 'Not classified'
    setResult({ ate_oral, ate_dermal, ate_inhalation_vapour, cat_oral, cat_dermal, cat_inhalation, signal_word })
  }

  // Сохранить email в Supabase и скачать PDF
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

  // Печать / сохранение как PDF через браузерный диалог
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
        </tr>`)
      .join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>ATE Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; margin: 40px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { color: #666; font-size: 11px; margin-bottom: 20px; }
        h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f5f5f5; text-align: left; padding: 6px 8px; border: 1px solid #ddd; }
        td { padding: 6px 8px; border: 1px solid #eee; }
        .results { margin-top: 20px; }
        .row { display: flex; gap: 32px; margin-bottom: 6px; }
        .label { color: #666; width: 180px; }
        .value { font-weight: bold; }
        .signal { display: inline-block; margin-top: 12px; padding: 6px 20px; border-radius: 20px;
                  font-weight: bold; font-size: 15px;
                  background: ${result.signal_word === 'DANGER' ? '#dc2626' : result.signal_word === 'WARNING' ? '#facc15' : '#e5e7eb'};
                  color: ${result.signal_word === 'DANGER' ? '#fff' : '#111'}; }
        .formula { margin-top: 28px; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 12px; }
        @media print { body { margin: 20px; } }
      </style></head><body>
      <h1>ATE Mixture Calculation Report</h1>
      <div class="meta">Generated: ${date} &nbsp;|&nbsp; ghssymbols.com &nbsp;|&nbsp; Method: UN GHS Rev.9, Section 3.1.3.6</div>

      <h2>Mixture Components</h2>
      <table>
        <thead><tr>
          <th>Component</th><th>CAS</th><th>Conc.</th>
          <th>ATE oral (mg/kg)</th><th>ATE dermal (mg/kg)</th><th>ATE inhal. (mg/L)</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <h2>Results</h2>
      <div class="results">
        ${result.ate_oral ? `<div class="row"><span class="label">ATEmix Oral</span><span class="value">${result.ate_oral.toFixed(0)} mg/kg bw${result.cat_oral ? ' — Category ' + result.cat_oral : ''}</span></div>` : ''}
        ${result.ate_dermal ? `<div class="row"><span class="label">ATEmix Dermal</span><span class="value">${result.ate_dermal.toFixed(0)} mg/kg bw${result.cat_dermal ? ' — Category ' + result.cat_dermal : ''}</span></div>` : ''}
        ${result.ate_inhalation_vapour ? `<div class="row"><span class="label">ATEmix Inhalation</span><span class="value">${result.ate_inhalation_vapour.toFixed(3)} mg/L/4h${result.cat_inhalation ? ' — Category ' + result.cat_inhalation : ''}</span></div>` : ''}
        <div class="signal">${result.signal_word}</div>
      </div>

      <div class="formula">
        Formula: 100 / ATE<sub>mix</sub> = &Sigma;(C<sub>i</sub> / ATE<sub>i</sub>) for all components with concentration &ge; 1%<br>
        Reference: UN GHS Rev.9, Chapter 3.1
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
            {/* Строка 1: поиск + кнопка удаления */}
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
                <button
                  onClick={() => removeComponent(idx)}
                  className="text-gray-400 hover:text-red-500 p-2 transition-colors shrink-0"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Разделитель */}
            <div className="border-t border-gray-100 mt-3 pt-3">
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Concentration</span>
            </div>

            {/* Ползунок + числовое поле */}
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={comp.concentration}
                onChange={e => updateConcentration(idx, e.target.value)}
                className="flex-1 accent-orange-500 cursor-pointer h-2"
              />
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden shrink-0">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={comp.concentration || ''}
                  onChange={e => updateConcentration(idx, e.target.value)}
                  className="w-14 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <span className="px-1.5 text-gray-400 text-sm bg-gray-50 self-stretch flex items-center border-l border-gray-300">%</span>
              </div>
            </div>

            {/* ATE значения */}
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

      {/* Кнопки действий */}
      <div className="flex gap-3">
        <button
          onClick={addComponent}
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:border-orange-400 hover:text-orange-600 transition-colors"
        >
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
        <div className="border border-orange-200 rounded-2xl p-6 bg-orange-50">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Calculation Results</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
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

          {/* Сигнальное слово */}
          <div className={`inline-block px-4 py-2 rounded-full font-bold text-sm mb-6 ${result.signal_word === 'DANGER' ? 'bg-red-600 text-white' : result.signal_word === 'WARNING' ? 'bg-yellow-400 text-yellow-900' : 'bg-gray-200 text-gray-600'}`}>
            {result.signal_word}
          </div>

          {/* Кнопка PDF */}
          <div className="bg-white rounded-xl p-4 border border-orange-200">
            <p className="text-sm font-medium text-gray-900 mb-3">
              Download a PDF report for your SDS documentation
            </p>
            <button
              onClick={() => setEmailModal(true)}
              className="bg-orange-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors"
            >
              Download PDF Report
            </button>
          </div>
        </div>
      )}

      {/* Модалка захвата email */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Get your PDF Report</h3>
            <p className="text-sm text-gray-500 mb-6">
              Enter your work email — the report will download instantly. No spam.
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
