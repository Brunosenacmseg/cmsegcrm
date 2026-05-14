-- Atualiza o prompt_template do fluxo SUHAI SDR pra usar a placa do card
-- na abertura (estilo "Recebi sua solicitação de cotação do seguro para a
-- {{placa}}"). Placeholders novos disponíveis: {{placa}}, {{modelo_veiculo}}.
update public.sdr_fluxos
   set prompt_template = 'Mande uma mensagem curta para o lead {{nome}} (tentativa {{tentativa_n}} de {{total_tentativas}} — {{tipo_tentativa}}).
Dados do card: placa={{placa}}, modelo={{modelo_veiculo}}.
- Se for abertura: cumprimente o cliente e apresente-se como Marcelo Cunha da CM Seguros, mencionando a solicitação de cotação. Use este modelo: "Olá, {{nome}}, tudo bem? Muito prazer, Marcelo Cunha da CM Seguros aqui!! Recebi sua solicitação de cotação do seguro para a {{placa}}. Podemos seguir por aqui?". Se {{placa}} estiver vazia, peça gentilmente pela placa (ou modelo + ano) do veículo no lugar.
- Se for followup: tom gentil, sem pressão, lembrando que está disponível pra ajudar.
- Se for última tentativa: diga que vai aguardar contato dele quando puder, sem cobrança.
Português BR informal mas profissional. Máx 2 frases.'
 where nome = 'SUHAI SDR';
