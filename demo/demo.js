// Notification playground (dev only). Everything a MajaDor push can vary on is
// modelled here: the catalogue of notification types, the per-type settings,
// a phone mock-up, and the option to fire the same thing as a real
// notification on this computer.

import '@fontsource-variable/work-sans'
import { addedText } from '../supabase/functions/majador-push/text.ts'

const ICON = new URL('/icon-192.png', location.origin).href
const BADGE = new URL('/badge-96.png', location.origin).href

const $ = (selector) => document.querySelector(selector)
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const join = (items) => items.join(', ')

// ── Catalogue ───────────────────────────────────────────────────────────────
// status: live = can be sent today, next = being built now, idea = belongs to
// a feature that does not exist yet.
// `burst` marks types that naturally arrive several in a row.
// A variant turns { who, items } into { title, body }.

const QUIET = { silent: true, grouping: 'summary', renotify: false, urgency: 'low', ttl: 86400, topic: true }
const NORMAL = { silent: false, grouping: 'each', renotify: false, urgency: 'normal', ttl: 86400, topic: false }

const KINDS = [
  {
    id: 'shopping.added',
    group: 'Indkøbsliste',
    name: 'Vare tilføjet',
    status: 'live',
    who: 'Maja',
    detailLabel: 'Vare',
    detail: 'mælk',
    burst: ['mælk', 'æg', 'Bind (de gode der med 3 dråber og vinger på)', 'smør', 'kaffe'],
    tag: 'indkob-tilfojet',
    actions: [{ action: 'open', title: 'Åbn listen' }],
    defaults: { ...QUIET, appBadge: false },
    variants: [
      {
        // The wording the server really sends (same function as the Edge
        // Function). Newest item first, long items cut, one line at most.
        label: 'Som i appen: antal i titlen',
        make: ({ who, items }) => addedText(who, [...items].reverse()),
      },
      {
        label: 'Navn som titel',
        make: ({ who, items }) => ({
          title: who,
          body:
            items.length === 1
              ? `tilføjede ${items[0]} til indkøbslisten`
              : `tilføjede ${items.length} varer: ${join(items)}`,
        }),
      },
      {
        label: 'Alt i titlen',
        make: ({ who, items }) =>
          items.length === 1
            ? { title: `${who} tilføjede ${items[0]}`, body: '' }
            : { title: `${who} tilføjede ${items.length} varer`, body: cap(join(items)) },
      },
      {
        label: 'Listen som titel',
        make: ({ who, items }) => ({ title: 'Indkøbsliste', body: `${who}: ${join(items)}` }),
      },
      {
        label: 'Varen som titel',
        make: ({ who, items }) => ({ title: cap(join(items)), body: `${who} · Indkøbsliste` }),
      },
    ],
  },
  {
    id: 'calendar.new',
    group: 'Kalender',
    name: 'Ny aftale',
    status: 'idea',
    who: 'Maja',
    detailLabel: 'Aftale',
    detail: 'Middag hos Anne, fredag kl. 18.00',
    tag: 'kalender-ny',
    actions: [{ action: 'open', title: 'Se aftalen' }],
    defaults: { ...NORMAL, silent: true },
    variants: [
      {
        label: 'Type som titel',
        make: ({ who, items }) => ({ title: 'Ny aftale', body: `${who}: ${items[0]}` }),
      },
      {
        label: 'Aftalen som titel',
        make: ({ who, items }) => ({ title: items[0], body: `Tilføjet af ${who}` }),
      },
    ],
  },
  {
    id: 'calendar.reminder',
    group: 'Kalender',
    name: 'Påmindelse om aftale',
    status: 'idea',
    who: 'Maja',
    detailLabel: 'Aftale',
    detail: 'Tandlæge kl. 14.30',
    tag: 'kalender-paamindelse',
    actions: [{ action: 'open', title: 'Se aftalen' }],
    defaults: { ...NORMAL, urgency: 'high', ttl: 3600 },
    variants: [
      {
        label: 'Tid som titel',
        make: ({ items }) => ({ title: 'Om 1 time', body: items[0] }),
      },
      {
        label: 'Aftalen som titel',
        make: ({ items }) => ({ title: items[0], body: 'Starter om 1 time' }),
      },
    ],
  },
  {
    id: 'wishlist.added',
    group: 'Ønskeliste',
    name: 'Nyt ønske',
    status: 'idea',
    who: 'Maja',
    detailLabel: 'Ønske',
    detail: 'Ny cykelhjelm',
    burst: ['Ny cykelhjelm', 'Strikkepinde', 'Kogebog'],
    tag: 'onske-nyt',
    defaults: QUIET,
    variants: [
      {
        label: 'Alt i titlen',
        make: ({ who, items }) => ({
          title: items.length === 1 ? `${who} ønsker sig noget nyt` : `${who} har ${items.length} nye ønsker`,
          body: join(items),
        }),
      },
      {
        label: 'Listen som titel',
        make: ({ who, items }) => ({ title: 'Ønskeliste', body: `${who}: ${join(items)}` }),
      },
    ],
  },
  {
    id: 'movie.rated',
    group: 'Film',
    name: 'Film bedømt',
    status: 'idea',
    who: 'Maja',
    detailLabel: 'Film',
    detail: 'Dune: Part Two',
    tag: 'film-bedomt',
    actions: [{ action: 'open', title: 'Se bedømmelsen' }],
    defaults: { ...NORMAL, silent: true, image: true },
    variants: [
      {
        label: 'Alt i titlen',
        make: ({ who, items }) => ({ title: `${who} har bedømt en film`, body: `${items[0]} · ★★★★★☆` }),
      },
      {
        label: 'Filmen som titel',
        make: ({ who, items }) => ({ title: items[0], body: `${who} gav 5 ud af 6 stjerner` }),
      },
    ],
  },
  {
    id: 'test',
    group: 'System',
    name: 'Testnotifikation',
    status: 'live',
    who: 'Theodor',
    tag: 'majador-test',
    defaults: { ...NORMAL, grouping: 'replace' },
    variants: [
      {
        label: 'Som i dag',
        make: ({ who }) => ({ title: 'MajaDor', body: `Testnotifikation fra ${who}` }),
      },
    ],
  },
]

