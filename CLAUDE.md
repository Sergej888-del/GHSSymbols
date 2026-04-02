# GHS Ecosystem — Claude Code Context File

## Кто я и что мы строим

Я соло-предприниматель (Латвия, Рига) без опыта программирования.
Строю взаимосвязанную B2B экосистему из трёх сайтов в нише 
химической безопасности (GHS — Globally Harmonized System).

Инструмент разработки: Claude Code + Cursor (AI-driven development).
Всегда объясняй команды терминала пошагово. Пиши на русском языке.

---

## Три домена — одна воронка

```
ghssymbols.com      → Astro + Supabase + Tailwind
                      Интент: токсикология, охрана труда, EHS
                      Главный инструмент: Калькулятор ATE смесей
                      Хостинг: Cloudflare Pages

ghspictograms.com   → Astro + Supabase + Tailwind  
                      Интент: визуализация, дизайн, логистика
                      Главный инструмент: Конструктор этикеток GHS
                      Хостинг: Cloudflare Pages

ghslabels.com       → Next.js 14 + Supabase + Tailwind
                      Интент: транзакция, заказ, покупка
                      Главный инструмент: RFQ-форма + каталог
                      Хостинг: Vercel
```

Единая база данных: **один Supabase проект** для всех трёх сайтов.

---

## Структура папок проекта

```
GHS-Ecosystem/
├── CLAUDE.md                    ← этот файл (читается Claude Code)
├── .cursorrules                 ← инструкции для Cursor AI
├── ghssymbols/                  ← Astro проект
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── lib/
│   ├── astro.config.mjs
│   └── package.json
├── ghspictograms/               ← Astro проект
│   ├── src/
│   └── package.json
├── ghslabels/                   ← Next.js проект
│   ├── app/
│   ├── components/
│   └── package.json
└── supabase/                    ← общая БД
    ├── schema.sql               ← схема всех таблиц
    ├── seed_core.sql            ← 4400 веществ (CLP Annex VI)
    └── migrations/
```

---

## База данных Supabase — архитектура

### Многоуровневая стратегия данных

```
Уровень 1 (ЯДРО) — 5,000-7,000 веществ
  Источник: ECHA CLP Annex VI (гармонизированная классификация ЕС)
  Хранение: Supabase, полная верификация данных
  Покрытие: 85%+ всех пользовательских запросов

Уровень 2 (КОММЕРЧЕСКИЙ) — 40,000-45,000 веществ  
  Источник: TSCA Active Inventory (США) + REACH (ЕС)
  Хранение: Supabase основная БД

Уровень 3 (ON-DEMAND) — 300,000+ редких веществ
  НЕ хранится локально
  При запросе → live API к PubChem PUG-REST
```

### Схема таблиц (PostgreSQL / Supabase)

```sql
-- Основные таблицы
substances          -- вещества (CAS, EC, UN, IUPAC, физ. свойства)
hazard_classifications  -- классы опасности (многие-ко-многим)
h_statements        -- H-фразы H200-H410 (многоязычные)
p_statements        -- P-фразы P100-P502 (многоязычные)
pictograms_signals  -- GHS01-GHS09 SVG + сигнальные слова
mixtures            -- смеси (компоненты + % концентрации)

-- Пользовательские данные
leads               -- захваченные лиды (email, компания, инструмент)
rfq_requests        -- RFQ заявки (спецификации, статус)
saved_mixtures      -- сохранённые расчёты пользователей
```

---

## Четыре SaaS-инструмента (приоритет разработки)

### Инструмент 1: Калькулятор ATE смесей
**Домен:** ghssymbols.com
**Алгоритм:** `100 / ATEmix = Σ(Ci / ATEi)` для всех компонентов ≥1%
**Конверсия:** Бесплатный результат → PDF отчёт за email (лид-магнит)

### Инструмент 2: Матрица совместимости хранения
**Домен:** ghssymbols.com  
**Алгоритм:** Цветовая матрица (🟢🟡🔴) по правилам сегрегации GHS
**Конверсия:** → CTA на ghslabels.com (знаки для склада)

### Инструмент 3: Конструктор этикеток GHS
**Домен:** ghspictograms.com
**Алгоритм:** 6 обязательных элементов + Precautionary Statement Optimizer
**Конверсия:** PDF превью → предупреждение о BS5609 → ghslabels.com

