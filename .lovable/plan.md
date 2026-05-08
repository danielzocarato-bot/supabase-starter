# Permitir correções pós-classificação em todos os tipos de documento

Hoje, tanto em NFS-e tomadas (planilha), quanto NF-e entrada/saída (XML/SIEG) e documento avulso (upload com IA), depois que a nota é salva os campos extraídos viram somente leitura, e quando a competência é concluída tudo trava. Vamos resolver para todos os fluxos.

## Etapa 1 — Editar dados da nota dentro do drawer (todos os tipos)

Aplicar a edição em **dois drawers**:

### A) `src/components/NotaDrawerNFe.tsx` (usado por NF-e entrada/saída e documento avulso)

- Botão **"Editar dados"** no canto superior direito da aba Resumo.
- Modo edição troca os `Field` por inputs para:
  - Razão social, CNPJ, endereço, município, UF
  - Número, emissão, vencimento
  - Valor total
  - Descrição e CFOP do item nº 1 (apenas quando documento avulso, pois NF-e tem múltiplos itens — para NF-e a edição de descrição/CFOP por item já existe via classificação por item; o formulário aqui só edita o cabeçalho da nota).
- Botões **Salvar** / **Cancelar** no rodapé do drawer.
- Salva via `update` em `notas_fiscais` (cabeçalho) e, quando aplicável, em `notas_fiscais_itens` (item 1).
- Botão oculto se `readOnly` (competência concluída/exportada) ou `nota.cancelada`.
- Nova prop `onSalvarDados(notaId, patchNota, patchItem?) => Promise<void>` injetada por `ClassificacaoNFe.tsx`.

### B) `NotaDrawer` interno em `src/pages/ClassificacaoNFSe.tsx` (NFS-e tomadas)

- Mesmo botão **"Editar dados"** dentro do drawer.
- Modo edição com inputs para os campos do prestador e da nota NFS-e (razão, CNPJ, município, UF, número, emissão, valor, descrição/serviço municipal).
- Salva via `update` em `notas_fiscais`.
- Botão oculto quando competência concluída/exportada ou nota cancelada.

Padrão de UX, validação básica (CNPJ só dígitos, valor numérico aceitando vírgula) e toasts são compartilhados visualmente entre os dois drawers.

## Etapa 2 — Tornar 'Reabrir competência' visível em ambas as telas

O botão **Reabrir competência** já existe em `ClassificacaoNFe.tsx` (linha 742) e em `ClassificacaoNFSe.tsx` (linha 722), mas hoje fica em local discreto. Ajustes:

- Quando o status é **concluida** (e não exportada), exibir um banner sutil no topo da página: "Competência concluída — para corrigir alguma classificação, reabra a competência." com botão **Reabrir** ao lado, em ambas as telas.
- Mantém o botão atual onde está (não removemos), só ganhamos um ponto de entrada óbvio.

## Fora de escopo

- Tela de **Upload de Documentos** (`UploadDocumentos.tsx`) não muda — a edição passa a acontecer dentro do drawer da classificação, que é o mesmo lugar para documento avulso.
- Telas de **Importar Planilha** e **Importar XMLs** não mudam.
- Layouts de TXT, edge functions de exportação/importação — intocados.
- Sem migrations, sem alterações em RLS, sem alterar `types.ts`.
