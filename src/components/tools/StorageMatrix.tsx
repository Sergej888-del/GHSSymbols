// Матрица совместимости хранения химических веществ (Инструмент 2)
// Цветовая матрица 🟢🟡🔴 по правилам сегрегации GHS
import { useState } from 'react'

// Классы опасности для сегрегации (основные группы)
const HAZARD_GROUPS = [
  { id: 'flammable',    label: 'Flammable liquids/gases',    color: 'bg-red-100 text-red-800' },
  { id: 'oxidizer',     label: 'Oxidizing agents',           color: 'bg-yellow-100 text-yellow-800' },
  { id: 'toxic',        label: 'Acute toxic (Cat 1-3)',       color: 'bg-purple-100 text-purple-800' },
  { id: 'corrosive',    label: 'Corrosives (acids/bases)',    color: 'bg-orange-100 text-orange-800' },
  { id: 'explosive',    label: 'Explosives',                  color: 'bg-red-200 text-red-900' },
  { id: 'compressed',   label: 'Compressed gases',           color: 'bg-blue-100 text-blue-800' },
  { id: 'aquatic',      label: 'Aquatic hazard',             color: 'bg-teal-100 text-teal-800' },
  { id: 'peroxide',     label: 'Organic peroxides',          color: 'bg-pink-100 text-pink-800' },
] as const

type HazardId = typeof HAZARD_GROUPS[number]['id']

// Матрица совместимости: 0=несовместимы🔴, 1=осторожно🟡, 2=совместимы🟢
// Индексы соответствуют порядку HAZARD_GROUPS
const COMPATIBILITY: Record<string, Record<string, 0 | 1 | 2>> = {
  flammable:  { flammable: 2, oxidizer: 0, toxic: 1, corrosive: 0, explosive: 0, compressed: 1, aquatic: 2, peroxide: 0 },
  oxidizer:   { flammable: 0, oxidizer: 2, toxic: 1, corrosive: 1, explosive: 0, compressed: 1, aquatic: 2, peroxide: 0 },
  toxic:      { flammable: 1, oxidizer: 1, toxic: 2, corrosive: 1, explosive: 0, compressed: 1, aquatic: 2, peroxide: 1 },
  corrosive:  { flammable: 0, oxidizer: 1, toxic: 1, corrosive: 2, explosive: 0, compressed: 1, aquatic: 1, peroxide: 0 },
  explosive:  { flammable: 0, oxidizer: 0, toxic: 0, corrosive: 0, explosive: 1, compressed: 0, aquatic: 1, peroxide: 0 },
  compressed: { flammable: 1, oxidizer: 1, toxic: 1, corrosive: 1, explosive: 0, compressed: 2, aquatic: 2, peroxide: 1 },
  aquatic:    { flammable: 2, oxidizer: 2, toxic: 2, corrosive: 1, explosive: 1, compressed: 2, aquatic: 2, peroxide: 2 },
  peroxide:   { flammable: 0, oxidizer: 0, toxic: 1, corrosive: 0, explosive: 0, compressed: 1, aquatic: 2, peroxide: 1 },
}

const STATUS_CONFIG = {
  0: { label: 'Incompatible',  bg: 'bg-red-500',    text: 'text-white',      icon: '✕' },
  1: { label: 'Caution',       bg: 'bg-yellow-400', text: 'text-yellow-900', icon: '!' },
  2: { label: 'Compatible',    bg: 'bg-green-500',  text: 'text-white',      icon: '✓' },
}

export default function StorageMatrix() {
  const [selected, setSelected] = useState<Set<HazardId>>(new Set())

  const toggleGroup = (id: HazardId) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedArr = Array.from(selected) as HazardId[]

  return (
    <div className="space-y-8">
      {/* Выбор классов опасности */}
      <div>
        <p className="text-sm text-gray-600 mb-4">
          Select the hazard classes of chemicals in your storage area:
        </p>
        <div className="flex flex-wrap gap-3">
          {HAZARD_GROUPS.map(g => (
            <button
              key={g.id}
              onClick={() => toggleGroup(g.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                selected.has(g.id)
                  ? `${g.color} border-current`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Матрица совместимости */}
      {selectedArr.length >= 2 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Compatibility Matrix
          </h3>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-36 p-2"></th>
                  {selectedArr.map(id => {
                    const g = HAZARD_GROUPS.find(x => x.id === id)!
                    return (
                      <th key={id} className="p-2 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${g.color}`}>
                          {g.label.split(' ')[0]}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {selectedArr.map(rowId => {
                  const rowGroup = HAZARD_GROUPS.find(x => x.id === rowId)!
                  return (
                    <tr key={rowId}>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${rowGroup.color}`}>
                          {rowGroup.label}
                        </span>
                      </td>
                      {selectedArr.map(colId => {
                        const status = COMPATIBILITY[rowId][colId]
                        const cfg = STATUS_CONFIG[status]
                        return (
                          <td key={colId} className="p-2 text-center">
                            <div
                              className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center font-bold text-lg ${cfg.bg} ${cfg.text}`}
                              title={cfg.label}
                            >
                              {cfg.icon}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Легенда */}
          <div className="flex gap-6 mt-4 text-sm">
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${v.bg} ${v.text}`}>
                  {v.icon}
                </div>
                <span className="text-gray-600">{v.label}</span>
              </div>
            ))}
          </div>

          {/* CTA: знаки для склада */}
          {selectedArr.some(id => COMPATIBILITY[id] && Object.values(COMPATIBILITY[id]).includes(0)) && (
            <div className="mt-6 bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-900">
                Incompatible substances detected in your storage area.
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Order GHS segregation signs and labels for your warehouse.
              </p>
              <a
                href="https://ghslabels.com"
                className="mt-3 inline-block bg-orange-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors"
              >
                Get Storage Signs → ghslabels.com
              </a>
            </div>
          )}
        </div>
      )}

      {selectedArr.length === 1 && (
        <p className="text-sm text-gray-500">Select at least 2 hazard classes to see compatibility.</p>
      )}

      {selectedArr.length === 0 && (
        <p className="text-sm text-gray-400">No hazard classes selected yet.</p>
      )}
    </div>
  )
}
