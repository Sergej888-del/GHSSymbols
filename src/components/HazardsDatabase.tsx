// База веществ: одна загрузка, Fuse.js + фильтры в браузере
import { useState, useEffect, useMemo, useRef } from 'react'
import Fuse from 'fuse.js'
import { supabase } from '../lib/supabase'

const PAGE_SIZE = 1000
const GHS_CODES = ['GHS01', 'GHS02', 'GHS03', 'GHS04', 'GHS05', 'GHS06', 'GHS07', 'GHS08', 'GHS09'] as const

export interface SubstanceRow {
  id: string
  iupac_name: string
  common_name: string | null
  cas_number: string | null
  svhc_status: boolean
  signal_word: string | null
  ghs_pictogram_codes: string[]
}

type PictogramMeta = {
  src: string | null
  label: string
  svgContent?: string | null
}

function normalizeRow(row: Record<string, unknown>): SubstanceRow {
  const codes = row.ghs_pictogram_codes
  return {
    id: String(row.id),
    iupac_name: String(row.iupac_name ?? ''),
    common_name: (row.common_name as string | null) ?? null,
    cas_number: (row.cas_number as string | null) ?? null,
    svhc_status: Boolean(row.svhc_status),
    signal_word: (row.signal_word as string | null) ?? null,
    ghs_pictogram_codes: Array.isArray(codes) ? (codes as string[]) : [],
  }
}

async function fetchAllSubstances(): Promise<SubstanceRow[]> {
  const all: SubstanceRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('substances')
      .select('id, iupac_name, common_name, cas_number, svhc_status, signal_word, ghs_pictogram_codes')
      .order('iupac_name')
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    const rows = (data ?? []).map((r) => normalizeRow(r as Record<string, unknown>))
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return all
}