const STATUS = { live: 'Findes', next: 'Bygges nu', idea: 'Idé' }

// ── Options ─────────────────────────────────────────────────────────────────
// support: ja | nej | delvist | test (= documented, must be tried on the phones)

const OPTIONS = [
  {
    section: 'Opmærksomhed',
    key: 'silent',
    type: 'toggle',
    label: 'Lydløs',
    code: 'silent',
    help: 'Ingen lyd og ingen vibration. Notifikationen lægger sig stille i listen og popper normalt ikke op over det, man er i gang med.',
    support: { android: 'ja', ios: 'test', win: 'ja' },
    note: 'iPhone: understøttet fra iOS 17 ifølge dokumentationen, men skal prøves på jeres telefoner.',
  },
  {
    section: 'Opmærksomhed',
    key: 'grouping',
    type: 'choice',
    label: 'Når der kommer flere i træk',
    code: 'tag',
    choices: [
      ['each', 'Hver for sig', 'Hver vare giver sin egen notifikation. Fem varer = fem notifikationer.'],
      [
        'replace',
        'Erstat den forrige',
        'Alle har samme mærkat (tag), så en ny erstatter den gamle. Der ligger højst én, og den viser kun det seneste.',
      ],
      [
        'summary',
        'Saml i én',
        'Som “erstat”, men teksten tæller op: “tilføjede 3 varer: mælk, æg, rugbrød”. Der ligger højst én, og intet går tabt.',
      ],
      [
        'batch',
        'Vent og saml',
        'Serveren venter, til der har været ro i et par minutter, og sender så én samlet notifikation. Mindst forstyrrende, men den kommer forsinket og kræver et planlagt job i databasen.',
      ],
    ],
    support: { android: 'ja', ios: 'ja', win: 'ja' },
  },
  {
    section: 'Opmærksomhed',
    key: 'renotify',
    type: 'toggle',
    label: 'Giv lyd igen ved opdatering',
    code: 'renotify',
    help: 'Når en notifikation bliver erstattet eller talt op: skal telefonen give lyd igen? Slået fra giver kun den første lyd.',
    support: { android: 'ja', ios: 'nej', win: 'ja' },
    disabled: (c) =>
      c.silent ? 'Lydløs er slået til.' : c.grouping === 'each' || c.grouping === 'batch' ? 'Kun relevant ved “erstat” og “saml”.' : null,
  },
  {
    section: 'Levering',
    key: 'urgency',
    type: 'choice',
    label: 'Hastegrad',
    code: 'Urgency',
    choices: [
      ['very-low', 'Meget lav', 'Leveres kun, når telefonen er på strøm og wifi.'],
      ['low', 'Lav', 'En sovende telefon bliver ikke vækket for det. Kan komme lidt senere; sparer strøm.'],
      ['normal', 'Normal', 'Leveres, så snart telefonen alligevel er vågen eller kort efter.'],
      ['high', 'Høj', 'Vækker telefonen og leveres med det samme.'],
    ],
    support: { android: 'ja', ios: 'ja', win: 'ja' },
  },
  {
    section: 'Levering',
    key: 'ttl',
    type: 'choice',
    label: 'Levetid, hvis telefonen er offline',
    code: 'TTL',
    choices: [
      [0, 'Kun nu', 'Droppes, hvis telefonen ikke er online i samme øjeblik.'],
      [3600, '1 time', 'Gemmes i en time. Godt til påmindelser, der hurtigt bliver forældede.'],
      [86400, '1 døgn', 'Gemmes i et døgn.'],
      [2419200, '4 uger', 'Så længe push-tjenesten tillader (det er det, vi gør i dag).'],
    ],
    support: { android: 'ja', ios: 'ja', win: 'ja' },
  },
  {
    section: 'Levering',
    key: 'topic',
    type: 'toggle',
    label: 'Erstat ventende beskeder',
    code: 'Topic',
    help: 'Er telefonen offline, mens der kommer flere, gemmer push-tjenesten kun den seneste i stedet for at levere dem alle på én gang bagefter.',
    support: { android: 'ja', ios: 'ja', win: 'ja' },
  },
  {
    section: 'Udseende',
    key: 'icon',
    type: 'toggle',
    label: 'Ikon',
    code: 'icon',
    help: 'Billedet ved siden af teksten. iPhone viser altid appens eget ikon.',
    support: { android: 'ja', ios: 'nej', win: 'ja' },
  },
  {
    section: 'Udseende',
    key: 'badge',
    type: 'toggle',
    label: 'Ikon i statuslinjen',
    code: 'badge',
    help: 'Det lille hvide ikon øverst på Android (huset med hjertet). Uden det viser Android en klokke.',
    support: { android: 'ja', ios: 'nej', win: 'nej' },
  },
  {
    section: 'Udseende',
    key: 'image',
    type: 'toggle',
    label: 'Stort billede',
    code: 'image',
    help: 'Et stort billede under teksten, fx en filmplakat. Gør notifikationen markant større.',
    support: { android: 'ja', ios: 'nej', win: 'ja' },
  },
  {
    section: 'Udseende',
    key: 'actions',
    type: 'toggle',
    label: 'Knapper',
    code: 'actions',
    help: 'Op til to knapper direkte på notifikationen, fx “Åbn listen”.',
    support: { android: 'ja', ios: 'nej', win: 'ja' },
    disabled: (c, kind) => (kind.actions ? null : 'Denne type har ingen oplagte knapper.'),
  },
  {
    section: 'Udseende',
    key: 'requireInteraction',
    type: 'toggle',
    label: 'Bliv stående, til den lukkes',
    code: 'requireInteraction',
    help: 'Forsvinder ikke af sig selv fra skærmen. Virker kun på computer.',
    support: { android: 'nej', ios: 'nej', win: 'ja' },
  },
  {
    section: 'Udseende',
    key: 'appBadge',
    type: 'toggle',
    label: 'Tal på app-ikonet',
    code: 'setAppBadge()',
    help: 'En push kan opdatere tallet på ikonet, også når appen er lukket. I dag opdateres det kun, mens appen er åben.',
    support: { android: 'delvist', ios: 'ja', win: 'ja' },
    note: 'Android viser en prik, ikke et tal.',
  },
]

