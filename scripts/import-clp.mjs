/**
 * Скрипт импорта CLP Annex VI из ECHA в Supabase
 *
 * Что делает:
 *   1. Скачивает официальный Excel файл CLP Annex VI с сайта ECHA
 *   2. Парсит все строки (5000+ веществ)
 *   3. Трансформирует данные в формат таблицы substances
 *   4. Вставляет батчами по 100 строк через Supabase service role
 *
 * Запуск:
 *   node scripts/import-clp.mjs
 *
 * Или с локальным файлом (если уже скачал вручную):
 *   node scripts/import-clp.mjs --file=путь/к/файлу.xlsx
 */

import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, URL as NodeURL } from 'url'
import { createRequire } from 'module'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import https from 'https'
import http from 'http'
import fs from 'fs'

// xlsx — CommonJS модуль, загружаем через createRequire
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Загрузка переменных окружения ───────────────────────────────────────────

const envPath = resolve(__dirname, '../.env.local')
if (!existsSync(envPath)) {
  console.error('❌ Не найден файл .env.local в папке ghssymbols/')
  process.exit(1)
}
dotenv.config({ path: envPath })

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Отсутствуют SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env.local')
  process.exit(1)
}

// Service role клиент — обходит RLS, нужен для INSERT
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
})

// ─── URL файла ECHA CLP Annex VI ─────────────────────────────────────────────
// Официальная страница: https://echa.europa.eu/information-on-chemicals/annex-vi-to-clp
// ATP18 — последняя версия на момент написания скрипта

const ECHA_EXCEL_URL =
  'https://echa.europa.eu/documents/10162/17227/annex_vi_clp_table_atp18_en.xlsx'

const LOCAL_CACHE = resolve(__dirname, '../scripts/clp_annex_vi_cache.xlsx')

// ─── Функция скачивания файла ─────────────────────────────────────────────────

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`⬇️  Скачиваю: ${url}`)
    const file = fs.createWriteStream(dest)
    const protocol = url.startsWith('https') ? https : http

    const request = protocol.get(url, (response) => {
      // Обработка редиректов (301/302)
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close()
        fs.unlinkSync(dest)
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject)
      }

      if (response.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        return reject(new Error(`HTTP ${response.statusCode} при скачивании файла`))
      }

      const total = parseInt(response.headers['content-length'] || '0')
      let downloaded = 0

      response.on('data', chunk => {
        downloaded += chunk.length
        if (total > 0) {
          const pct = Math.round((downloaded / total) * 100)
          process.stdout.write(`\r   Прогресс: ${pct}% (${Math.round(downloaded / 1024)} KB)`)
        }
      })

      response.pipe(file)
      file.on('finish', () => {
        file.close()
        console.log('\n✅ Файл скачан')
        resolve()
      })
    })

    request.on('error', err => {
      fs.unlinkSync(dest)
      reject(err)
    })

    // Таймаут 60 секунд
    request.setTimeout(60000, () => {
      request.destroy()
      reject(new Error('Таймаут при скачивании файла'))
    })
  })
}

// ─── Парсинг Excel структуры ECHA CLP Annex VI ───────────────────────────────
//
// Типичные колонки в файле ECHA:
//   A: Index Number        (606-001-00-8)
//   B: International Chemical Identification (IUPAC name)
//   C: EC Number           (200-662-2)
//   D: CAS Number          (67-64-1)
//   E: Hazard class & category codes
//   F: Hazard statement codes
//   G: Pictogram / signal word codes
//   H: Supplemental hazard codes (EUH...)
//   I: Specific conc. limits, M-factors, ATE

