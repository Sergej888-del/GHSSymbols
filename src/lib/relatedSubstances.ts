/** In-memory similarity for static build: pictogram + H-statement overlap scores. */

export type SubstanceForRelated = {
  cas_number: string
  common_name: string | null
  display_name_short: string | null
  iupac_name: string
  h_statement_codes: string[] | null
  ghs_pictogram_codes: string[] | null
  p_statement_codes?: string[] | null
  signal_word: string | null
}

function intersectionSize(
  a: string[] | null | undefined,
  b: string[] | null | undefined
): number {
  const setA = new Set(a ?? [])
  let n = 0
  for (const x of b ?? []) {
    if (setA.has(x)) n++
  }
  return n
}

function pairScore(
  a: SubstanceForRelated,
  b: SubstanceForRelated
): number {
  return (
    intersectionSize(a.ghs_pictogram_codes, b.ghs_pictogram_codes) +
    intersectionSize(a.h_statement_codes, b.h_statement_codes)
  )
}

/** Top `limit` neighbours by (pictogram overlap + H overlap), excluding self. */
export function buildRelatedByCas(
  substances: SubstanceForRelated[],
  limit = 8
): Map<string, SubstanceForRelated[]> {
  const picIndex = new Map<string, Set<string>>()
  const hIndex = new Map<string, Set<string>>()
  const byCas = new Map<string, SubstanceForRelated>()

  for (const s of substances) {
    byCas.set(s.cas_number, s)
    for (const p of s.ghs_pictogram_codes ?? []) {
      if (!picIndex.has(p)) picIndex.set(p, new Set())
      picIndex.get(p)!.add(s.cas_number)
    }
    for (const h of s.h_statement_codes ?? []) {
      if (!hIndex.has(h)) hIndex.set(h, new Set())
      hIndex.get(h)!.add(s.cas_number)
    }
  }

  const out = new Map<string, SubstanceForRelated[]>()

  for (const s of substances) {
    const cand = new Set<string>()
    for (const p of s.ghs_pictogram_codes ?? []) {
      for (const c of picIndex.get(p) ?? []) {
        if (c !== s.cas_number) cand.add(c)
      }
    }
    for (const h of s.h_statement_codes ?? []) {
      for (const c of hIndex.get(h) ?? []) {
        if (c !== s.cas_number) cand.add(c)
      }
    }

    const scored: { cas: string; score: number }[] = []
    for (const c of cand) {
      const t = byCas.get(c)
      if (!t) continue
      const score = pairScore(s, t)
      if (score > 0) scored.push({ cas: c, score })
    }
    scored.sort(
      (x, y) =>
        y.score - x.score ||
        x.cas.localeCompare(y.cas, undefined, { numeric: true })
    )
    const top = scored
      .slice(0, limit)
      .map(({ cas }) => byCas.get(cas)!)
    out.set(s.cas_number, top)
  }

  return out
}
