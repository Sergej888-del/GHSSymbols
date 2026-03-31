/**
 * Засев SVG пиктограмм GHS01–GHS09 в таблицу pictograms_signals
 * Запуск: node scripts/seed-pictograms.mjs
 */
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import * as dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
dotenv.config({ path: resolve(__dirname, '../.env.local') })
const { createClient } = require('@supabase/supabase-js')

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Вспомогательная функция: оборачивает символ в стандартный GHS бриллиант (красная рамка)
const diamond = (symbol) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <polygon points="60,3 117,60 60,117 3,60" fill="white" stroke="#d0021b" stroke-width="6"/>
  ${symbol}
</svg>`

// Символы для каждой пиктограммы (чёрные, в области ~25–95 координат)
const SYMBOLS = {
  // GHS01 — Взрывающаяся бомба
  GHS01: diamond(`
    <circle cx="60" cy="70" r="22" fill="black"/>
    <path d="M72 50 Q82 38 76 26 Q88 22 82 12" stroke="black" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="82" cy="11" r="5" fill="#e8a000"/>
    <line x1="35" y1="48" x2="25" y2="36" stroke="black" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="29" y1="62" x2="17" y2="60" stroke="black" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="42" y1="42" x2="36" y2="28" stroke="black" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="85" y1="55" x2="97" y2="50" stroke="black" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="82" y1="70" x2="95" y2="72" stroke="black" stroke-width="3.5" stroke-linecap="round"/>
  `),

  // GHS02 — Пламя
  GHS02: diamond(`
    <path d="M60 95 C38 95 26 80 28 65 C30 52 38 50 38 50
             C38 58 44 60 44 60 C44 44 52 30 60 22
             C60 36 68 38 68 28 C76 38 82 52 80 65
             C78 80 72 90 68 95 C65 92 63 88 63 85
             C63 75 55 68 55 60 C48 68 48 78 52 88 Z"
          fill="black"/>
    <path d="M60 90 C50 90 44 82 46 72 C46 64 52 60 52 60
             C52 66 56 67 56 67 C58 56 62 48 66 44
             C66 54 70 55 70 50 C74 56 76 64 74 72
             C72 83 68 90 60 90 Z"
          fill="#e8a000"/>
  `),

  // GHS03 — Пламя над кругом
  GHS03: diamond(`
    <path d="M60 78 C48 78 40 70 41 61 C42 53 48 51 48 51
             C48 57 52 58 52 58 C53 48 58 38 63 32
             C63 43 68 44 68 40 C73 47 75 56 73 64
             C71 73 67 78 60 78 Z"
          fill="black"/>
    <path d="M60 74 C52 74 47 68 48 61 C49 55 53 52 53 52
             C53 57 56 58 56 58 C57 50 61 44 64 40
             C64 49 68 50 68 47 C71 53 72 60 70 66
             C69 72 65 74 60 74 Z"
          fill="#e8a000"/>
    <ellipse cx="60" cy="90" rx="22" ry="9" fill="none" stroke="black" stroke-width="5"/>
    <line x1="38" y1="90" x2="82" y2="90" stroke="black" stroke-width="5"/>
  `),

  // GHS04 — Газовый баллон
  GHS04: diamond(`
    <rect x="42" y="45" width="36" height="46" rx="10" fill="black"/>
    <rect x="50" y="38" width="20" height="12" rx="4" fill="black"/>
    <rect x="54" y="28" width="12" height="14" rx="3" fill="black"/>
    <rect x="46" y="24" width="28" height="8" rx="3" fill="black"/>
    <rect x="44" y="88" width="32" height="6" rx="2" fill="#555"/>
  `),

  // GHS05 — Коррозия (капли разъедают руку и поверхность)
  GHS05: diamond(`
    <path d="M32 48 L32 38 L48 38 L48 48 C44 52 36 52 32 48 Z" fill="black"/>
    <path d="M48 48 C52 44 62 50 58 58 C54 62 44 62 44 56 L42 80 L38 80 L36 56 C32 56 28 58 28 64 L26 80 L22 80 L22 62 C22 54 28 48 34 48 Z" fill="black"/>
    <ellipse cx="42" cy="80" rx="10" ry="4" fill="black"/>
    <path d="M70 30 Q68 42 62 48 Q70 46 74 54 Q78 42 76 30 Z" fill="black"/>
    <path d="M82 22 Q80 30 76 34 Q82 32 84 38 Q88 30 86 22 Z" fill="black"/>
    <line x1="20" y1="88" x2="100" y2="88" stroke="black" stroke-width="5"/>
    <path d="M22 88 Q32 78 42 88 Q52 98 62 88 Q72 78 82 88" stroke="black" stroke-width="4" fill="none"/>
  `),

  // GHS06 — Череп и скрещённые кости
  GHS06: diamond(`
    <ellipse cx="60" cy="52" rx="22" ry="20" fill="black"/>
    <rect x="48" y="68" width="24" height="10" rx="2" fill="black"/>
    <ellipse cx="52" cy="52" rx="7" ry="8" fill="white"/>
    <ellipse cx="68" cy="52" rx="7" ry="8" fill="white"/>
    <ellipse cx="52" cy="52" rx="4" ry="5" fill="black"/>
    <ellipse cx="68" cy="52" rx="4" ry="5" fill="black"/>
    <rect x="56" y="64" width="4" height="8" fill="white"/>
    <rect x="64" y="64" width="4" height="8" fill="black"/>
    <line x1="28" y1="78" x2="52" y2="96" stroke="black" stroke-width="7" stroke-linecap="round"/>
    <line x1="28" y1="96" x2="52" y2="78" stroke="black" stroke-width="7" stroke-linecap="round"/>
    <line x1="68" y1="78" x2="92" y2="96" stroke="black" stroke-width="7" stroke-linecap="round"/>
    <line x1="68" y1="96" x2="92" y2="78" stroke="black" stroke-width="7" stroke-linecap="round"/>
  `),

  // GHS07 — Восклицательный знак
  GHS07: diamond(`
    <rect x="54" y="28" width="12" height="42" rx="5" fill="black"/>
    <circle cx="60" cy="83" r="7" fill="black"/>
  `),

  // GHS08 — Опасность для здоровья (человек со звездой)
  GHS08: diamond(`
    <circle cx="60" cy="30" r="9" fill="black"/>
    <path d="M60 40 L60 72" stroke="black" stroke-width="8" stroke-linecap="round"/>
    <path d="M38 52 L82 52" stroke="black" stroke-width="7" stroke-linecap="round"/>
    <path d="M60 72 L42 92" stroke="black" stroke-width="7" stroke-linecap="round"/>
    <path d="M60 72 L78 92" stroke="black" stroke-width="7" stroke-linecap="round"/>
    <path d="M50 46 L42 26 M50 46 L62 28 M50 46 L36 42 M50 46 L40 56 M50 46 L36 56"
          stroke="black" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  `),

  // GHS09 — Экологическая опасность (мёртвая рыба + дерево)
  GHS09: diamond(`
    <path d="M22 72 Q28 60 38 64 Q44 58 50 62 Q50 52 44 48
             Q38 38 30 42 Q24 46 22 54 Z" fill="black"/>
    <line x1="34" y1="56" x2="34" y2="56" stroke="white" stroke-width="2"/>
    <circle cx="28" cy="58" r="3" fill="white"/>
    <path d="M22 74 Q16 70 14 74 Q22 82 22 74 Z" fill="black"/>
    <line x1="22" y1="60" x2="18" y2="50" stroke="black" stroke-width="3"/>
    <line x1="22" y1="66" x2="16" y2="60" stroke="black" stroke-width="3"/>
    <line x1="75" y1="95" x2="75" y2="50" stroke="black" stroke-width="5" stroke-linecap="round"/>
    <path d="M75 68 Q90 60 95 45 Q80 48 75 60 Q70 48 55 45 Q60 60 75 68 Z" fill="black"/>
    <path d="M75 82 Q86 75 90 64 Q78 66 75 76 Q72 66 60 64 Q64 75 75 82 Z" fill="black"/>
  `),
}

async function main() {
  console.log('Засеваем SVG пиктограммы GHS01–GHS09...\n')

  const rows = Object.entries(SYMBOLS).map(([code, svg]) => ({
    code,
    svg_content: svg.trim(),
  }))

  // Обновляем только svg_content — не трогаем name_en и другие поля
  let ok = 0
  for (const { code, svg_content } of rows) {
    const { error } = await sb
      .from('pictograms_signals')
      .update({ svg_content })
      .eq('code', code)
    if (error) console.error(`  ❌ ${code}:`, error.message)
    else { process.stdout.write(`  ✅ ${code}\n`); ok++ }
  }

  console.log(`\n✅ SVG загружены для ${ok}/${rows.length} пиктограмм`)

  // Проверка
  const { data } = await sb.from('pictograms_signals').select('code, svg_content').order('code')
  for (const row of data ?? []) {
    console.log(row.code, '—', row.svg_content ? `SVG ${row.svg_content.length} chars` : 'EMPTY')
  }
}

main().catch(console.error)
