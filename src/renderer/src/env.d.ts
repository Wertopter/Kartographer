/// <reference types="vite/client" />

import type { KartographerApi } from '@shared/api'

declare global {
  interface Window {
    kartographer: KartographerApi
  }
}

export {}