const PRESETS = [
  {
    label: 'Diskret (anbefalet)',
    values: { ...QUIET, icon: true, badge: true, image: false, actions: false, requireInteraction: false, appBadge: true },
  },
  {
    label: 'Almindelig',
    values: { ...NORMAL, icon: true, badge: true, image: false, actions: false, requireInteraction: false, appBadge: true },
  },
  {
    label: 'Påtrængende',
    values: {
      silent: false,
      grouping: 'each',
      renotify: true,
      urgency: 'high',
      ttl: 2419200,
      topic: false,
      icon: true,
      badge: true,
      image: true,
      actions: true,
      requireInteraction: true,
      appBadge: true,
    },
  },
]

const BASE = { icon: true, badge: true, image: false, actions: false, requireInteraction: false, appBadge: true }

// ── State ───────────────────────────────────────────────────────────────────

const state = {
  kind: KINDS[0].id,
  platform: 'android',
  real: false,
  // Per type: its settings plus the sample data and chosen wording.
  perKind: Object.fromEntries(
    KINDS.map((k) => [
      k.id,
      { ...BASE, ...k.defaults, who: k.who, detail: k.detail ?? '', variant: 0, title: null, body: null },
    ]),
  ),
}

let feed = [] // what is on the mock phone, newest first
let collected = [] // items gathered so far under the current tag ("saml i én")
let stats = { pushes: 0, alerts: 0 }
let waiting = 0 // items the server is holding back ("vent og saml")
let lastAlert = null // 'loud' | 'quiet' | 'waiting'
let running = false
let serial = 0

