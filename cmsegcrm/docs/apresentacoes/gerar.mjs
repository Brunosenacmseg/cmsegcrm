#!/usr/bin/env node
// Gera, para cada módulo definido em modulos.json:
//  - <slug>.html         → apresentação de slides individual (auto-contida)
//  - <slug>.storyboard.md → roteiro cena-a-cena para gravar o vídeo
// Uso:  node docs/apresentacoes/gerar.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const modulos = JSON.parse(readFileSync(join(here, "modulos.json"), "utf8"));

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

const slidesHtml = (m) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${esc(m.titulo)} — Apresentação</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #0b1020; color: #e8ecf8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif; }
  .deck { scroll-snap-type: y mandatory; overflow-y: scroll; height: 100vh; }
  .slide { scroll-snap-align: start; min-height: 100vh; padding: 6vh 8vw; display: flex; flex-direction: column; justify-content: center; border-bottom: 1px solid #1a2240; }
  .slide.title { background: linear-gradient(135deg, #1c2a6b 0%, #0b1020 100%); }
  .eyebrow { letter-spacing: .2em; font-size: 12px; color: #8aa0ff; text-transform: uppercase; margin-bottom: 14px; }
  h1 { font-size: clamp(28px, 5vw, 56px); margin: 0 0 16px; line-height: 1.1; }
  h2 { font-size: clamp(22px, 3.2vw, 36px); margin: 0 0 20px; color: #fff; }
  p, li { font-size: clamp(16px, 1.6vw, 20px); line-height: 1.55; }
  ul { padding-left: 1.2em; }
  li { margin: .35em 0; }
  .meta { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 24px; }
  .pill { background: #182154; padding: 8px 14px; border-radius: 999px; font-size: 14px; color: #c9d2ff; }
  .nav { position: fixed; right: 14px; bottom: 14px; background: rgba(0,0,0,.4); padding: 8px 12px; border-radius: 8px; font-size: 12px; color: #c9d2ff; }
  .footer { position: fixed; left: 14px; bottom: 14px; font-size: 12px; color: #6f7bb0; }
  @media print {
    .deck { overflow: visible; height: auto; }
    .slide { page-break-after: always; min-height: 100vh; border: none; }
    .nav, .footer { display: none; }
  }
</style>
</head>
<body>
<div class="deck">
  <section class="slide title">
    <div class="eyebrow">CRM • Apresentação por módulo</div>
    <h1>${esc(m.titulo)}</h1>
    <p>Visão geral, fluxos e boas práticas.</p>
    <div class="meta">
      <span class="pill">Público-alvo: ${esc(m.responsavel)}</span>
    </div>
  </section>

  <section class="slide">
    <div class="eyebrow">Objetivo</div>
    <h2>Para que serve este módulo</h2>
    <p>${esc(m.objetivo)}</p>
  </section>

  <section class="slide">
    <div class="eyebrow">Telas principais</div>
    <h2>O que você verá na tela</h2>
    <ul>${m.telas.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
  </section>

  <section class="slide">
    <div class="eyebrow">Fluxos</div>
    <h2>Como se usa no dia a dia</h2>
    <ul>${m.fluxos.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
  </section>

  <section class="slide">
    <div class="eyebrow">Campos importantes</div>
    <h2>O que preencher</h2>
    <ul>${m.campos.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
  </section>

  <section class="slide">
    <div class="eyebrow">Boas práticas</div>
    <h2>Dicas e cuidados</h2>
    <ul>${m.dicas.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
  </section>

  <section class="slide title">
    <div class="eyebrow">Próximos passos</div>
    <h1>Dúvidas?</h1>
    <p>Vamos abrir o sistema e percorrer juntos cada tela do módulo <strong>${esc(m.titulo)}</strong>.</p>
  </section>
</div>
<div class="nav">↓ rolar / setas / Page Down</div>
<div class="footer">cmsegcrm — ${esc(m.titulo)}</div>
</body>
</html>
`;

const storyboard = (m) => `# Storyboard — ${m.titulo}

> Roteiro cena-a-cena para gravar o vídeo explicativo deste módulo.
> Público-alvo: **${m.responsavel}**. Duração sugerida: **4–6 minutos**.

---

## Cena 1 — Abertura (0:00 – 0:20)
- **Tela:** card de abertura com o nome do módulo.
- **Narração:** "Olá! Neste vídeo vamos conhecer o módulo **${m.titulo}** do CRM. Ele é voltado principalmente para a área de ${m.responsavel}."
- **Ação:** mostrar logo/título.

## Cena 2 — Objetivo (0:20 – 0:50)
- **Tela:** slide "Objetivo".
- **Narração:** "${m.objetivo}"
- **Ação:** destacar a frase-chave em tela.

## Cena 3 — Onde encontrar (0:50 – 1:20)
- **Tela:** dashboard do CRM, clicar no menu lateral em **${m.titulo}**.
- **Narração:** "No menu lateral, acesse **${m.titulo}**. Você verá a tela inicial do módulo."
- **Ação:** gravar o clique e a transição.

## Cena 4 — Telas principais (1:20 – 2:30)
- **Tela:** percorrer cada tela do módulo.
- **Narração:** "As principais telas são:"
${m.telas.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}
- **Ação:** mostrar cada uma rapidamente, com zoom nos detalhes.

## Cena 5 — Fluxos no dia a dia (2:30 – 4:00)
- **Tela:** demonstrar passo a passo.
- **Narração:** "No dia a dia, os fluxos mais comuns são:"
${m.fluxos.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}
- **Ação:** executar cada fluxo na tela real.

## Cena 6 — Campos importantes (4:00 – 4:40)
- **Tela:** formulário de cadastro/edição.
- **Narração:** "Atenção aos campos: ${m.campos.join(", ")}."
- **Ação:** destacar cada campo com um pequeno highlight.

## Cena 7 — Boas práticas (4:40 – 5:30)
- **Tela:** lista de dicas.
- **Narração:** "Algumas boas práticas que recomendamos:"
${m.dicas.map((t) => `  - ${t}`).join("\n")}

## Cena 8 — Encerramento (5:30 – 6:00)
- **Tela:** slide final.
- **Narração:** "Esse foi o módulo **${m.titulo}**. Qualquer dúvida, fale com a equipe responsável. Até o próximo vídeo!"
- **Ação:** card final com contato/suporte.

---

## Checklist de gravação
- [ ] Limpar dados sensíveis da tela (LGPD).
- [ ] Usar conta de demonstração, não conta real.
- [ ] Gravar em 1080p, microfone com pop filter.
- [ ] Cortar silêncios > 1s na edição.
- [ ] Incluir legenda em PT-BR.
`;

for (const m of modulos) {
  writeFileSync(join(here, `${m.slug}.html`), slidesHtml(m));
  writeFileSync(join(here, `${m.slug}.storyboard.md`), storyboard(m));
  console.log("ok:", m.slug);
}

// índice
const index = `# Apresentações por módulo

Cada módulo do CRM tem:
- \`<slug>.html\` — apresentação de slides (abrir no navegador, basta scrollar)
- \`<slug>.storyboard.md\` — roteiro cena-a-cena para gravar o vídeo

## Como regenerar
\`\`\`bash
node docs/apresentacoes/gerar.mjs
\`\`\`

## Módulos

${modulos.map((m) => `- **${m.titulo}** (\`${m.responsavel}\`) — [slides](./${m.slug}.html) · [storyboard](./${m.slug}.storyboard.md)`).join("\n")}
`;
writeFileSync(join(here, "README.md"), index);
console.log("ok: README.md");
