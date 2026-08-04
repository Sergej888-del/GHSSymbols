/**
 * scripts/generate-substance-redirect-map.mjs
 *
 * Готовит карту CAS -> слаг для редиректа старых страниц веществ:
 *   ghssymbols.com/hazards/<cas>/  ->  ghspictograms.com/substances/<слаг>-<cas>/
 *
 * Пишет functions/_substance-map.json, который читает functions/hazards/[cas].js.
 * Файл КОММИТИТСЯ в репозиторий: Cloudflare Pages собирает функции из того, что
 * лежит в ветке, и запускать этот скрипт на сборке негде и незачем.
 *
 * Запуск (из корня ghssymbols):
 *   npm run generate:substance-redirects
 *
 * ⚠⚠ ПОЧЕМУ ЛОГИКА СЛАГА НЕ ПОВТОРЕНА ЗДЕСЬ.
 * Слаг и имя берутся импортом из ghspictograms — из ТЕХ ЖЕ файлов, по которым
 * getStaticPaths строит страницу. Если списать правило сюда, оно разойдётся
 * молча: редирект поведёт на адрес, которого нет, и увидим мы это только по
 * 404 в Search Console. Такое уже случилось в проекте — sort в
 * generate-pictogram-redirects.mjs повторяет prioritizePictogramSubstances из
 * src/lib/pictogramCasPaths.ts, и две копии теперь надо править парой.
 *
 * ⚠ Цена решения: скрипт требует, чтобы репозитории лежали рядом:
 *     GHS Ecosystem/
 *       ghssymbols/     <- отсюда запускаем
 *       ghspictograms/  <- отсюда импортируем правило
 * Если это не так, скрипт падает с внятным текстом (см. ниже), а не молча
 * генерирует битую карту. Громкий отказ лучше тихого расхождения.
 *
 * ⚠ Нужен Node >= 22.18 (или флаг --experimental-strip-types): импортируем .ts
 * напрямую, полагаясь на встроенное срезание типов. В substanceSlug.ts и
 * substanceName.ts нет ничего, кроме стираемого синтаксиса.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const PICTOGRAMS_LIB = path.resolve(REPO, '..', 'ghspictograms', 'src', 'lib')

// ───────────────── правило слага: единственный источник ─────────────────

function libUrl(file) {
  return new URL(`file://${path.resolve(PICTOGRAMS_LIB, file).split(path.sep).join('/')}`).href
}

let substanceSlug, substanceNameFull, NAME_COLUMNS
try {
  ;({ substanceSlug } = await import(libUrl('substanceSlug.ts')))
  ;({ substanceNameFull, NAME_COLUMNS } = await import(libUrl('substanceName.ts')))
} catch (e) {
  console.error('')
  console.error('Не удалось прочитать правило слага из ghspictograms.')
  console.error(`Искал здесь: ${PICTOGRAMS_LIB}`)
  console.error('')
  if (String(e).includes('ERR_UNKNOWN_FILE_EXTENSION')) {
    console.error('Node не умеет импортировать .ts. Нужен Node >= 22.18,')
    console.error('либо запуск с флагом:')
    console.error('  node --experimental-strip-types scripts/generate-substance-redirect-map.mjs')
  } else {
    console.error('Проверь, что папки ghssymbols и ghspictograms лежат рядом,')
    console.error('и что в ghspictograms есть src/lib/substanceSlug.ts и src/lib/substanceName.ts.')
  }
  console.error('')
  console.error(String(e))
  process.exit(1)
}

// ───────────────── подключение к базе (как в generate-pictogram-redirects) ─────────────────

dotenv.config({ path: path.join(REPO, '.env.local') })
dotenv.config()

const url = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const key = process.env.PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Нужны PUBLIC_SUPABASE_URL и PUBLIC_SUPABASE_ANON_KEY (.env.local)')
  process.exit(1)
}

const supabase = createClient(url, key)

// ───────────────── выборка ─────────────────

const OUT = path.join(REPO, 'functions', '_substance-map.json')
const PAGE = 1000

/**
 * ⚠ Условия отбора обязаны совпасть с getStaticPaths страницы
 * ghspictograms/src/pages/substances/[slug].astro:
 *   cas_number строгой формы \d{2,7}-\d{2}-\d
 * Иначе редирект поведёт на страницу, которой не построили.
 */
