/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Head, Html, Preview, Button } from 'npm:@react-email/components@0.0.22'
import { AcruxShell, h1, text, textMuted, button } from './_acrux-shell.tsx'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Redefina sua senha de acesso</Preview>
    <AcruxShell>
      <h1 style={h1}>Redefinir senha</h1>
      <p style={text}>
        Recebemos um pedido para redefinir a senha da sua conta. Para sua segurança,
        este link é de uso único e expira em pouco tempo.
      </p>
      <Button style={button} href={confirmationUrl}>Definir nova senha</Button>
      <p style={textMuted}>
        Se você não pediu essa alteração, ignore este e-mail — sua senha continua a mesma.
        Se algo precisa de atenção, fale com a sua contabilidade.
      </p>
    </AcruxShell>
  </Html>
)

export default RecoveryEmail
