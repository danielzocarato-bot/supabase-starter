/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Head, Html, Preview, Button, Link } from 'npm:@react-email/components@0.0.22'
import { AcruxShell, h1, text, textMuted, button, link } from './_acrux-shell.tsx'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme seu acesso à plataforma Acrux</Preview>
    <AcruxShell>
      <h1 style={h1}>Confirme seu acesso com segurança</h1>
      <p style={text}>
        Olá. Recebemos uma solicitação para criar seu acesso à {siteName} usando o
        e-mail <Link href={`mailto:${recipient}`} style={link}>{recipient}</Link>.
      </p>
      <p style={text}>
        Para validar a identidade e liberar a plataforma, confirme seu e-mail:
      </p>
      <Button style={button} href={confirmationUrl}>Confirmar acesso</Button>
      <p style={textMuted}>
        Se você não solicitou este acesso, ignore esta mensagem — nada será criado.
      </p>
    </AcruxShell>
  </Html>
)

export default SignupEmail
