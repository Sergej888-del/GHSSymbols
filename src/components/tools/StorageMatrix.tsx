import { useState } from 'react'

const HAZARD_GROUPS = [
  { id: 'flammable',  label: 'Flammable liquids/gases', color: 'bg-red-100 text-red-800' },
  { id: 'oxidizer',  label: 'Oxidizing agents',         color: 'bg-yellow-100 text-yellow-800' },
  { id: 'toxic',     label: 'Acute toxic (Cat 1-3)',    color: 'bg-purple-100 text-purple-800' },
  { id: 'corrosive', label: 'Corrosives (acids/bases)', color: 'bg-orange-100 text-orange-800' },
  { id: 'explosive', label: 'Explosives',               color: 'bg-red-200 text-red-900' },
  { id: 'compressed',label: 'Compressed gases',         color: 'bg-blue-100 text-blue-800' },
  { id: 'aquatic',   label: 'Aquatic hazard',           color: 'bg-teal-100 text-teal-800' },
  { id: 'peroxide',  label: 'Organic peroxides',        color: 'bg-pink-100 text-pink-800' },
] as const

type HazardId = typeof HAZARD_GROUPS[number]['id']

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

// Описания рисков для попапа
const RISK_DETAILS: Partial<Record<string, Partial<Record<string, { risk: string; measures: string[] }>>>> = {
  flammable: {
    oxidizer: {
      risk: 'Oxidizers dramatically accelerate combustion of flammable materials, potentially causing explosive fires that are extremely difficult to extinguish.',
      measures: [
        'Minimum separation distance: 3 metres or a fire-resistant wall (REI 60)',
        'Store in separate dedicated fire-resistant cabinets',
        'Ensure separate secondary containment (bunding)',
        'Install automatic fire suppression in both zones',
      ],
    },
    corrosive: {
      risk: 'Many corrosive acids (e.g. sulphuric acid, nitric acid) react violently with flammable solvents, generating heat and toxic vapours that may ignite.',
      measures: [
        'Store in separate ventilated cabinets with individual bunding',
        'Minimum distance: 3 metres or physical barrier',
        'Acid-resistant flooring required in corrosive storage zone',
        'Keep fire extinguisher (CO₂ or dry powder) accessible',
      ],
    },
    explosive: {
      risk: 'Flammable vapours can ignite explosive materials, causing detonation. This combination presents the highest possible fire and blast risk.',
      measures: [
        'Strict separation: different buildings or blast-proof rooms',
        'No shared ventilation systems',
        'Explosives require licensed storage facility',
        'Contact your national competent authority for permit requirements',
      ],
    },
    peroxide: {
      risk: 'Organic peroxides are self-reactive and can decompose explosively in the presence of flammable vapours or heat sources.',
      measures: [
        'Store in separate temperature-controlled cabinet (max 25°C)',
        'No shared storage under any circumstances',
        'Separate fire suppression systems required',
        'Check peroxide expiry date — decomposition risk increases with age',
      ],
    },
    compressed: {
      risk: 'Flammable gas cylinders near heat sources or other flammables present serious fire and explosion risk if a leak occurs.',
      measures: [
        'Secure cylinders upright with chains to prevent falling',
        'Minimum 1.5 metres from flammable liquids',
        'Install gas leak detector in storage area',
        'Ensure forced ventilation — flammable gases may accumulate at floor level',
      ],
    },
  },
  oxidizer: {
    explosive: {
      risk: 'Oxidizers provide additional oxygen to explosive materials, drastically increasing the risk and severity of detonation.',
      measures: [
        'Never store together under any circumstances',
        'Explosives require separate licensed facility',
        'Contact competent authority — this combination may be prohibited by law',
      ],
    },
    peroxide: {
      risk: 'Both oxidizers and organic peroxides are strong oxidising agents. Combined, they can trigger runaway exothermic reactions.',
      measures: [
        'Separate storage rooms required',
        'Individual temperature monitoring for peroxide cabinet',
        'No shared drainage or bunding',
      ],
    },
    corrosive: {
      risk: 'Some oxidizers react with acids releasing toxic gases (e.g. chlorine from hypochlorites + acid). Controlled co-storage is possible with precautions.',
      measures: [
        'Separate bunding — never share a drip tray',
        'Ensure adequate ventilation to disperse any released gases',
        'Keep spill kits compatible with both chemical types nearby',
      ],
    },
  },
  corrosive: {
    explosive: {
      risk: 'Corrosives can degrade packaging of explosive materials and may trigger detonation through chemical reaction or heat generation.',
      measures: [
        'Strict separation required — different storage rooms',
        'Explosives require licensed storage',
        'No exceptions to this segregation rule',
      ],
    },
    peroxide: {
      risk: 'Acids can catalyse decomposition of organic peroxides, potentially triggering violent exothermic reactions or detonation.',
      measures: [
        'Separate storage rooms required',
        'Peroxides must be kept in temperature-controlled cabinet',
        'Never use the same spill containment tray',
      ],
    },
    aquatic: {
      risk: 'Corrosive spills into shared bunding with aquatic hazard chemicals can create highly toxic run-off that contaminates drains and groundwater.',
      measures: [
        'Use separate secondary containment (bunding) for each group',
        'Install drain valve that can be closed in case of spill',
        'Corrosive spill kit must be immediately accessible',
      ],
    },
  },
  explosive: {
    compressed: {
      risk: 'Pressurised gas cylinders near explosives create catastrophic risk — cylinder failure (BLEVE) can trigger detonation.',
      measures: [
        'Strictly prohibited — separate buildings required',
        'Both materials require licensed storage',
        'Consult your national authority for legal requirements',
      ],
    },
    toxic: {
      risk: 'Explosive detonation near toxic chemicals can disperse poisonous substances over a wide area, causing mass casualties.',
      measures: [
        'Store in completely separate buildings',
        'Explosives require licensed facility',
        'Emergency response plan must account for toxic release scenario',
      ],
    },
    aquatic: {
      risk: 'Explosion near aquatic hazard chemicals can cause environmental contamination of water systems.',
      measures: [
        'Store in separate buildings with independent bunding',
        'Emergency containment for water run-off required',
      ],
    },
  },
  toxic: {
    compressed: {
      risk: 'Pressurised gas cylinder failure near toxic chemicals can disperse toxins. Toxic compressed gases (Class 2.3) require special precautions.',
      measures: [
        'Install gas leak detectors',
        'Ensure emergency escape routes are not obstructed',
        'Toxic gas cylinders require additional containment cabinets',
        'Emergency response plan must include toxic gas release scenario',
      ],
    },
    corrosive: {
      risk: 'Some corrosive-toxic combinations (e.g. cyanides + acids) generate extremely toxic gases (hydrogen cyanide) on contact.',
      measures: [
        'Separate storage with individual bunding — critical',
        'Check SDS for specific incompatibilities',
        'Forced ventilation with gas detection mandatory',
        'Emergency shower and eyewash station required within 10 seconds travel',
      ],
    },
  },
  peroxide: {
    compressed: {
      risk: 'Heat from compressed gas leaks or cylinder failure can trigger peroxide decomposition, leading to fire or explosion.',
      measures: [
        'Keep peroxides in temperature-controlled cabinet away from cylinders',
        'Minimum 3 metre separation',
        'Install temperature alarm on peroxide storage',
      ],
    },
  },
}

