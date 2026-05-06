# 3. Clientes, Apólices, Propostas e Renovações

## 👥 Clientes

### Para que serve
Repositório central de contatos: dados pessoais, endereços, telefones, e-mails, dados profissionais e bancários. Toda apólice/negócio é vinculado a um cliente.

### Onde fica
Menu lateral → **Clientes**.

### Quem pode usar
| Perfil | O que enxerga |
|---|---|
| Admin | Todos os clientes |
| Líder | Clientes da equipe + dele |
| Corretor | Apenas clientes vinculados a ele como vendedor |

Apenas **admin** pode excluir um cliente.

### Visão geral da tela

- Tabela paginada (50 por página) com: Nome, CPF/CNPJ, Telefone, E-mail, Vendedor.
- **Busca** por nome, CPF, telefone ou e-mail (com 350 ms de debounce).
- **Filtro por vendedor** (admin/líder).
- **Botão `+ Novo cliente`**.
- **Botão `📥 Exportar Excel`** (gera planilha com a lista filtrada).

### Modal de cadastro / edição — abas

| Aba | Campos |
|---|---|
| **Dados** | Tipo (PF/PJ), Nome, CPF/CNPJ, RG, Nascimento, Aniversário (não-civil), Sexo, Estado Civil |
| **Endereços** | 3 endereços (principal + 2 secundários): CEP, logradouro, número, complemento, bairro, cidade, UF |
| **Contato** | Até 3 telefones e 3 e-mails |
| **Profissional** | Profissão, ramo, renda mensal, vencimento da CNH, estipulantes, filial, parentesco, pasta do cliente (URL Drive) |
| **Sistema** | Cliente desde, Vendedor responsável, Ativo, Receber e-mail (newsletter) |
| **Obs** | Observação livre (textarea) |

### Passo a passo — criar cliente

1. Em **Clientes**, clique **`+ Novo cliente`**.
2. Aba **Dados**: preencha tipo, CPF (máscara automática), nome, nascimento.
3. Aba **Endereços**: digite o **CEP** e clique fora — o sistema consulta o ViaCEP e preenche logradouro, bairro, cidade e UF automaticamente.
4. Aba **Contato**: telefone (máscara automática) e e-mail.
5. Demais abas se houver dados profissionais ou observações.
6. **`✓ Criar Cliente`**.

> Se você não preencher o vendedor, o sistema atribui o cliente a você (usuário logado).

### Passo a passo — editar / excluir

- **Editar**: clique no nome do cliente na tabela → modal abre preenchido.
- **Excluir** (admin): botão 🗑 na linha. Pede confirmação. Ação irreversível.

### Ficha do cliente (`/clientes/[id]`)

Quando você clica em um cliente, abre a **ficha completa** com 5 abas:

1. 🤝 **Negócios** — todos os negócios do cliente, agrupados por funil. Permite criar novo negócio, mover etapa, adicionar nota.
2. 🕐 **Histórico** — timeline de todos os eventos: notas, mudanças de etapa, ligações, e-mails enviados, conversas de WhatsApp registradas.
3. 📋 **Apólices** — apólices ativas e vencidas, com prêmio, vigência e status.
4. 👤 **Dados** — visualização dos dados cadastrais (edição é em /clientes).
5. 📎 **Anexos** — RG, CNH, contratos, PDFs de apólice etc. Drag-and-drop suportado.

### Dicas
- A busca é **flexível**: pode digitar parte do nome, do CPF, do telefone ou do e-mail.
- Para acompanhar todos os negócios de um cliente sem precisar trocar de funil, abra a ficha dele.
- Use a aba **Histórico** antes de ligar — você verá em segundos tudo que já aconteceu.

---

## 📋 Apólices

### Para que serve
Listagem central de apólices em vigência (e vencidas/canceladas). Permite editar dados, lançar comissões recebidas, sincronizar com clientes e exportar em Excel.

### Onde fica
Menu lateral → **Apólices**.

### Quem pode usar
| Perfil | Acesso |
|---|---|
| Admin | Tudo, inclusive criar nova apólice e lançar comissão |
| Líder | Apólices da própria equipe |
| Corretor | Suas apólices |

