import type { User } from '@supabase/supabase-js'
import { create } from 'zustand'

import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  carregando: boolean
  inicializar: () => Promise<void>
  login: (email: string, senha: string) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  carregando: true,

  inicializar: async () => {
    const { data } = await supabase.auth.getSession()
    set({ user: data.session?.user ?? null, carregando: false })

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null })
    })
  },

  login: async (email, senha) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })
    if (error) throw new Error(error.message)
    set({ user: data.user })
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null })
  },
}))