function parseEchaRow(row, headers) {
  // Функции-помощники для безопасного чтения ячеек
  const cell = (key) => {
    const val = row[key]
    if (val === undefined || val === null) return null
    return String(val).trim() || null
  }

  const cellNum = (key) => {
    const val = row[key]
    if (val === undefined || val === null || val === '') return null
    const n = parseFloat(String(val).replace(',', '.'))
    return isNaN(n) ? null : n
  }

  // Определяем индексы колонок по заголовкам (файл может меняться)
  const h = headers

  const indexNo       = cell(h.index)
  const iupacName     = cell(h.iupac)
  const ecNumber      = cell(h.ec)
  const casNumber     = cell(h.cas)
  const hazardCodes   = cell(h.hazard_class)   // напр. "Flam. Liq. 2, Acute Tox. 4*"
  const hCodes        = cell(h.h_statements)   // напр. "H225; H302"
  const pgSignal      = cell(h.pictogram)      // напр. "GHS02, GHS07; Dgr"
  const ateRaw        = cell(h.ate)            // напр. "ATE oral = 500 mg/kg bw"

  if (!iupacName) return null // Пропускаем пустые строки

  // Парсим H-фразы в массив (включая EUH)
  const hStatementCodes = hCodes
    ? hCodes.split(/[;,\s]+/).map(s => s.trim()).filter(s => /^(H|EUH)\d{3}/.test(s))
    : []

  // Парсим пиктограммы из колонки G: "GHS02, GHS07; Dgr" → ['GHS02','GHS07']
  const ghsPictogramCodes = pgSignal
    ? pgSignal.split(/[;,\s]+/).map(s => s.trim()).filter(s => /^GHS\d{2}$/.test(s))
    : []

  // Парсим сигнальное слово: "Dgr" → "Danger", "Wng" → "Warning"
  let signalWord = null
  if (pgSignal) {
    if (/\bDgr\b/i.test(pgSignal))       signalWord = 'Danger'
    else if (/\bWng\b/i.test(pgSignal))  signalWord = 'Warning'
    else if (/\bDanger\b/i.test(pgSignal))  signalWord = 'Danger'
    else if (/\bWarning\b/i.test(pgSignal)) signalWord = 'Warning'
  }

  // Парсим ATE значения из строки вида "ATE oral = 500; ATE dermal = 1000"
  const ateOral = ateRaw ? parseAteValue(ateRaw, 'oral') : null
  const ateDermal = ateRaw ? parseAteValue(ateRaw, 'dermal') : null
  const ateInhalVapour = ateRaw ? parseAteValue(ateRaw, 'inhal') : null

  // Нормализуем CAS номер: берём только первый если их несколько, обрезаем до 20 символов
  const casRaw = casNumber?.replace(/\s/g, '') || null
  const cas = casRaw ? casRaw.split(/[,;\/]/)[0].trim().slice(0, 20) : null

  // Нормализуем EC номер, обрезаем до 20 символов
  const ec = ecNumber ? ecNumber.replace(/\s/g, '').split(/[,;]/)[0].trim().slice(0, 20) : null

  // Обрезаем index_number до 20 символов
  const indexNorm = indexNo ? indexNo.slice(0, 20) : null

  return {
    index_number:         indexNorm,
    iupac_name:           iupacName,
    ec_number:            ec,
    cas_number:           cas || null,
    ate_oral:             ateOral,
    ate_dermal:           ateDermal,
    ate_inhalation_vapour: ateInhalVapour,
    h_statement_codes:    hStatementCodes.length > 0 ? hStatementCodes : null,
    ghs_pictogram_codes:  ghsPictogramCodes.length > 0 ? ghsPictogramCodes : null,
    signal_word:          signalWord,
    clp_harmonized:       true,
    data_source:          'CLP_ANNEX_VI',
    data_level:           1,
  }
}

// Извлекает числовое значение ATE из строки
// Примеры входных строк:
//   "ATE oral = 500 mg/kg bw"
//   "oral: 500; dermal: 1000"
//   "500" (просто число)
function parseAteValue(raw, type) {
  if (!raw) return null
  const lower = raw.toLowerCase()

  // Ищем паттерн: oral/dermal/inhal + число
  const patterns = {
    oral:   /(?:oral|po)[^\d]*?([\d.,]+)/i,
    dermal: /dermal[^\d]*?([\d.,]+)/i,
    inhal:  /(?:inhal|vapou?r|dust)[^\d]*?([\d.,]+)/i,
  }

  const match = lower.match(patterns[type])
  if (match) {
    const n = parseFloat(match[1].replace(',', '.'))
    return isNaN(n) ? null : n
  }

  // Если в строке только одно число и тип = oral (по умолчанию)
  if (type === 'oral') {
    const simple = raw.match(/([\d.,]+)/)
    if (simple) {
      const n = parseFloat(simple[1].replace(',', '.'))
      return isNaN(n) ? null : n
    }
  }

  return null
}

