import schemaDocument from './schemas.json' with { type: 'json' }
import validatorProfile from './validator-profile.json' with { type: 'json' }

export type Schema = Record<string, unknown>
export type SchemaDocument = { $defs: Record<string, Schema> } & Schema
const profile: { keywords: string[]; formats: string[]; patterns: string[] } = validatorProfile
const keywords = new Set(profile.keywords)
const formats = new Set(profile.formats)
const types = new Set(['object', 'array', 'string', 'integer', 'number', 'boolean', 'null'])
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const children = ['properties', '$defs']
const naturalKeywords = [
  'minProperties',
  'maxProperties',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
]
const patternAllowed = (value: string) => profile.patterns.includes(value)
const patternMatches = (pattern: string, value: string): boolean => {
  const match = new RegExp(pattern, 'u').exec(value)
  // JS permits $ before a trailing line terminator; the shared subset uses strict end-of-input.
  return (
    match !== null && (!pattern.endsWith('$') || match.index + match[0].length === value.length)
  )
}

/** This is a deliberately small, strict 2020-12 subset. Unsupported or malformed schemas throw. */
export function compileDocument(document: SchemaDocument): void {
  if (!isObject(document) || !isObject(document.$defs)) throw new Error('contract: missing $defs')
  const visit = (schema: unknown, path: string): void => {
    if (!isObject(schema)) throw new Error(`contract: expected schema object at ${path}`)
    for (const key of Object.keys(schema))
      if (!keywords.has(key)) throw new Error(`contract: unsupported keyword ${key} at ${path}`)
    if (
      '$ref' in schema &&
      (typeof schema.$ref !== 'string' ||
        !/^#\/\$defs\/[A-Za-z0-9]+$/.test(schema.$ref) ||
        !Object.hasOwn(document.$defs, schema.$ref.slice(8)))
    )
      throw new Error(`contract: unsupported/unresolved reference at ${path}`)
    if ('type' in schema && (typeof schema.type !== 'string' || !types.has(schema.type)))
      throw new Error(`contract: unsupported type at ${path}`)
    if ('format' in schema && !formats.has(String(schema.format)))
      throw new Error(`contract: unsupported format at ${path}`)
    if ('pattern' in schema) {
      if (typeof schema.pattern !== 'string' || !patternAllowed(schema.pattern))
        throw new Error(`contract: unsupported regular expression at ${path}`)
      new RegExp(schema.pattern, 'u')
    }
    for (const key of naturalKeywords)
      if (key in schema && (!Number.isSafeInteger(schema[key]) || Number(schema[key]) < 0))
        throw new Error(`contract: invalid ${key} at ${path}`)
    for (const key of ['minimum', 'maximum'])
      if (key in schema && (typeof schema[key] !== 'number' || !Number.isFinite(schema[key])))
        throw new Error(`contract: invalid ${key} at ${path}`)
    if (
      'required' in schema &&
      (!Array.isArray(schema.required) ||
        schema.required.some((k) => typeof k !== 'string') ||
        new Set(schema.required).size !== schema.required.length)
    )
      throw new Error(`contract: invalid required at ${path}`)
    if ('enum' in schema && (!Array.isArray(schema.enum) || schema.enum.length === 0))
      throw new Error(`contract: invalid enum at ${path}`)
    if ('uniqueItems' in schema && typeof schema.uniqueItems !== 'boolean')
      throw new Error(`contract: invalid uniqueItems at ${path}`)
    for (const key of children)
      if (key in schema) {
        if (!isObject(schema[key])) throw new Error(`contract: invalid ${key} at ${path}`)
        for (const [name, child] of Object.entries(schema[key]))
          visit(child, `${path}/${key}/${name}`)
      }
    for (const key of ['items', 'propertyNames', 'not'])
      if (key in schema) visit(schema[key], `${path}/${key}`)
    if ('additionalProperties' in schema && typeof schema.additionalProperties !== 'boolean')
      visit(schema.additionalProperties, `${path}/additionalProperties`)
    for (const key of ['oneOf', 'anyOf', 'allOf'])
      if (key in schema) {
        if (!Array.isArray(schema[key]) || schema[key].length === 0)
          throw new Error(`contract: invalid ${key} at ${path}`)
        for (const [index, child] of schema[key].entries()) visit(child, `${path}/${key}/${index}`)
      }
  }
  visit(document, '#')
  // No recursive references: bounded DTOs need none, and refusing them prevents stack/resource attacks.
  const walkRefs = (schema: Schema, stack: Set<string>): void => {
    if (typeof schema.$ref === 'string') {
      const name = schema.$ref.slice(8)
      if (stack.has(name)) throw new Error(`contract: recursive reference ${name}`)
      walkRefs(document.$defs[name], new Set([...stack, name]))
    }
    for (const key of children)
      if (isObject(schema[key]))
        for (const child of Object.values(schema[key])) walkRefs(child as Schema, stack)
    for (const key of ['items', 'propertyNames', 'not', 'additionalProperties'])
      if (isObject(schema[key])) walkRefs(schema[key], stack)
    for (const key of ['oneOf', 'anyOf', 'allOf'])
      if (Array.isArray(schema[key]))
        for (const child of schema[key]) walkRefs(child as Schema, stack)
  }
  for (const [name, definition] of Object.entries(document.$defs))
    walkRefs(definition, new Set([name]))
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}
function validFormat(format: string, value: string): boolean {
  if (format === 'date-time') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false
    const parsed = new Date(value)
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString() === (value.length === 20 ? value.replace('Z', '.000Z') : value)
    )
  }
  if (format === 'email')
    return (
      /^[\x21-\x7e]+$/.test(value) &&
      !/[\r\n]/.test(value) &&
      /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(
        value,
      ) &&
      !value.startsWith('.') &&
      !value.includes('..') &&
      !value.includes('.@')
    )
  if (format === 'local-path')
    return (
      value.startsWith('/') &&
      !value.startsWith('//') &&
      !/[\\\u0000-\u0020\u007f]/.test(value) &&
      !/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
    )
  if (format === 'http-url' || format === 'http-origin') {
    if (
      !/^https?:\/\//.test(value) ||
      [...value].some((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126 || c === '\\') ||
      value.includes('*')
    )
      return false
    try {
      const parsed = new URL(value)
      if (parsed.username || parsed.password || !parsed.hostname) return false
      if (format === 'http-origin') return value === parsed.origin
      return true
    } catch {
      return false
    }
  }
  return false
}

