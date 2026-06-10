/**
 * Extrai uma string legível de um erro do Axios/FastAPI.
 *
 * O FastAPI pode mandar `detail` em duas formas:
 *  - string simples: `{ "detail": "Token inválido" }`
 *  - lista de erros de validação (HTTP 422 Pydantic):
 *    `{ "detail": [{ type, loc, msg, input, ctx }, ...] }`
 *
 * Antes, o código tratava só o caso string e quando vinha o array (ex.
 * usuário apaga a data e dispara um GET com filtro inválido) o objeto ia
 * direto pro JSX e o React quebrava com error #31.
 */
export function extrairErro(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: unknown } } }).response
    const detail = resp?.data?.detail

    if (typeof detail === 'string') return detail

    if (Array.isArray(detail)) {
      // Lista de erros de validação do Pydantic. Junta as msgs num texto só.
      const partes = detail
        .map((d) => {
          if (typeof d === 'string') return d
          if (d && typeof d === 'object' && typeof (d as { msg?: unknown }).msg === 'string') {
            const loc = (d as { loc?: unknown[] }).loc
            const campo = Array.isArray(loc) && loc.length > 0 ? loc.at(-1) : null
            const msg = (d as { msg: string }).msg
            return campo ? `${campo}: ${msg}` : msg
          }
          return null
        })
        .filter((p): p is string => typeof p === 'string')

      if (partes.length > 0) return partes.join(' · ')
    }

    if (detail && typeof detail === 'object') {
      try {
        return JSON.stringify(detail)
      } catch {
        // segue pro fallback
      }
    }
  }

  if (err instanceof Error) return err.message
  return 'Erro desconhecido'
}