const kind = () => KINDS.find((k) => k.id === state.kind)
const cfg = () => state.perKind[state.kind]

function compose(items, withOverride) {
  const c = cfg()
  const made = kind().variants[c.variant].make({ who: c.who, items })
  if (!withOverride) return made
  return { title: c.title ?? made.title, body: c.body ?? made.body }
}

/** The options object the service worker would hand to showNotification(). */
function notificationOptions(n, tag) {
  const c = cfg()
  const o = { body: n.body, lang: 'da' }
  if (tag) o.tag = tag
  if (tag && c.renotify && !c.silent) o.renotify = true
  if (c.silent) o.silent = true
  if (c.icon) o.icon = ICON
  if (c.badge) o.badge = BADGE
  if (c.image) o.image = sampleImage(c.detail || kind().name)
  if (c.actions && kind().actions) o.actions = kind().actions
  if (c.requireInteraction) o.requireInteraction = true
  return o
}

const tagFor = () => (cfg().grouping === 'each' ? null : kind().tag)

// ── Sample image (stands in for e.g. a film poster) ─────────────────────────

const images = new Map()
function sampleImage(text) {
  if (images.has(text)) return images.get(text)
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 360
  const g = canvas.getContext('2d')
  const fill = g.createLinearGradient(0, 0, 720, 360)
  fill.addColorStop(0, '#03260d')
  fill.addColorStop(1, '#00a82a')
  g.fillStyle = fill
  g.fillRect(0, 0, 720, 360)
  g.fillStyle = 'rgb(255 255 255 / 0.92)'
  g.font = '600 44px "Work Sans Variable", system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text.length > 26 ? `${text.slice(0, 25)}…` : text, 360, 180)
  const url = canvas.toDataURL('image/png')
  images.set(text, url)
  return url
}

// ── Real notifications on this computer ─────────────────────────────────────

const canNotify = 'Notification' in window && 'serviceWorker' in navigator
const registration = canNotify
  ? navigator.serviceWorker.register('./sw.js', { scope: './' }).then(() => navigator.serviceWorker.ready)
  : null

async function showReal(n, tag) {
  if (!state.real || !registration) return
  const reg = await registration
  await reg.showNotification(n.title, { ...notificationOptions(n, tag), data: { url: location.href } })
}

async function clearReal() {
  if (!registration) return
  const reg = await registration
  for (const n of await reg.getNotifications()) n.close()
}

// ── Delivering ──────────────────────────────────────────────────────────────

function deliver(n, tag) {
  const c = cfg()
  stats.pushes++
  const existing = tag ? feed.find((f) => f.tag === tag) : null
  const loud = !c.silent && (!existing || c.renotify)
  if (loud) stats.alerts++
  lastAlert = loud ? 'loud' : 'quiet'
  const card = { id: ++serial, tag, title: n.title, body: n.body, options: notificationOptions(n, tag), loud }
  feed = [card, ...feed.filter((f) => f !== existing)]
  void showReal(n, tag).catch((e) => setRealHint(`Kunne ikke vise den rigtige notifikation: ${e.message}`))
}

