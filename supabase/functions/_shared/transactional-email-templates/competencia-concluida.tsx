/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Head, Html, Preview, Button } from 'npm:@react-email/components@0.0.22'
import {
  AcruxShell,
  h1,
  text,
  textMuted,
  button,
  statBox,
  statLabel,
  statValue,
} from './_acrux-shell.tsx'
import type { TemplateEntry } from './registry.ts'

interface CompetenciaConcluidaProps {
  nomeCliente?: string
  razaoSocial?: string
  periodoLabel?: string
  totalNotas?: number
  ctaUrl?: string
}

const CompetenciaConcluidaEmail = ({
  nomeCliente,
  razaoSocial,
  periodoLabel,
  totalNotas,
  ctaUrl,
}: CompetenciaConcluidaProps) => {
  const empresa = razaoSocial || 'O cliente'
  const quem = nomeCliente || empresa
  const periodo = periodoLabel || 'a competência'
  const url = ctaUrl || 'https://classifica.acrux-group.com.br/app/escritorio'
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{empresa} validou a classificação de {periodo}</Preview>
      <AcruxShell>
        <h1 style={h1}>Classificação validada com segurança</h1>
        <p style={text}>
          <strong>{quem}</strong> acabou de marcar como concluída a competência de{' '}
          <strong>{periodo}</strong>. A classificação foi validada pelo cliente e o
          arquivo de importação no formato Domínio já pode ser gerado.
        </p>
        {typeof totalNotas === 'number' && totalNotas > 0 && (
          <div style={statBox}>
            <p style={statLabel}>Notas classificadas</p>
            <p style={statValue}>{totalNotas}</p>
          </div>
        )}
        <p style={text}>
          Próximo passo: gerar o arquivo TXT no Leiaute 18 e importar no Domínio.
        </p>
        <Button style={button} href={url}>Gerar arquivo Domínio</Button>
        <p style={textMuted}>
          Se algo precisa de atenção, você pode reabrir a competência diretamente
          na tela de classificação.
        </p>
      </AcruxShell>
    </Html>
  )
}

export const template = {
  component: CompetenciaConcluidaEmail,
  subject: (data: Record<string, any>) => {
    const empresa = data?.razaoSocial || 'O cliente'
    const periodo = data?.periodoLabel || 'a competência'
    return `${empresa} validou a classificação de ${periodo}`
  },
  displayName: 'Competência concluída (escritório)',
  previewData: {
    nomeCliente: 'Daniel Zocarato',
    razaoSocial: 'Empresa Exemplo Ltda',
    periodoLabel: 'Outubro / 2025',
    totalNotas: 42,
    ctaUrl: 'https://classifica.acrux-group.com.br/app/escritorio/competencias/abc-123',
  },
} satisfies TemplateEntry