// Определяет индексы нужных колонок по заголовкам первой строки
function detectColumnHeaders(headerRow) {
  const map = {}
  const entries = Object.entries(headerRow)

  for (const [key, rawVal] of entries) {
    const val = String(rawVal || '').toLowerCase()

    if (val.includes('index') || val.includes('index no'))            map.index = key
    else if (val.includes('international') || val.includes('iupac') || val.includes('chemical identification')) map.iupac = key
    else if (val.includes('ec no') || val.includes('ec number') || val.includes('einecs')) map.ec = key
    else if (val.includes('cas no') || val.includes('cas number') || val.includes('cas-rn')) map.cas = key
    else if (val.includes('hazard class') || val.includes('category code')) map.hazard_class = key
    else if (val.includes('hazard statement') || val.includes('h-statement')) map.h_statements = key
    else if (val.includes('pictogram') || val.includes('signal word')) map.pictogram = key
    else if (val.includes('ate') || val.includes('specific conc') || val.includes('m-factor')) map.ate = key
  }

  // Фоллбек: если не нашли по заголовкам — используем порядковые колонки A-I
  if (!map.index)       map.index       = 'A'
  if (!map.iupac)       map.iupac       = 'B'
  if (!map.ec)          map.ec          = 'C'
  if (!map.cas)         map.cas         = 'D'
  if (!map.hazard_class) map.hazard_class = 'E'
  if (!map.h_statements) map.h_statements = 'F'
  if (!map.pictogram)   map.pictogram   = 'G'
  if (!map.ate)         map.ate         = 'I'

  return map
}

// ─── Батчевая вставка в Supabase ─────────────────────────────────────────────

async function insertBatch(rows, batchNum, totalBatches) {
  // Дедуплицируем по cas_number внутри батча
  const seen = new Set()
  const clean = []
  for (const r of rows) {
    const key = r.cas_number ?? r.iupac_name
    if (!seen.has(key)) {
      seen.add(key)
      clean.push(r)
    }
  }

  const { error } = await supabase
    .from('substances')
    .upsert(clean, {
      onConflict: 'cas_number',     // Обновляем если CAS уже есть
      ignoreDuplicates: true,       // Пропускаем дубликаты без ошибки
    })

  if (error) {
    console.error(`❌ Ошибка батча ${batchNum}/${totalBatches}:`, error.message)
    // Не прерываем весь импорт — логируем и продолжаем
    return false
  }

  process.stdout.write(`\r   Батч ${batchNum}/${totalBatches} вставлен (${batchNum * rows.length} строк)`)
  return true
}

