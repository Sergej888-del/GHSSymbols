// Клиентский компонент базы данных веществ
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

interface SubstanceRow {
  id: string
  iupac_name: string
  common_name: string | null
  cas_number: string | null
  svhc_status: boolean
}

async function querySubstances(search: string): Promise<SubstanceRow[]> {
  const trimmed = search.trim()

  if (trimmed.length < 2) {
    // Без поиска — первые 50 по алфавиту
    const { data } = await supabase
      .from('substances')
      .select('id, iupac_name, common_name, cas_number, svhc_status')
      .order('iupac_name')
      .limit(50)
    return (data ?? []) as SubstanceRow[]
  }

  // Поиск по IUPAC имени
  const { data: byName } = await supabase
    .from('substances')
    .select('id, iupac_name, common_name, cas_number, svhc_status')
    .ilike('iupac_name', `%${trimmed}%`)
    .order('iupac_name')
    .limit(30)

  // Поиск по common_name
  const { data: byCommon } = await supabase
    .from('substances')
    .select('id, iupac_name, common_name, cas_number, svhc_status')
    .ilike('common_name', `%${trimmed}%`)
    .order('iupac_name')
    .limit(20)

  // Поиск по CAS номеру (точное совпадение)
  const { data: byCas } = await supabase
    .from('substances')
    .select('id, iupac_name, common_name, cas_number, svhc_status')
    .eq('cas_number', trimmed)
    .limit(5)

  // Объединяем, убираем дубликаты по id
  const seen = new Set<string>()
  const results: SubstanceRow[] = []
  for (const row of [...(byName ?? []), ...(byCommon ?? []), ...(byCas ?? [])]) {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      results.push(row as SubstanceRow)
    }
  }
  return results
}

export default function HazardsDatabase() {
  const [substances, setSubstances] = useState<SubstanceRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Первая загрузка
    querySubstances('').then(data => {
      setSubstances(data)
      setLoading(false)
    })
  }, [])

  const handleSearch = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const data = await querySubstances(value)
      setSubstances(data)
      setLoading(false)
    }, 350)
  }

  return (
    <>
      {/* Поиск */}
      <div className="mb-8 relative">
        <input
          type="search"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search by name or CAS number..."
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 pr-24"
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-4 top-3.5 text-gray-400 text-sm animate-pulse">Searching…</span>
        )}
      </div>

      {/* Результаты */}
      {!loading && substances.length === 0 ? (
        <p className="text-gray-500 text-center py-12">
          {query.length >= 2 ? `No results for "${query}"` : 'No substances found.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {substances.map(s => (
            <li key={s.id}>
              {/* Ссылка с query-параметром — не требует статической генерации страниц */}
              <a
                href={`/hazards/view?cas=${encodeURIComponent(s.cas_number ?? '')}&id=${s.id}`}
                className="flex items-center justify-between py-4 hover:text-orange-600 transition-colors group"
              >
                <div>
                  <span className="font-medium group-hover:text-orange-600">{s.iupac_name}</span>
                  {s.common_name && (
                    <span className="ml-2 text-sm text-gray-500">({s.common_name})</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400 shrink-0">
                  {s.cas_number && <span>CAS {s.cas_number}</span>}
                  {s.svhc_status && (
                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">SVHC</span>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      {substances.length >= 50 && !loading && (
        <p className="text-center text-sm text-gray-400 mt-6">
          Showing first 50 results — use search to narrow down.
        </p>
      )}
    </>
  )
}