// СИЗ и оборудование по классам опасности
const PPE_REQUIREMENTS: Record<HazardId, { icon: string; items: string[] }> = {
  flammable: {
    icon: '🔥',
    items: [
      'Anti-static clothing and footwear',
      'Flame-resistant (FR) lab coat or coverall',
      'Chemical splash goggles',
      'Explosion-proof electrical equipment',
      'CO₂ or dry powder fire extinguisher',
      'Earthing/bonding equipment for liquid transfer',
    ],
  },
  oxidizer: {
    icon: '⭕',
    items: [
      'Nitrile or neoprene gloves (NOT natural rubber)',
      'Chemical splash goggles or face shield',
      'Avoid organic materials in clothing (cotton preferred)',
      'Keep water supply readily available',
      'CO₂ extinguisher NOT suitable — use water or dry sand',
    ],
  },
  toxic: {
    icon: '☠️',
    items: [
      'Nitrile gloves (double-gloving for Cat 1-2)',
      'Full face respirator with appropriate cartridge (OV/P100)',
      'Chemical-resistant lab coat or coverall',
      'Emergency eyewash station within 10 seconds travel',
      'Emergency shower within 10 seconds travel',
      'Buddy system — never work alone with acute toxics',
    ],
  },
  corrosive: {
    icon: '⚗️',
    items: [
      'Heavy-duty PVC or neoprene gloves',
      'Face shield (full face, not just goggles)',
      'Chemical-resistant apron or coverall',
      'Acid/alkali-resistant footwear',
      'Emergency eyewash station mandatory',
      'Emergency shower mandatory',
      'Sodium bicarbonate (for acid spills) or citric acid (for alkali spills) neutraliser',
    ],
  },
  explosive: {
    icon: '💥',
    items: [
      'Anti-static clothing and footwear — mandatory',
      'Blast-resistant face shield',
      'NO mobile phones or electronic devices in storage area',
      'Minimum personnel in area — licensed handlers only',
      'Grounding required for all equipment',
      'Hot work permit system required',
    ],
  },
  compressed: {
    icon: '🔵',
    items: [
      'Safety glasses or goggles',
      'Leather gloves for cylinder handling',
      'Cylinder trolley — never roll or drag cylinders',
      'Chain or bracket to secure cylinders upright',
      'Gas leak detector appropriate for gas type',
      'Ensure ventilation — some gases displace oxygen',
    ],
  },
  aquatic: {
    icon: '🐟',
    items: [
      'Standard chemical gloves',
      'Safety glasses',
      'Closed drain valves in storage area',
      'Spill containment bunding — all spills must be contained',
      'Absorbent spill kit (NOT washed to drain)',
      'Notify environmental authority if spill reaches drain',
    ],
  },
  peroxide: {
    icon: '⚡',
    items: [
      'Nitrile gloves',
      'Face shield',
      'Temperature-controlled storage cabinet (check SDS for limits)',
      'Temperature alarm/monitoring system',
      'Never return unused peroxide to original container',
      'Check expiry date — decomposition risk increases significantly',
      'Keep away from friction, shock, and heat sources',
    ],
  },
}