/** One event (e.g. one item added) under the current grouping rule. */
function trigger(item, withOverride = false) {
  const c = cfg()
  const tag = tagFor()
  if (c.grouping === 'summary' && kind().burst) {
    collected = [...collected, item]
    deliver(compose(collected, withOverride && collected.length === 1), tag)
  } else {
    deliver(compose([item], withOverride), tag)
  }
}

function sendOne() {
  trigger(cfg().detail || kind().detail || '', true)
  renderOutput()
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function simulate() {
  if (running) return
  running = true
  resetFeed()
  renderOutput()
  const k = kind()
  const batch = cfg().grouping === 'batch'
  for (const item of k.burst) {
    await pause(900)
    if (batch) {
      waiting++
      lastAlert = 'waiting'
    } else {
      trigger(item)
    }
    renderOutput()
  }
  if (batch) {
    await pause(1600)
    waiting = 0
    deliver(compose(k.burst), k.tag)
  }
  running = false
  renderOutput()
}

function resetFeed() {
  feed = []
  collected = []
  stats = { pushes: 0, alerts: 0 }
  waiting = 0
  lastAlert = null
  void clearReal()
}

// ── Rendering ───────────────────────────────────────────────────────────────

function renderKinds() {
  let group = null
  let html = ''
  for (const k of KINDS) {
    if (k.group !== group) {
      if (group) html += '</ul>'
      group = k.group
      html += `<h3>${esc(group)}</h3><ul class="kinds">`
    }
    const c = state.perKind[k.id]
    const sample = k.variants[c.variant].make({ who: c.who, items: [c.detail] })
    html += `
      <li class="${k.id === state.kind ? 'current' : ''}">
        <button class="kind" data-select="${k.id}" aria-pressed="${k.id === state.kind}">
          <span class="kind-name">${esc(k.name)}
            <span class="chip chip-${k.status}">${STATUS[k.status]}</span>
            ${c.silent ? '<span class="chip">Lydløs</span>' : '<span class="chip chip-loud">Med lyd</span>'}
          </span>
          <span class="kind-sample">${esc([sample.title, sample.body].filter(Boolean).join(' · '))}</span>
        </button>
        <button class="small" data-try="${k.id}">Prøv</button>
      </li>`
  }
  $('#kinds').innerHTML = `${html}</ul>`
}

const SUPPORT_MARK = { ja: '✓', nej: '✗', delvist: '~', test: '?' }
const SUPPORT_WORD = { ja: 'virker', nej: 'virker ikke', delvist: 'virker delvist', test: 'skal testes' }

function supportChips(support) {
  return [
    ['android', 'Android'],
    ['ios', 'iPhone'],
    ['win', 'Computer'],
  ]
    .map(
      ([key, name]) =>
        `<span class="sup sup-${support[key]}" title="${name}: ${SUPPORT_WORD[support[key]]}">${SUPPORT_MARK[support[key]]} ${name}</span>`,
    )
    .join('')
}

function renderControls() {
  const k = kind()
  const c = cfg()
  const made = compose([c.detail])

  let html = `
    <h2>Indstillinger for “${esc(k.name)}”</h2>
    <div class="presets">
      <span>Hurtigvalg:</span>
      ${PRESETS.map((p, i) => `<button class="small ghost" data-preset="${i}">${esc(p.label)}</button>`).join('')}
    </div>

    <h3>Tekst</h3>
    <div class="fields">
      <label>Formulering
        <select data-field="variant">
          ${k.variants.map((v, i) => `<option value="${i}" ${i === c.variant ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
        </select>
      </label>
      <label>Hvem
        <select data-field="who">
          ${['Maja', 'Theodor'].map((w) => `<option ${w === c.who ? 'selected' : ''}>${w}</option>`).join('')}
        </select>
      </label>
      ${
        k.detailLabel
          ? `<label class="wide">${esc(k.detailLabel)}
              <input data-field="detail" value="${esc(c.detail)}" maxlength="200" />
            </label>`
          : ''
      }
      <label class="wide">Titel
        <input data-field="title" value="${esc(c.title ?? made.title)}" maxlength="80" />
      </label>
      <label class="wide">Tekst
        <input data-field="body" value="${esc(c.body ?? made.body)}" maxlength="200" />
      </label>
    </div>
    <p class="hint">Titel og tekst kan rettes frit. Vælg en formulering igen for at nulstille dem.</p>`

  let section = null
  for (const o of OPTIONS) {
    if (o.section !== section) {
      section = o.section
      html += `<h3>${esc(section)}</h3>`
    }
    const off = o.disabled?.(c, k) ?? null
    const head = `
      <div class="opt-head">
        <span class="opt-label">${esc(o.label)} <code>${esc(o.code)}</code></span>
        <span class="sups">${supportChips(o.support)}</span>
      </div>`
    if (o.type === 'toggle') {
      html += `
        <div class="opt ${off ? 'off' : ''}">
          ${head}
          <label class="switch">
            <input type="checkbox" data-key="${o.key}" ${c[o.key] && !off ? 'checked' : ''} ${off ? 'disabled' : ''} />
            <span>${esc(off ?? o.help)}</span>
          </label>
          ${o.note ? `<p class="hint">${esc(o.note)}</p>` : ''}
        </div>`
    } else {
      const chosen = o.choices.find(([value]) => value === c[o.key])
      html += `
        <div class="opt">
          ${head}
          <div class="seg" role="group" aria-label="${esc(o.label)}">
            ${o.choices
              .map(
                ([value, label]) =>
                  `<button data-key="${o.key}" data-value="${value}" aria-pressed="${value === c[o.key]}">${esc(label)}</button>`,
              )
              .join('')}
          </div>
          <p class="opt-help">${esc(chosen?.[2] ?? '')}</p>
        </div>`
    }
  }
  $('#controls').innerHTML = html
}

function renderPlatform() {
  $('#platform').innerHTML = [
    ['android', 'Android'],
    ['ios', 'iPhone'],
  ]
    .map(([id, name]) => `<button data-platform="${id}" aria-pressed="${state.platform === id}">${name}</button>`)
    .join('')
}

function cardHtml(card) {
  const o = card.options
  const ios = state.platform === 'ios'
  const body = card.body ? `<p class="n-body">${esc(card.body)}</p>` : ''
  if (ios) {
    return `
      <article class="n n-ios ${card.loud ? 'loud' : ''}" data-id="${card.id}">
        <img class="n-app" src="${ICON}" alt="" />
        <div class="n-main">
          <div class="n-row"><p class="n-title">${esc(card.title)}</p><span class="n-time">nu</span></div>
          ${body}
        </div>
      </article>`
  }
  return `
    <article class="n n-android ${card.loud ? 'loud' : ''}" data-id="${card.id}">
      <div class="n-meta">
        <span class="n-small">${o.badge ? `<img src="${BADGE}" alt="" />` : bell()}</span>
        MajaDor · nu ${o.silent ? '<span class="n-mute">· lydløs</span>' : ''}
      </div>
      <div class="n-row">
        <div class="n-main"><p class="n-title">${esc(card.title)}</p>${body}</div>
        ${o.icon ? `<img class="n-large" src="${ICON}" alt="" />` : ''}
      </div>
      ${o.image ? `<img class="n-image" src="${o.image}" alt="" />` : ''}
      ${o.actions ? `<div class="n-actions">${o.actions.map((a) => `<span>${esc(a.title)}</span>`).join('')}</div>` : ''}
    </article>`
}

const bell = () =>
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22zm7-5.5-1.6-1.7V10a5.4 5.4 0 0 0-4.2-5.3V3.6a1.2 1.2 0 0 0-2.4 0v1.1A5.4 5.4 0 0 0 6.6 10v4.8L5 16.5v.9h14z"/></svg>'

let lastTopCard = 0

function renderPhone() {
  const c = cfg()
  const ios = state.platform === 'ios'
  const now = new Date()
  const time = now.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })
  const statusIcons =
    !ios && feed.length
      ? feed
          .slice(0, 4)
          .map((f) => `<span class="n-small">${f.options.badge ? `<img src="${BADGE}" alt="" />` : bell()}</span>`)
          .join('')
      : ''
  const count = 2 + stats.pushes
  const appBadge = !c.appBadge ? '' : ios ? `<b class="count">${count}</b>` : stats.pushes ? '<b class="dot"></b>' : ''
  const ignored = ios
    ? ['icon', 'image', 'actions'].filter((key) => c[key] && (key !== 'actions' || kind().actions))
    : []
  const ignoredNames = { icon: 'eget ikon', image: 'billede', actions: 'knapper' }

  $('#phone').innerHTML = `
    <div class="phone phone-${state.platform}">
      <div class="phone-status"><span>${time}</span><span class="phone-icons">${statusIcons}</span></div>
      <div class="phone-clock">${time}<small>${esc(date)}</small></div>
      <div class="feed">
        ${waiting ? `<p class="feed-wait">Serveren venter: ${waiting} ${waiting === 1 ? 'ændring' : 'ændringer'} i kø…</p>` : ''}
        ${feed.map(cardHtml).join('') || (waiting ? '' : '<p class="feed-empty">Ingen notifikationer</p>')}
      </div>
      <div class="phone-home">
        <span class="app-icon"><img src="${ICON}" alt="" />${appBadge}</span>
        <span>MajaDor</span>
      </div>
    </div>
    ${
      ignored.length
        ? `<p class="hint">iPhone ignorerer: ${ignored.map((key) => ignoredNames[key]).join(', ')}.</p>`
        : ''
    }`

  // Animate only the card that just arrived.
  const top = feed[0]
  if (top && top.id !== lastTopCard) {
    lastTopCard = top.id
    const el = $(`#phone [data-id="${top.id}"]`)
    el?.classList.add('arrive')
    if (top.loud) $('#phone .phone').classList.add('shake')
  }
}

function renderStats() {
  const pill = $('#alert')
  pill.className = `alert-pill ${lastAlert ?? ''}`
  pill.textContent =
    lastAlert === 'loud'
      ? 'Lyd + vibration, popper op på skærmen'
      : lastAlert === 'quiet'
        ? 'Lydløst: ingen lyd, ingen vibration'
        : lastAlert === 'waiting'
          ? 'Intet sendt endnu'
          : 'Tryk “Send én” eller “Prøv” på en type'
  $('#stats').innerHTML = `
    <div><dt>Sendt</dt><dd>${stats.pushes}</dd></div>
    <div><dt>På skærmen</dt><dd>${feed.length}</dd></div>
    <div><dt>Lyd/vibration</dt><dd>${stats.alerts}</dd></div>`
  const k = kind()
  $('#actions').innerHTML = `
    <button data-act="send" ${running ? 'disabled' : ''}>Send én</button>
    ${
      k.burst
        ? `<button data-act="simulate" ${running ? 'disabled' : ''}>${running ? 'Simulerer…' : `Simulér ${k.burst.length} i træk`}</button>`
        : ''
    }
    <button class="ghost" data-act="clear" ${running ? 'disabled' : ''}>Ryd</button>`
}

function renderCode() {
  const k = kind()
  const c = cfg()
  const tag = tagFor()
  const n = compose([c.detail], true)
  const options = notificationOptions(n, tag)
  if (options.image) options.image = 'https://…/billede.jpg'
  options.icon &&= 'icon-192.png'
  options.badge &&= 'badge-96.png'
  const payload = { type: k.id, title: n.title, body: n.body, tag: tag ?? undefined, silent: c.silent || undefined }
  if (c.appBadge) payload.badgeCount = 3
  const headers = { TTL: c.ttl, urgency: c.urgency }
  if (c.topic) headers.topic = k.tag
  const rule =
    c.grouping === 'batch'
      ? '// Sendes af et planlagt job, når der har været ro i 2 minutter.\n'
      : c.grouping === 'summary' && k.burst
        ? '// Teksten bygges af alt, samme person har tilføjet de sidste minutter.\n'
        : ''
  $('#code').innerHTML = `
    <h3>Serveren (Edge Function <code>majador-push</code>)</h3>
    <pre>${esc(`${rule}webpush.sendNotification(enhed, payload, ${JSON.stringify(headers, null, 2)})\n\npayload = ${JSON.stringify(payload, null, 2)}`)}</pre>
    <h3>Telefonen (<code>src/sw.ts</code>)</h3>
    <pre>${esc(`self.registration.showNotification(${JSON.stringify(n.title)}, ${JSON.stringify(options, null, 2)})${c.appBadge ? '\nself.navigator.setAppBadge(3)' : ''}`)}</pre>`
}

/** Everything that depends on the current settings but is not a form field. */
function renderOutput() {
  renderPhone()
  renderStats()
  renderCode()
}

function renderAll() {
  renderKinds()
  renderControls()
  renderPlatform()
  renderOutput()
}

function setRealHint(text) {
  $('#real-hint').textContent = text
}

// ── Events ──────────────────────────────────────────────────────────────────

function selectKind(id) {
  if (state.kind === id) return
  state.kind = id
  resetFeed()
}

$('#kinds').addEventListener('click', (e) => {
  if (running) return
  const pick = e.target.closest('[data-select]')
  const tryIt = e.target.closest('[data-try]')
  if (pick) selectKind(pick.dataset.select)
  if (tryIt) {
    selectKind(tryIt.dataset.try)
    trigger(cfg().detail || kind().detail || '', true)
  }
  if (pick || tryIt) renderAll()
})

$('#controls').addEventListener('click', (e) => {
  const c = cfg()
  const preset = e.target.closest('[data-preset]')
  const choice = e.target.closest('button[data-key]')
  if (preset) {
    Object.assign(c, PRESETS[Number(preset.dataset.preset)].values)
    resetFeed()
  }
  if (choice) {
    const option = OPTIONS.find((o) => o.key === choice.dataset.key)
    c[option.key] = option.choices.find(([value]) => String(value) === choice.dataset.value)[0]
    if (option.key === 'grouping') resetFeed()
  }
  if (preset || choice) renderAll()
})

$('#controls').addEventListener('change', (e) => {
  const c = cfg()
  const t = e.target
  if (t.dataset.key) c[t.dataset.key] = t.checked
  else if (t.dataset.field === 'variant') Object.assign(c, { variant: Number(t.value), title: null, body: null })
  else if (t.dataset.field === 'who') Object.assign(c, { who: t.value, title: null, body: null })
  else return
  renderAll()
})

$('#controls').addEventListener('input', (e) => {
  const c = cfg()
  const t = e.target
  if (t.dataset.field === 'detail') {
    Object.assign(c, { detail: t.value, title: null, body: null })
    const made = compose([c.detail])
    $('#controls [data-field="title"]').value = made.title
    $('#controls [data-field="body"]').value = made.body
  } else if (t.dataset.field === 'title' || t.dataset.field === 'body') {
    c[t.dataset.field] = t.value
  } else {
    return
  }
  renderKinds()
  renderCode()
})

$('#platform').addEventListener('click', (e) => {
  const b = e.target.closest('[data-platform]')
  if (!b) return
  state.platform = b.dataset.platform
  renderPlatform()
  renderPhone()
})

$('#actions').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act
  if (act === 'send') sendOne()
  if (act === 'simulate') void simulate()
  if (act === 'clear') {
    resetFeed()
    renderOutput()
  }
})

$('#real').addEventListener('change', async (e) => {
  const box = e.target
  if (!box.checked) {
    state.real = false
    setRealHint('Send dem også til denne computer.')
    return
  }
  if (!canNotify) {
    box.checked = false
    setRealHint('Denne browser kan ikke vise notifikationer. Åbn siden i Chrome eller Edge.')
    return
  }
  const permission = await Notification.requestPermission()
  state.real = permission === 'granted'
  box.checked = state.real
  setRealHint(
    state.real
      ? 'Slået til. De dukker op som Windows-notifikationer (tjek at “Forstyr ikke” er slået fra).'
      : 'Browseren har blokeret notifikationer for denne side. Tillad dem via hængelåsen i adresselinjen.',
  )
})

navigator.serviceWorker?.addEventListener('message', (e) => {
  if (!e.data?.clicked) return
  const action = kind().actions?.find((a) => a.action === e.data.clicked)
  setRealHint(action ? `Du trykkede på knappen “${action.title}”.` : 'Du trykkede på notifikationen.')
})

renderAll()
