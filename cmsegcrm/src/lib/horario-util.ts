// Cálculo de "hora útil" para o SDR SUHAI.
// Definição (conforme alinhado): janela 8:30–18:00 BRT, todos os dias da
// semana (inclui sábado/domingo). Sem checagem de feriados.
//
// Se a hora de entrada está fora da janela, "pula" para o próximo 8:30.
// Adicionar N horas úteis = soma N * 60 minutos de tempo dentro da janela.

const TZ = 'America/Sao_Paulo'

const ABERTURA_HH = 8
const ABERTURA_MM = 30
const FECHAMENTO_HH = 18
const FECHAMENTO_MM = 0

// Retorna {hora, minuto} no fuso BRT da Date d.
function partesBRT(d: Date): { y: number; m: number; dia: number; hh: number; mm: number; ss: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = fmt.formatToParts(d).reduce((acc: any, p) => { acc[p.type] = p.value; return acc }, {} as any)
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    dia: Number(parts.day),
    hh: Number(parts.hour === '24' ? '0' : parts.hour),
    mm: Number(parts.minute),
    ss: Number(parts.second),
  }
}

// Constrói uma Date UTC equivalente a Y-M-D HH:MM:00 no fuso BRT.
// O offset BRT é -03:00 (sem horário de verão desde 2019).
function dataBRT(y: number, m: number, dia: number, hh: number, mm: number): Date {
  // ISO com offset explícito: o motor JS converte sozinho pra UTC.
  const iso = `${y}-${String(m).padStart(2,'0')}-${String(dia).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00-03:00`
  return new Date(iso)
}

// Soma N horas úteis (8:30-18:00 BRT) a uma Date.
// Se start está fora da janela, alinha para o próximo 8:30 antes de somar.
export function horarioUtilAdd(start: Date, horas: number): Date {
  if (!Number.isFinite(horas) || horas <= 0) return start
  let restanteMs = horas * 60 * 60 * 1000
  let cursor = new Date(start.getTime())

  while (restanteMs > 0) {
    const p = partesBRT(cursor)
    const inicioJanela = dataBRT(p.y, p.m, p.dia, ABERTURA_HH, ABERTURA_MM)
    const fimJanela    = dataBRT(p.y, p.m, p.dia, FECHAMENTO_HH, FECHAMENTO_MM)

    if (cursor.getTime() < inicioJanela.getTime()) {
      // Antes da abertura → pula pra abertura do mesmo dia
      cursor = inicioJanela
      continue
    }
    if (cursor.getTime() >= fimJanela.getTime()) {
      // Depois do fechamento → próximo dia 8:30
      const proximo = new Date(fimJanela.getTime() + 24*60*60*1000)
      const pn = partesBRT(proximo)
      cursor = dataBRT(pn.y, pn.m, pn.dia, ABERTURA_HH, ABERTURA_MM)
      continue
    }

    // Dentro da janela: gasta o que dá no resto do dia
    const ateFim = fimJanela.getTime() - cursor.getTime()
    if (restanteMs <= ateFim) {
      return new Date(cursor.getTime() + restanteMs)
    }
    restanteMs -= ateFim
    cursor = fimJanela // termina o dia, loop continua
  }
  return cursor
}
