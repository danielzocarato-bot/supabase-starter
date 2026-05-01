## O que confirmei
- Hoje existe **1 perfil** no ambiente e ele ainda está como **`cliente`**.
- Não há nenhum perfil com papel **`escritorio`** no banco neste momento.
- A função de promoção existe, mas como o fluxo está instável, o jeito mais seguro para te destravar é **converter diretamente a sua conta atual no backend** e depois validar o redirecionamento.

## Plano
1. **Destravar sua conta imediatamente**
   - Atualizar o seu perfil atual para `role = 'escritorio'`.
   - Limpar `cliente_id` desse perfil, para ele ficar coerente com papel de escritório.
   - Confirmar no banco que sua conta foi convertida com sucesso.

2. **Validar o acesso após a conversão**
   - Garantir que, ao entrar novamente, você seja enviado para `/app/escritorio`.
   - Verificar se o bloqueio por papel (`RequireRole`) passa a liberar as rotas de escritório normalmente.

3. **Checar o fluxo de bootstrap para não quebrar de novo**
   - Revisar se o botão **“Promover usuário a escritório”** continua aparecendo apenas quando não existe escritório.
   - Confirmar que o redirecionamento automático da tela de login não volta a empurrar um usuário recém-criado para `/app/cliente` antes da promoção.
   - Se necessário, ajustar apenas o mínimo para estabilizar o fluxo sem mexer no restante da autenticação.

## Resultado esperado
- Sua conta atual passa a ser **escritório**.
- O login deixa de cair no painel de cliente.
- O bootstrap inicial fica consistente até existir o primeiro escritório.

## Detalhes técnicos
- Isso exige **atualização de dados existentes**, não mudança estrutural do banco.
- Portanto, a correção principal é uma **mutação no perfil atual** e uma nova validação do fluxo.
- Não pretendo habilitar cadastro público nem alterar a regra de segurança do bootstrap.

Se você aprovar, eu faço a conversão da sua conta e em seguida valido o fluxo completo.