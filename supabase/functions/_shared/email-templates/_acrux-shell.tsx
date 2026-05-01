/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'

// Acrux brand tokens — mirror src/index.css
// --brand: 217 91% 35%  →  #0a4cb0 (approx HSL→HEX)
export const acrux = {
  brand: '#0a4cb0',
  brandSoft: '#eaf2fd',
  brandText: '#ffffff',
  ink: '#0f172a',
  inkMuted: '#475569',
  border: '#e2e8f0',
  bg: '#f7f8fb',
  card: '#ffffff',
  radius: '12px',
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}

export const main = {
  backgroundColor: '#ffffff',
  fontFamily: acrux.font,
  margin: 0,
  padding: 0,
}

export const outerContainer = {
  width: '100%',
  backgroundColor: acrux.bg,
  padding: '32px 16px',
}

export const card = {
  width: '100%',
  maxWidth: '560px',
  backgroundColor: acrux.card,
  borderRadius: acrux.radius,
  border: `1px solid ${acrux.border}`,
  boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)',
  margin: '0 auto',
  overflow: 'hidden' as const,
}

export const header = {
  backgroundColor: acrux.card,
  padding: '24px 32px 0',
}

export const wordmark = {
  fontFamily: acrux.font,
  fontSize: '15px',
  fontWeight: 700 as const,
  letterSpacing: '-0.01em',
  color: acrux.brand,
  margin: 0,
}

export const wordmarkSub = {
  fontFamily: acrux.font,
  fontSize: '12px',
  color: acrux.inkMuted,
  margin: '2px 0 0',
}

export const content = {
  padding: '24px 32px 8px',
}

export const h1 = {
  fontFamily: acrux.font,
  fontSize: '20px',
  fontWeight: 600 as const,
  color: acrux.ink,
  letterSpacing: '-0.01em',
  lineHeight: '1.3',
  margin: '0 0 16px',
}

export const text = {
  fontFamily: acrux.font,
  fontSize: '15px',
  color: acrux.ink,
  lineHeight: '1.6',
  margin: '0 0 16px',
}

export const textMuted = {
  fontFamily: acrux.font,
  fontSize: '13px',
  color: acrux.inkMuted,
  lineHeight: '1.55',
  margin: '0 0 12px',
}

export const button = {
  display: 'inline-block',
  backgroundColor: acrux.brand,
  color: acrux.brandText,
  fontFamily: acrux.font,
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '10px',
  padding: '12px 22px',
  textDecoration: 'none',
  margin: '8px 0 24px',
}

export const footerSection = {
  padding: '20px 32px 28px',
  backgroundColor: acrux.card,
  borderTop: `1px solid ${acrux.border}`,
}

export const footerText = {
  fontFamily: acrux.font,
  fontSize: '12px',
  color: acrux.inkMuted,
  lineHeight: '1.5',
  margin: 0,
  textAlign: 'center' as const,
}

export const link = {
  color: acrux.brand,
  textDecoration: 'underline',
}

export const codeBox = {
  fontFamily: "'SF Mono', Menlo, Monaco, Consolas, monospace",
  fontSize: '24px',
  fontWeight: 700 as const,
  letterSpacing: '0.18em',
  color: acrux.brand,
  backgroundColor: acrux.brandSoft,
  borderRadius: '8px',
  padding: '14px 18px',
  textAlign: 'center' as const,
  margin: '0 0 20px',
}

interface ShellProps {
  children: React.ReactNode
}

export const AcruxShell = ({ children }: ShellProps) => (
  <Body style={main}>
    <Section style={outerContainer}>
      <Container style={card}>
        <Section style={header}>
          <Text style={wordmark}>Acrux Contabilidade</Text>
          <Text style={wordmarkSub}>Plataforma de classificação fiscal</Text>
          <Hr style={{ borderColor: acrux.border, margin: '20px 0 0' }} />
        </Section>
        <Section style={content}>{children}</Section>
        <Section style={footerSection}>
          <Text style={footerText}>
            Acrux Contabilidade · uma forma mais inteligente de classificar suas notas
          </Text>
        </Section>
      </Container>
    </Section>
  </Body>
)
