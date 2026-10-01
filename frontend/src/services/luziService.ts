import { api } from './api'
import type { LuziConfig, MensagemLuzi } from '@/types'

export interface ChatLuziPayload {
  mensagens: MensagemLuzi[]
  inicio?: string // YYYY-MM-DD — período filtrado no dashboard
  fim?: string
}

// A Luzi pode consultar o banco várias vezes antes de responder.
const TIMEOUT_CHAT_MS = 60_000

export const luziService = {
  config: () =>
    api.get<LuziConfig>('/api/luzi/config').then((r) => r.data),

  conversar: (perpetuoId: string, payload: ChatLuziPayload) =>
    api
      .post<{ resposta: string }>(
        `/api/luzi/perpetuos/${perpetuoId}/chat`,
        payload,
        { timeout: TIMEOUT_CHAT_MS },
      )
      .then((r) => r.data.resposta),
}
