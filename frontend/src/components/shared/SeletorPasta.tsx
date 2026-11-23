import { pastasService } from '@/services/lancamentosService'
import type { Pasta } from '@/types'

/** Valor especial do seletor: o usuário quer criar uma pasta nova agora. */
export const PASTA_NOVA = '__nova__'

export interface EscolhaPasta {
  /** '' = sem pasta, PASTA_NOVA = criar, senão o id da pasta. */
  valor: string
  nomeNova: string
}

/** A escolha está completa? (pasta nova precisa de nome) */
export function escolhaPastaValida(e: EscolhaPasta): boolean {
  return e.valor !== PASTA_NOVA || e.nomeNova.trim().length > 0
}

/** Transforma a escolha no id da pasta — criando a pasta nova se for o caso. */
export async function resolverPasta(e: EscolhaPasta): Promise<string | null> {
  if (e.valor === '') return null
  if (e.valor !== PASTA_NOVA) return e.valor
  const criada = await pastasService.criar(e.nomeNova.trim())
  return criada.id
}

const campo: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13,
}

const rotulo: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text-muted)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

/** Escolhe a pasta de um dashboard: nenhuma, uma existente ou uma nova. */
export function SeletorPasta({
  pastas,
  escolha,
  onChange,
}: {
  pastas: Pasta[]
  escolha: EscolhaPasta
  onChange: (e: EscolhaPasta) => void
}) {
  return (
    <div>
      <label style={rotulo}>Pasta</label>
      <select
        value={escolha.valor}
        onChange={(e) => onChange({ ...escolha, valor: e.target.value })}
        style={campo}
      >
        <option value="">Sem pasta</option>
        {pastas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
        <option value={PASTA_NOVA}>+ Criar nova pasta…</option>
      </select>
      {escolha.valor === PASTA_NOVA && (
        <input
          autoFocus
          type="text"
          value={escolha.nomeNova}
          onChange={(e) => onChange({ ...escolha, nomeNova: e.target.value })}
          placeholder="Nome da pasta (ex: Black Friday 2026)"
          maxLength={120}
          style={{ ...campo, marginTop: 8 }}
        />
      )}
      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
        A pasta junta o dash de leads e o de vendas do mesmo lançamento.
      </p>
    </div>
  )
}
