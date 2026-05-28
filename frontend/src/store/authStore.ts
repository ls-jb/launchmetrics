import type { User } from '@supabase/supabase-js'
import { create } from 'zustand'

import { supabase } from '@/lib/supabase'
import { usuariosService } from '@/services/usuariosService'
import type { Papel } from '@/types'

interface AuthState {
  user: User | null
  papel: Papel | null
  carregando: boolean
  inicializar: () => Promise<void>
  login: (email: string, senha: string) => Promise<void>
  logout: () => Promise<void>
  carregarPapel: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  papel: null,
  carregando: true,

  inicializar: async () => {
    const { data } = await supabase.auth.getSession()
    set({ user: data.session?.user ?? null, carregando: false })
    if (data.session?.user) {
      get().carregarPapel()
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null })
      if (session?.user) {
        get().carregarPapel()
      } else {
        set({ papel: null })
      }
    })
  },

  carregarPapel: async () => {
    try {
      const perfil = await usuariosService.meuPerfil()
      set({ papel: perfil.papel })
    } catch {
      set({ papel: 'viewer' })
    }
  },

  login: async (email, senha) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })
    if (error) throw new Error(error.message)
    set({ user: data.user })
    await get().carregarPapel()
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, papel: null })
  },
}))
