# Excluir importação de uma competência

Permitir ao escritório apagar uma competência inteira (NFSe ou NFe) — incluindo notas e itens — para poder reimportar do zero.

## Onde a ação aparece

1. **Lista de competências do cliente** (`DetalheCliente.tsx` → aba Competências): adicionar um menu de ações (`⋯`) em cada linha, ao lado do botão "Abrir", com a opção destrutiva **"Excluir importação"**.
2. **Header da tela de classificação** (`ClassificacaoNFe.tsx` e `ClassificacaoNFSe.tsx`): mesmo item dentro de um menu `⋯` no canto direito do header, para quem já está dentro da competência. Após excluir, redireciona de volta para `/app/escritorio/clientes/{id}?tab=competencias`.

Visível apenas para perfil `escritorio` (cliente nunca apaga).

## Fluxo de confirmação

`AlertDialog` destrutivo com:

- Título: **"Excluir esta importação?"**
- Corpo:
  - Período + tipo (ex.: "Outubro / 2025 — NF-e Entrada")
  - "X notas e Y itens serão apagados permanentemente. Esta ação não pode ser desfeita."
  - Aviso extra **vermelho** se `status = 'exportada'`: "Esta competência já foi exportada para o Domínio. Excluir aqui não desfaz a exportação no sistema contábil."
- Campo de texto exigindo digitar **EXCLUIR** (case-sensitive) para liberar o botão.
- Botão final: **"Excluir definitivamente"** (`variant="destructive"`).

## Execução da exclusão

Feita client-side via Supabase SDK (RLS `*_escritorio_all` já permite DELETE para escritório). Sem FK cascade no banco, então a ordem importa:

```text
1. delete from notas_fiscais_itens
   where nota_id in (select id from notas_fiscais where competencia_id = X)
2. delete from notas_fiscais where competencia_id = X
3. delete from competencias where id = X
```

Encadeado num helper `excluirCompetencia(id)` em `src/lib/competencias.ts` (novo). Em qualquer erro, toast `"Algo precisa de atenção"` com a mensagem; sem rollback (Supabase JS não suporta transação multi-statement, mas a ordem garante consistência: se passo 2 falhar, itens órfãos já foram limpos; se passo 3 falhar, competência fica vazia e pode ser reaberta/reexcluída).

Ao final: `toast.success("Importação excluída.")` + recarregar lista (ou navegar fora se for do header).

## Não mexer

- Edge Functions (não precisa criar nenhuma — RLS já cobre).
- Schema do banco (sem migration).
- Layout de exportação, parser de XML, telas existentes que não foram citadas.

## Arquivos afetados

- `src/lib/competencias.ts` — novo helper `excluirCompetencia`.
- `src/pages/escritorio/DetalheCliente.tsx` — menu de ações + AlertDialog na aba Competências.
- `src/pages/ClassificacaoNFe.tsx` — menu `⋯` no header com mesma ação.
- `src/pages/ClassificacaoNFSe.tsx` — idem.