### Инструмент 4: Инспектор GHS vs ADR/DOT
**Домен:** ghspictograms.com
**Алгоритм:** Сравнение рабочей и транспортной маркировки бок о бок
**Конверсия:** → CTA на ghslabels.com (интеграция печати)

---

## Программное SEO (pSEO)

### Разделение интентов (без каннибализации)

```
ghssymbols.com — токсикологический интент:
  /hazards/[chemical-name]/     → H-statements + классификация
  /storage/[chemical-name]/     → матрица совместимости
  /toxicity/[chemical-name]/    → ATE + пределы воздействия

ghspictograms.com — визуальный интент:
  /pictograms/[chemical-name]/  → SVG пиктограммы (скачать)
  /labels/[chemical-name]/      → требования к этикетке
  /compare/[chemical-name]/     → GHS vs ADR/DOT

ghslabels.com — транзакционный интент:
  /order/[chemical-name]/       → заказать этикетки
  /printers/[type]/             → каталог принтеров
  /quote/                       → RFQ форма
```

### Защита от Thin Content
Каждая страница уникальна через conditional logic:
- Если flash_point < 23°C → уникальный абзац про хранение
- Если SVHC статус → блок про обязательное информирование
- Если aquatic toxicity Cat 1 → блок про канализацию и слив
- Schema.org ChemicalSubstance JSON-LD на каждой странице

---

## Монетизация — три этапа

```
Этап 1 (месяцы 1-6): Affiliate Marketing
  Brady, Epson ColorWorks, Avery, Amazon Associates
  Комиссия 5-15% с продажи принтеров ($1,500-$4,500)

Этап 2 (месяцы 4-12): B2B Лидогенерация / RFQ
  Продажа квалифицированных лидов типографиям
  $50-$150 за лид, цель: 20 лидов/мес к месяцу 12

Этап 3 (год 2+): White Label + Dropshipping
  ghslabels.com = бренд производителя
  API-интеграция с контрактными типографиями
  Обязательно: сертификация BS5609 у партнёра
```

---

## Технический стек — детали

### Astro (ghssymbols + ghspictograms)
```javascript
// astro.config.mjs — актуальный конфиг ghssymbols
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import mdx from '@astrojs/mdx'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://ghssymbols.com',
  output: 'static',
  integrations: [react(), mdx(), sitemap()],
  vite: { plugins: [tailwindcss()] }
})
// ВАЖНО: output: 'hybrid' не существует в Astro 6 — только 'static' или 'server'
// Tailwind через @tailwindcss/vite плагин, НЕ через @astrojs/tailwind интеграцию
```

### Next.js (ghslabels)
```
App Router (не Pages Router)
Server Components по умолчанию
Client Components только для форм и интерактива
generateStaticParams() для pSEO страниц
```

### Supabase подключение
```typescript
// lib/supabase.ts — используется во всех трёх сайтах
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
)
// ВАЖНО: в Astro клиентские переменные требуют префикс PUBLIC_
// В Next.js — NEXT_PUBLIC_ префикс
```

