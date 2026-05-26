---
name: supabase-auth
description: Autenticação completa com Supabase JWT para o projeto LaunchMetrics. Use esta skill SEMPRE que for implementar ou modificar login, logout, proteção de rotas, middleware de autenticação no FastAPI, ou qualquer tela/componente que precise saber se o usuário está logado. Também use ao resolver erros 401 ou 403.
---

# Supabase Auth — LaunchMetrics

## Como funciona

1. O **frontend** usa o SDK do Supabase para fazer login com email + senha
2. O Supabase retorna um **JWT** (JSON Web Token)
3. O frontend envia esse JWT no header `Authorization: Bearer <token>` em todas as chamadas à API
4. O **backend FastAPI** valida o JWT usando o segredo do Supabase (`SUPABASE_JWT_SECRET`)
5. Se válido, a requisição prossegue. Se não, retorna 401.

---

## Backend — Middleware FastAPI

```python
# app/middleware/auth.py
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

security = HTTPBearer()

def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado. Faça login novamente.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
        )
```

Dependência a instalar: `pip install PyJWT`

Uso no router:
```python
from app.middleware.auth import verify_token

@router.get("/")
async def rota_protegida(_: dict = Depends(verify_token)):
    ...
```

---

## Frontend — Configuração do Supabase

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

---

## Frontend — Store de autenticação (Zustand)

```typescript
// src/store/authStore.ts
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: any | null
  token: string | null
  loading: boolean
  login: (email: string, senha: string) => Promise<void>
  logout: () => Promise<void>
  inicializar: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: true,

  inicializar: async () => {
    const { data } = await supabase.auth.getSession()
    set({
      user: data.session?.user ?? null,
      token: data.session?.access_token ?? null,
      loading: false,
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      set({
        user: session?.user ?? null,
        token: session?.access_token ?? null,
      })
    })
  },

  login: async (email, senha) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) throw new Error(error.message)
    set({ user: data.user, token: data.session?.access_token ?? null })
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, token: null })
  },
}))
```

---

## Frontend — Axios com token automático

```typescript
// src/services/api.ts
import axios from 'axios'
import { supabase } from '@/lib/supabase'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

// Injeta o token JWT em toda requisição automaticamente
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redireciona para login se receber 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

---

## Frontend — Proteção de rotas

```typescript
// src/components/shared/RotaProtegida.tsx
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function RotaProtegida({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()

  if (loading) return <div>Carregando...</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

Uso no roteamento:
```tsx
<Route path="/lancamentos" element={<RotaProtegida><TelaLancamentos /></RotaProtegida>} />
```

---

## Frontend — Tela de Login

```tsx
// src/pages/Login.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      await login(email, senha)
      navigate('/lancamentos')
    } catch (err: any) {
      setErro('Email ou senha incorretos.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required />
      <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha" required />
      {erro && <p style={{ color: 'red' }}>{erro}</p>}
      <button type="submit" disabled={carregando}>
        {carregando ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
```

---

## Criar usuários no Supabase

No painel do Supabase → Authentication → Users → "Invite user" ou via SQL:
```sql
-- No Supabase SQL Editor
SELECT auth.sign_up('usuario@empresa.com', 'senha-segura-aqui');
```

---

## Checklist de segurança

- [ ] `SUPABASE_JWT_SECRET` nunca no código, sempre no `.env`
- [ ] `SUPABASE_SERVICE_KEY` nunca no frontend
- [ ] Todas as rotas do FastAPI usam `Depends(verify_token)` exceto `/health` e `/webhooks/ghl/{token}`
- [ ] Token nunca salvo em `localStorage` — o SDK do Supabase usa cookies seguros automaticamente
