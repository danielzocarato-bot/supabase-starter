/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as competenciaPronta } from './competencia-pronta.tsx'
import { template as competenciaConcluida } from './competencia-concluida.tsx'
import { template as competenciaReaberta } from './competencia-reaberta.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'competencia-pronta': competenciaPronta,
  'competencia-concluida': competenciaConcluida,
  'competencia-reaberta': competenciaReaberta,
}