const STATUS_CONFIG = {
  0: { label: 'Incompatible', bg: 'bg-red-500',    text: 'text-white',      icon: '✕' },
  1: { label: 'Caution',      bg: 'bg-yellow-400', text: 'text-yellow-900', icon: '!' },
  2: { label: 'Compatible',   bg: 'bg-green-500',  text: 'text-white',      icon: '✓' },
}

interface PopupState {
  rowId: HazardId
  colId: HazardId
  status: 0 | 1 | 2
}

export default function StorageMatrix() {
  const [selected, setSelected] = useState<Set<HazardId>>(new Set())
  const [popup, setPopup] = useState<PopupState | null>(null)

  const toggleGroup = (id: HazardId) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedArr = Array.from(selected) as HazardId[]

  const getDetails = (rowId: HazardId, colId: HazardId) => {
    return (
      RISK_DETAILS[rowId]?.[colId] ||
      RISK_DETAILS[colId]?.[rowId] ||
      null
    )
  }

  const handleCellClick = (rowId: HazardId, colId: HazardId) => {
    if (rowId === colId) return
    const status = COMPATIBILITY[rowId][colId] as 0 | 1 | 2
    setPopup({ rowId, colId, status })
  }

  const rowLabel = (id: HazardId) => HAZARD_GROUPS.find(x => x.id === id)!.label
  const hasIncompatible = selectedArr.some(id =>
    selectedArr.some(id2 => COMPATIBILITY[id][id2] === 0)
  )

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

      {/* Матрица */}
      {selectedArr.length >= 2 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Compatibility Matrix</h3>
          <p className="text-sm text-gray-500 mb-4">Click any ✕ or ! cell for detailed risk information and required measures.</p>
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
                        const status = COMPATIBILITY[rowId][colId] as 0 | 1 | 2
                        const cfg = STATUS_CONFIG[status]
                        const isSelf = rowId === colId
                        const hasDetail = !isSelf && getDetails(rowId, colId) !== null
                        const isClickable = !isSelf && status !== 2
                        return (
                          <td key={colId} className="p-2 text-center">
                            <div
                              onClick={() => isClickable && handleCellClick(rowId, colId)}
                              className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center font-bold text-lg ${cfg.bg} ${cfg.text} ${isClickable ? 'cursor-pointer hover:opacity-80 hover:scale-110 transition-transform' : ''}`}
                              title={isClickable ? `Click for details: ${rowLabel(rowId)} + ${rowLabel(colId)}` : cfg.label}
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

          {/* Блок СИЗ */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Required PPE & Safety Equipment</h3>
            <p className="text-sm text-gray-500 mb-4">Based on the hazard classes selected for your storage area:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {selectedArr.map(id => {
                const ppe = PPE_REQUIREMENTS[id]
                const group = HAZARD_GROUPS.find(x => x.id === id)!
                return (
                  <div key={id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{ppe.icon}</span>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${group.color}`}>
                        {group.label}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {ppe.items.map((item, i) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>

          {/* CTA */}
          {hasIncompatible && (
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

      {/* Попап */}
      {popup && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setPopup(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold mb-2 ${
                  popup.status === 0 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  <span>{popup.status === 0 ? '✕ Incompatible' : '! Caution Required'}</span>
                </div>
                <h4 className="text-base font-semibold text-gray-900">
                  {rowLabel(popup.rowId)} + {rowLabel(popup.colId)}
                </h4>
              </div>
              <button
                onClick={() => setPopup(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold ml-4 shrink-0"
              >
                ×
              </button>
            </div>

            {/* Содержимое */}
            {(() => {
              const details = getDetails(popup.rowId, popup.colId)
              if (details) {
                return (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">⚠️ Risk</p>
                      <p className="text-sm text-gray-600">{details.risk}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">✅ Required measures</p>
                      <ul className="space-y-1">
                        {details.measures.map((m, i) => (
                          <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                            <span className="text-green-500 mt-0.5 shrink-0">•</span>
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )
              }
              return (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    {popup.status === 0
                      ? 'These chemical classes must not be stored together. Separate storage rooms or buildings are required.'
                      : 'These chemical classes can be stored together with precautions. Check specific SDS documents for individual substances.'}
                  </p>
                  <p className="text-sm text-gray-500">
                    Always consult the Safety Data Sheet (SDS) for each specific substance and your local regulations.
                  </p>
                </div>
              )
            })()}

            <div className="mt-5 pt-4 border-t border-gray-100 flex justify-between items-center">
              <p className="text-xs text-gray-400">Source: GHS/CLP segregation rules (ECHA)</p>
              <button
                onClick={() => setPopup(null)}
                className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