### Visão geral da tela

- **KPIs no topo**: total de apólices, prêmio total, comissão total, vencendo em 30 dias.
- **Filtros**:
  - **Status**: Ativo (padrão) / Renovar (vencendo em 30d) / Vencido / Cancelado / Todos.
  - **Seguradora** (lista dinâmica).
  - **Ramo** (Auto, Vida, Saúde, Patrimonial…).
  - **Vendedor** (todos / sem vendedor / específico — admin/líder).
  - **Busca** por número, segurado, produto, seguradora.
- **Tabela**: Segurado | Produto | Seguradora | Vendedor | Prêmio | Comissão | Vencimento | Status.
- **Botões de ação por linha**:
  - 📝 **Detalhes** — abre modal completo com 30+ campos.
  - 💵 **Comissão** (admin) — lança comissão recebida.
  - ✏ Editar vendedor (admin/líder).
- **Botões globais**:
  - **`+ Nova apólice`** (admin)
  - **`🔄 Sincronizar clientes`** (admin) — vincula apólices órfãs.
  - **`🧹 Normalizar duplicatas`** (admin) — remove duplicadas.
  - **`📥 Exportar Excel`**.

### Campos da apólice (modal Detalhes)

- **Identificação**: número, proposta, endosso, ramo, produto, seguradora.
- **Segurado**: CPF/CNPJ/RG, tipo de documento, estipulante.
- **Vigência**: emissão, início, fim, data de controle.
- **Financeiro**: prêmio total, prêmio líquido, % comissão, % repasse vendedor, qtd parcelas, tipo de pagamento, banco/agência/conta.
- **Extras**: filial, pasta, status, status da assinatura.
- **Vínculos**: cliente, vendedor, negócio espelho.

### Passo a passo — criar nova apólice (admin)

1. **`+ Nova apólice`**.
2. Busque o cliente existente **ou** crie como apólice "órfã" (sem cliente).
3. Preencha número da apólice, seguradora, ramo, produto, vigências, prêmio e % comissão.
4. **`✓ Criar apólice`**.
5. O sistema cria simultaneamente um **negócio espelho** no funil correspondente.

### Passo a passo — lançar comissão recebida (admin)

1. Na tabela, clique **💵 Comissão** na linha da apólice.
2. Informe:
   - Valor recebido (R$)
   - Data do recebimento (padrão: hoje)
   - Competência (mês de referência, formato `AAAA-MM`)
   - Parcela (1) e total de parcelas
   - Observação (opcional)
3. **`✓ Lançar`**.
4. A comissão é registrada na tabela `comissoes_recebidas` e aparece no módulo **Comissões → Recebidas**.

### Passo a passo — sincronizar clientes / normalizar duplicatas (admin)

- **🔄 Sincronizar clientes**: percorre apólices sem cliente vinculado e tenta casar por **CPF/CNPJ** (preferência) ou **nome**. Útil após importações em massa de seguradoras.
- **🧹 Normalizar duplicatas**: encontra apólices com mesmo nº + seguradora + segurado e remove as duplicadas, mantendo a mais antiga. Use **com cuidado** — apresente o preview antes de confirmar.

### Dicas
- Use o filtro **`Renovar`** mensalmente para ligar para todos os clientes prestes a vencer.
- A coluna **Comissão** já mostra o valor estimado (prêmio × % comissão).
- Para apólices importadas com erro de CPF, use o **`Sincronizar clientes`** depois de corrigir os cadastros.

---

## 📝 Propostas

### Para que serve
Documento da seguradora antes da apólice ser fechada. Você importa em PDF e o sistema extrai os dados; depois acompanha o ciclo (em análise → aceita → convertida).

### Onde fica
Menu lateral → **Propostas**.

### Quem pode usar
- Acessível a todos.
- A **importação de PDFs** é feita em **Seguradoras** (admin).

### Visão geral da tela

