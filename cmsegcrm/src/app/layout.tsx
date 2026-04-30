import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CM.segCRM',
  description: 'CRM para Corretora de Seguros',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
