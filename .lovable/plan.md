## Objetivo

Você já pode reabrir a competência, alterar só as notas que quiser e gerar um novo TXT — as classificações das demais notas são preservadas. O problema é que **a UI não comunica isso com clareza**, então passa a sensação de que reabrir "zera tudo" ou que não vai dar para exportar de novo. Vamos ajustar a comunicação e garantir o fluxo de re-exportação.

## Mudanças

### 1. Banner "Reabrir competência" mais explicativo
Em `ClassificacaoNFe.tsx` e `ClassificacaoNFSe.tsx`, quando o status é `concluida` (ou `exportada`), o banner atual fica:

> **Competência concluída** — para corrigir alguma classificação, reabra a competência. *[Reabrir]*

Trocar por um texto que deixa claro o que acontece e o que **não** acontece:

> **Competência concluída.** Para ajustar a classificação de uma ou mais notas, reabra a competência. **As demais notas continuam com a classificação atual** — só o que você editar muda. Depois é só concluir e gerar um novo TXT. *[Reabrir competência]*

Mesmo texto para status `exportada`, ajustando só o final: "...gerar uma nova versão do TXT (a anterior fica no histórico)."

### 2. Diálogo de confirmação "Reabrir" mais informativo
Os modais de confirmação atuais (`confirmReabrirOpen`) ganham um corpo claro:

- Título: **Reabrir esta competência?**
- Descrição: 
  - "Todas as notas já classificadas mantêm a classificação atual."
  - "Você poderá editar apenas as notas que quiser."
  - "Depois é só concluir novamente e gerar um novo TXT — o arquivo anterior continua disponível no histórico de exportações."
- Botões: *Cancelar* / *Reabrir competência*

### 3. Permitir gerar TXT novamente após re-conclusão
Hoje, depois de exportar uma vez, o status vai para `exportada` e o botão de gerar TXT some (`competencia.status !== "exportada"` em ambos os arquivos). Vamos:

- Manter o botão **"Gerar novo TXT"** visível também quando `status === "exportada"`, com rótulo diferente quando já houve exportação anterior:
  - 1ª vez: "Gerar TXT separador"
  - Já exportada antes: "Gerar nova versão do TXT"
- Cada geração continua criando uma nova linha em `exportacoes` (já é assim hoje), aparecendo no `HistoricoExportacoes`.
- Ao gerar nova versão, atualizar `exportada_em` com a data da última exportação.

### 4. Indicador visual nas notas alteradas após reabertura *(opcional, leve)*
Pequeno badge "editada" ao lado de notas cujo `classificado_em` é mais recente que a `exportada_em` anterior. Ajuda o usuário a saber o que mudou desde a última exportação. Se preferir manter simples, podemos pular este item.

## Fora de escopo

- Lógica de reabertura no banco (já preserva classificações corretamente).
- Edge function `gerar-txt-separador` (continua igual; já suporta múltiplas chamadas).
- Migrations, RLS, types.ts.
- Reabrir só "X notas selecionadas" — toda a competência volta para `aberta`, mas as classificações ficam intactas.

## Pergunta rápida

O item 4 (badge "editada") faz sentido para você ou prefere deixar de fora por enquanto?