function matches(document: SchemaDocument, schema: Schema, value: unknown): boolean {
  if (schema.$ref && !matches(document, document.$defs[String(schema.$ref).slice(8)], value))
    return false
  if ('const' in schema && canonical(schema.const) !== canonical(value)) return false
  if (
    schema.enum &&
    !(schema.enum as unknown[]).some((item) => canonical(item) === canonical(value))
  )
    return false
  if (
    schema.oneOf &&
    (schema.oneOf as Schema[]).filter((s) => matches(document, s, value)).length !== 1
  )
    return false
  if (schema.anyOf && !(schema.anyOf as Schema[]).some((s) => matches(document, s, value)))
    return false
  if (schema.allOf && !(schema.allOf as Schema[]).every((s) => matches(document, s, value)))
    return false
  if (schema.not && matches(document, schema.not as Schema, value)) return false
  if (schema.type) {
    const checks: Record<string, boolean> = {
      object: isObject(value),
      array: Array.isArray(value),
      string: typeof value === 'string',
      integer: typeof value === 'number' && Number.isSafeInteger(value),
      number: typeof value === 'number' && Number.isFinite(value),
      boolean: typeof value === 'boolean',
      null: value === null,
    }
    if (!checks[String(schema.type)]) return false
  }
  if (typeof value === 'string') {
    const length = [...value].length
    if (length < Number(schema.minLength ?? 0) || length > Number(schema.maxLength ?? Infinity))
      return false
    if (schema.pattern && !patternMatches(String(schema.pattern), value)) return false
    if (schema.format && !validFormat(String(schema.format), value)) return false
  }
  if (
    typeof value === 'number' &&
    (value < Number(schema.minimum ?? -Infinity) || value > Number(schema.maximum ?? Infinity))
  )
    return false
  if (Array.isArray(value)) {
    if (
      value.length < Number(schema.minItems ?? 0) ||
      value.length > Number(schema.maxItems ?? Infinity)
    )
      return false
    if (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length) return false
    if (schema.items && !value.every((item) => matches(document, schema.items as Schema, item)))
      return false
  }
  if (isObject(value)) {
    const keys = Object.keys(value)
    if (
      keys.length < Number(schema.minProperties ?? 0) ||
      keys.length > Number(schema.maxProperties ?? Infinity)
    )
      return false
    if (schema.required && !(schema.required as string[]).every((key) => Object.hasOwn(value, key)))
      return false
    const properties = (schema.properties ?? {}) as Record<string, Schema>
    for (const key of keys) {
      if (schema.propertyNames && !matches(document, schema.propertyNames as Schema, key))
        return false
      if (Object.hasOwn(properties, key)) {
        if (!matches(document, properties[key], value[key])) return false
      } else if (schema.additionalProperties === false) return false
      else if (
        isObject(schema.additionalProperties) &&
        !matches(document, schema.additionalProperties, value[key])
      )
        return false
    }
  }
  return true
}

export function validateWithDocument(
  document: SchemaDocument,
  name: string,
  value: unknown,
): boolean {
  compileDocument(document)
  if (!Object.hasOwn(document.$defs, name)) throw new Error(`contract: unknown schema ${name}`)
  return matches(document, document.$defs[name], value)
}

const document: SchemaDocument = schemaDocument
compileDocument(document)
/** Shape validation only: no authentication, persistence, freshness, or authority is inferred. */
export function validateNamed(name: string, value: unknown): boolean {
  if (!Object.hasOwn(document.$defs, name)) throw new Error(`contract: unknown schema ${name}`)
  return matches(document, document.$defs[name], value)
}
