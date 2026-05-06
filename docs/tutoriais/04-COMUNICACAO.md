# 4. Comunicação — Telefone, WhatsApp, Mensagens, E-mail e Mural

## 📞 Telefone (GoTo Connect)

### Para que serve
Realizar e receber chamadas pelo CRM, integrado ao **GoTo Connect**, com histórico completo (data, duração, status, contato, link para a ficha).

### Onde fica
Menu lateral → **Telefone**.

### Quem pode usar
| Perfil | Acesso |
|---|---|
| Corretor | Faz ligações, vê próprio histórico |
| Líder | Idem + monitora ligações da equipe e vê quem está em ligação ao vivo |
| Admin | Tudo, com filtro por qualquer usuário |

### Visão geral da tela

Três abas:
1. **Discador** — teclado numérico, busca de cliente, contador de duração em tempo real.
2. **🔴 Em andamento** (apenas admin/líder) — ligações ativas neste momento.
3. **Histórico** — todas as ligações feitas/recebidas.

Topo:
- Status **🔗 Conectar GoTo** ou **GoTo Conectado ✓**.
- Filtro por usuário (admin/líder).

### Passo a passo — primeira vez

1. Em **Meu Perfil**, garanta que seu **ramal GoTo** está cadastrado (admin atribui em **Usuários**).
2. Em **Telefone**, clique **`🔗 Conectar GoTo`** e autorize no fluxo OAuth do GoTo.
3. Quando voltar ao CRM verá **GoTo Conectado ✓**.

### Passo a passo — fazer uma ligação

1. **Aba Discador**.
2. Use a busca **🔍 Buscar cliente…** para encontrar pelo nome, telefone ou CPF, **ou** digite o número direto no teclado.
3. Clique **`📞 Ligar`**.
4. O contador inicia. Status muda para **🟢 Em andamento**.
5. Para encerrar, clique **`📵 Encerrar`**. A duração é registrada.

### Aba Histórico

Mostra: direção (saída/entrada), nome do contato, número, duração, status (Iniciada / Em andamento / Encerrada / Perdida / Erro), data e hora, link para a ficha do cliente.

### Aba "Em andamento" (líder/admin)

Lista chamadas vivas no momento, com avatar pulsante, duração crescente e nome do contato. Útil para acompanhar o ritmo do time em tempo real.

### Dicas
- Cada ligação fica vinculada ao cliente quando você selecionou pelo buscador. Isso enriquece o histórico do cliente.
- Use a aba **Em andamento** durante reuniões 1:1 com o time para incentivar a prospecção.
- Ligações **perdidas** geram notificação 🔔 para você.

---

## 💬 WhatsApp (Evolution API)

### Para que serve
Conversar com clientes pelo WhatsApp diretamente do CRM. Suporta texto, emojis, figurinhas, **áudios gravados no navegador**, imagens, vídeos e documentos. Pode usar **agentes de IA** para responder automaticamente.

### Onde fica
Menu lateral → **WhatsApp**.

### Quem pode usar
| Perfil | Acesso |
|---|---|
| Corretor | Seu próprio WhatsApp (envia/recebe) |
| Líder | Visualiza WhatsApp da equipe (modo só-leitura quando monitora) |
| Admin | Visualiza qualquer usuário (modo só-leitura quando monitora) |

### Visão geral da tela

- Status: **🟢 Conectado**, **🟡 Aguardando QR Code**, **🔴 Desconectado**.
- Lista lateral de conversas com **badge vermelho** de não-lidas e ordem por última mensagem.
- Painel central: histórico da conversa selecionada + composição.
- Painel de **agente IA**: dropdown para escolher agente cadastrado e toggle para ativar.

### Passo a passo — conectar pela primeira vez

1. Clique **`📱 Conectar WhatsApp`**.
2. Aparece um **QR Code**.
3. No celular: **WhatsApp → Aparelhos conectados → Conectar um aparelho** → aponte para o QR.
4. Após confirmar, status fica **🟢 Conectado**.

### Passo a passo — nova conversa

1. **`✉️ Nova Conversa`**.
2. Buscar cliente existente (preenche número automaticamente) ou digitar número manualmente (formato `55 + DDD + 9 + número`).
3. Digite a mensagem na caixa inferior.
4. **Enter** para enviar; **Shift + Enter** para quebrar linha.

### Recursos durante a conversa

| Botão | O que faz |
|---|---|
| 😊 Emoji | Painel com 24 emojis comuns |
| 🎭 Figurinha | Stickers personalizados (configurados pela empresa) |
| 📎 Anexar | PDF, DOC, XLS, imagens, vídeos (até 10 MB) |
| 🎤 Áudio | Grava áudio direto no navegador (mostra cronômetro) |
| ✏ Editar contato | Trocar nome/número da conversa |
| 👤 Vincular cliente | Associa a conversa a um cliente do CRM |
| 📋 Registrar no histórico | Resume as últimas 20 mensagens e adiciona à ficha do cliente |

### Agente de IA

1. No dropdown **🤖 Agente IA**, escolha um agente cadastrado (admin cadastra em **Agentes de IA**).
2. Ative o toggle.
3. A partir de agora, mensagens recebidas são respondidas automaticamente pelo agente. Você continua vendo a conversa.
4. Para desativar, basta deslizar o toggle.

### Dicas
- O badge vermelho na conversa indica **mensagens não lidas**.
- Sempre **vincule a conversa a um cliente** — isso enriquece o histórico para o time inteiro.
- Líderes podem **monitorar** a conversa de um corretor, mas não conseguem responder no nome dele (modo só-leitura).
- Use o agente IA fora do horário comercial para não deixar o cliente sem resposta.