function buildPictogramSrc(svg_url: string | null, svg_content: string | null): string | null {
  if (svg_url && svg_url.trim()) return svg_url.trim()
  if (svg_content && svg_content.trim().toLowerCase().includes('<svg')) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg_content)}`
  }
  return null
}

export default function HazardsDatabase() {
  const [allSubstances, setAllSubstances] = useState<SubstanceRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [picByCode, setPicByCode] = useState<Record<string, PictogramMeta>>({})

  const fuseRef = useRef<Fuse<SubstanceRow> | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selectedPictograms, setSelectedPictograms] = useState<string[]>([])
  const [selectedSignal, setSelectedSignal] = useState('')

  const [visibleCount, setVisibleCount] = useState(100)

  // Загрузка веществ и пиктограмм (SVG в репо нет — берём из Supabase)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadError(null)
      setLoadingData(true)
      try {
        const [substances, picRes] = await Promise.all([
          fetchAllSubstances(),
          supabase.from('pictograms_signals').select('code, name_en, svg_url, svg_content').order('code'),
        ])
        if (cancelled) return

        const meta: Record<string, PictogramMeta> = {}
        for (const c of GHS_CODES) {
          meta[c] = { src: null, label: c, svgContent: null }
        }
        for (const row of picRes.data ?? []) {
          const code = row.code as string
          if (!GHS_CODES.includes(code as (typeof GHS_CODES)[number])) continue
          const src = buildPictogramSrc(row.svg_url, row.svg_content)
          meta[code] = {
            src,
            label: (row.name_en as string) || code,
            svgContent: (row.svg_content as string | null) || null,
          }
        }
        setPicByCode(meta)

        fuseRef.current = new Fuse(substances, {
          keys: ['iupac_name', 'common_name', 'cas_number'],
          threshold: 0.3,
          includeScore: true,
        })
        setAllSubstances(substances)
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load substances')
      } finally {
        if (!cancelled) setLoadingData(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Debounce поиска 300 ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchInput)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  const fuseResults = useMemo(() => {
    const q = debouncedQuery.trim()
    if (!q) return allSubstances
    const fuse = fuseRef.current
    if (!fuse) return allSubstances
    return fuse.search(q).map((r) => r.item)
  }, [debouncedQuery, allSubstances])

  const filtered = useMemo(() => {
    let result = fuseResults

    if (selectedPictograms.length > 0) {
      result = result.filter((s) =>
        selectedPictograms.every((p) =>
          s.ghs_pictogram_codes?.some(
            (gc) => gc.toUpperCase().trim() === p.toUpperCase().trim()
          )
        )
      )
    }
    if (selectedSignal) {
      const want = selectedSignal.toLowerCase()
      result = result.filter((s) => (s.signal_word ?? '').toLowerCase() === want)
    }
    return result
  }, [fuseResults, selectedPictograms, selectedSignal])

  const filtersActive =
    selectedPictograms.length > 0 || selectedSignal !== ''

  const counterWarn =
    filtersActive && filtered.length > 0 && filtered.length < 15

  useEffect(() => {
    setVisibleCount(100)
  }, [debouncedQuery, selectedPictograms, selectedSignal])

  const isPictogramActive = (code: string) =>
    selectedPictograms.some((p) => p.toUpperCase().trim() === code.toUpperCase().trim())

  const togglePictogram = (code: string) => {
    setSelectedPictograms((prev) => {
      const normalized = code.toUpperCase().trim()
      const exists = prev.some((p) => p.toUpperCase().trim() === normalized)
      if (exists) {
        return prev.filter((p) => p.toUpperCase().trim() !== normalized)
      } else {
        return [...prev, normalized]
      }
    })
  }

  const toggleSignal = (word: string) => {
    setSelectedSignal((prev) => (prev === word ? '' : word))
  }

  const resetFilters = () => {
    setSelectedPictograms([])
    setSelectedSignal('')
  }

  const visibleRows = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-600">
        <div
          className="h-10 w-10 rounded-full border-2 border-orange-400 border-t-transparent animate-spin"
          aria-hidden
        />
        <p className="text-sm">Loading substance database…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <p className="text-red-600 text-center py-12" role="alert">
        {loadError}
      </p>
    )
  }

  return (
    <>
      <div className="mb-6 relative">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name or CAS number..."
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          autoComplete="off"
          aria-label="Search substances"
        />
      </div>

      <div style={{ background: '#F8FAFC', padding: '1rem', borderBottom: '1px solid #E2E8F0' }}>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Hazard Pictograms</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {GHS_CODES.map((code) => {
            const meta = picByCode[code]
            return (
              <button
                key={code}
                type="button"
                onClick={() => togglePictogram(code)}
                title={meta?.label ?? code}
                className={`flex items-center justify-center rounded-lg transition-colors h-11 w-11 ${
                  isPictogramActive(code)
                    ? 'border-2 border-[#062A78] bg-[#EFF6FF]'
                    : 'border border-[#CBD5E1] bg-white'
                }`}
                aria-pressed={isPictogramActive(code)}
              >
                {meta?.svgContent ? (
                  <div
                    style={{ width: 36, height: 36 }}
                    dangerouslySetInnerHTML={{ __html: meta.svgContent }}
                  />
                ) : meta?.src ? (
                  <img src={meta.src} alt="" width={36} height={36} className="object-contain" />
                ) : (
                  <span className="text-[10px] font-bold text-gray-600">{code}</span>
                )}
              </button>
            )
          })}
        </div>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Signal Word</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {(['Danger', 'Warning'] as const).map((w) => {
            const active = selectedSignal === w
            return (
              <button
                key={w}
                type="button"
                onClick={() => toggleSignal(w)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  background: active ? '#062A78' : '#fff',
                  color: active ? '#fff' : '#334155',
                  border: active ? 'none' : '1px solid #CBD5E1',
                }}
                aria-pressed={active}
              >
                {w}
              </button>
            )
          })}
        </div>

        {filtersActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="mt-2 text-sm px-3 py-1.5 rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300 font-medium"
          >
            Reset all filters
          </button>
        )}
      </div>

      <p
        className={`text-sm py-3 px-1 ${counterWarn ? 'text-orange-600 font-medium' : 'text-gray-600'}`}
      >
        Showing {filtered.length} of {allSubstances.length} substances
      </p>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-12">
          {debouncedQuery.trim() || filtersActive
            ? 'No substances match your search or filters.'
            : 'No substances found.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-b-lg overflow-hidden bg-white">
            {visibleRows.map((s) => (
              <li key={s.id}>
                <a
                  href={`/hazards/${encodeURIComponent(s.cas_number ?? '')}/`}
                  className="flex flex-wrap items-center gap-3 py-4 px-1 sm:px-0 hover:text-orange-600 transition-colors group"
                >
                  <div className="flex-1 min-w-[12rem]">
                    <span className="font-medium group-hover:text-orange-600">{s.iupac_name}</span>
                    {s.common_name && (
                      <span className="ml-2 text-sm text-gray-500">({s.common_name})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {s.ghs_pictogram_codes.map((code) => {
                      const meta = picByCode[code]
                      return meta?.svgContent ? (
                        <div
                          key={code}
                          style={{ width: 16, height: 16, flexShrink: 0 }}
                          dangerouslySetInnerHTML={{ __html: meta.svgContent }}
                        />
                      ) : meta?.src ? (
                        <img
                          key={code}
                          src={meta.src}
                          alt=""
                          width={16}
                          height={16}
                          className="object-contain shrink-0"
                        />
                      ) : (
                        <span
                          key={code}
                          className="text-[9px] font-bold text-gray-500 border border-gray-200 rounded px-0.5"
                        >
                          {code}
                        </span>
                      )
                    })}
                    {s.cas_number && <span className="text-sm text-gray-400">CAS {s.cas_number}</span>}
                    {s.svhc_status && (
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">
                        SVHC
                      </span>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => Math.min(c + 100, filtered.length))}
                className="px-5 py-2.5 rounded-lg bg-gray-100 text-gray-800 font-semibold text-sm hover:bg-gray-200"
              >
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
