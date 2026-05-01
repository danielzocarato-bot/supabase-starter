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

interface CompetenciaProntaProps {
  nome?: string
  razaoSocial?: string
  periodoLabel?: string
  totalNotas?: number
  ctaUrl?: string
}

const CompetenciaProntaEmail = ({
  nome,
  razaoSocial,
  periodoLabel,
  totalNotas,
  ctaUrl,
}: CompetenciaProntaProps) => {
  const empresa = razaoSocial || 'Sua contabilidade'
  const periodo = periodoLabel || 'a nova competência'
  const url = ctaUrl || 'https://classifica.acrux-group.com.br/app/cliente'
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>
        {empresa} enviou {totalNotas ?? ''} notas para você classificar
      </Preview>
      <AcruxShell>
        <h1 style={h1}>Sua competência está pronta para classificar</h1>
        <p style={text}>
          Olá{nome ? `, ${nome}` : ''}. A {empresa} concluiu a importação das notas
          fiscais do período de <strong>{periodo}</strong> e está pronta para que
          você valide a classificação com segurança.
        </p>
        {typeof totalNotas === 'number' && totalNotas > 0 && (
          <div style={statBox}>
            <p style={statLabel}>Notas aguardando classificação</p>
            <p style={statValue}>{totalNotas}</p>
          </div>
        )}
        <p style={text}>
          Acesse a plataforma para revisar cada nota e selecionar o acumulador
          correto. Tudo é salvo com segurança a cada classificação.
        </p>
        <Button style={button} href={url}>Classificar agora</Button>
        <p style={textMuted}>
          Se algo precisa de atenção em alguma nota, sinalize diretamente para sua
          contabilidade dentro da plataforma.
        </p>
      </AcruxShell>
    </Html>
  )
}

export const template = {
  component: CompetenciaProntaEmail,
  subject: (data: Record<string, any>) => {
    const total = data?.totalNotas
    if (typeof total === 'number') {
      return `Sua contabilidade enviou ${total} notas para classificar`
    }
    return 'Sua contabilidade enviou novas notas para classificar'
  },
  displayName: 'Competência pronta (cliente)',
  previewData: {
    nome: 'Daniel',
    razaoSocial: 'Acrux Contabilidade Ltda',
    periodoLabel: 'Outubro / 2025',
    totalNotas: 42,
    ctaUrl: 'https://classifica.acrux-group.com.br/app/cliente/competencias/abc-123',
  },
} satisfies TemplateEntry
