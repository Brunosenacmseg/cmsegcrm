# 7. Empresa — RH, Gestão de Equipe, Usuários e Perfil

## 🧑‍💼 RH

### Para que serve
Módulo completo de Recursos Humanos: cadastro de funcionários, férias, avaliações, benefícios, cargos, documentos e desligamentos.

### Onde fica
Menu lateral → seção **Empresa → RH**.

### Quem pode usar

| Perfil | O que vê |
|---|---|
| Todos | Avaliações próprias, comissões próprias, suas férias |
| RH | Acesso total (cadastro, documentos, benefícios, férias, avaliações) |
| Admin | Acesso total + gestão de acessos |

### Abas disponíveis

**Para todos os usuários:**
- ⭐ **Avaliações** — avaliações de desempenho recebidas.
- 💰 **Comissões** — visão pessoal de comissões.
- 🏖 **Férias** — minhas solicitações.

**Restritas (RH/Admin):**
- 🧑 **Funcionários** — cadastro completo.
- 🎂 **Aniversariantes** — filtro por mês.
- 📁 **Documentos** — biblioteca de documentos por funcionário.
- 🎁 **Benefícios** — VR, VT, plano de saúde, períodos de vigência.
- 💼 **Cargos** — posições com salário base.
- 🚪 **Desligamentos** — registros de saída.

### Passo a passo — cadastrar funcionário (RH)

1. Aba **🧑 Funcionários** → **`+ Novo funcionário`**.
2. Preencha em abas:
   - **Pessoal**: nome*, CPF, RG, e-mail, telefone, nascimento, sexo.
   - **Contrato**: data de admissão, data de demissão (vazio = ativo), salário, comissão padrão, comissão meta batida.
   - **Endereço**: CEP, logradouro, cidade, estado, CEP.
   - **Bancário**: banco, agência, conta, PIX.
   - **Emergência**: nome e telefone do contato.
   - **Cargo**: posição na empresa.
   - **Status**: ativo, férias, afastado, desligado.
3. **`✓ Salvar`**.

### Passo a passo — solicitar férias (qualquer usuário)

1. Aba **🏖 Férias** → **`+ Nova solicitação`**.
2. Informe **data início*** e **data fim***.
3. (Opcional) Justificativa.
4. **`✓ Solicitar`** — RH/admin recebe alerta.

### Passo a passo — aprovar/recusar (RH)

1. Veja a solicitação na tabela.
2. **`Aprovar`** confirma; **`Recusar`** pede motivo; **`Pedir ajuste`** envia ao colaborador comentário sobre o que precisa mudar.

### Passo a passo — avaliação de desempenho

1. Aba **⭐ Avaliações** → **`+ Novo`**.
2. Selecione **funcionário**, **período** (ex: `2026-Q1`), **nota geral (0-10)**.
3. Preencha **pontos fortes**, **pontos de melhoria**, **metas**, **feedback**.
4. **`✓ Salvar`** — funcionário recebe notificação.

### Passo a passo — anexar documento (RH)

1. Aba **📁 Documentos** → selecione **funcionário**.
2. Escolha **tipo** (Contrato, RG, CPF, CTPS, Comprovante endereço…).
3. Coloque **validade** (se houver — útil para CNH e outros).
4. **`📎 Escolher arquivo`** + descrição → **`Enviar`**.
5. Para visualizar a biblioteca completa, deixe o filtro de funcionário em branco.

### Dicas
- Cadastre todos os funcionários antes de começar a usar avaliações e benefícios.
- Use **Aniversariantes** mensalmente para iniciativas de engajamento (parabéns no Mural).
- Documentos com **validade** devem ser revisados periodicamente.

---

## 🧭 Gestão de Equipe

### Para que serve
Ferramenta diária para o **líder** acompanhar humor, desempenho e dificuldades de cada colaborador da sua equipe, com avaliações rápidas, histórico e relatório de tendências.

### Onde fica
Menu lateral → seção **Empresa → Gestão de Equipe** (apenas líderes e admin).

### Quem pode usar
- **Líder de equipe** — vê e avalia sua equipe.
- **Admin** — todas as equipes; configura perguntas.

### Abas

1. **Hoje** — avaliação do dia.
2. **📜 Histórico** — avaliações passadas.
3. **📊 Relatório** — gráfico de média por colaborador.
4. **⚙️ Perguntas** (admin) — configura as perguntas do questionário.

### Aba Hoje

- Cards por colaborador com indicador **✅ Avaliado** ou **⏳ Pendente**.
- Botão **`Avaliar agora`** abre o modal.

### Modal de avaliação

