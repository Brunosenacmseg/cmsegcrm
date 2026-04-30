// Logger simples com timestamp e nível. Escreve em stdout (PM2 captura)
// e opcionalmente num arquivo se LOG_DIR estiver setado.

const fs   = require('fs')
const path = require('path')

const LOG_DIR = process.env.LOG_DIR
let logStream = null

if (LOG_DIR) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    const file = path.join(LOG_DIR, `robo-${new Date().toISOString().slice(0,10)}.log`)
    logStream = fs.createWriteStream(file, { flags: 'a' })
  } catch (err) {
    console.error('[log] não foi possível abrir arquivo de log:', err.message)
  }
}

function write(level, msg, extra) {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${level}] ${msg}` + (extra ? ' ' + JSON.stringify(extra) : '')
  console.log(line)
  if (logStream) logStream.write(line + '\n')
}

module.exports = {
  info:  (m, e) => write('INFO',  m, e),
  warn:  (m, e) => write('WARN',  m, e),
  error: (m, e) => write('ERROR', m, e),
  debug: (m, e) => process.env.NODE_ENV !== 'production' && write('DEBUG', m, e),
}
