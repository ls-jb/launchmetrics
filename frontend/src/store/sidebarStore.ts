import { create } from 'zustand'

const STORAGE_KEY = 'lm-sidebar-colapsada'

function carregarInicial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

interface SidebarState {
  colapsada: boolean
  toggle: () => void
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  colapsada: carregarInicial(),
  toggle: () => {
    const novo = !get().colapsada
    try {
      localStorage.setItem(STORAGE_KEY, novo ? '1' : '0')
    } catch {
      // ignore
    }
    set({ colapsada: novo })
  },
}))
