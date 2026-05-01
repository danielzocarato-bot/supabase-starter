/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Head, Html, Preview, Button } from 'npm:@react-email/components@0.0.22'
import { AcruxShell, h1, text, textMuted, button } from './_acrux-shell.tsx'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, confirmationUrl }: InviteEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Sua contabilidade convidou você para a plataforma</Preview>
    <AcruxShell>
      <h1 style={h1}>Você foi convidado para a {siteName}</h1>
      <p style={text}>
        Sua contabilidade configurou um acesso para que você valide as classificações
        fiscais da sua empresa diretamente na plataforma — com mais controle e segurança.
      </p>
      <p style={text}>
        Para concluir o convite e definir sua senha, acesse:
      </p>
      <Button style={button} href={confirmationUrl}>Aceitar convite</Button>
      <p style={textMuted}>
        Se você não esperava este convite, pode ignorar com tranquilidade.
      </p>
    </AcruxShell>
  </Html>
)

export default InviteEmail
