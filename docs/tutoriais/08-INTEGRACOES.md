# 8. Integrações — Seguradoras, Meta Ads, RD Station

## 🛡️ Seguradoras (importação e sincronização)

### Para que serve
Cadastro das seguradoras parceiras e ponto único de **importação de dados** vindos delas: apólices, propostas, sinistros, inadimplência e comissões — em vários formatos (XLSX, CSV, XML, ZIP, RET, PDFs).

### Onde fica
Menu lateral → seção **Seguradoras → Seguradoras**.

### Quem pode usar
| Perfil | Acesso |
|---|---|
| Todos | Visualizar lista |
| Admin / EQUIPE GESTÃO | Adicionar, ativar/desativar, importar |

### Lista de seguradoras

- Tabela com nome e status (Ativo/Inativo).
- Busca por nome em tempo real.
- Toggle para mostrar/ocultar inativas.
- (Admin) Adicionar nova seguradora pelo input **`+ Nome da nova seguradora`**.
- Botão por linha para alternar status ativo/inativo.

### Detalhe da seguradora

Clique no nome → abre uma página com **6 abas**:

1. 📋 **Apólices** — importa apólices em XLSX/CSV/XML/PDF.
2. 📝 **Propostas** — importa propostas em XLSX/CSV/PDF.
3. 🆘 **Sinistros** — importa registros de sinistros.
4. 💸 **Inadimplência** — importa parcelas em atraso.
5. 💰 **Comissões** — importa extratos de comissão.
6. 🧾 **Relatório de clientes criados** — apólices que **criaram cliente automaticamente** (útil para conferir dados duplicados).

### Tipos de arquivo suportados (varia por seguradora)

- **XLSX / CSV** — formato genérico com mapeamento manual.
- **XML** — Tokio Marine.
- **ZIP** — Allianz (extrai e processa).
- **RET / .COM / .APP / .API** — Porto Seguro.
- **PDFs em lote** — Ezze e outras (extração automática de campos).

### Passo a passo — importar XLSX/CSV

1. Abra a aba do tipo de dado (ex: Apólices).
2. Selecione o arquivo.
3. O sistema **sugere o mapeamento** das colunas. Ajuste se necessário (dropdown por coluna do arquivo).
4. **`Ver Preview`** mostra os primeiros registros processados.
5. **`✓ Confirmar Importação`** — registros vão para "staging".
6. **`🔄 Sincronizar (X pendentes)`** — vincula a clientes (match por CPF/CNPJ ou nome), cria apólices/negócios.
7. Confira: **Sincronizados: X • Erros: Y**.

### Passo a passo — importar PDFs em lote

1. Selecione múltiplos arquivos `.pdf`.
2. Sistema processa um por um, mostrando progresso ("Processando 1/5: documento.pdf").
3. Para cada PDF, exibe o número de linhas extraídas e o layout reconhecido (ex: "Layout Ezze").
4. **`🔄 Sincronizar`** — registra no CRM.

### Tratar erros

Se algum registro foi para "Erro", clique **`Reenfileirar X erros`** para tentar processar de novo.

### Atalhos de menu

No menu lateral existem links rápidos:
- **Tokio Marine (WS)** — abre direto a página da Tokio com webservice.
- **Conectar Allianz / HDI** (em **Integrações** do menu).

### Tokio Marine (Webservice)

Página específica em **Seguradoras → Tokio Marine (WS)** com:

- **🔐 Testar Login** — valida credenciais e mostra validade do token.
- **7 serviços REST**: Apólice, Parcela, Comissão, Sinistro, Renovação, Pendência, Recusa.
- **Filtros**: data início, data fim, nº apólice.
- **`🌐 Buscar do Webservice`** ou **`📁 Enviar XML manualmente`**.
- Histórico das últimas 30 importações.

### Dicas
- Faça importações **mensais**, sempre na mesma data.
- Após importar apólices, rode **Apólices → Sincronizar clientes** para vincular registros órfãos.
- Use **Normalizar duplicatas** (em Apólices) se a mesma apólice aparecer mais de uma vez.

---

## 🔗 Conectar Meta (Facebook/Instagram Ads)

### Para que serve
Configurar a integração com **Meta Business** para sincronizar campanhas, capturar leads (Lead Ads) e enviar eventos de conversão (Conversions API).

### Onde fica
Menu lateral → seção **Integrações → Conectar Meta** (apenas admin).

### Pré-requisitos no Meta for Developers

1. Crie um app tipo **Business** em https://developers.facebook.com.
2. Adicione produtos: **Marketing API**, **Webhooks**.
3. Gere um **System User Access Token** (Marketing API → Tools → Access Token).
4. Anote `ad_account_id` (Ads Manager, formato `act_XXXXXXXXX`) e `page_id` (Página do Facebook).
5. Invente um `verify_token` (qualquer string segura, ex: `cmsegcrm_meta_xyz`).

### Configurar no CRM

