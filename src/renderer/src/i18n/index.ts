import { zh } from './zh'

const translations = zh

export function t(key: string, params?: Record<string, string>): string {
  const template = translations[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`)
}

export { zh }
export type TranslationKey = keyof typeof zh
