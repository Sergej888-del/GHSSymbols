import type { SupabaseClient } from '@supabase/supabase-js'

/** Page size for H-statement substance lists (static build + SEO). */
export const H_SUBSTANCES_PAGE_SIZE = 100

/** Count substances per H-code (one increment per substance per code). */
export async function countSubstancesPerHCode(
  supabase: SupabaseClient
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  let from = 0
  const batch = 1000
  while (true) {
    const { data } = await supabase
      .from('substances')
      .select('h_statement_codes')
      .not('cas_number', 'is', null)
      .range(from, from + batch - 1)

    if (!data?.length) break
    for (const row of data) {
      const codes = (row as { h_statement_codes: string[] | null }).h_statement_codes ?? []
      for (const h of codes) {
        counts.set(h, (counts.get(h) ?? 0) + 1)
      }
    }
    if (data.length < batch) break
    from += batch
  }
  return counts
}