- "Como ele/a parece estar hoje?" — emoji do humor (Ótimo, Bom, Neutro, Baixo, Ruim).
- Perguntas configuradas pelo admin (escala 1-5, Sim/Não, Texto).
- Campos extras: **Destaque do dia**, **Dificuldade observada**, **Ação para amanhã**, **Comentário geral**.
- A nota média é calculada automaticamente.
- **`Salvar avaliação`**.

### Aba Histórico

- Filtro por colaborador, **de** e **até** datas.
- Tabela: nome, data, nota, comentário.
- Cores: Verde (≥4), Amarelo (≥3), Vermelho (<3).

### Aba Relatório

- Janela de **7 ou 30 dias**.
- Cards por colaborador: nº de avaliações, nota média, barra de progresso.

### Aba Perguntas (admin)

- Adicionar pergunta: texto, descrição, tipo (Escala 1-5, Sim/Não, Texto).
- Ativar/desativar perguntas existentes.

### Dicas
- Faça a avaliação **diariamente**, no fim do expediente — leva 2 minutos por pessoa.
- Use o **destaque do dia** para reconhecer publicamente no Mural depois.
- Análise semanal no relatório ajuda a identificar quem precisa de apoio.

---

## 👥 Usuários (admin)

### Para que serve
Cadastro de usuários do CRM, atribuição de papéis (admin/líder/financeiro/corretor), associação de ramal GoTo, criação e gestão de **equipes**.

### Onde fica
Menu lateral → seção **Config → Usuários** (apenas admin).

### Abas

1. **👤 Usuários** — listagem + formulário de criação.
2. **👥 Equipes** — gestão de times.

### Aba Usuários

Cada linha mostra: avatar, nome (editável inline), e-mail, role (dropdown), ramal GoTo (editável).

#### Criar usuário

1. No painel direito, preencha:
   - **Nome completo**
   - **E-mail**
   - **Senha** (mín. 6 caracteres)
   - **Nível** (admin / líder / financeiro / corretor)
2. **`+ Adicionar`**.
3. O usuário recebe e-mail e pode acessar imediatamente.

#### Alterar role

Dropdown ao lado do nome — escolha o novo papel; salva automaticamente.

#### Associar ramal GoTo

1. Clique **✏** ao lado de "Ramal".
2. Escolha um número (1001-3006) na dropdown.
3. **`✓`**.

### Aba Equipes

Cards por equipe com líder, membros e ações.

#### Criar equipe

1. **`+ Nova Equipe`**.
2. Nome (ex: "Equipe São Paulo").
3. Selecione **Líder** (deve ter role `lider` ou `admin`).
4. **`🔗 Criar`**.

#### Adicionar membro

Dropdown "Adicionar membro…" no card → escolha o usuário.

#### Remover membro / trocar líder / renomear / excluir

- **✕** ao lado do nome remove o membro.
- Dropdown de líder troca quem comanda.
- **`✎ Renomear`** muda o nome.
- 🗑 exclui (com confirmação).

### Dicas
- Equipes alimentam os filtros de **Dashboard**, **Funis**, **Tarefas**, **Comissões**.
- Para um líder ver os negócios do time, ele precisa estar registrado como **`lider_id`** na equipe.
- Para liberar **Autentique** ou **Seguradoras** a um usuário, adicione-o às equipes específicas (`EQUIPE PÓS VENDA`, `EQUIPE GESTÃO`).

---

## 👤 Meu Perfil

### Para que serve
Editar dados pessoais, foto e senha do próprio usuário.

### Onde fica
Menu lateral → seção **Config → Meu Perfil** (ou clique no avatar do canto inferior esquerdo).

### O que pode ser alterado

- **Nome completo**
- **Telefone** (opcional)
- **Foto de perfil** (clique 📷 sobre o avatar)
- **Senha** (mín. 6 caracteres)

Não é possível alterar:
- E-mail (é usado para login)
- Nível/role (apenas admin altera)
- Ramal GoTo (admin altera)

### Passo a passo

1. Acesse **Meu Perfil**.
2. Edite nome/telefone → **`✓ Salvar perfil`**.
3. Para foto: clique no botão 📷 sobre o avatar grande, escolha o arquivo. Aparece imediatamente.
4. Para senha: card **🔒 Alterar senha** → digite e confirme → **`🔒 Alterar senha`**.

### Dicas
- Suba uma **foto** sua — facilita reconhecimento em rankings e comentários.
- Use **senhas únicas** — evite reutilizar a mesma de outros sistemas.
- Mantenha o **telefone** atualizado, especialmente se você é líder e precisa ser contatado.

---

→ Próximo: [08-INTEGRACOES.md](./08-INTEGRACOES.md)
