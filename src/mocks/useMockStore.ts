import { use } from 'react'
import type { MockStoreContextValue } from './MockStoreContext.tsx'
import { MockStoreContext } from './mockStoreInstance.ts'

export function useMockStore(): MockStoreContextValue {
  const ctx = use(MockStoreContext)
  if (!ctx) {
    throw new Error('useMockStore debe usarse dentro de MockStoreProvider.')
  }
  return ctx
}
