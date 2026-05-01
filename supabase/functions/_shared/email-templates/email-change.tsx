/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Head, Html, Preview, Button, Link } from 'npm:@react-email/components@0.0.22'
import { AcruxShell, h1, text, textMuted, button, link } from './_acrux-shell.tsx'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme a alteração do seu e-mail de acesso</Preview>
    <AcruxShell>
      <h1 style={h1}>Confirme a troca de e-mail</h1>
      <p style={text}>
        Você solicitou alterar seu e-mail de acesso de{' '}
        <Link href={`mailto:${oldEmail}`} style={link}>{oldEmail}</Link> para{' '}
        <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
      </p>
      <p style={text}>
        Para validar essa alteração com segurança, clique abaixo:
      </p>
      <Button style={button} href={confirmationUrl}>Confirmar alteração</Button>
      <p style={textMuted}>
        Se você não fez esse pedido, algo precisa de atenção — proteja sua conta
        alterando a senha imediatamente.
      </p>
    </AcruxShell>
  </Html>
)

export default EmailChangeEmail
