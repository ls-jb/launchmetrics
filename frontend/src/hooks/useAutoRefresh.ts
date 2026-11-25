import { useEffect, useRef } from 'react'

/**
 * Chama `callback` a cada `intervaloMs`, mas SÓ enquanto a aba está visível.
 * Aba escondida/minimizada não gera requisição (cada chamada consome a cota
 * de CPU/transferência da Vercel). Ao voltar pra aba, recarrega na hora.
 */
export function useAutoRefresh(
  callback: () => void,
  intervaloMs: number,
  ativo = true,
): void {
  // Ref pra sempre chamar a versão mais recente do callback sem reiniciar
  // o timer a cada render.
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!ativo) return
    let id: ReturnType<typeof setInterval> | null = null

    const iniciar = () => {
      if (id === null) id = setInterval(() => callbackRef.current(), intervaloMs)
    }
    const parar = () => {
      if (id !== null) {
        clearInterval(id)
        id = null
      }
    }
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible') {
        callbackRef.current()
        iniciar()
      } else {
        parar()
      }
    }

    if (document.visibilityState === 'visible') iniciar()
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    return () => {
      parar()
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    }
  }, [intervaloMs, ativo])
}
