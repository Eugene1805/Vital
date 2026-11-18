import { createContext } from 'react'
import type { MockStoreContextValue } from './MockStoreContext.tsx'

export const MockStoreContext = createContext<MockStoreContextValue | null>(null)