### Переменные окружения
```
# Astro (ghssymbols, ghspictograms) — файл .env.local
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
BREVO_API_KEY=

# Next.js (ghslabels)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## Правила кода

1. **TypeScript везде** — никакого plain JavaScript
2. **Tailwind для стилей** — никаких отдельных CSS файлов
3. **Supabase SDK** — никаких прямых SQL запросов из фронтенда
4. **Полные пути** — всегда показывай где создаётся файл
5. **Маленькие компоненты** — один компонент = одна задача
6. **Комментарии на русском** — в сложных местах кода

---

## Текущий статус проекта

```
✅ Стратегический план создан (Master Plan)
✅ Claude Project настроен
✅ Cursor Pro установлен
✅ GitHub подключён (Sergej888-del)
✅ Supabase проект создан
✅ Схема БД задеплоена
✅ Данные импортированы (~3814 веществ CLP Annex VI)
✅ ghssymbols.com — задеплоен на Cloudflare Pages
✅ ghssymbols.com — pSEO страницы /hazards/[cas]/ (3814 страниц)
✅ ghssymbols.com — Blog (/blog/) и FAQ (/faq/) работают
✅ ghssymbols.com — PDF download форма работает
✅ ghssymbols.com — Brevo интеграция работает
✅ ghssymbols.com — leads сохраняются в Supabase
✅ ghssymbols.com — Cloudflare Functions для API (/functions/api/leads.ts)
✅ ghssymbols.com — GA4 подключён (G-1Y5MKV5XMK)
✅ ghspictograms.com — создан, задеплоен на Cloudflare Pages
✅ ghspictograms.com — домен подключён
✅ ghspictograms.com — Supabase подключён
✅ ghspictograms.com — навигация экосистемы (GHS Symbols / GHS Pictograms / GHS Labels)
✅ ghspictograms.com — pSEO страницы /pictograms/[cas]/ (3814 страниц)
✅ ghspictograms.com — GHS label tool (Label Preview, Download PDF, CTA)
✅ ghspictograms.com — секция Label Requirements (CLP размеры, стандарты)
✅ ghspictograms.com — JSON-LD Product разметка
✅ ghspictograms.com — favicon синий (#0D2B6B)
✅ ghssymbols.com — favicon красный (#C0392B)

⬜ ghspictograms.com — GA4 новое свойство
⬜ ghspictograms.com — Google Search Console
⬜ ghspictograms.com — навигация добавить в ghssymbols.com header
⬜ ghspictograms.com — Конструктор этикеток GHS (Инструмент 3)
⬜ ghspictograms.com — Инспектор GHS vs ADR/DOT (Инструмент 4)
⬜ ghspictograms.com — микроразметка ChemicalSubstance + FAQPage
⬜ ghslabels.com — Next.js проект создан
⬜ ghslabels.com — RFQ форма
⬜ ghssymbols.com — ATE Calculator (Инструмент 1)
⬜ ghssymbols.com — Storage Compatibility Matrix (Инструмент 2)
```

### Реализованные детали ghssymbols.com

```
Архитектура:   Astro 6, output: 'static', React client:load компоненты
Роутинг pSEO:  /hazards/[cas]/ — getStaticPaths с пагинацией (1000 записей за раз)
Роутинг legacy:/hazards/view?cas=&id= — остаётся для обратной совместимости
Поиск:         три отдельных Supabase запроса (ilike .or() не работает — молча возвращает пустой результат)
Env vars:      PUBLIC_ префикс для клиентских переменных
               Cloudflare Pages: Settings → Environment variables → PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY
Email лиды:    таблица leads, source_tool: ate_calculator / safety_summary
PDF:           window.print() через новое окно (jsPDF несовместим с Vite SSR transform)
Tailwind:      через @tailwindcss/vite плагин + @tailwindcss/typography для блога
Blog:          src/content.config.ts (НЕ src/content/config.ts — Astro 6 требует новый путь)
               getCollection('blog'), render(post) — НЕ post.render() (старый API)
               post.id вместо post.slug (новый Content Layer API)
H-statements:  все одного красного цвета bg-red-50 border-red-200 text-red-800
               (убрана категоризация по цветам — H400/H410 были зелёными ошибочно)
```

---

## Важно: Cloudflare Pages архитектура

**ghssymbols.com**

- `output: 'static'` в `astro.config.mjs`
- Build output: `dist/client`
- API routes → `/functions/api/leads.ts` (Cloudflare Pages Function)
- `export const prerender = false` не нужен (папка `functions` отдельно от Astro)

**ghspictograms.com**

- `output: 'static'` в `astro.config.mjs`
- Build output: `dist/client`
- Пока нет API routes

---

## Важные ссылки

```
Supabase Dashboard:   app.supabase.com
GitHub репозиторий:   github.com/Sergej888-del/GHSSymbols
Vercel Dashboard:     vercel.com/dashboard
Cloudflare Dashboard: dash.cloudflare.com
ECHA CLP Annex VI:    echa.europa.eu/information-on-chemicals/annex-vi-to-clp
PubChem API:          pubchem.ncbi.nlm.nih.gov/docs/pug-rest
```

---

*Этот файл обновляется по мере развития проекта.*
*Последнее обновление: Апрель 2026*