---

## ✉️ Mensagens internas

### Para que serve
Comunicação interna entre membros da equipe — chat 1:1 e grupos. Notificações de não-lidas no menu lateral (badge).

### Onde fica
Menu lateral → **Mensagens**.

### Quem pode usar
- Todos os usuários enviam/recebem mensagens.
- **Admin** pode visualizar a caixa de qualquer usuário (modo somente-leitura).

### Visão geral

Duas abas:
- **👥 Pessoas** — todos os colegas listados, com badge de não-lidas.
- **💬 Grupos** — grupos dos quais você participa.

Topo:
- (Admin) Dropdown "Caixa de" — permite assistir à caixa de outro usuário.

### Passo a passo — conversa 1:1

1. Aba **Pessoas**.
2. Clique no nome do colega.
3. Histórico abre à direita.
4. Digite e pressione **Enter** (Shift+Enter quebra linha).

### Passo a passo — grupo

1. Botão **`➕ Novo grupo`**.
2. Preencha o **nome** e selecione pelo menos 1 membro (você é adicionado automaticamente como criador).
3. **`✓ Criar grupo`**.
4. Aba **Grupos** → selecione o grupo → envie mensagens em thread.

### Dicas
- Mensagens internas são separadas das **notificações** — quando alguém te marca em outro lugar (Mural, comentário) cai no sino 🔔, não aqui.
- O **admin auditando** vê o aviso "👁 Visualizando" e fica em modo leitura.

---

## 📧 E-mail

### Para que serve
Configurar SMTP/IMAP para enviar e-mails (e futuramente receber) direto do CRM, com histórico, assinatura padrão e suporte a **provedores pré-configurados**.

### Onde fica
Menu lateral → **Email**.

### Quem pode usar
- Cada usuário configura **sua própria** conta.
- Admin pode preparar para outros se necessário.

### Visão geral

Três abas:
1. **⚙️ Configuração** — credenciais SMTP/IMAP.
2. **✉️ Enviar** — envio de e-mail individual.
3. **📜 Histórico** — todos os e-mails enviados, com status.

### Passo a passo — configurar (primeira vez)

1. Aba **Configuração**.
2. Selecione o **provedor** (Skymail / Gmail / Outlook / Locaweb / UOL). O sistema preenche automaticamente host, porta e tipo de criptografia.
3. Preencha:
   - **E-mail do remetente** (ex: `joao@cmseguros.com.br`)
   - **Nome exibido** (ex: `João — CM Seguros`)
   - **Usuário SMTP** (geralmente igual ao e-mail)
   - **Senha** — para Gmail use **App Password** (gerada na conta Google), nunca a senha real.
4. (Opcional) IMAP host/porta/SSL para futuro recebimento.
5. **Assinatura padrão** — texto que vai automaticamente ao final.
6. Clique **`Testar conexão`** — deve retornar **✅ Conexão SMTP validada**.
7. **`Salvar`**.

> A senha é criptografada com AES-256-GCM antes de ser salva no banco e nunca volta para o navegador.

### Passo a passo — enviar e-mail

1. Aba **Enviar**.
2. Preencha **Para**, **CC**, **BCC** (opcional), **Assunto**, **Mensagem**.
3. **`Enviar email`**.
4. A assinatura é anexada automaticamente.

### Aba Histórico

Lista todos os e-mails enviados com status (`enviado` / `erro` / `pendente`), data, destinatário e assunto.

### Dicas
- Se sua empresa usa Gmail, **ative App Passwords** nas configurações do Google para gerar uma senha específica para o CRM.
- Erros mais comuns: porta errada, senha errada, autenticação 2FA sem app password.

---

## 📣 Mural da empresa

### Para que serve
Rede social interna: humor do dia, posts com fotos, menções, reações e comentários — para integrar a equipe.

### Onde fica
Menu lateral → **Mural**.

### Quem pode usar
Todos os usuários publicam, comentam e reagem. Cada um só pode excluir os próprios posts.

### Visão geral

1. **🌤️ Humor do dia** — selecione um dos 8 emojis (Ótimo, Bem, Normal, Triste etc.). Avatares aparecem agrupados pelo emoji escolhido.
2. **Composição de post** — textarea + botão de foto.
3. **Feed** — posts em ordem cronológica reversa, com comentários, reações e quem mencionou quem.

### Passo a passo

1. **Registrar humor**: clique no emoji desejado. Para mudar, clique em outro. Para remover, clique no mesmo.
2. **Publicar**: escreva no campo "O que está acontecendo?". Use **@** para mencionar colegas (autocomplete). Adicione foto se quiser. Clique **`📣 Publicar`**.
3. **Reagir**: hover no post → escolha um dos 6 emojis (👍 ❤️ 😂 🎉 🔥 👏). Clique de novo para tirar.
4. **Comentar**: campo "Comentar… @ para marcar" embaixo do post. Enter para enviar.

### Notificações geradas

- Menções (`@nome`) → notificação 🔔 para o mencionado.
- Comentário no seu post → notificação para o autor.
- Reação no seu post → notificação para o autor.

### Dicas
- O humor do dia é uma forma de a liderança perceber o clima da equipe sem precisar perguntar individualmente.
- Posts e comentários **suportam @ menções**.
- "Ver todos os X comentários" expande comentários antigos.

---

→ Próximo: [05-PRODUTIVIDADE.md](./05-PRODUTIVIDADE.md)
