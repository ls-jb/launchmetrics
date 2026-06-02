import { create } from 'zustand'

export type Tema = 'padrao' | 'escuro' | 'claro'

const STORAGE_KEY = 'lm-tema'

function carregarTemaInicial(): Tema {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY)
    if (salvo === 'padrao' || salvo === 'escuro' || salvo === 'claro') {
      return salvo
    }
  } catch {
    // localStorage indisponível (SSR / modo privado raro); usa padrão
  }
  return 'padrao'
}

interface ThemeState {
  tema: Tema
  setTema: (t: Tema) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  tema: carregarTemaInicial(),
  setTema: (t) => {
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // ignore
    }
    document.documentElement.setAttribute('data-theme', t)
    set({ tema: t })
  },
}))

// Aplica o tema escolhido no <html> assim que o módulo carrega — antes do
// React renderizar — pra evitar "flash" do tema padrão na carga.
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', carregarTemaInicial())
}
