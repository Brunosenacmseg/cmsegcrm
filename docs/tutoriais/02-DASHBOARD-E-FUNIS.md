# 2. Dashboard, Funis e Cotações

## 📈 Dashboard

### Para que serve
Tela inicial — visão 360° do desempenho com KPIs, ranking de vendas, ranking de ligações, tarefas pendentes e renovações urgentes.

### Onde fica
Menu lateral → **Dashboard** (primeiro item).

### Quem pode usar
| Perfil | O que vê |
|---|---|
| Admin / Líder | Tudo, com filtros por equipe e por usuário |
| Corretor | Apenas seus próprios dados |

### Visão geral da tela

1. **Cabeçalho** — botão `+ Novo Lead` (vai direto para o cadastro de cliente).
2. **Filtro de período (admin/líder)** — botões **Mês atual / Mês anterior / Esta semana / Personalizado**.
3. **Filtro de equipe e usuário (admin/líder)** — afina o ranking, ligações e tarefas.
4. **🏆 Ranking de Vendas** — visual estilo "corrida", top 10 vendedores com pista, avatar, prêmio total e comissão estimada.
5. **KPIs principais (4 cards)**:
   - **Prêmio Fechado (mês)** com comparação ao mês anterior (↑ ↓ %)
   - **Novos Clientes (mês)** com comparação
   - **Negócios Ativos** (em pipeline)
   - **Renovações (30d)** — quantos negócios vencem nos próximos 30 dias
6. **📞 Ranking de Ligações** — top 8 por número de chamadas e duração total.
7. **✅ Tarefas pendentes** — até 50 tarefas ordenadas por prazo (atrasadas em vermelho, hoje em ouro).

### Passo a passo

**Para o corretor:**
1. Após o login, abra o **Dashboard**.
2. Confira os 4 KPIs no topo: você está crescendo no mês ou caindo?
3. Veja **Tarefas pendentes**: clique em uma tarefa para ir direto ao cliente/negócio relacionado.
4. Acompanhe **Renovações** — se há apólices a vencer em 30 dias, acione o cliente.
5. Para criar um lead novo, clique **`+ Novo Lead`** (canto superior direito).

**Para o líder/admin:**
1. Selecione o **período** (Mês atual / Mês anterior / Esta semana / Personalizado).
2. Aplique o **filtro de equipe** ou **usuário** específico.
3. Acompanhe o **Ranking de Vendas** — quem fechou mais prêmio.
4. Use o **Ranking de Ligações** para identificar quem está prospectando ativamente.
5. Veja se o time tem **muitas tarefas atrasadas** ou **renovações urgentes**.

### Dicas
- O dashboard é atualizado a cada vez que você abre.
- "Personalizado" no período permite escolher qualquer intervalo (`de` e `até`).
- Os filtros valem para Vendas, Ligações e Tarefas simultaneamente.
- Tarefas em **vermelho** estão atrasadas; em **dourado** vencem hoje.

---

## 🏗 Funis (Kanban de negócios)

### Para que serve
Coração comercial do CRM. Cada **negócio** é um cartão dentro de um **funil** (pipeline). As colunas são as etapas. Você arrasta cartões entre etapas para mover o processo.

### Onde fica
Menu lateral → **Funis**.

### Quem pode usar
- **Admin**: vê todos os funis e todos os negócios.
- **Líder**: vê negócios da própria equipe.
- **Corretor**: vê apenas seus negócios.
- **EQUIPE PÓS VENDA**: tem visão ampla do funil "EMISSÃO E IMPLANTAÇÃO" (vê negócios de qualquer vendedor neste funil específico).
- **Funis com restrição por equipe**: só aparecem para quem está nelas (configurado pelo admin).

### Visão geral da tela

1. **Seletor de funil** no topo — clique no nome do funil para trocar (Venda, Renovação, Cobrança, Sinistro, Pós-venda etc.).
2. **Barra de filtros**:
   - **Status**: Em andamento (padrão), Ganho, Perdido, Todos.
   - **Visão**: Kanban (padrão) ou Lista.
   - **Ordenação**: Recentes / Antigos / A-Z / Z-A.
   - **Filtro de data**: Sem filtro / Por criação / Por fechamento — com `de` e `até`.
   - **Filtro por equipe**, **por usuário**, **busca** (cliente, título, placa, CPF, produto).
3. **Botão `+ Novo negócio`** — cria um cartão.
4. **Modo seleção (admin)** — seleciona vários cards para mover/excluir em massa.
5. **Botão exportar XLSX** — exporta a lista filtrada.
6. **Kanban** — colunas = etapas, cartões = negócios. Arraste para mover.

### Cartão de negócio (dentro do kanban)

Mostra:
- Nome do cliente
- Produto e/ou placa do veículo
- Prêmio (valor)
- Próxima tarefa em aberto (se houver)
- Avatar do vendedor responsável
- Ícones de anexos, mensagens, ligações vinculadas

### Modal do cartão (clicar no cartão)

Quando você clica no cartão, abre uma modal com **abas**:
- **Detalhes**: cliente, produto, prêmio, % de comissão, vencimento, observações.
- **Tarefas**: lista de tarefas vinculadas; pode criar nova diretamente.
- **Anexos**: PDFs, imagens, documentos. Suporta drag-and-drop. Gera link assinado de download.
- **Notas**: histórico de notas escritas pelo time.
- **Tags / Produtos / Origem**: campos de classificação.
- **Campos personalizados**: definidos pelo admin em **Configurações → Campos personalizados**.

### Passo a passo — criar um novo negócio

