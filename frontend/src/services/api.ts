import axios from 'axios'

import { supabase } from '@/lib/supabase'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

// Injeta o JWT do Supabase em toda requisição
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Em 401, faz signOut e redireciona pro login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)
