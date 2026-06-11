import { Buffer } from 'buffer'

;(globalThis as typeof globalThis & { global: typeof globalThis; Buffer: typeof Buffer }).global =
  globalThis
;(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer
