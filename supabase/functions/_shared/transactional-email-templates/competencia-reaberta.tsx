/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Head, Html, Preview, Button } from 'npm:@react-email/components@0.0.22'
import {
  AcruxShell,
  h1,
  text,
  textMuted,
  button,
} from './_acrux-shell.tsx'
import type { TemplateEntry } from './registry.ts'

interface CompetenciaReabertaProps {
  nome?: string
  periodoLabel?: string
  ctaUrl?: string
}

const CompetenciaReabertaEmail = ({
  nome,
  periodoLabel,
  ctaUrl,
}: CompetenciaReabertaProps) => {
  const periodo = periodoLabel || 'a competência'
  const url = ctaUrl || 'https://classifica.acrux-group.com.br/app/cliente'
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Reabrimos {periodo} para ajustes</Preview>
      <AcruxShell>
        <h1 style={h1}>Competência reaberta para ajustes</h1>
        <p style={text}>
          Olá{nome ? `, ${nome}` : ''}. Sua contabilidade reabriu a competência de{' '}
          <strong>{periodo}</strong> para ajustar a classificação de algumas notas.
        </p>
        <p style={text}>
          Quando finalizar a revisão, marque a competência como concluída novamente
          para que possamos gerar o arquivo de importação no formato Domínio com
          segurança.
        </p>
        <Button style={button} href={url}>Revisar classificação</Button>
        <p style={textMuted}>
          Se algo precisa de atenção, fale diretamente com sua contabilidade.
        </p>
      </AcruxShell>
    </Html>
  )
}

export const template = {
  component: CompetenciaReabertaEmail,
  subject: (data: Record<string, any>) => {
    const periodo = data?.periodoLabel || 'a competência'
    return `Reabrimos a competência de ${periodo} para ajustes`
  },
  displayName: 'Competência reaberta (cliente)',
  previewData: {
    nome: 'Daniel',
    periodoLabel: 'Outubro / 2025',
    ctaUrl: 'https://classifica.acrux-group.com.br/app/cliente/competencias/abc-123',
  },
} satisfies TemplateEntry