1. Em **Funis**, escolha o funil correto (ex: VENDA).
2. Clique **`+ Novo negócio`**.
3. Busque o cliente pelo nome ou CPF; se não existir, **crie ali mesmo** (preencha nome, CPF, telefone, e-mail).
4. Preencha:
   - **Título**: descrição curta (ex: "João — Auto Civic 2020")
   - **Produto** (Auto, Vida, Saúde, Patrimonial…)
   - **Seguradora**
   - **Prêmio** (R$)
   - **Etapa inicial** (a primeira do funil por padrão)
   - **Observações**
   - **Vendedor** (quem é responsável)
5. Clique **Salvar**.
6. O cartão aparece no kanban — arraste para a próxima etapa quando avançar.

### Passo a passo — marcar como Ganho ou Perdido

1. Clique no cartão.
2. Botão **`Marcar Ganho`** → registra `data_fechamento`, alimenta o ranking.
3. Botão **`Marcar Perdido`** → abre modal pedindo o **motivo da perda** (lista cadastrada em Configurações). Você pode digitar um motivo livre se nenhum servir.

### Passo a passo — assinatura digital a partir de um anexo

1. Suba um PDF na aba **Anexos** do cartão.
2. Clique no PDF e escolha **`Enviar para assinatura`**.
3. Selecione um **template de e-mail** (cadastrado em Configurações → Templates).
4. Adicione signatários (nome + e-mail).
5. Confirme. O documento sobe ao Autentique e cada signatário recebe e-mail com link.
6. Acompanhe o status na tela **Autentique** ou na própria aba do cartão.

### Configurar funis (admin)

Em **Funis → Configurar** (URL `/dashboard/funis/configurar`) o admin pode:

- Criar novos funis com nome, emoji, cor, descrição.
- Adicionar/remover/reordenar etapas (drag-and-drop).
- Definir visibilidade: 🌐 todos, ou 🔒 apenas equipes selecionadas.
- Reordenar funis (botões ↑↓).
- Normalizar duplicados — unifica funis com o mesmo nome.

### Dicas
- **Kanban vs Lista**: a visão **Lista** é melhor para edições em massa e exportação.
- **Modo seleção** (admin): permite selecionar vários cartões e mover todos para outra etapa de uma vez.
- **Filtros se acumulam**: o ícone "✕ Limpar" reseta tudo.
- **Comentários e atividades** ficam no **histórico do cliente** (acessível pela ficha).

---

## 🔍 Cotações (somente Admin)

### Para que serve
Cotador automático de **seguro auto**. Conecta com um robô (RPA) que simula a navegação no Aggilizador/sites de seguradoras e devolve um screenshot/tabela de preços. Suporta **auto-preenchimento de CPF, placa e CEP**.

### Onde fica
Menu lateral → **Cotações** (apenas administradores).

### Visão geral

- Histórico das cotações já feitas (até 50) com status: ⏳ Calculando / ✅ Concluído / ❌ Erro.
- Botão **`+ Nova Cotação`**.
- Botões **`Ver resultado`** (abre o screenshot retornado pelo robô) e **`✏ Editar/Refazer`** (reabre os dados anteriores para nova tentativa).

### Modal — 5 abas

| Aba | Campos principais |
|---|---|
| 👤 **Segurado** | CPF (auto-consulta), nome, nascimento, sexo, estado civil, CEP, telefone, e-mail |
| 🚗 **Veículo** | Placa (auto-consulta modelo/ano), chassi, ano fab/mod, zero KM, modelo, combustível, CEP de pernoite, rastreador, antifurto, blindagem, kit gás, alienado |
| 👨 **Condutor** | Condutor principal (próprio/cônjuge/filho…), CPF, nome, nascimento, sexo, estado civil, tempo de habilitação |
| 📋 **Questionário** | Garagem residência/trabalho/estudo, tipo de uso, jovem condutor, quilometragem, PCD, isenção fiscal |
| 🛡️ **Seguro** | Renovação?, vigência (1 ano), seguradora anterior, % de bônus, cobertura (compreensiva/RCF/roubo), franquia, % FIPE, danos (material/corporal/moral/morte), assistência, vidros, carro reserva, % comissão |

### Passo a passo

1. **`+ Nova Cotação`**.
2. **Aba Segurado**:
   - Busque um cliente existente **ou** digite o **CPF** completo. Após 11 dígitos, o sistema consulta a base local; se não existir, dispara o robô para enriquecer dados (nome, nascimento, CEP, telefone).
3. **Aba Veículo**:
   - Digite a **placa** completa (7 caracteres). O robô abre o consulta-placa, captura modelo, ano, FIPE e preenche os campos.
   - Coloque o CEP de pernoite — ViaCEP completa cidade/estado.
   - Marque rastreador, antifurto etc.
4. **Aba Condutor**: dados do condutor principal.
5. **Aba Questionário**: hábitos do veículo (garagem, uso, quilometragem).
6. **Aba Seguro**: configuração desejada da cotação (cobertura, franquia, FIPE, comissão).
7. Clique **`🚀 Calcular Cotação`**.
8. O modal fecha. Na lista, o registro aparece como **Calculando** — o sistema faz polling a cada 5 s. Em 2 a 6 minutos retorna **Concluído** ou **Erro**.
9. Clique **`Ver resultado`** para abrir o screenshot da tabela de preços.

### Dicas
- A cotação é **assíncrona**: você pode fechar a tela e voltar depois.
- Use **`✏ Editar/Refazer`** quando quiser ajustar uma variável (ex: % FIPE) sem redigitar tudo.
- Se o robô estiver indisponível, o status fica **Erro**: tente novamente após alguns minutos.

---

→ Próximo: [03-CLIENTES-APOLICES-PROPOSTAS.md](./03-CLIENTES-APOLICES-PROPOSTAS.md)
