/**
 * Скачивает официальные SVG пиктограммы GHS01-GHS09 с Wikimedia Commons
 * (те же файлы используют ECHA, UNECE и все регуляторы)
 * Запуск: node scripts/download-pictograms.mjs
 */
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import https from 'https'
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

// Официальные SVG файлы с Wikimedia Commons
// Special:FilePath — автоматический редирект к актуальному файлу
const GHS_SOURCES = [
  { code: 'GHS01', file: 'GHS-pictogram-explos.svg',       name: 'Exploding Bomb' },
  { code: 'GHS02', file: 'GHS-pictogram-flamme.svg',      name: 'Flame' },
  { code: 'GHS03', file: 'GHS-pictogram-rondflam.svg',    name: 'Flame Over Circle' },
  { code: 'GHS04', file: 'GHS-pictogram-bottle.svg',      name: 'Gas Cylinder' },
  { code: 'GHS05', file: 'GHS-pictogram-acid.svg',        name: 'Corrosion' },
  { code: 'GHS06', file: 'GHS-pictogram-skull.svg',       name: 'Skull and Crossbones' },
  { code: 'GHS07', file: 'GHS-pictogram-exclam.svg',      name: 'Exclamation Mark' },
  { code: 'GHS08', file: 'GHS-pictogram-silhouette.svg',  name: 'Health Hazard' },
  { code: 'GHS09', file: 'GHS-pictogram-pollu.svg',       name: 'Environmental Hazard' },
]

// Скачать SVG по URL с поддержкой редиректов
function fetchSvg(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Слишком много редиректов'))

    const req = https.get(url, {
      headers: {
        'User-Agent': 'GHSEcosystem/1.0 (chemical safety tools; contact@ghssymbols.com)',
        'Accept': 'image/svg+xml,*/*',
      }
    }, (res) => {
      // Следуем за редиректами
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return fetchSvg(res.headers.location, redirectCount + 1).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} для ${url}`))
      }

      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => body += chunk)
      res.on('end', () => resolve(body))
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Таймаут')) })
  })
}

// Минимальная очистка SVG: убираем XML декларацию и DOCTYPE если есть
function cleanSvg(raw) {
  return raw
    .replace(/<\?xml[^?]*\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!--.*?-->/gs, '')
    .trim()
}

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  Загрузка официальных GHS SVG с Wikimedia Commons')
  console.log('═══════════════════════════════════════════════════\n')

  const baseUrl = 'https://commons.wikimedia.org/wiki/Special:FilePath/'

  let successCount = 0

  for (const { code, file, name } of GHS_SOURCES) {
    const url = baseUrl + encodeURIComponent(file)
    process.stdout.write(`⬇️  ${code} (${name})... `)

    try {
      const raw = await fetchSvg(url)

      // Проверяем что это SVG
      if (!raw.includes('<svg') && !raw.includes('<SVG')) {
        console.log(`❌ Ответ не является SVG (${raw.slice(0, 80)})`)
        continue
      }

      const svg = cleanSvg(raw)

      // Обновляем только svg_content в БД
      const { error } = await sb
        .from('pictograms_signals')
        .update({ svg_content: svg })
        .eq('code', code)

      if (error) {
        console.log(`❌ Ошибка БД: ${error.message}`)
      } else {
        console.log(`✅ ${svg.length} байт`)
        successCount++
      }

      // Пауза между запросами — уважаем Wikimedia
      await new Promise(r => setTimeout(r, 500))

    } catch (err) {
      console.log(`❌ ${err.message}`)
    }
  }

  console.log(`\n${'═'.repeat(51)}`)
  console.log(`  Готово: ${successCount}/${GHS_SOURCES.length} пиктограмм загружено`)
  console.log('═'.repeat(51))

  if (successCount < GHS_SOURCES.length) {
    console.log('\n⚠️  Некоторые файлы не загрузились.')
    console.log('   Попробуй запустить скрипт ещё раз — возможно временная ошибка сети.')
  }
}

main().catch(err => {
  console.error('\n💥', err.message)
  process.exit(1)
})
