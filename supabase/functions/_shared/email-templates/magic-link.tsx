/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Head, Html, Preview, Button } from 'npm:@react-email/components@0.0.22'
import { AcruxShell, h1, text, textMuted, button } from './_acrux-shell.tsx'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu link de acesso à plataforma</Preview>
    <AcruxShell>
      <h1 style={h1}>Seu link de acesso</h1>
      <p style={text}>
        Use o botão abaixo para entrar na plataforma com segurança. O link é de uso
        único e expira em poucos minutos.
      </p>
      <Button style={button} href={confirmationUrl}>Acessar plataforma</Button>
      <p style={textMuted}>
        Se você não solicitou este link, ignore esta mensagem.
      </p>
    </AcruxShell>
  </Html>
)

export default MagicLinkEmail
