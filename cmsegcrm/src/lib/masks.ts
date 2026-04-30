// Máscaras de input para uso em formulários.
// Aplicação típica:
//   <input value={cpf} onChange={e => setCpf(maskCpfCnpj(e.target.value))} />
// As funções aceitam qualquer string (com ou sem máscara prévia) e devolvem o
// valor formatado dentro do limite do dígito.

function digits(v: string): string {
  return (v || '').replace(/\D/g, '')
}

export function maskCPF(v: string): string {
  const d = digits(v).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function maskCNPJ(v: string): string {
  const d = digits(v).slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

// Detecta automaticamente se é CPF ou CNPJ pelo número de dígitos
export function maskCpfCnpj(v: string): string {
  return digits(v).length <= 11 ? maskCPF(v) : maskCNPJ(v)
}

export function maskTelefone(v: string): string {
  const d = digits(v).slice(0, 11)
  if (d.length <= 10) {
    // Fixo: (00) 0000-0000
    return d
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  // Celular: (00) 00000-0000
  return d
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

export function maskCEP(v: string): string {
  return digits(v).slice(0, 8).replace(/(\d{5})(\d{1,3})$/, '$1-$2')
}

// Placa Mercosul (AAA0A00) ou tradicional (AAA-0000). Aceita ambas.
export function maskPlaca(v: string): string {
  const cleaned = (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
  if (cleaned.length <= 3) return cleaned
  return cleaned.slice(0, 3) + '-' + cleaned.slice(3)
}

// Formato de moeda BRL para exibição: 1234.5 → "1.234,50"
export function formatMoney(n: number | string | null | undefined, decimals = 2): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n || 0)
  if (isNaN(num)) return '0,00'
  return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// Versões sem máscara (para gravar no banco)
export function unmask(v: string): string {
  return digits(v)
}
