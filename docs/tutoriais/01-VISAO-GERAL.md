# 1. Visão Geral do Sistema

## Para que serve o CM.segCRM

O **CM.segCRM** é a plataforma de gestão da CM Seguros. Ele reúne, em um só lugar:

- Cadastro de **clientes**, **apólices**, **propostas**, **negócios** e **renovações**
- Comunicação por **telefone (GoTo)**, **WhatsApp**, **e-mail** e **mensagens internas**
- Gestão de **tarefas**, **metas**, **comissões** e **financeiro**
- Integrações com **seguradoras** (Tokio, Allianz, HDI, Porto, Ezze etc.), **Meta Ads**, **RD Station** e **Autentique**
- **Automações** de funil e **agentes de IA** para WhatsApp
- Módulos de **RH**, **manuais**, **mural da empresa** e **gestão de equipe**

---

## Acessando o sistema (login)

1. Abra o navegador no endereço informado pela empresa (ex: `crm.cmseguros.com.br/login`).
2. Informe **e-mail** e **senha** cadastrados.
3. Caso seja seu primeiro acesso, o administrador deve ter criado seu usuário em **Configurações → Usuários**.
4. Em caso de esquecimento de senha, peça reset ao administrador (ele pode trocar diretamente em **Usuários**).

> Por segurança, todo login é registrado nos **Logs do Sistema** (com IP, cidade e dispositivo).

---

## Perfis de usuário

O sistema reconhece quatro **funções principais** (`role`) e duas **adesões a equipe** que liberam módulos específicos:

| Perfil | O que enxerga |
|---|---|
| **Admin** | Acesso a tudo: configurações, financeiro, integrações, todos os clientes/negócios, logs |
| **Líder** | Suas próprias informações + as da equipe que ele lidera (ranking, tarefas, gestão de equipe) |
| **Financeiro** | Mesmo que admin nas telas financeiras; vê demais módulos como leitor |
| **Corretor** | Vê apenas os próprios clientes, negócios, comissões e tarefas |
| **EQUIPE PÓS VENDA** | Libera o módulo **Autentique** e visão ampla do funil "Emissão e Implantação" |
| **EQUIPE GESTÃO** | Libera o módulo **Seguradoras** (importações) |

Quem ajusta as funções é o **Admin**, em **Configurações → Usuários**.

---

## Layout do CRM

A tela é dividida em três áreas:

```
┌───────────────┬──────────────────────────────────────────────┐
│               │  Header (busca · 🔔 Notificações · avatar)   │
│  Menu lateral ├──────────────────────────────────────────────┤
│  (esquerda)   │                                              │
│               │  Conteúdo principal                          │
│   - Dashboard │                                              │
│   - Funis     │                                              │
│   - Clientes  │                                              │
│   - ...       │                                              │
│               │                                              │
│  (rodapé:     │                                              │
│  seu avatar)  │                                              │
└───────────────┴──────────────────────────────────────────────┘
                                                  🤖 (Chat IA)
```

### 1. Menu lateral (esquerda)

Itens são agrupados em seções:

- **(sem seção)** — Dashboard, Funis, Cotações, Telefone, WhatsApp, Mensagens, Email, Mural, Clientes, Apólices, Propostas, Tarefas, Metas, Renovações, Relatórios, Autentique
- **Financeiro** — Comissões, Financeiro/DRE, Contas a Pagar
- **Marketing** — Campanhas Meta
- **Seguradoras** — Seguradoras, Tokio Marine
- **Integrações** — RD Station CRM, Conectar Meta
- **(sem seção)** — Agentes de IA, Automações
- **Empresa** — Manuais & Processos, Gestão de Equipe, RH, Melhorias CRM
- **Config** — Importar Dados, Meu Perfil, Usuários, Log do Sistema, Configurações

> As seções **Marketing**, **Integrações**, **Empresa** e **Config** vêm **recolhidas** por padrão. Clique no nome da seção para expandir/recolher (a preferência fica salva no navegador).

Itens com ícone vermelho (badge) indicam **mensagens não lidas** ou **tarefas pendentes**.

### 2. Header (topo)

- 🔔 **Notificações**: tudo que precisa da sua atenção (menções, tarefas, comentários, ligações perdidas, renovações, vencimentos). Clique no sino para abrir o painel.
  - "Marcar todas lidas" zera o contador.
  - Clicar em uma notificação leva para a página relacionada.
- **Avatar e nome** à direita: clique para abrir o **Meu Perfil**.

### 3. Conteúdo principal

Cada módulo tem seu próprio cabeçalho, filtros e tabelas/cards. As próximas seções deste guia descrevem todos eles.

### 4. Chat IA flutuante (🤖)

No canto inferior direito de qualquer página existe um botão flutuante com 🤖. Ele abre o **assistente de IA** (GPT-4o mini), que pode:

- Responder dúvidas sobre o sistema
- Comentar sobre seus próprios negócios, tarefas e metas
- Explicar termos de seguros (franquia, cobertura, IS, perfil)

Tem **6 sugestões prontas** para começar; basta clicar. Use Enter para enviar e Shift+Enter para quebrar linha. O botão 🗑️ no topo limpa a conversa.

---

## Notificações no detalhe

O sistema gera notificações automaticamente em situações como:

- 📣 **Menção** — quando alguém te marca (`@nome`) no Mural ou em comentário
- ✅ **Tarefa** — quando criam uma tarefa para você
- 💬 **Comentário** — quando comentam em algo seu
- ❤️ **Reação** — quando reagem ao seu post no Mural
- 📞 **Ligação** — chamada perdida ou atribuída
- 🔄 **Renovação** — apólice próxima do vencimento
- ⚠️ **Vencimento** — datas críticas (proposta expirando, prazo de tarefa)
- 🔔 **Sistema** — avisos administrativos

A cada **15 segundos** o sistema checa em segundo plano se há novidades — não precisa atualizar a página.

---

## Auditoria (logs)

Para o administrador, **toda ação relevante é registrada** em **Log do Sistema**:

- Cada navegação entre módulos (`page_view` com pathname)
- Logins (com IP, cidade, ISP, dispositivo)
- Criação/edição de registros sensíveis (negócios, clientes, financeiro)

Útil para descobrir quem alterou algo e quando.

---

## Boas práticas iniciais

1. **Atualize seu perfil**: foto, telefone e ramal GoTo. Isso ajuda colegas a te identificarem.
2. **Defina sua senha forte**: mínimo 6 caracteres; troque na sua primeira sessão.
3. **Cadastre suas configurações de e-mail** (módulo Email → aba Configuração) caso vá enviar e-mails para clientes pelo CRM.
4. **Conecte o GoTo** (módulo Telefone → "🔗 Conectar GoTo") se for atender por ramal.
5. **Conecte seu WhatsApp** (módulo WhatsApp → "📱 Conectar") caso atenda clientes por mensagem.
6. **Aprenda o Chat IA**: clique no 🤖 e teste perguntas como "Quais minhas tarefas atrasadas?" e "Como estou vs minha meta?".

---

## Próximo passo

→ Avance para [02-DASHBOARD-E-FUNIS.md](./02-DASHBOARD-E-FUNIS.md) para entender a tela inicial e o coração comercial do CRM (kanban de negócios).