async function fetchSubstances() {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    // PostgREST отдаёт максимум 1000 строк за раз.
    const { data, error } = await supabase
      .from('substances')
      .select(`cas_number, ${NAME_COLUMNS}`)
      .not('cas_number', 'is', null)
      .order('cas_number')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`substances (from=${from}) — ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

/**
 * Кого оставить, если за одним CAS стоит несколько записей.
 * ⚠ Уникален ПОЛНЫЙ слаг, а не CAS: у разных форм одного вещества CAS общий,
 * и на ghspictograms это две страницы. Старый адрес был один — /hazards/<cas>/ —
 * значит редирект обязан выбрать одну цель, и выбор должен быть устойчивым от
 * запуска к запуску, иначе цель редиректа будет прыгать между сборками.
 * Порядок: курированное common_name важнее, при равенстве — более короткое имя,
 * при полном равенстве — алфавит слага.
 */
function pickWinner(a, b) {
  const aCurated = a.row.common_name ? 1 : 0
  const bCurated = b.row.common_name ? 1 : 0
  if (aCurated !== bCurated) return aCurated > bCurated ? a : b
  if (a.name.length !== b.name.length) return a.name.length < b.name.length ? a : b
  return a.slug <= b.slug ? a : b
}

async function main() {
  const rows = await fetchSubstances()

  // ⚠ 156 записей несут многосоставный CAS, обрезанный varchar(20):
  // «110-45-2[1]35073-27-». Страницы для них не строятся — редирект тоже не нужен.
  // ⚠⚠ Отбор ОБЯЗАН совпадать с ghspictograms: getStaticPaths в
  // src/pages/substances/[slug].astro и fetchSubstanceSitemapEntries берут CAS
  // строгой формы. Проверка `!includes('[')` пропускала три записи, которые CAS
  // не являются: `-`, `127087-87-09016-45-9`, `3811-73-215922-78-8`.
  // Страниц для них нет — значит и редирект вёл бы в 404.
  const clean = rows.filter((r) => r.cas_number && /^\d{2,7}-\d{2}-\d$/.test(r.cas_number))

  const chosen = new Map()
  const collisions = new Map()

  for (const row of clean) {
    const cas = row.cas_number
    const name = substanceNameFull(row)
    const entry = { row, name, slug: substanceSlug(name, cas) }
    const prev = chosen.get(cas)
    if (!prev) {
      chosen.set(cas, entry)
      continue
    }
    if (prev.slug === entry.slug) continue // одна и та же цель, спорить не о чем
    collisions.set(cas, [...(collisions.get(cas) ?? [prev.slug]), entry.slug])
    chosen.set(cas, pickWinner(prev, entry))
  }

  const map = {}
  for (const cas of [...chosen.keys()].sort()) map[cas] = chosen.get(cas).slug

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(map) + '\n')

  const bytes = fs.statSync(OUT).size
  console.log(`Строк в substances с CAS: ${rows.length}`)
  console.log(`Отброшено из-за '[' в CAS:  ${rows.length - clean.length}`)
  console.log(`CAS в карте:               ${Object.keys(map).length}`)
  console.log(`Записано: ${OUT} (${(bytes / 1024).toFixed(0)} КБ)`)

  if (collisions.size) {
    console.log('')
    console.log(`⚠ За ${collisions.size} CAS стоит больше одной страницы на ghspictograms.`)
    console.log('  Старый адрес /hazards/<cas>/ был один — ведём на выбранную:')
    for (const [cas, slugs] of [...collisions].slice(0, 15)) {
      console.log(`   ${cas}: ${slugs.join(' | ')}  ->  ${map[cas]}`)
    }
    if (collisions.size > 15) console.log(`   ... ещё ${collisions.size - 15}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