// ─── Главная функция ──────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  Импорт CLP Annex VI → Supabase substances')
  console.log('═══════════════════════════════════════════════════\n')

  // Проверяем аргументы командной строки
  const fileArg = process.argv.find(a => a.startsWith('--file='))
  let xlsxPath

  if (fileArg) {
    // Пользователь передал путь к файлу вручную
    xlsxPath = resolve(fileArg.replace('--file=', ''))
    if (!existsSync(xlsxPath)) {
      console.error(`❌ Файл не найден: ${xlsxPath}`)
      process.exit(1)
    }
    console.log(`📂 Использую локальный файл: ${xlsxPath}`)
  } else if (existsSync(LOCAL_CACHE)) {
    // Используем кэш если он уже есть
    xlsxPath = LOCAL_CACHE
    const stat = fs.statSync(LOCAL_CACHE)
    const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24)
    console.log(`📂 Найден кэш (возраст: ${ageDays.toFixed(0)} дней): ${LOCAL_CACHE}`)
  } else {
    // Скачиваем с ECHA
    xlsxPath = LOCAL_CACHE
    try {
      await downloadFile(ECHA_EXCEL_URL, xlsxPath)
    } catch (err) {
      console.error('\n❌ Ошибка скачивания:', err.message)
      console.log('\n💡 Попробуй скачать файл вручную:')
      console.log(`   ${ECHA_EXCEL_URL}`)
      console.log(`   И запусти: node scripts/import-clp.mjs --file=путь/к/файлу.xlsx`)
      process.exit(1)
    }
  }

  // ── Парсинг Excel ──────────────────────────────────────────────────────────

  console.log('\n📊 Парсинг Excel файла...')
  const workbook = XLSX.readFile(xlsxPath, {
    cellText: true,
    cellDates: false,
    raw: false,
  })

  // Берём первый лист
  const sheetName = workbook.SheetNames[0]
  console.log(`   Лист: "${sheetName}"`)

  const sheet = workbook.Sheets[sheetName]
  const allRows = XLSX.utils.sheet_to_json(sheet, {
    header: 'A',    // Колонки A, B, C...
    defval: null,
    raw: false,
  })

  console.log(`   Всего строк в файле: ${allRows.length}`)

  // Определяем заголовки (ищем строку с текстом "CAS" или "IUPAC")
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const vals = Object.values(allRows[i]).map(v => String(v || '').toLowerCase())
    if (vals.some(v => v.includes('cas') || v.includes('iupac') || v.includes('index no'))) {
      headerRowIdx = i
      break
    }
  }

  const headers = detectColumnHeaders(allRows[headerRowIdx])
  console.log(`   Строка заголовков: ${headerRowIdx + 1}`)
  console.log(`   Колонки: CAS=${headers.cas}, IUPAC=${headers.iupac}, H-фразы=${headers.h_statements}, ATE=${headers.ate}`)

  // Парсим строки данных (пропускаем заголовок)
  const substances = []
  let skipped = 0

  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const row = parseEchaRow(allRows[i], headers)
    if (!row) { skipped++; continue }
    substances.push(row)
  }

  console.log(`\n✅ Распознано веществ: ${substances.length} (пропущено: ${skipped})`)

  // Статистика по ATE
  const withAteOral    = substances.filter(s => s.ate_oral).length
  const withAteDermal  = substances.filter(s => s.ate_dermal).length
  const withCas        = substances.filter(s => s.cas_number).length
  console.log(`   С CAS номером:  ${withCas}`)
  console.log(`   С ATE oral:     ${withAteOral}`)
  console.log(`   С ATE dermal:   ${withAteDermal}`)

  // ── Вставка в Supabase ─────────────────────────────────────────────────────

  const BATCH_SIZE = 100
  const batches = []
  for (let i = 0; i < substances.length; i += BATCH_SIZE) {
    batches.push(substances.slice(i, i + BATCH_SIZE))
  }

  console.log(`\n🚀 Вставка в Supabase (${batches.length} батчей по ${BATCH_SIZE})...`)
  console.log(`   URL: ${SUPABASE_URL}\n`)

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < batches.length; i++) {
    const ok = await insertBatch(batches[i], i + 1, batches.length)
    if (ok) successCount++
    else errorCount++

    // Небольшая пауза чтобы не перегружать Supabase
    if (i < batches.length - 1) {
      await new Promise(r => setTimeout(r, 50))
    }
  }

  console.log('\n')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Готово!`)
  console.log(`  Успешных батчей: ${successCount}/${batches.length}`)
  console.log(`  Всего веществ:   ~${successCount * BATCH_SIZE}`)
  if (errorCount > 0) {
    console.log(`  Ошибок батчей:   ${errorCount}`)
  }
  console.log('═══════════════════════════════════════════════════')

  // ── Проверка: считаем строки в таблице ────────────────────────────────────

  const { count } = await supabase
    .from('substances')
    .select('*', { count: 'exact', head: true })

  console.log(`\n📈 Строк в таблице substances: ${count}`)

  if (errorCount > 0) {
    console.log('\n⚠️  Были ошибки вставки. Возможные причины:')
    console.log('   - Схема БД ещё не задеплоена (сначала запусти schema.sql в Supabase)')
    console.log('   - Дубликаты CAS номеров (upsert должен обработать)')
    console.log('   - Проблемы с типами данных (проверь логи выше)')
  }
}

main().catch(err => {
  console.error('\n💥 Критическая ошибка:', err)
  process.exit(1)
})