1. Acesse **Conectar Meta**.
2. Cole **Access Token**, **ad_account_id**, **page_id**, **verify_token**.
3. Opcionalmente: **App ID**, **App Secret** (para refresh automático).
4. **`✓ Conectar`**. Status muda para **● Conectado**.

### Pixel + Conversions API

Para otimizar campanhas com eventos server-side:

1. Em Events Manager (Meta) crie um Pixel.
2. Cole o **Pixel ID** no campo correspondente.
3. Cole o **Conversions API Token** (Events Manager → Configurações → Acesso à API).
4. (Opcional) **Dataset ID**.
5. **`Salvar`**. O Pixel é injetado automaticamente nas páginas do CRM.

### Testar evento de conversão

- Botão **`🧪 Enviar evento de teste`** dispara um evento.
- Confira em Meta Events Manager → Test Events.

### Dicas
- O Verify Token é o **mesmo** que você cadastra no webhook da Meta — eles precisam bater.
- Eventos de conversão disparam automaticamente quando um negócio é marcado como **Ganho** no funil "META + MULTICANAL".

---

## 📣 Campanhas Meta

### Para que serve
Visualização e sincronização de campanhas Meta Ads, com KPIs (gasto, leads, vendas, ROAS).

### Onde fica
Menu lateral → seção **Marketing → Campanhas Meta** (apenas admin).

### Visão geral

- Botão **`🔄 Sincronizar`** — puxa todas as campanhas da conta.
- Botão **`⚙ Conectar Meta`** — atalho para a configuração.
- Filtros: Período (7/30/90 dias), Status (Ativas/Pausadas/Todas).
- KPIs: Gasto, Receita, ROAS, Leads, Vendas, CPL, CTR, Impressões.
- Tabela detalhada: campanha, status, gasto, impressões, CTR, leads, CPL, vendas, receita, ROAS.

### Passo a passo

1. Configure a integração em **Conectar Meta** (ver acima).
2. Clique **`🔄 Sincronizar`** — campanhas aparecem na lista.
3. Selecione período → analise KPIs.
4. Identifique campanhas com **ROAS baixo** (Receita ÷ Gasto < 1) e otimize ou pause.

### Dicas
- O ROAS é calculado a partir dos **negócios marcados como Ganho** que tiveram origem em uma campanha.
- Para isso funcionar, certifique-se de que o **funil "META + MULTICANAL"** está captando os leads corretamente.

---

## 🔁 RD Station CRM

### Para que serve
Sincronização **bidirecional** com o RD Station CRM via webhooks em tempo real (sem necessidade de tokens API). Suporta eventos: `deal_created`, `deal_updated`, `deal_won`, `deal_lost`, `contact_created`, `contact_updated`.

### Onde fica
Menu lateral → seção **Integrações → RD Station CRM** (apenas admin).

### Pré-requisitos

A variável de ambiente **`RDSTATION_WEBHOOK_SECRET`** precisa estar configurada no servidor (Vercel) com uma string forte (32+ caracteres). Após configurar, faça redeploy.

### Passo a passo

1. Em **RD Station CRM** no CRM:
   - **Copie a URL do webhook** (já vem com o secret embutido).
   - **`🔍 Testar webhook agora`** valida que está acessível.
2. No RD Station:
   - **Configurações → Integrações → Webhooks → Novo webhook**.
   - Cole a URL.
   - Selecione os eventos: `deal_created`, `deal_updated`, `deal_won`, `deal_lost`, `contact_created`, `contact_updated`.
   - Salvar.
3. Pronto. Qualquer movimentação no RD aparecerá no CRM em segundos.

### Importação inicial (uma vez)

Antes do webhook, é comum **importar tudo o que existe** no RD:

1. Configure `RDSTATION_CRM_TOKEN` (token de API do RD) no servidor.
2. Em **RD Station CRM** no CRM, clique **`Importar tudo`**. A ordem recomendada (já implementada) é: Usuários → Funis → Contatos → Negócios → Atividades.
3. A importação é **idempotente**: rode quantas vezes quiser; registros existentes (`rd_id`) são atualizados, não duplicados.

### Dicas
- Se renomear/recriar o secret, atualize o webhook no RD para a nova URL.
- O **Importar tudo** é seguro para rodar mensalmente como backup.

---

## 🌐 Tokio Marine (Webservice direto)

Já documentado em **Seguradoras**. Acesso direto via menu **Seguradoras → Tokio Marine (WS)**:

- Conecta diretamente no webservice da Tokio.
- 7 serviços REST: Apólice, Parcela, Comissão, Sinistro, Renovação, Pendência, Recusa.
- Importação por filtros (datas/nº apólice) ou XML manual.
- Histórico das últimas 30 importações.

Uso típico:
1. **🔐 Testar Login** confirma credenciais.
2. Escolha o serviço (ex: Comissão) → preencha filtros (mês de competência) → **`🌐 Buscar do Webservice`**.
3. Confira o resultado e os erros.

---

→ Próximo: [09-AUTOMACAO-IA.md](./09-AUTOMACAO-IA.md)
