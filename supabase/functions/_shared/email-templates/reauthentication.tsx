/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Head, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import { AcruxShell, h1, text, textMuted, codeBox } from './_acrux-shell.tsx'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de validação</Preview>
    <AcruxShell>
      <h1 style={h1}>Confirme sua identidade</h1>
      <p style={text}>
        Use o código abaixo para validar sua sessão na plataforma:
      </p>
      <Text style={codeBox}>{token}</Text>
      <p style={textMuted}>
        Este código expira em poucos minutos. Se você não pediu essa validação,
        ignore esta mensagem.
      </p>
    </AcruxShell>
  </Html>
)

export default ReauthenticationEmail
