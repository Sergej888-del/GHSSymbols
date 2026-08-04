/**
 * Cloudflare Pages Function — GET /hazards/<cas>/
 *
 * Справочник веществ переехал на ghspictograms.com (session 35):
 *   ghssymbols.com/hazards/67-64-1/  ->  ghspictograms.com/substances/acetone-67-64-1/
 *
 * ⚠ ПОЧЕМУ ФУНКЦИЯ, А НЕ _redirects.
 * Правил нужно 3 653, а лимит статических правил Cloudflare Pages — 2 000.
 * Свернуть в один шаблон нельзя: адрес меняется целиком, общей части у
 * старого и нового нет — новый несёт имя вещества, которого в старом не было.
 *
 * ⚠ КАРТА ГЕНЕРИРУЕТСЯ, А НЕ ПИШЕТСЯ РУКАМИ.
 * _substance-map.json собирает scripts/generate-substance-redirect-map.mjs
 * из тех же функций, по которым ghspictograms строит страницы. После каждого
 * импорта веществ карту надо пересобрать:
 *   npm run generate:substance-redirects
 *
 * ⚠ ПОРЯДОК CLOUDFLARE: ФУНКЦИИ ПЕРЕД СТАТИКОЙ.
 * Воркер функций получает запрос первым, а статические файлы и public/_redirects
 * — это его fallback (env.ASSETS.fetch), к которому он идёт только через next().
 * Отсюда два следствия:
 *  1. Старые собранные страницы /hazards/<cas>/index.html больше не показываются:
 *     функция перехватывает адрес раньше.
 *  2. Строка «/hazards/view/* /hazards/ 301» из public/_redirects сама по себе
 *     НЕ отработает: /hazards/view/ подходит под маршрут :cas (cas = "view").
 *     Поэтому промах по карте — это не 404, а next(): запрос уходит дальше в
 *     статику, где _redirects и разбирается. Вернуть здесь жёсткий 404 значило
 *     бы сломать существующее правило.
 *
 * ⚠ /hazards/ (индекс раздела) сюда не попадает: маршрут :cas требует непустой
 * сегмент, и path-to-regexp на «/hazards/» даёт false. Запрос уходит в статику —
 * а там, начиная с session 36, стоит правило _redirects:
 *   /hazards/ https://ghspictograms.com/substances/ 301
 * Сама страница индекса удалена (src/pages/hazards/index.astro), потому что
 * Cloudflare не документирует, что важнее при совпадении — статический файл или
 * правило _redirects. Пока файл лежал в dist, редирект мог не сработать вовсе.
 */
import MAP from '../_substance-map.json'

const TARGET = 'https://ghspictograms.com/substances/'

export function onRequest(context) {
  const raw = context.params.cas
  // Простой параметр [cas] всегда строка, но подстраховка дешевле отладки.
  const segment = Array.isArray(raw) ? raw[0] : raw
  if (!segment) return context.next()

  let cas
  try {
    cas = decodeURIComponent(segment)
  } catch {
    // Битая процентная последовательность — не наш случай, отдаём дальше.
    return context.next()
  }

  // ⚠ hasOwn, а не просто MAP[cas]: импортированный JSON — обычный объект
  // с Object.prototype, и /hazards/constructor/ или /hazards/toString/ иначе вернули бы
  // функцию вместо слага и увели на адрес из исходного кода этой функции.
  const slug = Object.hasOwn(MAP, cas) ? MAP[cas] : null
  // ⚠ Промах отдаём в статику, а не 404: там ждут _redirects и настоящая
  // страница 404 сайта. См. разбор в шапке.
  if (typeof slug !== 'string' || !slug) return context.next()

  return Response.redirect(`${TARGET}${slug}/`, 301)
}
