/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type { SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

export function pcKit() {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
    const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el;
  };
  /** An icon from the page's sprite; decorative, the words beside it carry the meaning. */
  const glyph = (name: string) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#icon-' + name); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'pc-icon'); svg.append(use); return svg;
  };
  /** A catalog button (`mw-btn`). */
  const button = (label: string, variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline', size: 'sm' | 'md' | 'lg' | 'icon' = 'sm', icon?: string) => {
    const el = make('button', undefined, 'mw-btn mw-btn--' + variant + ' mw-btn--' + size); el.type = 'button'; el.dataset.slot = 'button';
    if (icon) el.append(glyph(icon)); const words = make('span', label); words.dataset.slot = 'button-label'; el.append(words); return el;
  };
  const text = (value: unknown): string => value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  /** Common status words a design left in English ("open", "completed") read in Chinese, in a field named like a status. */
  const STATUS_WORDS: Record<string, string> = { open: '进行中', active: '进行中', in_progress: '进行中', 'in-progress': '进行中', completed: '已完成', complete: '已完成',
    done: '已完成', closed: '已关闭', cancelled: '已取消', canceled: '已取消', pending: '待处理', todo: '待办', archived: '已归档', draft: '草稿', paused: '已暂停', failed: '失败', succeeded: '成功' };
  const statusWord = (field: string | undefined, value: unknown): string | undefined => field && /status|state/i.test(field) && typeof value === 'string' ? STATUS_WORDS[value.trim().toLowerCase()] : undefined;
  /** The exact value beside the words it is shown as, for search and for checks; not read aloud. */
  const exactly = (value: unknown) => { const exact = make('span', ' ' + text(value), 'pc-sr'); exact.setAttribute('aria-hidden', 'true'); return exact; };
  /** How a record's field reads: the column's own words for its values, a status in Chinese, 是/否 for a plain boolean. */
  const shown = (column: { field?: string; values?: Record<string, string> } | undefined, value: unknown): unknown =>
    column?.values && Object.hasOwn(column.values, text(value)) ? column.values[text(value)] : statusWord(column?.field, value) ?? (typeof value === 'boolean' ? value ? '是' : '否'
      // A list of words or numbers reads as words ("晨跑、读书"), not as code.
      : Array.isArray(value) && value.every(item => typeof item === 'string' || typeof item === 'number') ? value.join('、') : value);
  /** Model answers often carry light Markdown: show **emphasis**, drop heading marks. Always text nodes, never markup. */
  const prose = <K extends keyof HTMLElementTagNameMap>(tag: K, value: unknown, cls?: string) => {
    const element = make(tag, undefined, cls), source = text(value).replace(/^#{1,6}\s+/gmu, '');
    for (const [index, piece] of source.split(/\*\*([^*\n][^*]*?)\*\*/u).entries()) element.append(index % 2 ? make('strong', piece) : document.createTextNode(piece));
    return element;
  };
  const at = (value: unknown, path?: string): unknown => {
    if (!path) return value;
    for (const key of path.split('.')) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || !value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined;
      value = (value as Record<string, unknown>)[key];
    } return value;
  };
  /** Status tags use the catalog badge tones: a value's place among its choices picks its tone, yes is success. */
  const TONES = ['info', 'success', 'warning', 'neutral'];
  /** A plugin's mark: a neutral icon that says what it is about (colour belongs to state and selection). */
  const MARKS: Array<[RegExp, string]> = [[/书|读|阅|摘抄|文章/u, 'book'], [/单词|生词|词汇|英语|背诵/u, 'library'], [/账|钱|支出|收入|花销|预算|消费|报销/u, 'hash'],
    [/待办|任务|todo|清单|计划/iu, 'completed'], [/打卡|习惯|坚持/u, 'calendar'], [/提醒|闹钟|到期/u, 'bell'], [/目标|里程碑/u, 'target'], [/日志|日记|复盘|进展|周报/u, 'history'],
    [/灵感|想法|点子|创意/u, 'idea'], [/自测|测验|问答|题|考/u, 'question'], [/对话|聊天|助手/u, 'message'], [/报名|名单|联系人|客户|成员/u, 'user'],
    [/喝水|健康|运动|睡眠|体重/u, 'activity'], [/计时|番茄|时间/u, 'timer'], [/收藏|书签|链接|网址/u, 'bookmark'], [/图片|照片|相册/u, 'image'], [/笔记|随手记|记录|备忘/u, 'note']];
  const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  const TEMPLATE = /\{\{\s*[\w.]+\s*\}\}/u;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  /** A moment reads the way people say it; the exact value stays with it, for search and for checks. */
  const moment = (value: string) => {
    const date = new Date(value); if (Number.isNaN(date.getTime())) return make('span', value);
    const now = new Date(), day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), diff = Math.round((day(now) - day(date)) / 86_400_000);
    const time = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    const words = diff === 0 ? '今天 ' + time : diff === 1 ? '昨天 ' + time : diff === -1 ? '明天 ' + time
      : (date.getFullYear() === now.getFullYear() ? '' : date.getFullYear() + '年') + (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + time;
    const element = make('time', words); element.dateTime = value; element.title = value;
    const exact = make('span', ' ' + value, 'pc-sr'); exact.setAttribute('aria-hidden', 'true'); element.append(exact); return element;
  };
  /** "金额，大于 0" is a name and a hint: the name labels the field, the hint waits inside it. */
  const naming = (description: string | undefined, fallback: string) => { const [name, ...hint] = (description || fallback).split('，'); return { label: name!.trim() || fallback, hint: hint.join('，').trim() }; };
  /** A date written as a pattern in the description ("YYYY-MM") gets the matching picker. */
  const picker = (spec: SandboxSchema) => spec.type !== 'string' || spec.format || spec.enum ? undefined : /YYYY-MM-DD/i.test(spec.description ?? '') ? 'date' : /YYYY-MM/i.test(spec.description ?? '') ? 'month' : undefined;
  const chipsFit = (values: readonly unknown[]) => values.length <= 6 && values.every(value => text(value).length <= 12);
  /** A status as the catalog's badge. */
  const badge = (words: string, tone: string) => { const el = make('span', undefined, 'mw-badge mw-badge--' + tone + ' pc-tag'); el.dataset.slot = 'badge'; el.dataset.tone = tone === 'neutral' ? 'gray' : tone; el.append(words); return el; };
  /** A field's typed value, or undefined when left empty (an optional filter left at 全部). */
  function typedValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, spec: { type: string; format?: string }): unknown {
    if (spec.type === 'boolean') return input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value === '' ? undefined : input.value === 'true';
    if (input.value === '') return undefined;
    // A moment picked on this device carries this device's offset, so it means the same time wherever it is read.
    if (input instanceof HTMLInputElement && input.type === 'datetime-local') {
      const local = new Date(input.value); if (Number.isNaN(local.getTime())) return input.value;
      const offset = -local.getTimezoneOffset(), sign = offset >= 0 ? '+' : '-', pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
      return input.value.slice(0, 16) + ':00' + sign + pad(offset / 60) + ':' + pad(offset % 60);
    }
    return ['number', 'integer'].includes(spec.type) ? Number(input.value) : ['object', 'array', 'null'].includes(spec.type) ? JSON.parse(input.value) : input.value;
  }
  /** An object result (a total, a breakdown) as figure cards; a nested list of records as progress bars or a small table. */
  function figures(record: Record<string, unknown>, schema: SandboxSchema | undefined, depth: number): HTMLElement {
    const list = make('dl', undefined, 'pc-figures' + (depth ? ' pc-figures-nested' : ''));
    for (const [key, value] of Object.entries(record).slice(0, 24)) {
      const spec = schema?.type === 'object' ? schema.properties?.[key] : undefined, tile = make('div', undefined, 'mw-card pc-stat'); tile.dataset.slot = 'card';
      const records = Array.isArray(value) && value.length > 0 && value.every(item => item && typeof item === 'object' && !Array.isArray(item));
      // An undescribed list needs no label: its table names its own columns.
      if (spec?.description || !records) tile.append(make('dt', spec?.description || key));
      const cell = make('dd');
      if (records) {
        tile.classList.add('pc-figures-wide');
        const rows = (value as Array<Record<string, unknown>>).slice(0, 50), items = spec?.type === 'array' ? spec.items : undefined, keys = Object.keys(rows[0]!).slice(0, 6);
        const describe = (field: string) => (items?.type === 'object' ? items.properties?.[field]?.description : undefined) || field;
        const numeric = keys.filter(field => rows.every(row => typeof row[field] === 'number')), labels = keys.filter(field => !numeric.includes(field));
        if (keys.length === 2 && numeric.length === 1 && labels.length === 1) {
          // A label and an amount per row: the catalog's progress bars read faster than a table.
          const amount = numeric[0]!, label = labels[0]!, top = Math.max(...rows.map(row => Math.abs(row[amount] as number)), 0) || 1, bars = make('div', undefined, 'pc-bars');
          bars.setAttribute('role', 'table'); bars.setAttribute('aria-label', describe(label) + ' / ' + describe(amount));
          for (const row of rows) {
            const bar = make('div', undefined, 'pc-bar'), track = make('div', undefined, 'mw-progress'), fill = make('span'), share = Math.round(Math.abs(row[amount] as number) / top * 100);
            bar.setAttribute('role', 'row'); track.dataset.slot = 'progress'; track.setAttribute('role', 'progressbar'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); track.setAttribute('aria-valuenow', String(share));
            fill.style.width = share + '%'; track.append(fill); bar.append(make('span', text(shown(undefined, row[label]))), track, make('strong', text(row[amount]))); bars.append(bar);
          }
          cell.append(bars);
        } else {
          const table = make('table', undefined, 'mw-table pc-table'), head = make('tr'), body = make('tbody');
          for (const field of keys) head.append(make('th', describe(field)));
          for (const row of rows) { const tr = make('tr'); for (const field of keys) tr.append(make('td', text(shown(undefined, row[field])))); body.append(tr); }
          const thead = make('thead'); thead.append(head); table.append(thead, body); const wrap = make('div', undefined, 'mw-table-wrap pc-table-wrap'); wrap.append(table); cell.append(wrap);
        }
      } else if (value && typeof value === 'object' && !Array.isArray(value) && depth < 2) { tile.classList.add('pc-figures-wide'); cell.append(figures(value as Record<string, unknown>, spec, depth + 1)); }
      else if (typeof value === 'string' && MOMENT.test(value)) { tile.dataset.words = ''; cell.append(moment(value)); }
      else { if (typeof value !== 'number' && text(shown(undefined, value)).length > 12) tile.dataset.words = ''; cell.append(prose('span', shown(undefined, value))); }
      tile.append(cell); list.append(tile);
    }
    return list;
  }
  const skeleton = (idle: boolean) => { const block = make('div', undefined, 'pc-skeleton'); if (idle) block.dataset.idle = ''; block.setAttribute('aria-hidden', 'true'); for (let index = 0; index < (idle ? 2 : 3); index++) { const bone = make('span', undefined, 'mw-skeleton'); bone.dataset.slot = 'skeleton'; block.append(bone); } return block; };
  return { make, glyph, button, text, statusWord, exactly, shown, prose, at, TONES, MARKS, MOMENT, TEMPLATE, DAY, moment, naming, picker, chipsFit, badge, typedValue, figures, skeleton };
}
