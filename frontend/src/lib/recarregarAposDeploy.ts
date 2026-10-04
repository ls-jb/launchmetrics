// Depois de um deploy novo, os chunks JS antigos (com hash no nome) somem.
// Quem estava com a aba aberta tenta baixar um arquivo que não existe mais
// e a tela quebra. A saída é recarregar a página uma vez para pegar a versão nova.

const CHAVE_ULTIMO_RELOAD = 'lm:reload-apos-deploy'
const INTERVALO_MINIMO_MS = 10_000

const PADROES_ERRO_CHUNK: RegExp[] = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /is not a valid JavaScript MIME type/i,
  /Unable to preload CSS/i,
]

export function ehErroDeChunk(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : String(erro ?? '')
  return PADROES_ERRO_CHUNK.some((padrao) => padrao.test(mensagem))
}

/** Recarrega a página, no máximo uma vez a cada 10s (evita loop de reload). */
export function recarregarAposDeploy(): boolean {
  try {
    const ultimo = Number(sessionStorage.getItem(CHAVE_ULTIMO_RELOAD) ?? 0)
    if (Date.now() - ultimo < INTERVALO_MINIMO_MS) return false
    sessionStorage.setItem(CHAVE_ULTIMO_RELOAD, String(Date.now()))
  } catch {
    // sessionStorage indisponível (aba anônima restrita): recarrega mesmo assim
  }
  window.location.reload()
  return true
}

/** Vite dispara esse evento quando um import dinâmico falha. */
export function registrarRecargaAposDeploy(): void {
  window.addEventListener('vite:preloadError', (evento: Event) => {
    if (recarregarAposDeploy()) evento.preventDefault()
  })
}
