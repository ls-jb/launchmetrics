import { api } from './api'
import type { MeuPerfil, Papel, Usuario } from '@/types'

export interface UsuarioCreatePayload {
  email: string
  senha: string
  nome?: string | null
  papel: Papel
}

export const usuariosService = {
  meuPerfil: () =>
    api.get<MeuPerfil>('/api/usuarios/me').then((r) => r.data),

  listar: () => api.get<Usuario[]>('/api/usuarios').then((r) => r.data),

  criar: (dados: UsuarioCreatePayload) =>
    api.post<Usuario>('/api/usuarios', dados).then((r) => r.data),

  atualizarPapel: (userId: string, papel: Papel) =>
    api.patch<Usuario>(`/api/usuarios/${userId}`, { papel }).then((r) => r.data),

  remover: (userId: string) =>
    api.delete(`/api/usuarios/${userId}`).then(() => undefined),
}
