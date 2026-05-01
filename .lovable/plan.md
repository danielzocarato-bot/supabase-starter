# Correção do fluxo “Promover usuário a escritório”

## Diagnóstico

O problema principal não parece estar no roteamento, e sim no fato de que a promoção não chegou a acontecer no backend.

O que confirmei:

- A tabela `profiles` ainda está com seu usuário como `role = 'cliente'`.
- A função `promover_primeiro_escritorio` existe e hoje já está como `security definer` com `set search_path = public`.
- O enum de roles contém `escritorio`, então não é erro de tipo.
- Nas requests capturadas, **não houve chamada para** `rpc/promover_primeiro_escritorio`.
- No replay, depois do login o botão **“Promover usuário a escritório”** apareceu, mas não há evidência de clique efetivo nem request saindo para a RPC.

Em resumo: o fluxo atual está frágil. Mesmo quando o botão aparece, falta instrumentação e endurecimento para garantir que:

1. o clique realmente dispara a RPC,
2. o retorno bruto fique visível no console,
3. só exista sucesso quando a linha for realmente atualizada,
4. o app faça um recarregamento completo do profile após promoção.

## O que vou corrigir

### 1. Recriar a RPC com validação explícita de atualização real

Vou substituir a função por esta versão final:

```sql
create or replace function public.promover_primeiro_escritorio(_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  escritorio_count integer;
  linhas_afetadas integer;
begin
  select count(*)
    into escritorio_count
  from public.profiles
  where role = 'escritorio';

  if escritorio_count > 0 then
    return false;
  end if;

  update public.profiles
     set role = 'escritorio',
         cliente_id = null
   where id = _user_id;

  get diagnostics linhas_afetadas = row_count;

  return linhas_afetadas = 1;
end;
$$;
```

Isso elimina falso positivo: ela só retorna `true` se realmente atualizou exatamente 1 profile.

### 2. Corrigir o `handlePromover` no frontend

Vou ajustar o handler para:

- registrar `console.log` temporário com `{ data, error, userId }`,
- mostrar erro quando `error` existir,
- mostrar erro também quando `data === false`,
- só recarregar se `data === true`,
- usar `window.location.replace('/login')` em vez de `reload()`.

Handler corrigido:

```ts
const handlePromover = async () => {
  if (!user) {
    toast.error("Faça login primeiro com a conta que deve virar escritório.");
    return;
  }

  setLoading(true);

  const { data, error } = await supabase.rpc("promover_primeiro_escritorio", {
    _user_id: user.id,
  });

  console.log("[promover_primeiro_escritorio] resultado bruto", {
    data,
    error,
    userId: user.id,
  });

  setLoading(false);

  if (error || data === false) {
    toast.error("Não foi possível promover. Verifique se já existe um escritório cadastrado.");
    return;
  }

  if (data === true) {
    toast.success("Conta criada com segurança. Agora promova-se a escritório.");
    window.location.replace("/login");
  }
};
```

### 3. Forçar refetch limpo do profile no `AuthContext`

Depois da promoção, vou reforçar o recarregamento completo do profile.

No `AuthContext`, vou adicionar um log temporário no carregamento do profile para facilitar a validação no próximo teste:

```ts
const loadProfile = async (uid: string) => {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  console.log("[auth] profile carregado", { uid, data });
  setProfile(data as Profile | null);
};
```

O `replace()` já força uma reinicialização mais confiável do app e do contexto.

### 4. Melhorar a verificabilidade do teste

Depois da correção, no próximo teste você vai conseguir confirmar facilmente:

- se a RPC foi chamada,
- se retornou `true` ou `false`,
- qual `userId` foi enviado,
- e qual profile foi recarregado após o redirect.

## Arquivos que serão alterados

- migration SQL para recriar `promover_primeiro_escritorio`
- `src/pages/Login.tsx`
- `src/lib/auth.tsx`

## Resultado esperado após aplicar

Fluxo esperado:

```text
Login
  -> clicar em “Promover usuário a escritório”
  -> RPC retorna true
  -> profile.role vira "escritorio"
  -> replace para /login
  -> AuthContext recarrega profile atualizado
  -> redireciona para /app/escritorio
```

Se você aprovar, eu aplico essa correção agora.