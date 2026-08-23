import { useMemo } from 'react'
import { t } from './index'

export function useTranslation(): (key: string, params?: Record<string, string>) => string {
  const translate = useMemo(() => t, [])
  return translate
}
