#!/usr/bin/env node
// Gera migration SQL com import de despesas (jan-abr/2026) + faturamento.
// Lê TSVs em ./data/, escreve em cmsegcrm/supabase/migrations/016_import_dre_jan_abr_2026.sql

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const outFile = path.resolve(__dirname, '../../cmsegcrm/supabase/migrations/016_import_dre_jan_abr_2026.sql');

// ─────────── Helpers ───────────
const sqlStr = (s) => s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;
const sqlNum = (n) => n == null ? 'NULL' : Number(n).toFixed(2);

function parseBRL(s) {
  if (!s) return 0;
  const t = String(s).replace(/R\$/g, '').replace(/\s/g, '').trim();
  if (!t || t === '-') return 0;
  const n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function parseDate(s, fallbackYear, fallbackMonth) {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  // formato dd/mm/yy ou dd/mm/yyyy
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // formato dd/mm (usa fallback year/month do vencimento)
  m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m && fallbackYear) {
    const [, d, mo] = m;
    return `${fallbackYear}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
}

function normalizeTipo(s) {
  if (!s) return null;
  const t = String(s).trim().toUpperCase();
  if (t.startsWith('FIX')) return 'FIXA';
  if (t.startsWith('VAR')) return 'VARIÁVEL';
  return null;
}

function normalizeForma(s) {
  if (!s) return null;
  return String(s).trim().toUpperCase().replace(/\s+/g, ' ');
}

// extrai código e descrição limpa
function splitCode(desc) {
  const t = desc.trim();
  // typo MPRESA → EMPRESA
  const cleaned = t.replace(/\bMPRESA\b/g, 'EMPRESA');
  // 5.4 → 5.4.01
  let m = cleaned.match(/^(\d+\.\d+\.\d+)\s+(.+)$/);
  if (m) return { codigo: m[1], descricao: m[2].trim() };
  m = cleaned.match(/^(\d+\.\d+)\s+(.+)$/);
  if (m) {
    const codigo = m[1] === '5.4' ? '5.4.01' : `${m[1]}.01`;
    return { codigo, descricao: m[2].trim() };
  }
  return { codigo: null, descricao: cleaned };
}

// ─────────── Parse TSVs ───────────
function parseTSV(file, mesYear, mesNum) {
  const txt = fs.readFileSync(path.join(dataDir, file), 'utf8');
  const linhas = [];
  for (const raw of txt.split('\n')) {
    if (!raw.trim()) continue;
    const cols = raw.split('\t');
    if (cols.length < 8) continue;
    const [descRaw, tipoRaw, formaRaw, condRaw, vencRaw, pgtoRaw, progRaw, realRaw] = cols;
    const valor = parseBRL(realRaw);
    if (valor <= 0) continue; // pula sem valor real
    const venc = parseDate(vencRaw);
    const fyYear = venc ? venc.slice(0,4) : mesYear;
    const fyMonth = venc ? venc.slice(5,7) : String(mesNum).padStart(2,'0');
    const pgto = parseDate(pgtoRaw, fyYear, fyMonth);
    const { codigo, descricao } = splitCode(descRaw);
    linhas.push({
      codigo, descricao,
      tipo: normalizeTipo(tipoRaw),
      forma: normalizeForma(formaRaw),
      condicao: (condRaw || '').trim() || null,
      data_vencimento: venc,
      data_pgto: pgto,
      valor_previsto: parseBRL(progRaw) || null,
      valor,
      competencia: `${mesYear}-${String(mesNum).padStart(2,'0')}`,
    });
  }
  return linhas;
}

const meses = [
  { file: 'jan-despesas.tsv', y: '2026', m: 1 },
  { file: 'fev-despesas.tsv', y: '2026', m: 2 },
  { file: 'mar-despesas.tsv', y: '2026', m: 3 },
  { file: 'abr-despesas.tsv', y: '2026', m: 4 },
];

const todasDespesas = [];
for (const mes of meses) todasDespesas.push(...parseTSV(mes.file, mes.y, mes.m));

// ─────────── Inferir códigos faltantes (janeiro) ───────────
// Mapa: descrição (uppercase, sem CNPJ) → código mais comum
function chave(d) {
  return d.toUpperCase()
    .replace(/\([^)]*\)/g, '')   // remove tudo entre parênteses (CNPJ/razão social)
    .replace(/\s+/g, ' ')
    .trim();
}
const descToCode = new Map();
for (const d of todasDespesas) {
  if (!d.codigo) continue;
  const k = chave(d.descricao);
  if (!descToCode.has(k)) descToCode.set(k, d.codigo);
}
let inferidos = 0, semCodigo = 0;
for (const d of todasDespesas) {
  if (d.codigo) continue;
  const k = chave(d.descricao);
  if (descToCode.has(k)) {
    d.codigo = descToCode.get(k);
    d.codigo_inferido = true;
    inferidos++;
  } else {
    semCodigo++;
  }
}

// ─────────── Coletar categorias únicas ───────────
const categorias = new Map(); // codigo -> { codigo, nome }
for (const d of todasDespesas) {
  if (!d.codigo) continue;
  if (!categorias.has(d.codigo)) {
    // nome canônico = primeira descrição limpa que aparecer
    const nome = d.descricao.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    categorias.set(d.codigo, { codigo: d.codigo, nome });
  }
}

// ─────────── Faturamento ───────────
const fat = JSON.parse(fs.readFileSync(path.join(dataDir, 'faturamento.json'), 'utf8'));

// ─────────── Gerar SQL ───────────
const lines = [];
lines.push('-- ─────────────────────────────────────────────────────────────');
lines.push('-- 016_import_dre_jan_abr_2026.sql');
lines.push('-- Importa despesas e faturamento de jan-abr/2026 (gerado por script).');
lines.push(`-- Total despesas: ${todasDespesas.length} — inferidas: ${inferidos} — sem código: ${semCodigo}`);
lines.push('-- ─────────────────────────────────────────────────────────────');
lines.push('');
lines.push('-- 1) Permitir vendedor_id NULL em comissoes_recebidas (faturamento DRE não é por vendedor)');
lines.push('alter table public.comissoes_recebidas alter column vendedor_id drop not null;');
lines.push('');
lines.push('-- 2) Coluna valor_previsto em despesas (planejado da planilha)');
lines.push('alter table public.financeiro_despesas add column if not exists valor_previsto numeric(12,2);');
lines.push('');
lines.push('-- 3) Categorias (cria se não existir; nome conforme primeira ocorrência)');
const sortedCats = [...categorias.values()].sort((a,b) => a.codigo.localeCompare(b.codigo));
for (const c of sortedCats) {
  lines.push(`insert into public.financeiro_categorias (codigo, nome, tipo) values (${sqlStr(c.codigo)}, ${sqlStr(c.nome)}, 'despesa') on conflict (codigo) do nothing;`);
}
lines.push('');
lines.push('-- 4) Despesas');
lines.push('-- Idempotência: deleta lançamentos previamente importados via origem=importacao_dre_2026');
lines.push("alter table public.financeiro_despesas add column if not exists origem_import text;");
lines.push("delete from public.financeiro_despesas where origem_import = 'dre_2026_jan_abr';");
lines.push('');
for (const d of todasDespesas) {
  const obs = d.codigo_inferido ? `código inferido de fevereiro` : (d.codigo ? null : 'sem código de plano de contas');
  const cols = [
    `categoria_id = (select id from public.financeiro_categorias where codigo = ${sqlStr(d.codigo)})`,
  ];
  lines.push(
    `insert into public.financeiro_despesas (categoria_id, descricao, valor, valor_previsto, data, data_vencimento, data_pgto, competencia, tipo_despesa, forma_pagto, condicao, obs, origem_import) values (` +
    `${d.codigo ? `(select id from public.financeiro_categorias where codigo = ${sqlStr(d.codigo)})` : 'NULL'}, ` +
    `${sqlStr(d.descricao)}, ${sqlNum(d.valor)}, ${sqlNum(d.valor_previsto)}, ` +
    `${sqlStr(d.data_pgto || d.data_vencimento)}, ${sqlStr(d.data_vencimento)}, ${sqlStr(d.data_pgto)}, ` +
    `${sqlStr(d.competencia)}, ${sqlStr(d.tipo)}, ${sqlStr(d.forma)}, ${sqlStr(d.condicao)}, ${sqlStr(obs)}, 'dre_2026_jan_abr');`
  );
}
lines.push('');
lines.push('-- 5) Faturamento (comissoes_recebidas)');
lines.push("delete from public.comissoes_recebidas where origem = 'importacao' and obs = 'DRE 2026 jan-abr import';");
lines.push('');
const seg = fat.seguradoras;
for (const [comp, data] of Object.entries(fat.meses)) {
  const dataReceb = data.data_recebimento;
  for (const linha of data.linhas) {
    const [codigo, bruto, ir, outros = 0] = linha;
    const nomeSeg = seg[codigo] || codigo;
    lines.push(
      `insert into public.comissoes_recebidas (valor, ir_retido, outros_descontos, competencia, data_recebimento, seguradora, seguradora_codigo, status, origem, obs) values (` +
      `${sqlNum(bruto)}, ${sqlNum(ir)}, ${sqlNum(outros)}, ${sqlStr(comp)}, ${sqlStr(dataReceb)}, ${sqlStr(nomeSeg)}, ${sqlStr(codigo)}, 'recebido', 'importacao', 'DRE 2026 jan-abr import');`
    );
  }
}
lines.push('');
lines.push('-- Fim do import');

fs.writeFileSync(outFile, lines.join('\n'));
console.log(`✓ Wrote ${outFile}`);
console.log(`  ${todasDespesas.length} despesas, ${categorias.size} categorias, ${Object.values(fat.meses).reduce((s,m)=>s+m.linhas.length,0)} linhas faturamento`);
console.log(`  ${inferidos} códigos inferidos, ${semCodigo} sem código`);