- **Cards de resumo**: Em análise / Aceitas / Expirando em 7 dias / Prêmio total filtrado.
- **Aviso amarelo** (se houver) listando propostas importadas via PDF que ainda **não foram sincronizadas** para o módulo de produção (link para `Seguradoras`).
- **Filtros**: Status (todas/em análise/aceita/recusada/expirada/convertida/cancelada), Seguradora, Busca (nº, segurado, CPF, placa).
- **Tabela**: Nº | Segurado | Veículo | Seguradora | Prêmio | Validade | Status | Ações.

### Status das propostas

| Status | Quando acontece |
|---|---|
| **Em análise** | Importou e está aguardando decisão. Botões: `Aceitar` / `Recusar`. |
| **Aceita** | Cliente aceitou. Botão: `Marcar convertida` (após emitir apólice). |
| **Recusada** | Recusada pelo cliente ou pela seguradora. |
| **Expirada** | Validade da proposta passou. |
| **Convertida** | Virou apólice. |
| **Cancelada** | Cancelada manualmente. |

### Passo a passo

1. **Importação**: faça em **Seguradoras → [Seguradora] → aba Propostas** (PDF). Veja o tutorial 08.
2. Em **Propostas**, filtre por **Em análise**.
3. Para cada proposta, decida: clique **`Aceitar`** ou **`Recusar`**.
4. Quando a apólice for emitida, abra a proposta aceita e clique **`Marcar convertida`** — assim ela some das pendentes e fica registrada como bem-sucedida.

### Dicas
- O card **"Expirando em 7 dias"** evita que propostas vençam por descuido.
- Se sobraram propostas em "staging pendente" (importadas mas sem vínculo), vá em **Seguradoras** e clique em **Sincronizar**.

---

## 🔄 Renovações

### Para que serve
Acompanhamento de apólices/negócios prestes a vencer. Distribuição entre vendedores, registro de contato e marcação como renovado.

### Onde fica
Menu lateral → **Renovações**.

### Quem pode usar
- **Admin**: todos os negócios com vencimento.
- **Líder**: negócios com vencimento da equipe; pode atribuir.
- **Corretor**: apenas seus negócios; marca como renovado.

### Visão geral da tela

**4 KPIs clicáveis** (servem como filtros rápidos):
- 🔴 **Vencidos** — vencimento já passou.
- 🟠 **Vencem Hoje**.
- 🟡 **Próximos 7 dias**.
- 🟢 **Próximos 30 dias** (mostra prêmio total previsto).

**Filtros**:
- Botões: Todos / Vencidos / Hoje / 7 dias / 30 dias.
- (Admin/Líder) Dropdown de **responsável** — Todos / Sem responsável / um vendedor específico.

**Tabela**: Cliente | Produto (com placa, se houver) | Seguradora | Prêmio | Vencimento (com dias coloridos) | Funil | Responsável | Ações.

**Ações por linha**:
- 📞 **Contato** — registra o contato no histórico do cliente E cria automaticamente uma **tarefa de acompanhamento em 3 dias**.
- ✅ **Renovado** — move o negócio para a etapa "Renovado" no funil + registra evento no histórico.
- (Admin/Líder) Dropdown para **atribuir a um vendedor** — o atribuído recebe **notificação automática**.

### Passo a passo — distribuição (líder)

1. Acesse **Renovações**.
2. Filtre **Sem responsável** ou **Vencidos**.
3. Em cada linha, abra o dropdown **`— Atribuir —`** e escolha o vendedor.
4. O vendedor recebe notificação imediatamente e a renovação aparece na lista dele.

### Passo a passo — corretor

1. Filtre por **Hoje** ou **7 dias** para priorizar.
2. Clique **📞 Contato** ao ligar para o cliente — fica registrado e cria tarefa de acompanhamento em 3 dias.
3. Quando o cliente confirmar a renovação, clique **✅ Renovado** — o negócio é movido no funil e a contagem some da lista.

### Dicas
- Os KPIs no topo funcionam como **atalhos**: clique em "Vencidos" para filtrar instantaneamente.
- Renovações com **placa** (auto) aparecem com o emoji 🚗 e o número da placa abaixo do produto.
- Quem **atribui** sempre notifica o destinatário — não precisa avisar por WhatsApp separado.

---

→ Próximo: [04-COMUNICACAO.md](./04-COMUNICACAO.md)
