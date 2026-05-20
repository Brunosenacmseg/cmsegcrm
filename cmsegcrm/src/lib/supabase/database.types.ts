export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_agentes: {
        Row: {
          ativo: boolean | null
          base_conhecimento: string | null
          created_at: string | null
          criado_por: string | null
          descricao: string | null
          id: string
          max_tokens: number | null
          modelo: string
          nome: string
          system_prompt: string
          temperatura: number | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          base_conhecimento?: string | null
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          max_tokens?: number | null
          modelo?: string
          nome: string
          system_prompt: string
          temperatura?: number | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          base_conhecimento?: string | null
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          max_tokens?: number | null
          modelo?: string
          nome?: string
          system_prompt?: string
          temperatura?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agentes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      allianz_apolices_relatorio: {
        Row: {
          apolice_anterior: string | null
          apolice_id: string | null
          cliente_id: string | null
          cliente_nome: string | null
          comissao_pct: number | null
          comissao_valor: number | null
          cpf_cnpj: string | null
          created_at: string | null
          dados: Json | null
          emissao: string | null
          endosso: string | null
          forma_pagamento: string | null
          id: string
          importacao_id: string | null
          numero_apolice: string | null
          numero_proposta: string | null
          premio_liquido: number | null
          premio_total: number | null
          produto: string | null
          qtd_parcelas: number | null
          ramo: string | null
          tipo: string
          updated_at: string | null
          vigencia_fim: string | null
          vigencia_ini: string | null
        }
        Insert: {
          apolice_anterior?: string | null
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          emissao?: string | null
          endosso?: string | null
          forma_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          premio_liquido?: number | null
          premio_total?: number | null
          produto?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          tipo: string
          updated_at?: string | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
        }
        Update: {
          apolice_anterior?: string | null
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          emissao?: string | null
          endosso?: string | null
          forma_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          premio_liquido?: number | null
          premio_total?: number | null
          produto?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          tipo?: string
          updated_at?: string | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allianz_apolices_relatorio_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allianz_apolices_relatorio_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allianz_apolices_relatorio_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "allianz_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      allianz_comissoes: {
        Row: {
          apolice_id: string | null
          cliente_id: string | null
          cliente_nome: string | null
          comissao_pct: number | null
          comissao_valor: number | null
          competencia: string | null
          cpf_cnpj: string | null
          created_at: string | null
          dados: Json | null
          data_emissao: string | null
          data_pagamento: string | null
          endosso: string | null
          id: string
          importacao_id: string | null
          numero_apolice: string | null
          numero_proposta: string | null
          parcela: number | null
          premio: number | null
          produto: string | null
          ramo: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          competencia?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_emissao?: string | null
          data_pagamento?: string | null
          endosso?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          parcela?: number | null
          premio?: number | null
          produto?: string | null
          ramo?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          competencia?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_emissao?: string | null
          data_pagamento?: string | null
          endosso?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          parcela?: number | null
          premio?: number | null
          produto?: string | null
          ramo?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allianz_comissoes_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allianz_comissoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allianz_comissoes_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "allianz_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      allianz_importacoes: {
        Row: {
          concluido_em: string | null
          erros: Json | null
          id: string
          iniciado_em: string | null
          nome_arquivo: string | null
          qtd_atualizados: number | null
          qtd_criados: number | null
          qtd_erros: number | null
          qtd_lidos: number | null
          tipo: string
          user_id: string | null
        }
        Insert: {
          concluido_em?: string | null
          erros?: Json | null
          id?: string
          iniciado_em?: string | null
          nome_arquivo?: string | null
          qtd_atualizados?: number | null
          qtd_criados?: number | null
          qtd_erros?: number | null
          qtd_lidos?: number | null
          tipo: string
          user_id?: string | null
        }
        Update: {
          concluido_em?: string | null
          erros?: Json | null
          id?: string
          iniciado_em?: string | null
          nome_arquivo?: string | null
          qtd_atualizados?: number | null
          qtd_criados?: number | null
          qtd_erros?: number | null
          qtd_lidos?: number | null
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allianz_importacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      allianz_inadimplencia: {
        Row: {
          apolice_id: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cpf_cnpj: string | null
          created_at: string | null
          dados: Json | null
          dias_atraso: number | null
          forma_pagamento: string | null
          id: string
          importacao_id: string | null
          numero_apolice: string | null
          numero_proposta: string | null
          parcela: number | null
          ramo: string | null
          updated_at: string | null
          valor: number | null
          vencimento: string | null
        }
        Insert: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          dias_atraso?: number | null
          forma_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          parcela?: number | null
          ramo?: string | null
          updated_at?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Update: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          dias_atraso?: number | null
          forma_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          parcela?: number | null
          ramo?: string | null
          updated_at?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allianz_inadimplencia_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allianz_inadimplencia_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allianz_inadimplencia_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "allianz_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      allianz_parcelas_emitidas: {
        Row: {
          apolice_id: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cpf_cnpj: string | null
          created_at: string | null
          dados: Json | null
          forma_pagamento: string | null
          id: string
          importacao_id: string | null
          numero_apolice: string | null
          numero_proposta: string | null
          parcela: number | null
          ramo: string | null
          status: string | null
          total_parcelas: number | null
          updated_at: string | null
          valor: number | null
          vencimento: string | null
        }
        Insert: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          forma_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          parcela?: number | null
          ramo?: string | null
          status?: string | null
          total_parcelas?: number | null
          updated_at?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Update: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          forma_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          parcela?: number | null
          ramo?: string | null
          status?: string | null
          total_parcelas?: number | null
          updated_at?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allianz_parcelas_emitidas_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allianz_parcelas_emitidas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allianz_parcelas_emitidas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "allianz_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      allianz_propostas_pendentes: {
        Row: {
          cliente_id: string | null
          cliente_nome: string | null
          cpf_cnpj: string | null
          created_at: string | null
          dados: Json | null
          data_proposta: string | null
          id: string
          importacao_id: string | null
          numero_proposta: string | null
          pendencia: string | null
          premio: number | null
          produto: string | null
          ramo: string | null
          situacao: string | null
          updated_at: string | null
          vigencia_fim: string | null
          vigencia_ini: string | null
        }
        Insert: {
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_proposta?: string | null
          id?: string
          importacao_id?: string | null
          numero_proposta?: string | null
          pendencia?: string | null
          premio?: number | null
          produto?: string | null
          ramo?: string | null
          situacao?: string | null
          updated_at?: string | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
        }
        Update: {
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_proposta?: string | null
          id?: string
          importacao_id?: string | null
          numero_proposta?: string | null
          pendencia?: string | null
          premio?: number | null
          produto?: string | null
          ramo?: string | null
          situacao?: string | null
          updated_at?: string | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allianz_propostas_pendentes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allianz_propostas_pendentes_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "allianz_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      allianz_sinistros: {
        Row: {
          apolice_id: string | null
          causa: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cpf_cnpj: string | null
          created_at: string | null
          dados: Json | null
          data_aviso: string | null
          data_encerramento: string | null
          data_ocorrencia: string | null
          id: string
          importacao_id: string | null
          numero_apolice: string | null
          numero_sinistro: string | null
          ramo: string | null
          situacao: string | null
          status: string
          updated_at: string | null
          valor_indenizacao: number | null
          valor_reserva: number | null
        }
        Insert: {
          apolice_id?: string | null
          causa?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_aviso?: string | null
          data_encerramento?: string | null
          data_ocorrencia?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_sinistro?: string | null
          ramo?: string | null
          situacao?: string | null
          status: string
          updated_at?: string | null
          valor_indenizacao?: number | null
          valor_reserva?: number | null
        }
        Update: {
          apolice_id?: string | null
          causa?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_aviso?: string | null
          data_encerramento?: string | null
          data_ocorrencia?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_sinistro?: string | null
          ramo?: string | null
          situacao?: string | null
          status?: string
          updated_at?: string | null
          valor_indenizacao?: number | null
          valor_reserva?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "allianz_sinistros_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allianz_sinistros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allianz_sinistros_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "allianz_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos: {
        Row: {
          apolice_id: string | null
          bucket: string
          categoria: string
          cliente_id: string | null
          conta_pagar_id: string | null
          created_at: string | null
          id: string
          negocio_id: string | null
          nome_arquivo: string
          path: string
          tamanho_kb: number | null
          tipo_mime: string | null
          user_id: string | null
        }
        Insert: {
          apolice_id?: string | null
          bucket?: string
          categoria: string
          cliente_id?: string | null
          conta_pagar_id?: string | null
          created_at?: string | null
          id?: string
          negocio_id?: string | null
          nome_arquivo: string
          path: string
          tamanho_kb?: number | null
          tipo_mime?: string | null
          user_id?: string | null
        }
        Update: {
          apolice_id?: string | null
          bucket?: string
          categoria?: string
          cliente_id?: string | null
          conta_pagar_id?: string | null
          created_at?: string | null
          id?: string
          negocio_id?: string | null
          nome_arquivo?: string
          path?: string
          tamanho_kb?: number | null
          tipo_mime?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anexos_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      apolice_acessorios: {
        Row: {
          apolice_id: string
          created_at: string | null
          descricao: string | null
          id: string
          is_segurada: number | null
          numero_item: number
          premio_anual: number | null
          premio_liquido: number | null
        }
        Insert: {
          apolice_id: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          is_segurada?: number | null
          numero_item?: number
          premio_anual?: number | null
          premio_liquido?: number | null
        }
        Update: {
          apolice_id?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          is_segurada?: number | null
          numero_item?: number
          premio_anual?: number | null
          premio_liquido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "apolice_acessorios_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
        ]
      }
      apolice_clausulas: {
        Row: {
          apolice_id: string
          cobertura_basica: string | null
          codigo_clausula: string | null
          codigo_franquia: string | null
          codigo_modalidade: string | null
          codigo_ramo: string | null
          created_at: string | null
          descricao_clausula: string | null
          descricao_franquia: string | null
          descricao_item_pre: string | null
          id: string
          is_segurada: number | null
          item: string | null
          local_codigo: string | null
          numero_documento_conjugado: string | null
          premio_anual: number | null
          premio_liquido: number | null
          valor_franquia: number | null
          valor_risco: number | null
        }
        Insert: {
          apolice_id: string
          cobertura_basica?: string | null
          codigo_clausula?: string | null
          codigo_franquia?: string | null
          codigo_modalidade?: string | null
          codigo_ramo?: string | null
          created_at?: string | null
          descricao_clausula?: string | null
          descricao_franquia?: string | null
          descricao_item_pre?: string | null
          id?: string
          is_segurada?: number | null
          item?: string | null
          local_codigo?: string | null
          numero_documento_conjugado?: string | null
          premio_anual?: number | null
          premio_liquido?: number | null
          valor_franquia?: number | null
          valor_risco?: number | null
        }
        Update: {
          apolice_id?: string
          cobertura_basica?: string | null
          codigo_clausula?: string | null
          codigo_franquia?: string | null
          codigo_modalidade?: string | null
          codigo_ramo?: string | null
          created_at?: string | null
          descricao_clausula?: string | null
          descricao_franquia?: string | null
          descricao_item_pre?: string | null
          id?: string
          is_segurada?: number | null
          item?: string | null
          local_codigo?: string | null
          numero_documento_conjugado?: string | null
          premio_anual?: number | null
          premio_liquido?: number | null
          valor_franquia?: number | null
          valor_risco?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "apolice_clausulas_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
        ]
      }
      apolice_coberturas: {
        Row: {
          apolice_id: string
          codigo_cobertura: string | null
          codigo_cobertura_tabela: string | null
          created_at: string | null
          descricao: string | null
          id: string
          is_segurada: number | null
          numero_item: number
          premio_anual: number | null
          premio_liquido: number | null
          tipo_franquia: string | null
          tipo_registro: string
          valor_franquia: number | null
        }
        Insert: {
          apolice_id: string
          codigo_cobertura?: string | null
          codigo_cobertura_tabela?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          is_segurada?: number | null
          numero_item?: number
          premio_anual?: number | null
          premio_liquido?: number | null
          tipo_franquia?: string | null
          tipo_registro: string
          valor_franquia?: number | null
        }
        Update: {
          apolice_id?: string
          codigo_cobertura?: string | null
          codigo_cobertura_tabela?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          is_segurada?: number | null
          numero_item?: number
          premio_anual?: number | null
          premio_liquido?: number | null
          tipo_franquia?: string | null
          tipo_registro?: string
          valor_franquia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "apolice_coberturas_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
        ]
      }
      apolice_itens_auto: {
        Row: {
          ano_fabricacao: number | null
          ano_modelo: number | null
          apolice_id: string
          bonus_nivel: number | null
          bonus_pct: number | null
          cep_circulacao: string | null
          cep_pernoite: string | null
          chassi: string | null
          ci_anterior: string | null
          ci_atual: string | null
          cobertura_codigo: string | null
          codigo_operacao: string | null
          combustivel: string | null
          created_at: string | null
          desconto_item: number | null
          descricao_cobertura: string | null
          id: string
          marca: string | null
          modelo: string | null
          num_passageiros: number | null
          numero_item: number
          operacao_item: string | null
          placa: string | null
          qtd_sinistros: number | null
          regiao_circulacao: string | null
          renavam: string | null
          valor_fipe: number | null
        }
        Insert: {
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          apolice_id: string
          bonus_nivel?: number | null
          bonus_pct?: number | null
          cep_circulacao?: string | null
          cep_pernoite?: string | null
          chassi?: string | null
          ci_anterior?: string | null
          ci_atual?: string | null
          cobertura_codigo?: string | null
          codigo_operacao?: string | null
          combustivel?: string | null
          created_at?: string | null
          desconto_item?: number | null
          descricao_cobertura?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          num_passageiros?: number | null
          numero_item?: number
          operacao_item?: string | null
          placa?: string | null
          qtd_sinistros?: number | null
          regiao_circulacao?: string | null
          renavam?: string | null
          valor_fipe?: number | null
        }
        Update: {
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          apolice_id?: string
          bonus_nivel?: number | null
          bonus_pct?: number | null
          cep_circulacao?: string | null
          cep_pernoite?: string | null
          chassi?: string | null
          ci_anterior?: string | null
          ci_atual?: string | null
          cobertura_codigo?: string | null
          codigo_operacao?: string | null
          combustivel?: string | null
          created_at?: string | null
          desconto_item?: number | null
          descricao_cobertura?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          num_passageiros?: number | null
          numero_item?: number
          operacao_item?: string | null
          placa?: string | null
          qtd_sinistros?: number | null
          regiao_circulacao?: string | null
          renavam?: string | null
          valor_fipe?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "apolice_itens_auto_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
        ]
      }
      apolice_locais: {
        Row: {
          agravacao_desconto: string | null
          apolice_id: string
          cep: string | null
          cidade: string | null
          codigo_atividade: string | null
          codigo_bem_segurado: string | null
          codigo_cliente: number | null
          codigo_construcao: string | null
          codigo_identificacao_doc: string | null
          codigo_modalidade: string | null
          codigo_municipio: string | null
          codigo_plano: string | null
          complemento: string | null
          created_at: string | null
          descricao_atividade: string | null
          descricao_bem_segurado: string | null
          descricao_construcao: string | null
          descricao_plano: string | null
          endereco: string | null
          id: string
          local_codigo: string | null
          numero_documento_conjugado: string | null
          pct_agravo_desconto: string | null
          premio_local: number | null
          pro_rata: string | null
          tipo_risco: string | null
          uf: string | null
        }
        Insert: {
          agravacao_desconto?: string | null
          apolice_id: string
          cep?: string | null
          cidade?: string | null
          codigo_atividade?: string | null
          codigo_bem_segurado?: string | null
          codigo_cliente?: number | null
          codigo_construcao?: string | null
          codigo_identificacao_doc?: string | null
          codigo_modalidade?: string | null
          codigo_municipio?: string | null
          codigo_plano?: string | null
          complemento?: string | null
          created_at?: string | null
          descricao_atividade?: string | null
          descricao_bem_segurado?: string | null
          descricao_construcao?: string | null
          descricao_plano?: string | null
          endereco?: string | null
          id?: string
          local_codigo?: string | null
          numero_documento_conjugado?: string | null
          pct_agravo_desconto?: string | null
          premio_local?: number | null
          pro_rata?: string | null
          tipo_risco?: string | null
          uf?: string | null
        }
        Update: {
          agravacao_desconto?: string | null
          apolice_id?: string
          cep?: string | null
          cidade?: string | null
          codigo_atividade?: string | null
          codigo_bem_segurado?: string | null
          codigo_cliente?: number | null
          codigo_construcao?: string | null
          codigo_identificacao_doc?: string | null
          codigo_modalidade?: string | null
          codigo_municipio?: string | null
          codigo_plano?: string | null
          complemento?: string | null
          created_at?: string | null
          descricao_atividade?: string | null
          descricao_bem_segurado?: string | null
          descricao_construcao?: string | null
          descricao_plano?: string | null
          endereco?: string | null
          id?: string
          local_codigo?: string | null
          numero_documento_conjugado?: string | null
          pct_agravo_desconto?: string | null
          premio_local?: number | null
          pro_rata?: string | null
          tipo_risco?: string | null
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apolice_locais_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
        ]
      }
      apolice_motoristas: {
        Row: {
          apolice_id: string
          codigo_fator: string | null
          codigo_motorista: string | null
          codigo_perfil: string | null
          codigo_subfator: string | null
          created_at: string | null
          data_nascimento: string | null
          descricao_fator: string | null
          descricao_subfator: string | null
          id: string
          nome: string | null
          numero_item: number
          tipo_registro: string
        }
        Insert: {
          apolice_id: string
          codigo_fator?: string | null
          codigo_motorista?: string | null
          codigo_perfil?: string | null
          codigo_subfator?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          descricao_fator?: string | null
          descricao_subfator?: string | null
          id?: string
          nome?: string | null
          numero_item?: number
          tipo_registro: string
        }
        Update: {
          apolice_id?: string
          codigo_fator?: string | null
          codigo_motorista?: string | null
          codigo_perfil?: string | null
          codigo_subfator?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          descricao_fator?: string | null
          descricao_subfator?: string | null
          id?: string
          nome?: string | null
          numero_item?: number
          tipo_registro?: string
        }
        Relationships: [
          {
            foreignKeyName: "apolice_motoristas_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
        ]
      }
      apolices: {
        Row: {
          agencia: string | null
          ano_fabricacao: string | null
          ano_modelo: string | null
          apolice_anterior: string | null
          apolice_conferida: boolean | null
          assistencias: Json | null
          atividade_local: string | null
          banco: string | null
          capital_total_empregados: number | null
          capital_total_segurado: number | null
          capital_total_socios: number | null
          cartao_final: string | null
          categoria_risco: string | null
          cep_pernoite: string | null
          chassi: string | null
          classe_bonus: number | null
          cliente_id: string | null
          cod_ci: string | null
          cod_fipe: string | null
          codigo_acordo: string | null
          codigo_cia_anterior: string | null
          codigo_estipulante: string | null
          codigo_unidade: string | null
          comissao_pct: number | null
          comissao_total_pct: number | null
          comissao_valor: number | null
          condicoes_gerais: string | null
          condutor_principal: Json | null
          conta: string | null
          cpf_cnpj_segurado: string | null
          created_at: string | null
          custo_apolice: number | null
          custom_fields: Json | null
          dados_pdf: Json | null
          dados_porto: Json | null
          dados_tokio: Json | null
          data_cadastro: string | null
          data_controle: string | null
          data_pagamento_1a: string | null
          descricao_endosso: string | null
          emails: string | null
          emissao: string | null
          endosso: string | null
          esporte_radical: string | null
          estipulante: string | null
          filial: string | null
          fim_vigencia_anterior: string | null
          finalidade_uso: string | null
          fonte: string | null
          forma_pagamento_descricao: string | null
          franquia_tipo: string | null
          franquia_valor: number | null
          grupo_codigo: string | null
          id: string
          importancia_segurada: number | null
          item: string | null
          kit_gas: boolean | null
          limite_maximo_garantia: number | null
          local_segurado: Json | null
          modelo: string | null
          negocio_corretora: string | null
          negocio_id: string | null
          nome_segurado: string | null
          num_empregados: number | null
          num_segurados: number | null
          num_socios: number | null
          numero: string | null
          numero_documento: string | null
          objeto_seguro: string | null
          pacote_contratado: string | null
          parcelas_pdf: Json | null
          pasta: string | null
          pasta_cliente: string | null
          pdf_importado_em: string | null
          placa: string | null
          premio: number | null
          premio_liquido: number | null
          premio_total: number | null
          produto: string | null
          profissao: string | null
          proposta: string | null
          proposta_assinada: boolean | null
          proposta_endosso: string | null
          qtd_parcelas: number | null
          ramo: string | null
          ramo_codigo: string | null
          repasse_vendedor: number | null
          repasse_vendedor_pct: number | null
          segurado_bairro: string | null
          segurado_cep: string | null
          segurado_cidade: string | null
          segurado_complemento: string | null
          segurado_email: string | null
          segurado_endereco: string | null
          segurado_numero: string | null
          segurado_rg: string | null
          segurado_rg_data: string | null
          segurado_rg_orgao: string | null
          segurado_telefone: string | null
          segurado_tipo_pessoa: string | null
          segurado_uf: string | null
          seguradora: string | null
          seguradora_anterior: string | null
          status: string | null
          status_apolice: string | null
          status_assinatura: string | null
          susep_corretor: string | null
          susep_inspetor: string | null
          susep_interno: string | null
          taxa_juros_mensal: number | null
          telefones: string | null
          telhado_isopainel: boolean | null
          tipo_construcao: string | null
          tipo_contratacao: string | null
          tipo_corretor: string | null
          tipo_documento: string | null
          tipo_endosso: string | null
          tipo_inspetor: string | null
          tipo_interno: string | null
          tipo_movimento: string | null
          tipo_pagamento: string | null
          tipo_pessoa: string | null
          tipo_residencia: string | null
          tipo_seguro_descricao: string | null
          tipo_vendedores: string | null
          transmissao: string | null
          valor_adicional_fracionamento: number | null
          valor_custo_documento: number | null
          valor_de_novo: boolean | null
          valor_em_risco: number | null
          valor_iof: number | null
          valor_juros: number | null
          valor_premio_total: number | null
          veiculo_descricao: string | null
          veiculo_igual_anterior: boolean | null
          vendedor_id: string | null
          vendedor_nome: string | null
          vendedores_envolvidos: Json | null
          vendedores_texto: string | null
          versao_tabela: string | null
          vigencia_anual_fim: string | null
          vigencia_anual_ini: string | null
          vigencia_fim: string | null
          vigencia_ini: string | null
          vigencia_tipo: string | null
          zero_km: boolean | null
        }
        Insert: {
          agencia?: string | null
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          apolice_anterior?: string | null
          apolice_conferida?: boolean | null
          assistencias?: Json | null
          atividade_local?: string | null
          banco?: string | null
          capital_total_empregados?: number | null
          capital_total_segurado?: number | null
          capital_total_socios?: number | null
          cartao_final?: string | null
          categoria_risco?: string | null
          cep_pernoite?: string | null
          chassi?: string | null
          classe_bonus?: number | null
          cliente_id?: string | null
          cod_ci?: string | null
          cod_fipe?: string | null
          codigo_acordo?: string | null
          codigo_cia_anterior?: string | null
          codigo_estipulante?: string | null
          codigo_unidade?: string | null
          comissao_pct?: number | null
          comissao_total_pct?: number | null
          comissao_valor?: number | null
          condicoes_gerais?: string | null
          condutor_principal?: Json | null
          conta?: string | null
          cpf_cnpj_segurado?: string | null
          created_at?: string | null
          custo_apolice?: number | null
          custom_fields?: Json | null
          dados_pdf?: Json | null
          dados_porto?: Json | null
          dados_tokio?: Json | null
          data_cadastro?: string | null
          data_controle?: string | null
          data_pagamento_1a?: string | null
          descricao_endosso?: string | null
          emails?: string | null
          emissao?: string | null
          endosso?: string | null
          esporte_radical?: string | null
          estipulante?: string | null
          filial?: string | null
          fim_vigencia_anterior?: string | null
          finalidade_uso?: string | null
          fonte?: string | null
          forma_pagamento_descricao?: string | null
          franquia_tipo?: string | null
          franquia_valor?: number | null
          grupo_codigo?: string | null
          id?: string
          importancia_segurada?: number | null
          item?: string | null
          kit_gas?: boolean | null
          limite_maximo_garantia?: number | null
          local_segurado?: Json | null
          modelo?: string | null
          negocio_corretora?: string | null
          negocio_id?: string | null
          nome_segurado?: string | null
          num_empregados?: number | null
          num_segurados?: number | null
          num_socios?: number | null
          numero?: string | null
          numero_documento?: string | null
          objeto_seguro?: string | null
          pacote_contratado?: string | null
          parcelas_pdf?: Json | null
          pasta?: string | null
          pasta_cliente?: string | null
          pdf_importado_em?: string | null
          placa?: string | null
          premio?: number | null
          premio_liquido?: number | null
          premio_total?: number | null
          produto?: string | null
          profissao?: string | null
          proposta?: string | null
          proposta_assinada?: boolean | null
          proposta_endosso?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          ramo_codigo?: string | null
          repasse_vendedor?: number | null
          repasse_vendedor_pct?: number | null
          segurado_bairro?: string | null
          segurado_cep?: string | null
          segurado_cidade?: string | null
          segurado_complemento?: string | null
          segurado_email?: string | null
          segurado_endereco?: string | null
          segurado_numero?: string | null
          segurado_rg?: string | null
          segurado_rg_data?: string | null
          segurado_rg_orgao?: string | null
          segurado_telefone?: string | null
          segurado_tipo_pessoa?: string | null
          segurado_uf?: string | null
          seguradora?: string | null
          seguradora_anterior?: string | null
          status?: string | null
          status_apolice?: string | null
          status_assinatura?: string | null
          susep_corretor?: string | null
          susep_inspetor?: string | null
          susep_interno?: string | null
          taxa_juros_mensal?: number | null
          telefones?: string | null
          telhado_isopainel?: boolean | null
          tipo_construcao?: string | null
          tipo_contratacao?: string | null
          tipo_corretor?: string | null
          tipo_documento?: string | null
          tipo_endosso?: string | null
          tipo_inspetor?: string | null
          tipo_interno?: string | null
          tipo_movimento?: string | null
          tipo_pagamento?: string | null
          tipo_pessoa?: string | null
          tipo_residencia?: string | null
          tipo_seguro_descricao?: string | null
          tipo_vendedores?: string | null
          transmissao?: string | null
          valor_adicional_fracionamento?: number | null
          valor_custo_documento?: number | null
          valor_de_novo?: boolean | null
          valor_em_risco?: number | null
          valor_iof?: number | null
          valor_juros?: number | null
          valor_premio_total?: number | null
          veiculo_descricao?: string | null
          veiculo_igual_anterior?: boolean | null
          vendedor_id?: string | null
          vendedor_nome?: string | null
          vendedores_envolvidos?: Json | null
          vendedores_texto?: string | null
          versao_tabela?: string | null
          vigencia_anual_fim?: string | null
          vigencia_anual_ini?: string | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
          vigencia_tipo?: string | null
          zero_km?: boolean | null
        }
        Update: {
          agencia?: string | null
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          apolice_anterior?: string | null
          apolice_conferida?: boolean | null
          assistencias?: Json | null
          atividade_local?: string | null
          banco?: string | null
          capital_total_empregados?: number | null
          capital_total_segurado?: number | null
          capital_total_socios?: number | null
          cartao_final?: string | null
          categoria_risco?: string | null
          cep_pernoite?: string | null
          chassi?: string | null
          classe_bonus?: number | null
          cliente_id?: string | null
          cod_ci?: string | null
          cod_fipe?: string | null
          codigo_acordo?: string | null
          codigo_cia_anterior?: string | null
          codigo_estipulante?: string | null
          codigo_unidade?: string | null
          comissao_pct?: number | null
          comissao_total_pct?: number | null
          comissao_valor?: number | null
          condicoes_gerais?: string | null
          condutor_principal?: Json | null
          conta?: string | null
          cpf_cnpj_segurado?: string | null
          created_at?: string | null
          custo_apolice?: number | null
          custom_fields?: Json | null
          dados_pdf?: Json | null
          dados_porto?: Json | null
          dados_tokio?: Json | null
          data_cadastro?: string | null
          data_controle?: string | null
          data_pagamento_1a?: string | null
          descricao_endosso?: string | null
          emails?: string | null
          emissao?: string | null
          endosso?: string | null
          esporte_radical?: string | null
          estipulante?: string | null
          filial?: string | null
          fim_vigencia_anterior?: string | null
          finalidade_uso?: string | null
          fonte?: string | null
          forma_pagamento_descricao?: string | null
          franquia_tipo?: string | null
          franquia_valor?: number | null
          grupo_codigo?: string | null
          id?: string
          importancia_segurada?: number | null
          item?: string | null
          kit_gas?: boolean | null
          limite_maximo_garantia?: number | null
          local_segurado?: Json | null
          modelo?: string | null
          negocio_corretora?: string | null
          negocio_id?: string | null
          nome_segurado?: string | null
          num_empregados?: number | null
          num_segurados?: number | null
          num_socios?: number | null
          numero?: string | null
          numero_documento?: string | null
          objeto_seguro?: string | null
          pacote_contratado?: string | null
          parcelas_pdf?: Json | null
          pasta?: string | null
          pasta_cliente?: string | null
          pdf_importado_em?: string | null
          placa?: string | null
          premio?: number | null
          premio_liquido?: number | null
          premio_total?: number | null
          produto?: string | null
          profissao?: string | null
          proposta?: string | null
          proposta_assinada?: boolean | null
          proposta_endosso?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          ramo_codigo?: string | null
          repasse_vendedor?: number | null
          repasse_vendedor_pct?: number | null
          segurado_bairro?: string | null
          segurado_cep?: string | null
          segurado_cidade?: string | null
          segurado_complemento?: string | null
          segurado_email?: string | null
          segurado_endereco?: string | null
          segurado_numero?: string | null
          segurado_rg?: string | null
          segurado_rg_data?: string | null
          segurado_rg_orgao?: string | null
          segurado_telefone?: string | null
          segurado_tipo_pessoa?: string | null
          segurado_uf?: string | null
          seguradora?: string | null
          seguradora_anterior?: string | null
          status?: string | null
          status_apolice?: string | null
          status_assinatura?: string | null
          susep_corretor?: string | null
          susep_inspetor?: string | null
          susep_interno?: string | null
          taxa_juros_mensal?: number | null
          telefones?: string | null
          telhado_isopainel?: boolean | null
          tipo_construcao?: string | null
          tipo_contratacao?: string | null
          tipo_corretor?: string | null
          tipo_documento?: string | null
          tipo_endosso?: string | null
          tipo_inspetor?: string | null
          tipo_interno?: string | null
          tipo_movimento?: string | null
          tipo_pagamento?: string | null
          tipo_pessoa?: string | null
          tipo_residencia?: string | null
          tipo_seguro_descricao?: string | null
          tipo_vendedores?: string | null
          transmissao?: string | null
          valor_adicional_fracionamento?: number | null
          valor_custo_documento?: number | null
          valor_de_novo?: boolean | null
          valor_em_risco?: number | null
          valor_iof?: number | null
          valor_juros?: number | null
          valor_premio_total?: number | null
          veiculo_descricao?: string | null
          veiculo_igual_anterior?: boolean | null
          vendedor_id?: string | null
          vendedor_nome?: string | null
          vendedores_envolvidos?: Json | null
          vendedores_texto?: string | null
          versao_tabela?: string | null
          vigencia_anual_fim?: string | null
          vigencia_anual_ini?: string | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
          vigencia_tipo?: string | null
          zero_km?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "apolices_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apolices_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apolices_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas: {
        Row: {
          apolice_id: string | null
          arquivo_nome: string | null
          arquivo_url: string | null
          atualizado_em: string | null
          autentique_id: string | null
          cliente_id: string | null
          concluido_em: string | null
          criado_em: string | null
          enviado_por: string | null
          id: string
          negocio_id: string | null
          nome_documento: string
          obs: string | null
          pasta: string | null
          payload_resposta: Json | null
          status: string
          total_assinados: number | null
          total_signatarios: number | null
          url_assinatura: string | null
          url_pdf_final: string | null
        }
        Insert: {
          apolice_id?: string | null
          arquivo_nome?: string | null
          arquivo_url?: string | null
          atualizado_em?: string | null
          autentique_id?: string | null
          cliente_id?: string | null
          concluido_em?: string | null
          criado_em?: string | null
          enviado_por?: string | null
          id?: string
          negocio_id?: string | null
          nome_documento: string
          obs?: string | null
          pasta?: string | null
          payload_resposta?: Json | null
          status?: string
          total_assinados?: number | null
          total_signatarios?: number | null
          url_assinatura?: string | null
          url_pdf_final?: string | null
        }
        Update: {
          apolice_id?: string | null
          arquivo_nome?: string | null
          arquivo_url?: string | null
          atualizado_em?: string | null
          autentique_id?: string | null
          cliente_id?: string | null
          concluido_em?: string | null
          criado_em?: string | null
          enviado_por?: string | null
          id?: string
          negocio_id?: string | null
          nome_documento?: string
          obs?: string | null
          pasta?: string | null
          payload_resposta?: Json | null
          status?: string
          total_assinados?: number | null
          total_signatarios?: number | null
          url_assinatura?: string | null
          url_pdf_final?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas_signatarios: {
        Row: {
          assinado_em: string | null
          assinatura_id: string
          autentique_id: string | null
          cpf: string | null
          criado_em: string | null
          email: string | null
          funcao: string | null
          id: string
          link_assinatura: string | null
          nome: string | null
          status: string | null
        }
        Insert: {
          assinado_em?: string | null
          assinatura_id: string
          autentique_id?: string | null
          cpf?: string | null
          criado_em?: string | null
          email?: string | null
          funcao?: string | null
          id?: string
          link_assinatura?: string | null
          nome?: string | null
          status?: string | null
        }
        Update: {
          assinado_em?: string | null
          assinatura_id?: string
          autentique_id?: string | null
          cpf?: string | null
          criado_em?: string | null
          email?: string | null
          funcao?: string | null
          id?: string
          link_assinatura?: string | null
          nome?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_signatarios_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "assinaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      automacoes: {
        Row: {
          acoes: Json
          ativo: boolean | null
          atualizado_em: string | null
          criado_em: string | null
          criado_por: string | null
          descricao: string | null
          etapa_filtro: string | null
          funil_id: string | null
          funis_excluidos: string[]
          id: string
          nome: string
          trigger: string
        }
        Insert: {
          acoes?: Json
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          etapa_filtro?: string | null
          funil_id?: string | null
          funis_excluidos?: string[]
          id?: string
          nome: string
          trigger: string
        }
        Update: {
          acoes?: Json
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          etapa_filtro?: string | null
          funil_id?: string | null
          funis_excluidos?: string[]
          id?: string
          nome?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "automacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automacoes_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
        ]
      }
      automacoes_logs: {
        Row: {
          acoes_executadas: Json | null
          automacao_id: string | null
          erro: string | null
          executado_em: string | null
          id: string
          negocio_id: string | null
          sucesso: boolean | null
          trigger: string
        }
        Insert: {
          acoes_executadas?: Json | null
          automacao_id?: string | null
          erro?: string | null
          executado_em?: string | null
          id?: string
          negocio_id?: string | null
          sucesso?: boolean | null
          trigger: string
        }
        Update: {
          acoes_executadas?: Json | null
          automacao_id?: string | null
          erro?: string | null
          executado_em?: string | null
          id?: string
          negocio_id?: string | null
          sucesso?: boolean | null
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "automacoes_logs_automacao_id_fkey"
            columns: ["automacao_id"]
            isOneToOne: false
            referencedRelation: "automacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automacoes_logs_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      campos_personalizados: {
        Row: {
          ativo: boolean | null
          chave: string
          criado_em: string | null
          criado_por: string | null
          entidade: string
          etapas_obrigatorias: string[] | null
          funis_visiveis: string[] | null
          id: string
          nome: string
          obrigatorio: boolean | null
          obrigatorio_modo: string | null
          opcoes: string[] | null
          ordem: number | null
          permite_novas_opcoes: boolean | null
          tipo: string
          visibilidade: string | null
        }
        Insert: {
          ativo?: boolean | null
          chave: string
          criado_em?: string | null
          criado_por?: string | null
          entidade: string
          etapas_obrigatorias?: string[] | null
          funis_visiveis?: string[] | null
          id?: string
          nome: string
          obrigatorio?: boolean | null
          obrigatorio_modo?: string | null
          opcoes?: string[] | null
          ordem?: number | null
          permite_novas_opcoes?: boolean | null
          tipo?: string
          visibilidade?: string | null
        }
        Update: {
          ativo?: boolean | null
          chave?: string
          criado_em?: string | null
          criado_por?: string | null
          entidade?: string
          etapas_obrigatorias?: string[] | null
          funis_visiveis?: string[] | null
          id?: string
          nome?: string
          obrigatorio?: boolean | null
          obrigatorio_modo?: string | null
          opcoes?: string[] | null
          ordem?: number | null
          permite_novas_opcoes?: boolean | null
          tipo?: string
          visibilidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campos_personalizados_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_tags: {
        Row: {
          cliente_id: string
          tag_id: string
        }
        Insert: {
          cliente_id: string
          tag_id: string
        }
        Update: {
          cliente_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_tags_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          aniversario: string | null
          ativo: boolean | null
          bairro: string | null
          bairro2: string | null
          bairro3: string | null
          cep: string | null
          cep2: string | null
          cep3: string | null
          cidade: string | null
          cidade2: string | null
          cidade3: string | null
          cliente_desde: string | null
          complemento: string | null
          complemento2: string | null
          complemento3: string | null
          corretor_id: string | null
          cpf_cnpj: string | null
          created_at: string | null
          custom_fields: Json | null
          dados_porto: Json | null
          email: string | null
          email2: string | null
          email3: string | null
          endereco: string | null
          endereco2: string | null
          endereco3: string | null
          estado: string | null
          estado_civil: string | null
          estado2: string | null
          estado3: string | null
          estipulantes: string | null
          filial: string | null
          fonte: string | null
          id: string
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          meta_form_id: string | null
          meta_lead_id: string | null
          nascimento: string | null
          nome: string
          numero: string | null
          numero2: string | null
          numero3: string | null
          observacao: string | null
          parentesco: string | null
          pasta_cliente: string | null
          profissao: string | null
          ramo: string | null
          rd_id: string | null
          receber_email: boolean | null
          renda_mensal: number | null
          rg: string | null
          sexo: string | null
          telefone: string | null
          telefone2: string | null
          telefone3: string | null
          tipo: string
          updated_at: string | null
          vencimento_cnh: string | null
          vendedor_id: string | null
        }
        Insert: {
          aniversario?: string | null
          ativo?: boolean | null
          bairro?: string | null
          bairro2?: string | null
          bairro3?: string | null
          cep?: string | null
          cep2?: string | null
          cep3?: string | null
          cidade?: string | null
          cidade2?: string | null
          cidade3?: string | null
          cliente_desde?: string | null
          complemento?: string | null
          complemento2?: string | null
          complemento3?: string | null
          corretor_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          dados_porto?: Json | null
          email?: string | null
          email2?: string | null
          email3?: string | null
          endereco?: string | null
          endereco2?: string | null
          endereco3?: string | null
          estado?: string | null
          estado_civil?: string | null
          estado2?: string | null
          estado3?: string | null
          estipulantes?: string | null
          filial?: string | null
          fonte?: string | null
          id?: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_form_id?: string | null
          meta_lead_id?: string | null
          nascimento?: string | null
          nome: string
          numero?: string | null
          numero2?: string | null
          numero3?: string | null
          observacao?: string | null
          parentesco?: string | null
          pasta_cliente?: string | null
          profissao?: string | null
          ramo?: string | null
          rd_id?: string | null
          receber_email?: boolean | null
          renda_mensal?: number | null
          rg?: string | null
          sexo?: string | null
          telefone?: string | null
          telefone2?: string | null
          telefone3?: string | null
          tipo?: string
          updated_at?: string | null
          vencimento_cnh?: string | null
          vendedor_id?: string | null
        }
        Update: {
          aniversario?: string | null
          ativo?: boolean | null
          bairro?: string | null
          bairro2?: string | null
          bairro3?: string | null
          cep?: string | null
          cep2?: string | null
          cep3?: string | null
          cidade?: string | null
          cidade2?: string | null
          cidade3?: string | null
          cliente_desde?: string | null
          complemento?: string | null
          complemento2?: string | null
          complemento3?: string | null
          corretor_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          dados_porto?: Json | null
          email?: string | null
          email2?: string | null
          email3?: string | null
          endereco?: string | null
          endereco2?: string | null
          endereco3?: string | null
          estado?: string | null
          estado_civil?: string | null
          estado2?: string | null
          estado3?: string | null
          estipulantes?: string | null
          filial?: string | null
          fonte?: string | null
          id?: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_form_id?: string | null
          meta_lead_id?: string | null
          nascimento?: string | null
          nome?: string
          numero?: string | null
          numero2?: string | null
          numero3?: string | null
          observacao?: string | null
          parentesco?: string | null
          pasta_cliente?: string | null
          profissao?: string | null
          ramo?: string | null
          rd_id?: string | null
          receber_email?: boolean | null
          renda_mensal?: number | null
          rg?: string | null
          sexo?: string | null
          telefone?: string | null
          telefone2?: string | null
          telefone3?: string | null
          tipo?: string
          updated_at?: string | null
          vencimento_cnh?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_recebidas: {
        Row: {
          apolice_id: string | null
          cliente_id: string | null
          competencia: string | null
          created_at: string | null
          data_recebimento: string | null
          id: string
          importacao_id: string | null
          ir_retido: number | null
          negocio_id: string | null
          obs: string | null
          origem: string
          outros_descontos: number | null
          parcela: number | null
          produto: string | null
          registrado_por: string | null
          seguradora: string | null
          seguradora_codigo: string | null
          status: string
          total_parcelas: number | null
          updated_at: string | null
          valor: number
          vendedor_id: string | null
        }
        Insert: {
          apolice_id?: string | null
          cliente_id?: string | null
          competencia?: string | null
          created_at?: string | null
          data_recebimento?: string | null
          id?: string
          importacao_id?: string | null
          ir_retido?: number | null
          negocio_id?: string | null
          obs?: string | null
          origem?: string
          outros_descontos?: number | null
          parcela?: number | null
          produto?: string | null
          registrado_por?: string | null
          seguradora?: string | null
          seguradora_codigo?: string | null
          status?: string
          total_parcelas?: number | null
          updated_at?: string | null
          valor: number
          vendedor_id?: string | null
        }
        Update: {
          apolice_id?: string | null
          cliente_id?: string | null
          competencia?: string | null
          created_at?: string | null
          data_recebimento?: string | null
          id?: string
          importacao_id?: string | null
          ir_retido?: number | null
          negocio_id?: string | null
          obs?: string | null
          origem?: string
          outros_descontos?: number | null
          parcela?: number | null
          produto?: string | null
          registrado_por?: string | null
          seguradora?: string | null
          seguradora_codigo?: string | null
          status?: string
          total_parcelas?: number | null
          updated_at?: string | null
          valor?: number
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_recebidas_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_recebidas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_recebidas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_comissao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_recebidas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_recebidas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_recebidas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          atualizado_em: string | null
          chave: string
          valor: Json
        }
        Insert: {
          atualizado_em?: string | null
          chave: string
          valor: Json
        }
        Update: {
          atualizado_em?: string | null
          chave?: string
          valor?: Json
        }
        Relationships: []
      }
      contas_pagar: {
        Row: {
          anexo_id: string | null
          aprovado_por: string | null
          atualizado_em: string | null
          categoria_id: string | null
          criado_em: string | null
          criado_por: string | null
          data_pagamento: string | null
          descricao: string | null
          despesa_id: string | null
          forma_pagto: string | null
          fornecedor: string | null
          id: string
          nf_anexo_id: string | null
          nome: string
          obs_admin: string | null
          pago_por: string | null
          recusado_por: string | null
          status: string
          tipo: string
          valor: number
          vencimento: string
        }
        Insert: {
          anexo_id?: string | null
          aprovado_por?: string | null
          atualizado_em?: string | null
          categoria_id?: string | null
          criado_em?: string | null
          criado_por?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          despesa_id?: string | null
          forma_pagto?: string | null
          fornecedor?: string | null
          id?: string
          nf_anexo_id?: string | null
          nome: string
          obs_admin?: string | null
          pago_por?: string | null
          recusado_por?: string | null
          status?: string
          tipo?: string
          valor: number
          vencimento: string
        }
        Update: {
          anexo_id?: string | null
          aprovado_por?: string | null
          atualizado_em?: string | null
          categoria_id?: string | null
          criado_em?: string | null
          criado_por?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          despesa_id?: string | null
          forma_pagto?: string | null
          fornecedor?: string | null
          id?: string
          nf_anexo_id?: string | null
          nome?: string
          obs_admin?: string | null
          pago_por?: string | null
          recusado_por?: string | null
          status?: string
          tipo?: string
          valor?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_anexo_id_fkey"
            columns: ["anexo_id"]
            isOneToOne: false
            referencedRelation: "anexos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_despesa_id_fkey"
            columns: ["despesa_id"]
            isOneToOne: false
            referencedRelation: "financeiro_despesas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_nf_anexo_id_fkey"
            columns: ["nf_anexo_id"]
            isOneToOne: false
            referencedRelation: "anexos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_pago_por_fkey"
            columns: ["pago_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_recusado_por_fkey"
            columns: ["recusado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar_anexos: {
        Row: {
          bucket: string
          conta_id: string
          created_at: string | null
          id: string
          nome_arquivo: string
          path: string
          tamanho_kb: number | null
          tipo_mime: string | null
          user_id: string | null
        }
        Insert: {
          bucket?: string
          conta_id: string
          created_at?: string | null
          id?: string
          nome_arquivo: string
          path: string
          tamanho_kb?: number | null
          tipo_mime?: string | null
          user_id?: string | null
        }
        Update: {
          bucket?: string
          conta_id?: string
          created_at?: string | null
          id?: string
          nome_arquivo?: string
          path?: string
          tamanho_kb?: number | null
          tipo_mime?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_anexos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_anexos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacoes: {
        Row: {
          alienado: boolean | null
          ano_fab: number | null
          ano_mod: number | null
          antifurto: string | null
          assistencia: string | null
          blindado: boolean | null
          carro_reserva: string | null
          cep_pernoite: string | null
          cep_residencial: string | null
          chassi: string | null
          cliente_id: string | null
          codigo_interno: string | null
          combustivel: string | null
          comissao_pct: number | null
          concluido_em: string | null
          condutor_principal: boolean | null
          cpf_cnpj: string | null
          cpf_condutor: string | null
          criado_em: string | null
          dados: Json | null
          danos_corporais: string | null
          danos_materiais: string | null
          danos_morais: string | null
          email: string | null
          erro: string | null
          estado_civil_condutor: string | null
          estado_civil_segurado: string | null
          final_vigencia: string | null
          final_vigencia_anterior: string | null
          fipe_pct: number | null
          garagem_estudo: string | null
          garagem_residencia: string | null
          garagem_trabalho: string | null
          id: string
          idade_mais_novo: number | null
          inicio_vigencia: string | null
          isencao_fiscal: boolean | null
          jovem_condutor: boolean | null
          kit_gas: boolean | null
          modelo: string | null
          morte_invalidez: string | null
          nascimento_condutor: string | null
          nascimento_segurado: string | null
          negocio_id: string | null
          nome_condutor: string | null
          nome_segurado: string | null
          novo_bonus: string | null
          numero_apolice_anterior: string | null
          pcd: boolean | null
          placa: string | null
          produto: string
          qtd_sinistros: number | null
          quilometragem: string | null
          rastreador: string | null
          renovacao: boolean | null
          resultado: Json | null
          resultado_url: string | null
          screenshot: string | null
          screenshot_url: string | null
          seguradora_anterior: string | null
          sexo_condutor: string | null
          sexo_jovens: string | null
          sexo_segurado: string | null
          status: string | null
          telefone: string | null
          tempo_habilitacao: string | null
          tentativas: number | null
          tipo_cobertura: string | null
          tipo_franquia: string | null
          tipo_residencia: string | null
          tipo_uso: string | null
          user_id: string | null
          valor_kit_gas: number | null
          vidros: string | null
          zero_km: boolean | null
        }
        Insert: {
          alienado?: boolean | null
          ano_fab?: number | null
          ano_mod?: number | null
          antifurto?: string | null
          assistencia?: string | null
          blindado?: boolean | null
          carro_reserva?: string | null
          cep_pernoite?: string | null
          cep_residencial?: string | null
          chassi?: string | null
          cliente_id?: string | null
          codigo_interno?: string | null
          combustivel?: string | null
          comissao_pct?: number | null
          concluido_em?: string | null
          condutor_principal?: boolean | null
          cpf_cnpj?: string | null
          cpf_condutor?: string | null
          criado_em?: string | null
          dados?: Json | null
          danos_corporais?: string | null
          danos_materiais?: string | null
          danos_morais?: string | null
          email?: string | null
          erro?: string | null
          estado_civil_condutor?: string | null
          estado_civil_segurado?: string | null
          final_vigencia?: string | null
          final_vigencia_anterior?: string | null
          fipe_pct?: number | null
          garagem_estudo?: string | null
          garagem_residencia?: string | null
          garagem_trabalho?: string | null
          id?: string
          idade_mais_novo?: number | null
          inicio_vigencia?: string | null
          isencao_fiscal?: boolean | null
          jovem_condutor?: boolean | null
          kit_gas?: boolean | null
          modelo?: string | null
          morte_invalidez?: string | null
          nascimento_condutor?: string | null
          nascimento_segurado?: string | null
          negocio_id?: string | null
          nome_condutor?: string | null
          nome_segurado?: string | null
          novo_bonus?: string | null
          numero_apolice_anterior?: string | null
          pcd?: boolean | null
          placa?: string | null
          produto?: string
          qtd_sinistros?: number | null
          quilometragem?: string | null
          rastreador?: string | null
          renovacao?: boolean | null
          resultado?: Json | null
          resultado_url?: string | null
          screenshot?: string | null
          screenshot_url?: string | null
          seguradora_anterior?: string | null
          sexo_condutor?: string | null
          sexo_jovens?: string | null
          sexo_segurado?: string | null
          status?: string | null
          telefone?: string | null
          tempo_habilitacao?: string | null
          tentativas?: number | null
          tipo_cobertura?: string | null
          tipo_franquia?: string | null
          tipo_residencia?: string | null
          tipo_uso?: string | null
          user_id?: string | null
          valor_kit_gas?: number | null
          vidros?: string | null
          zero_km?: boolean | null
        }
        Update: {
          alienado?: boolean | null
          ano_fab?: number | null
          ano_mod?: number | null
          antifurto?: string | null
          assistencia?: string | null
          blindado?: boolean | null
          carro_reserva?: string | null
          cep_pernoite?: string | null
          cep_residencial?: string | null
          chassi?: string | null
          cliente_id?: string | null
          codigo_interno?: string | null
          combustivel?: string | null
          comissao_pct?: number | null
          concluido_em?: string | null
          condutor_principal?: boolean | null
          cpf_cnpj?: string | null
          cpf_condutor?: string | null
          criado_em?: string | null
          dados?: Json | null
          danos_corporais?: string | null
          danos_materiais?: string | null
          danos_morais?: string | null
          email?: string | null
          erro?: string | null
          estado_civil_condutor?: string | null
          estado_civil_segurado?: string | null
          final_vigencia?: string | null
          final_vigencia_anterior?: string | null
          fipe_pct?: number | null
          garagem_estudo?: string | null
          garagem_residencia?: string | null
          garagem_trabalho?: string | null
          id?: string
          idade_mais_novo?: number | null
          inicio_vigencia?: string | null
          isencao_fiscal?: boolean | null
          jovem_condutor?: boolean | null
          kit_gas?: boolean | null
          modelo?: string | null
          morte_invalidez?: string | null
          nascimento_condutor?: string | null
          nascimento_segurado?: string | null
          negocio_id?: string | null
          nome_condutor?: string | null
          nome_segurado?: string | null
          novo_bonus?: string | null
          numero_apolice_anterior?: string | null
          pcd?: boolean | null
          placa?: string | null
          produto?: string
          qtd_sinistros?: number | null
          quilometragem?: string | null
          rastreador?: string | null
          renovacao?: boolean | null
          resultado?: Json | null
          resultado_url?: string | null
          screenshot?: string | null
          screenshot_url?: string | null
          seguradora_anterior?: string | null
          sexo_condutor?: string | null
          sexo_jovens?: string | null
          sexo_segurado?: string | null
          status?: string | null
          telefone?: string | null
          tempo_habilitacao?: string | null
          tentativas?: number | null
          tipo_cobertura?: string | null
          tipo_franquia?: string | null
          tipo_residencia?: string | null
          tipo_uso?: string | null
          user_id?: string | null
          valor_kit_gas?: number | null
          vidros?: string | null
          zero_km?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacoes_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas_operacao: {
        Row: {
          criado_em: string
          criado_por: string | null
          equipe_id: string | null
          id: string
          margem_lucro_pct: number | null
          mes: string
          nome: string
          observacao: string | null
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          equipe_id?: string | null
          id?: string
          margem_lucro_pct?: number | null
          mes: string
          nome: string
          observacao?: string | null
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          equipe_id?: string | null
          id?: string
          margem_lucro_pct?: number | null
          mes?: string
          nome?: string
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "despesas_operacao_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_operacao_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas_operacao_itens: {
        Row: {
          categoria: string | null
          criado_em: string
          descricao: string
          id: string
          operacao_id: string
          ordem: number | null
          valor: number
        }
        Insert: {
          categoria?: string | null
          criado_em?: string
          descricao: string
          id?: string
          operacao_id: string
          ordem?: number | null
          valor?: number
        }
        Update: {
          categoria?: string | null
          criado_em?: string
          descricao?: string
          id?: string
          operacao_id?: string
          ordem?: number | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_operacao_itens_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "despesas_operacao"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas_operacao_vendedores: {
        Row: {
          comissao_pct: number | null
          criado_em: string
          encargos_pct: number | null
          faturamento_mes: number | null
          id: string
          nome_snapshot: string
          operacao_id: string
          ordem: number | null
          salario_fixo: number | null
          user_id: string | null
        }
        Insert: {
          comissao_pct?: number | null
          criado_em?: string
          encargos_pct?: number | null
          faturamento_mes?: number | null
          id?: string
          nome_snapshot: string
          operacao_id: string
          ordem?: number | null
          salario_fixo?: number | null
          user_id?: string | null
        }
        Update: {
          comissao_pct?: number | null
          criado_em?: string
          encargos_pct?: number | null
          faturamento_mes?: number | null
          id?: string
          nome_snapshot?: string
          operacao_id?: string
          ordem?: number | null
          salario_fixo?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "despesas_operacao_vendedores_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "despesas_operacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_operacao_vendedores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_contas: {
        Row: {
          assinatura: string | null
          ativo: boolean
          atualizado_em: string
          criado_em: string
          from_email: string
          from_nome: string | null
          id: string
          imap_host: string | null
          imap_port: number | null
          imap_secure: boolean | null
          imap_user: string | null
          smtp_host: string
          smtp_pass_enc: string
          smtp_port: number
          smtp_secure: boolean
          smtp_user: string
          ultimo_teste_em: string | null
          ultimo_teste_msg: string | null
          ultimo_teste_ok: boolean | null
          user_id: string
        }
        Insert: {
          assinatura?: string | null
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          from_email: string
          from_nome?: string | null
          id?: string
          imap_host?: string | null
          imap_port?: number | null
          imap_secure?: boolean | null
          imap_user?: string | null
          smtp_host: string
          smtp_pass_enc: string
          smtp_port?: number
          smtp_secure?: boolean
          smtp_user: string
          ultimo_teste_em?: string | null
          ultimo_teste_msg?: string | null
          ultimo_teste_ok?: boolean | null
          user_id: string
        }
        Update: {
          assinatura?: string | null
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          from_email?: string
          from_nome?: string | null
          id?: string
          imap_host?: string | null
          imap_port?: number | null
          imap_secure?: boolean | null
          imap_user?: string | null
          smtp_host?: string
          smtp_pass_enc?: string
          smtp_port?: number
          smtp_secure?: boolean
          smtp_user?: string
          ultimo_teste_em?: string | null
          ultimo_teste_msg?: string | null
          ultimo_teste_ok?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_contas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          assunto: string | null
          ativo: boolean | null
          atualizado_em: string | null
          categoria: string
          criado_em: string | null
          criado_por: string | null
          id: string
          is_default: boolean | null
          mensagem: string
          nome: string
        }
        Insert: {
          assunto?: string | null
          ativo?: boolean | null
          atualizado_em?: string | null
          categoria?: string
          criado_em?: string | null
          criado_por?: string | null
          id?: string
          is_default?: boolean | null
          mensagem: string
          nome: string
        }
        Update: {
          assunto?: string | null
          ativo?: boolean | null
          atualizado_em?: string | null
          categoria?: string
          criado_em?: string | null
          criado_por?: string | null
          id?: string
          is_default?: boolean | null
          mensagem?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      emails_enviados: {
        Row: {
          apolice_id: string | null
          assunto: string | null
          bcc: string | null
          cc: string | null
          cliente_id: string | null
          conta_id: string | null
          corpo_html: string | null
          corpo_texto: string | null
          criado_em: string
          enviado_em: string | null
          erro: string | null
          id: string
          message_id: string | null
          negocio_id: string | null
          para: string
          status: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          apolice_id?: string | null
          assunto?: string | null
          bcc?: string | null
          cc?: string | null
          cliente_id?: string | null
          conta_id?: string | null
          corpo_html?: string | null
          corpo_texto?: string | null
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          message_id?: string | null
          negocio_id?: string | null
          para: string
          status?: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          apolice_id?: string | null
          assunto?: string | null
          bcc?: string | null
          cc?: string | null
          cliente_id?: string | null
          conta_id?: string | null
          corpo_html?: string | null
          corpo_texto?: string | null
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          message_id?: string | null
          negocio_id?: string | null
          para?: string
          status?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_enviados_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "email_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_enviados_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_enviados_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      endossos: {
        Row: {
          apolice_id: string | null
          cliente_id: string | null
          criado_em: string | null
          dados_brutos: Json | null
          data_emissao: string | null
          fonte: string | null
          id: string
          motivo: string | null
          numero_apolice: string | null
          numero_endosso: string
          seguradora: string | null
          tipo: string | null
          valor_diferenca: number | null
          valor_iof: number | null
          valor_premio: number | null
          vigencia_fim: string | null
          vigencia_ini: string | null
        }
        Insert: {
          apolice_id?: string | null
          cliente_id?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_emissao?: string | null
          fonte?: string | null
          id?: string
          motivo?: string | null
          numero_apolice?: string | null
          numero_endosso: string
          seguradora?: string | null
          tipo?: string | null
          valor_diferenca?: number | null
          valor_iof?: number | null
          valor_premio?: number | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
        }
        Update: {
          apolice_id?: string | null
          cliente_id?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_emissao?: string | null
          fonte?: string | null
          id?: string
          motivo?: string | null
          numero_apolice?: string | null
          numero_endosso?: string
          seguradora?: string | null
          tipo?: string | null
          valor_diferenca?: number | null
          valor_iof?: number | null
          valor_premio?: number | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "endossos_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endossos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_membros: {
        Row: {
          equipe_id: string
          user_id: string
        }
        Insert: {
          equipe_id: string
          user_id: string
        }
        Update: {
          equipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_membros_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_membros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      equipes: {
        Row: {
          created_at: string | null
          id: string
          lider_id: string | null
          nome: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lider_id?: string | null
          nome: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lider_id?: string | null
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipes_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_acessos: {
        Row: {
          liberado_em: string | null
          liberado_por: string | null
          user_id: string
        }
        Insert: {
          liberado_em?: string | null
          liberado_por?: string | null
          user_id: string
        }
        Update: {
          liberado_em?: string | null
          liberado_por?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_acessos_liberado_por_fkey"
            columns: ["liberado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_acessos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_categorias: {
        Row: {
          ativo: boolean | null
          codigo: string
          cor: string | null
          criado_em: string | null
          id: string
          nome: string
          ordem: number | null
          tipo: string
        }
        Insert: {
          ativo?: boolean | null
          codigo: string
          cor?: string | null
          criado_em?: string | null
          id?: string
          nome: string
          ordem?: number | null
          tipo?: string
        }
        Update: {
          ativo?: boolean | null
          codigo?: string
          cor?: string | null
          criado_em?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          tipo?: string
        }
        Relationships: []
      }
      financeiro_config: {
        Row: {
          id: number
          senha_hash: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: number
          senha_hash?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: number
          senha_hash?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_despesas: {
        Row: {
          categoria_id: string | null
          competencia: string | null
          condicao: string | null
          criado_em: string | null
          data: string
          data_pgto: string | null
          data_vencimento: string | null
          descricao: string
          forma_pagto: string | null
          fornecedor: string | null
          id: string
          numero_nf: string | null
          obs: string | null
          origem_import: string | null
          recorrente_id: string | null
          registrado_por: string | null
          tipo_despesa: string | null
          updated_at: string | null
          valor: number
          valor_previsto: number | null
        }
        Insert: {
          categoria_id?: string | null
          competencia?: string | null
          condicao?: string | null
          criado_em?: string | null
          data?: string
          data_pgto?: string | null
          data_vencimento?: string | null
          descricao: string
          forma_pagto?: string | null
          fornecedor?: string | null
          id?: string
          numero_nf?: string | null
          obs?: string | null
          origem_import?: string | null
          recorrente_id?: string | null
          registrado_por?: string | null
          tipo_despesa?: string | null
          updated_at?: string | null
          valor: number
          valor_previsto?: number | null
        }
        Update: {
          categoria_id?: string | null
          competencia?: string | null
          condicao?: string | null
          criado_em?: string | null
          data?: string
          data_pgto?: string | null
          data_vencimento?: string | null
          descricao?: string
          forma_pagto?: string | null
          fornecedor?: string | null
          id?: string
          numero_nf?: string | null
          obs?: string | null
          origem_import?: string | null
          recorrente_id?: string | null
          registrado_por?: string | null
          tipo_despesa?: string | null
          updated_at?: string | null
          valor?: number
          valor_previsto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_despesas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_despesas_recorrente_id_fkey"
            columns: ["recorrente_id"]
            isOneToOne: false
            referencedRelation: "financeiro_despesas_recorrentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_despesas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_despesas_recorrentes: {
        Row: {
          ativo: boolean | null
          categoria_id: string | null
          condicao: string | null
          criado_em: string | null
          criado_por: string | null
          descricao: string
          dia_vencimento: number | null
          forma_pagto: string | null
          fornecedor: string | null
          id: string
          obs: string | null
          tipo_despesa: string | null
          updated_at: string | null
          valor_padrao: number
        }
        Insert: {
          ativo?: boolean | null
          categoria_id?: string | null
          condicao?: string | null
          criado_em?: string | null
          criado_por?: string | null
          descricao: string
          dia_vencimento?: number | null
          forma_pagto?: string | null
          fornecedor?: string | null
          id?: string
          obs?: string | null
          tipo_despesa?: string | null
          updated_at?: string | null
          valor_padrao?: number
        }
        Update: {
          ativo?: boolean | null
          categoria_id?: string | null
          condicao?: string | null
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string
          dia_vencimento?: number | null
          forma_pagto?: string | null
          fornecedor?: string | null
          id?: string
          obs?: string | null
          tipo_despesa?: string | null
          updated_at?: string | null
          valor_padrao?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_despesas_recorrentes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_despesas_recorrentes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_receitas: {
        Row: {
          categoria_id: string | null
          cliente_id: string | null
          competencia: string | null
          criado_em: string
          data: string
          descricao: string
          forma_recebimento: string | null
          id: string
          negocio_id: string | null
          obs: string | null
          origem: string | null
          registrado_por: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          cliente_id?: string | null
          competencia?: string | null
          criado_em?: string
          data?: string
          descricao: string
          forma_recebimento?: string | null
          id?: string
          negocio_id?: string | null
          obs?: string | null
          origem?: string | null
          registrado_por?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          cliente_id?: string | null
          competencia?: string | null
          criado_em?: string
          data?: string
          descricao?: string
          forma_recebimento?: string | null
          id?: string
          negocio_id?: string | null
          obs?: string | null
          origem?: string | null
          registrado_por?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_receitas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_receitas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_receitas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_receitas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_seguradoras: {
        Row: {
          ativo: boolean | null
          codigo: string
          criado_em: string | null
          id: string
          nome: string
          ordem: number | null
        }
        Insert: {
          ativo?: boolean | null
          codigo: string
          criado_em?: string | null
          id?: string
          nome: string
          ordem?: number | null
        }
        Update: {
          ativo?: boolean | null
          codigo?: string
          criado_em?: string | null
          id?: string
          nome?: string
          ordem?: number | null
        }
        Relationships: []
      }
      financeiro_senha: {
        Row: {
          atualizada_em: string
          atualizada_por: string | null
          id: number
          senha_hash: string
        }
        Insert: {
          atualizada_em?: string
          atualizada_por?: string | null
          id?: number
          senha_hash: string
        }
        Update: {
          atualizada_em?: string
          atualizada_por?: string | null
          id?: number
          senha_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_senha_atualizada_por_fkey"
            columns: ["atualizada_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      funis: {
        Row: {
          cor: string | null
          created_at: string | null
          descricao: string | null
          emoji: string | null
          etapa_ganho: string | null
          etapa_perda: string | null
          etapas: string[]
          id: string
          meta_etapas: Json | null
          nome: string
          ordem: number | null
          rd_id: string | null
          tipo: string
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          emoji?: string | null
          etapa_ganho?: string | null
          etapa_perda?: string | null
          etapas: string[]
          id?: string
          meta_etapas?: Json | null
          nome: string
          ordem?: number | null
          rd_id?: string | null
          tipo: string
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          emoji?: string | null
          etapa_ganho?: string | null
          etapa_perda?: string | null
          etapas?: string[]
          id?: string
          meta_etapas?: Json | null
          nome?: string
          ordem?: number | null
          rd_id?: string | null
          tipo?: string
        }
        Relationships: []
      }
      funis_equipes: {
        Row: {
          equipe_id: string
          funil_id: string
        }
        Insert: {
          equipe_id: string
          funil_id: string
        }
        Update: {
          equipe_id?: string
          funil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funis_equipes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funis_equipes_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
        ]
      }
      gestao_equipe_avaliacoes: {
        Row: {
          acao_proxima: string | null
          atualizado_em: string | null
          colaborador_id: string
          comentario: string | null
          criado_em: string | null
          data: string
          destaque: string | null
          dificuldade: string | null
          equipe_id: string | null
          humor: string | null
          id: string
          lider_id: string
          nota_geral: number | null
        }
        Insert: {
          acao_proxima?: string | null
          atualizado_em?: string | null
          colaborador_id: string
          comentario?: string | null
          criado_em?: string | null
          data?: string
          destaque?: string | null
          dificuldade?: string | null
          equipe_id?: string | null
          humor?: string | null
          id?: string
          lider_id: string
          nota_geral?: number | null
        }
        Update: {
          acao_proxima?: string | null
          atualizado_em?: string | null
          colaborador_id?: string
          comentario?: string | null
          criado_em?: string | null
          data?: string
          destaque?: string | null
          dificuldade?: string | null
          equipe_id?: string | null
          humor?: string | null
          id?: string
          lider_id?: string
          nota_geral?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gestao_equipe_avaliacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestao_equipe_avaliacoes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestao_equipe_avaliacoes_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gestao_equipe_perguntas: {
        Row: {
          ativa: boolean
          chave: string
          criada_em: string | null
          descricao: string | null
          id: string
          max_escala: number
          min_escala: number
          ordem: number
          pergunta: string
          tipo: string
        }
        Insert: {
          ativa?: boolean
          chave: string
          criada_em?: string | null
          descricao?: string | null
          id?: string
          max_escala?: number
          min_escala?: number
          ordem?: number
          pergunta: string
          tipo?: string
        }
        Update: {
          ativa?: boolean
          chave?: string
          criada_em?: string | null
          descricao?: string | null
          id?: string
          max_escala?: number
          min_escala?: number
          ordem?: number
          pergunta?: string
          tipo?: string
        }
        Relationships: []
      }
      gestao_equipe_respostas: {
        Row: {
          avaliacao_id: string
          id: string
          nota: number | null
          pergunta_id: string
          resposta_texto: string | null
        }
        Insert: {
          avaliacao_id: string
          id?: string
          nota?: number | null
          pergunta_id: string
          resposta_texto?: string | null
        }
        Update: {
          avaliacao_id?: string
          id?: string
          nota?: number | null
          pergunta_id?: string
          resposta_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gestao_equipe_respostas_avaliacao_id_fkey"
            columns: ["avaliacao_id"]
            isOneToOne: false
            referencedRelation: "gestao_equipe_avaliacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestao_equipe_respostas_pergunta_id_fkey"
            columns: ["pergunta_id"]
            isOneToOne: false
            referencedRelation: "gestao_equipe_perguntas"
            referencedColumns: ["id"]
          },
        ]
      }
      goto_tokens: {
        Row: {
          access_token: string | null
          account_key: string | null
          criado_em: string | null
          expires_at: string | null
          id: string
          refresh_token: string | null
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          account_key?: string | null
          criado_em?: string | null
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          account_key?: string | null
          criado_em?: string | null
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goto_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      hdi_comissoes: {
        Row: {
          apolice_id: string | null
          cliente_id: string | null
          cliente_nome: string | null
          comissao_pct: number | null
          comissao_valor: number | null
          competencia: string | null
          cpf_cnpj: string | null
          created_at: string | null
          dados: Json | null
          data_emissao: string | null
          data_pagamento: string | null
          endosso: string | null
          id: string
          importacao_id: string | null
          numero_apolice: string | null
          numero_proposta: string | null
          parcela: number | null
          premio: number | null
          produto: string | null
          ramo: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          competencia?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_emissao?: string | null
          data_pagamento?: string | null
          endosso?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          parcela?: number | null
          premio?: number | null
          produto?: string | null
          ramo?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          competencia?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_emissao?: string | null
          data_pagamento?: string | null
          endosso?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          parcela?: number | null
          premio?: number | null
          produto?: string | null
          ramo?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hdi_comissoes_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hdi_comissoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hdi_comissoes_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "hdi_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      hdi_importacoes: {
        Row: {
          concluido_em: string | null
          erros: Json | null
          id: string
          iniciado_em: string | null
          nome_arquivo: string | null
          qtd_atualizados: number | null
          qtd_criados: number | null
          qtd_erros: number | null
          qtd_lidos: number | null
          tipo: string
          user_id: string | null
        }
        Insert: {
          concluido_em?: string | null
          erros?: Json | null
          id?: string
          iniciado_em?: string | null
          nome_arquivo?: string | null
          qtd_atualizados?: number | null
          qtd_criados?: number | null
          qtd_erros?: number | null
          qtd_lidos?: number | null
          tipo: string
          user_id?: string | null
        }
        Update: {
          concluido_em?: string | null
          erros?: Json | null
          id?: string
          iniciado_em?: string | null
          nome_arquivo?: string | null
          qtd_atualizados?: number | null
          qtd_criados?: number | null
          qtd_erros?: number | null
          qtd_lidos?: number | null
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hdi_importacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      hdi_inadimplencia: {
        Row: {
          apolice_id: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cpf_cnpj: string | null
          created_at: string | null
          dados: Json | null
          dias_atraso: number | null
          forma_pagamento: string | null
          id: string
          importacao_id: string | null
          numero_apolice: string | null
          numero_proposta: string | null
          parcela: number | null
          ramo: string | null
          updated_at: string | null
          valor: number | null
          vencimento: string | null
        }
        Insert: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          dias_atraso?: number | null
          forma_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          parcela?: number | null
          ramo?: string | null
          updated_at?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Update: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          dias_atraso?: number | null
          forma_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          parcela?: number | null
          ramo?: string | null
          updated_at?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hdi_inadimplencia_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hdi_inadimplencia_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hdi_inadimplencia_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "hdi_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      historico: {
        Row: {
          cliente_id: string
          created_at: string | null
          descricao: string | null
          id: string
          negocio_id: string | null
          rd_id: string | null
          tipo: string
          titulo: string
          user_id: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          negocio_id?: string | null
          rd_id?: string | null
          tipo?: string
          titulo: string
          user_id?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          negocio_id?: string | null
          rd_id?: string | null
          tipo?: string
          titulo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes_comissao: {
        Row: {
          anexo_id: string | null
          competencia: string | null
          created_at: string | null
          id: string
          nome_arquivo: string
          qtd_registros: number | null
          status: string | null
          total_importado: number | null
          user_id: string | null
        }
        Insert: {
          anexo_id?: string | null
          competencia?: string | null
          created_at?: string | null
          id?: string
          nome_arquivo: string
          qtd_registros?: number | null
          status?: string | null
          total_importado?: number | null
          user_id?: string | null
        }
        Update: {
          anexo_id?: string | null
          competencia?: string | null
          created_at?: string | null
          id?: string
          nome_arquivo?: string
          qtd_registros?: number | null
          status?: string | null
          total_importado?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_comissao_anexo_id_fkey"
            columns: ["anexo_id"]
            isOneToOne: false
            referencedRelation: "anexos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_comissao_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes_dados: {
        Row: {
          concluido_em: string | null
          entidade: string
          erros: string[] | null
          formato: string | null
          id: string
          iniciado_em: string | null
          nome_arquivo: string | null
          qtd_atualizados: number | null
          qtd_criados: number | null
          qtd_erros: number | null
          qtd_lidos: number | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          concluido_em?: string | null
          entidade: string
          erros?: string[] | null
          formato?: string | null
          id?: string
          iniciado_em?: string | null
          nome_arquivo?: string | null
          qtd_atualizados?: number | null
          qtd_criados?: number | null
          qtd_erros?: number | null
          qtd_lidos?: number | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          concluido_em?: string | null
          entidade?: string
          erros?: string[] | null
          formato?: string | null
          id?: string
          iniciado_em?: string | null
          nome_arquivo?: string | null
          qtd_atualizados?: number | null
          qtd_criados?: number | null
          qtd_erros?: number | null
          qtd_lidos?: number | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_dados_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes_porto: {
        Row: {
          concluido_em: string | null
          criado_em: string | null
          data_geracao: string | null
          erros: Json | null
          id: string
          nome_arquivo: string | null
          produto: string | null
          qtd_erros: number | null
          qtd_importados: number | null
          qtd_registros: number | null
          status: string | null
          tipo_arquivo: string | null
        }
        Insert: {
          concluido_em?: string | null
          criado_em?: string | null
          data_geracao?: string | null
          erros?: Json | null
          id?: string
          nome_arquivo?: string | null
          produto?: string | null
          qtd_erros?: number | null
          qtd_importados?: number | null
          qtd_registros?: number | null
          status?: string | null
          tipo_arquivo?: string | null
        }
        Update: {
          concluido_em?: string | null
          criado_em?: string | null
          data_geracao?: string | null
          erros?: Json | null
          id?: string
          nome_arquivo?: string | null
          produto?: string | null
          qtd_erros?: number | null
          qtd_importados?: number | null
          qtd_registros?: number | null
          status?: string | null
          tipo_arquivo?: string | null
        }
        Relationships: []
      }
      importacoes_tokio: {
        Row: {
          concluido_em: string | null
          criado_em: string | null
          data_geracao: string | null
          erros: Json | null
          id: string
          nome_arquivo: string | null
          qtd_erros: number | null
          qtd_importados: number | null
          qtd_registros: number | null
          status: string | null
          tipo_arquivo: string | null
        }
        Insert: {
          concluido_em?: string | null
          criado_em?: string | null
          data_geracao?: string | null
          erros?: Json | null
          id?: string
          nome_arquivo?: string | null
          qtd_erros?: number | null
          qtd_importados?: number | null
          qtd_registros?: number | null
          status?: string | null
          tipo_arquivo?: string | null
        }
        Update: {
          concluido_em?: string | null
          criado_em?: string | null
          data_geracao?: string | null
          erros?: Json | null
          id?: string
          nome_arquivo?: string | null
          qtd_erros?: number | null
          qtd_importados?: number | null
          qtd_registros?: number | null
          status?: string | null
          tipo_arquivo?: string | null
        }
        Relationships: []
      }
      integracao_sheets_cobranca: {
        Row: {
          ativo: boolean
          configurado_por: string | null
          created_at: string | null
          etapa_padrao: string | null
          funil_id: string | null
          id: number
          spreadsheet_id: string | null
          spreadsheet_url: string | null
          total_criados: number
          total_recebidos: number
          ultima_execucao: string | null
          updated_at: string | null
          vendedor_padrao_id: string | null
          webhook_token: string | null
        }
        Insert: {
          ativo?: boolean
          configurado_por?: string | null
          created_at?: string | null
          etapa_padrao?: string | null
          funil_id?: string | null
          id?: number
          spreadsheet_id?: string | null
          spreadsheet_url?: string | null
          total_criados?: number
          total_recebidos?: number
          ultima_execucao?: string | null
          updated_at?: string | null
          vendedor_padrao_id?: string | null
          webhook_token?: string | null
        }
        Update: {
          ativo?: boolean
          configurado_por?: string | null
          created_at?: string | null
          etapa_padrao?: string | null
          funil_id?: string | null
          id?: number
          spreadsheet_id?: string | null
          spreadsheet_url?: string | null
          total_criados?: number
          total_recebidos?: number
          ultima_execucao?: string | null
          updated_at?: string | null
          vendedor_padrao_id?: string | null
          webhook_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integracao_sheets_cobranca_configurado_por_fkey"
            columns: ["configurado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integracao_sheets_cobranca_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integracao_sheets_cobranca_vendedor_padrao_id_fkey"
            columns: ["vendedor_padrao_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      integracao_sheets_cobranca_logs: {
        Row: {
          cliente_id: string | null
          created_at: string | null
          erro: string | null
          external_id: string | null
          id: string
          negocio_id: string | null
          payload: Json
          status: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          erro?: string | null
          external_id?: string | null
          id?: string
          negocio_id?: string | null
          payload: Json
          status?: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          erro?: string | null
          external_id?: string | null
          id?: string
          negocio_id?: string | null
          payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracao_sheets_cobranca_logs_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integracao_sheets_cobranca_logs_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes_api_keys: {
        Row: {
          ativa: boolean
          conexao_id: string
          criada_em: string
          escopos: string[]
          expira_em: string | null
          id: string
          nome: string
          prefixo: string
          token_hash: string
          ultimo_uso: string | null
        }
        Insert: {
          ativa?: boolean
          conexao_id: string
          criada_em?: string
          escopos?: string[]
          expira_em?: string | null
          id?: string
          nome: string
          prefixo: string
          token_hash: string
          ultimo_uso?: string | null
        }
        Update: {
          ativa?: boolean
          conexao_id?: string
          criada_em?: string
          escopos?: string[]
          expira_em?: string | null
          id?: string
          nome?: string
          prefixo?: string
          token_hash?: string
          ultimo_uso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integracoes_api_keys_conexao_id_fkey"
            columns: ["conexao_id"]
            isOneToOne: false
            referencedRelation: "integracoes_conexoes"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes_conexoes: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          descricao: string | null
          ferramenta: string | null
          id: string
          nome: string
          owner_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          ferramenta?: string | null
          id?: string
          nome: string
          owner_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          ferramenta?: string | null
          id?: string
          nome?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracoes_conexoes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes_eventos_pendentes: {
        Row: {
          criado_em: string
          evento: string
          id: number
          payload: Json
          processado_em: string | null
          tentativas: number
        }
        Insert: {
          criado_em?: string
          evento: string
          id?: number
          payload: Json
          processado_em?: string | null
          tentativas?: number
        }
        Update: {
          criado_em?: string
          evento?: string
          id?: number
          payload?: Json
          processado_em?: string | null
          tentativas?: number
        }
        Relationships: []
      }
      integracoes_logs: {
        Row: {
          conexao_id: string | null
          criado_em: string
          direcao: string
          erro: string | null
          evento: string | null
          http_status: number | null
          id: string
          payload: Json | null
          recurso: string | null
          resposta: Json | null
          status: string
        }
        Insert: {
          conexao_id?: string | null
          criado_em?: string
          direcao: string
          erro?: string | null
          evento?: string | null
          http_status?: number | null
          id?: string
          payload?: Json | null
          recurso?: string | null
          resposta?: Json | null
          status?: string
        }
        Update: {
          conexao_id?: string | null
          criado_em?: string
          direcao?: string
          erro?: string | null
          evento?: string | null
          http_status?: number | null
          id?: string
          payload?: Json | null
          recurso?: string | null
          resposta?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracoes_logs_conexao_id_fkey"
            columns: ["conexao_id"]
            isOneToOne: false
            referencedRelation: "integracoes_conexoes"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes_webhooks_in: {
        Row: {
          ativo: boolean
          conexao_id: string
          criado_em: string
          entidade_alvo: string
          etapa_inicial: string | null
          funil_id: string | null
          id: string
          mapa_campos: Json
          nome: string
          responsaveis_ids: string[]
          responsavel_id: string | null
          responsavel_modo: string
          responsavel_proximo_idx: number
          token: string
        }
        Insert: {
          ativo?: boolean
          conexao_id: string
          criado_em?: string
          entidade_alvo: string
          etapa_inicial?: string | null
          funil_id?: string | null
          id?: string
          mapa_campos?: Json
          nome: string
          responsaveis_ids?: string[]
          responsavel_id?: string | null
          responsavel_modo?: string
          responsavel_proximo_idx?: number
          token: string
        }
        Update: {
          ativo?: boolean
          conexao_id?: string
          criado_em?: string
          entidade_alvo?: string
          etapa_inicial?: string | null
          funil_id?: string | null
          id?: string
          mapa_campos?: Json
          nome?: string
          responsaveis_ids?: string[]
          responsavel_id?: string | null
          responsavel_modo?: string
          responsavel_proximo_idx?: number
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracoes_webhooks_in_conexao_id_fkey"
            columns: ["conexao_id"]
            isOneToOne: false
            referencedRelation: "integracoes_conexoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integracoes_webhooks_in_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integracoes_webhooks_in_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes_webhooks_out: {
        Row: {
          ativo: boolean
          conexao_id: string
          criado_em: string
          eventos: string[]
          id: string
          nome: string
          secret: string | null
          ultimo_envio: string | null
          ultimo_status: number | null
          url: string
        }
        Insert: {
          ativo?: boolean
          conexao_id: string
          criado_em?: string
          eventos?: string[]
          id?: string
          nome: string
          secret?: string | null
          ultimo_envio?: string | null
          ultimo_status?: number | null
          url: string
        }
        Update: {
          ativo?: boolean
          conexao_id?: string
          criado_em?: string
          eventos?: string[]
          id?: string
          nome?: string
          secret?: string | null
          ultimo_envio?: string | null
          ultimo_status?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracoes_webhooks_out_conexao_id_fkey"
            columns: ["conexao_id"]
            isOneToOne: false
            referencedRelation: "integracoes_conexoes"
            referencedColumns: ["id"]
          },
        ]
      }
      jornadas: {
        Row: {
          accuracy_m: number | null
          cidade: string | null
          encerrada_em: string | null
          encerrada_motivo: string | null
          id: string
          iniciada_em: string
          ip: string | null
          lat: number | null
          lng: number | null
          uf: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          cidade?: string | null
          encerrada_em?: string | null
          encerrada_motivo?: string | null
          id?: string
          iniciada_em?: string
          ip?: string | null
          lat?: number | null
          lng?: number | null
          uf?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          cidade?: string | null
          encerrada_em?: string | null
          encerrada_motivo?: string | null
          id?: string
          iniciada_em?: string
          ip?: string | null
          lat?: number | null
          lng?: number | null
          uf?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornadas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ligacoes: {
        Row: {
          cliente_id: string | null
          criado_em: string | null
          direcao: string | null
          duracao_seg: number | null
          fim: string | null
          goto_call_id: string | null
          goto_conversation_id: string | null
          gravacao_url: string | null
          id: string
          inicio: string | null
          negocio_id: string | null
          nome_contato: string | null
          numero_destino: string | null
          numero_origem: string | null
          resumo_ai: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          criado_em?: string | null
          direcao?: string | null
          duracao_seg?: number | null
          fim?: string | null
          goto_call_id?: string | null
          goto_conversation_id?: string | null
          gravacao_url?: string | null
          id?: string
          inicio?: string | null
          negocio_id?: string | null
          nome_contato?: string | null
          numero_destino?: string | null
          numero_origem?: string | null
          resumo_ai?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          criado_em?: string | null
          direcao?: string | null
          duracao_seg?: number | null
          fim?: string | null
          goto_call_id?: string | null
          goto_conversation_id?: string | null
          gravacao_url?: string | null
          id?: string
          inicio?: string | null
          negocio_id?: string | null
          nome_contato?: string | null
          numero_destino?: string | null
          numero_origem?: string | null
          resumo_ai?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ligacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ligacoes_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ligacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      login_logs: {
        Row: {
          cidade: string | null
          criado_em: string
          id: number
          ip: string | null
          isp: string | null
          latitude: number | null
          longitude: number | null
          motivo: string | null
          pais: string | null
          regiao: string | null
          sucesso: boolean
          timezone: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_nome: string | null
        }
        Insert: {
          cidade?: string | null
          criado_em?: string
          id?: number
          ip?: string | null
          isp?: string | null
          latitude?: number | null
          longitude?: number | null
          motivo?: string | null
          pais?: string | null
          regiao?: string | null
          sucesso?: boolean
          timezone?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_nome?: string | null
        }
        Update: {
          cidade?: string | null
          criado_em?: string
          id?: number
          ip?: string | null
          isp?: string | null
          latitude?: number | null
          longitude?: number | null
          motivo?: string | null
          pais?: string | null
          regiao?: string | null
          sucesso?: boolean
          timezone?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      manuais: {
        Row: {
          arquivo_nome: string | null
          arquivo_tipo: string | null
          arquivo_url: string | null
          atualizado_em: string | null
          categoria: string | null
          criado_em: string | null
          criado_por: string | null
          descricao: string | null
          id: string
          tamanho_bytes: number | null
          titulo: string
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_tipo?: string | null
          arquivo_url?: string | null
          atualizado_em?: string | null
          categoria?: string | null
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          tamanho_bytes?: number | null
          titulo: string
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_tipo?: string | null
          arquivo_url?: string | null
          atualizado_em?: string | null
          categoria?: string | null
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          tamanho_bytes?: number | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "manuais_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      melhorias_crm: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          descricao: string | null
          id: string
          respondido_em: string | null
          respondido_por: string | null
          resposta: string | null
          status: string
          titulo: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          id?: string
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string | null
          status?: string
          titulo: string
          user_id: string
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          id?: string
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string | null
          status?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "melhorias_crm_respondido_por_fkey"
            columns: ["respondido_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "melhorias_crm_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      melhorias_crm_anexos: {
        Row: {
          bucket: string
          created_at: string | null
          id: string
          melhoria_id: string
          nome_arquivo: string
          path: string
          tamanho_kb: number | null
          tipo_mime: string | null
          user_id: string | null
        }
        Insert: {
          bucket?: string
          created_at?: string | null
          id?: string
          melhoria_id: string
          nome_arquivo: string
          path: string
          tamanho_kb?: number | null
          tipo_mime?: string | null
          user_id?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string | null
          id?: string
          melhoria_id?: string
          nome_arquivo?: string
          path?: string
          tamanho_kb?: number | null
          tipo_mime?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "melhorias_crm_anexos_melhoria_id_fkey"
            columns: ["melhoria_id"]
            isOneToOne: false
            referencedRelation: "melhorias_crm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "melhorias_crm_anexos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_grupo_membros: {
        Row: {
          entrou_em: string | null
          grupo_id: string
          papel: string
          user_id: string
        }
        Insert: {
          entrou_em?: string | null
          grupo_id: string
          papel?: string
          user_id: string
        }
        Update: {
          entrou_em?: string | null
          grupo_id?: string
          papel?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_grupo_membros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "mensagens_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_grupo_membros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_grupos: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_grupos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_internas: {
        Row: {
          conteudo: string
          criado_em: string | null
          de_user_id: string | null
          grupo_id: string | null
          id: string
          lida: boolean | null
          para_user_id: string | null
        }
        Insert: {
          conteudo: string
          criado_em?: string | null
          de_user_id?: string | null
          grupo_id?: string | null
          id?: string
          lida?: boolean | null
          para_user_id?: string | null
        }
        Update: {
          conteudo?: string
          criado_em?: string | null
          de_user_id?: string | null
          grupo_id?: string | null
          id?: string
          lida?: boolean | null
          para_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_internas_de_user_id_fkey"
            columns: ["de_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_internas_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "mensagens_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_internas_para_user_id_fkey"
            columns: ["para_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads: {
        Row: {
          adset_id: string | null
          atualizado_em: string | null
          formato: string | null
          id: string
          meta_id: string
          nome: string
          preview_url: string | null
          status: string | null
        }
        Insert: {
          adset_id?: string | null
          atualizado_em?: string | null
          formato?: string | null
          id?: string
          meta_id: string
          nome: string
          preview_url?: string | null
          status?: string | null
        }
        Update: {
          adset_id?: string | null
          atualizado_em?: string | null
          formato?: string | null
          id?: string
          meta_id?: string
          nome?: string
          preview_url?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "meta_adsets"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_adsets: {
        Row: {
          atualizada_em: string | null
          campanha_id: string | null
          daily_budget: number | null
          id: string
          meta_id: string
          nome: string
          status: string | null
        }
        Insert: {
          atualizada_em?: string | null
          campanha_id?: string | null
          daily_budget?: number | null
          id?: string
          meta_id: string
          nome: string
          status?: string | null
        }
        Update: {
          atualizada_em?: string | null
          campanha_id?: string | null
          daily_budget?: number | null
          id?: string
          meta_id?: string
          nome?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_adsets_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "meta_campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campanhas: {
        Row: {
          atualizada_em: string | null
          criada_em: string | null
          daily_budget: number | null
          fim: string | null
          id: string
          inicio: string | null
          meta_id: string
          nome: string
          objetivo: string | null
          status: string | null
        }
        Insert: {
          atualizada_em?: string | null
          criada_em?: string | null
          daily_budget?: number | null
          fim?: string | null
          id?: string
          inicio?: string | null
          meta_id: string
          nome: string
          objetivo?: string | null
          status?: string | null
        }
        Update: {
          atualizada_em?: string | null
          criada_em?: string | null
          daily_budget?: number | null
          fim?: string | null
          id?: string
          inicio?: string | null
          meta_id?: string
          nome?: string
          objetivo?: string | null
          status?: string | null
        }
        Relationships: []
      }
      meta_config: {
        Row: {
          access_token: string | null
          ad_account_id: string | null
          app_id: string | null
          app_secret: string | null
          configurado_em: string | null
          connected_by: string | null
          conversions_token: string | null
          dataset_id: string | null
          expires_at: string | null
          id: number
          page_access_token: string | null
          page_id: string | null
          pixel_id: string | null
          updated_at: string | null
          verify_token: string | null
          webhook_subscribed: boolean | null
        }
        Insert: {
          access_token?: string | null
          ad_account_id?: string | null
          app_id?: string | null
          app_secret?: string | null
          configurado_em?: string | null
          connected_by?: string | null
          conversions_token?: string | null
          dataset_id?: string | null
          expires_at?: string | null
          id?: number
          page_access_token?: string | null
          page_id?: string | null
          pixel_id?: string | null
          updated_at?: string | null
          verify_token?: string | null
          webhook_subscribed?: boolean | null
        }
        Update: {
          access_token?: string | null
          ad_account_id?: string | null
          app_id?: string | null
          app_secret?: string | null
          configurado_em?: string | null
          connected_by?: string | null
          conversions_token?: string | null
          dataset_id?: string | null
          expires_at?: string | null
          id?: number
          page_access_token?: string | null
          page_id?: string | null
          pixel_id?: string | null
          updated_at?: string | null
          verify_token?: string | null
          webhook_subscribed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_config_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_eventos_log: {
        Row: {
          cliente_id: string | null
          enviado_em: string | null
          enviado_por: string | null
          erro_msg: string | null
          event_name: string
          event_time: number
          id: string
          negocio_id: string | null
          payload: Json | null
          resposta: Json | null
          status: string | null
        }
        Insert: {
          cliente_id?: string | null
          enviado_em?: string | null
          enviado_por?: string | null
          erro_msg?: string | null
          event_name: string
          event_time: number
          id?: string
          negocio_id?: string | null
          payload?: Json | null
          resposta?: Json | null
          status?: string | null
        }
        Update: {
          cliente_id?: string | null
          enviado_em?: string | null
          enviado_por?: string | null
          erro_msg?: string | null
          event_name?: string
          event_time?: number
          id?: string
          negocio_id?: string | null
          payload?: Json | null
          resposta?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_eventos_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_eventos_log_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_eventos_log_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_eventos_mapping: {
        Row: {
          ativo: boolean | null
          etapa: string
          event_name: string
          funil_id: string | null
          id: string
        }
        Insert: {
          ativo?: boolean | null
          etapa: string
          event_name: string
          funil_id?: string | null
          id?: string
        }
        Update: {
          ativo?: boolean | null
          etapa?: string
          event_name?: string
          funil_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_eventos_mapping_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_form_mapeamento: {
        Row: {
          ativo: boolean
          campo_map: Json
          campo_negocio_map: Json
          created_at: string | null
          criar_negocio: boolean
          etapa: string | null
          form_id: string
          form_nome: string | null
          funil_id: string | null
          id: string
          observacoes: string | null
          page_id: string | null
          proximo_vendedor_idx: number
          titulo_campos: string[]
          updated_at: string | null
          vendedor_id: string | null
          vendedor_ids: string[]
        }
        Insert: {
          ativo?: boolean
          campo_map?: Json
          campo_negocio_map?: Json
          created_at?: string | null
          criar_negocio?: boolean
          etapa?: string | null
          form_id: string
          form_nome?: string | null
          funil_id?: string | null
          id?: string
          observacoes?: string | null
          page_id?: string | null
          proximo_vendedor_idx?: number
          titulo_campos?: string[]
          updated_at?: string | null
          vendedor_id?: string | null
          vendedor_ids?: string[]
        }
        Update: {
          ativo?: boolean
          campo_map?: Json
          campo_negocio_map?: Json
          created_at?: string | null
          criar_negocio?: boolean
          etapa?: string | null
          form_id?: string
          form_nome?: string | null
          funil_id?: string | null
          id?: string
          observacoes?: string | null
          page_id?: string | null
          proximo_vendedor_idx?: number
          titulo_campos?: string[]
          updated_at?: string | null
          vendedor_id?: string | null
          vendedor_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "meta_form_mapeamento_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_form_mapeamento_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_insights: {
        Row: {
          alcance: number | null
          atualizado_em: string | null
          cliques: number | null
          cpc: number | null
          cpm: number | null
          ctr: number | null
          data: string
          entidade_id: string
          entidade_tipo: string
          gasto: number | null
          id: string
          impressoes: number | null
          leads: number | null
        }
        Insert: {
          alcance?: number | null
          atualizado_em?: string | null
          cliques?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          data: string
          entidade_id: string
          entidade_tipo: string
          gasto?: number | null
          id?: string
          impressoes?: number | null
          leads?: number | null
        }
        Update: {
          alcance?: number | null
          atualizado_em?: string | null
          cliques?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          data?: string
          entidade_id?: string
          entidade_tipo?: string
          gasto?: number | null
          id?: string
          impressoes?: number | null
          leads?: number | null
        }
        Relationships: []
      }
      meta_leads: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          campanha_id: string | null
          campos: Json | null
          cliente_id: string | null
          form_id: string | null
          id: string
          lead_criado_em: string | null
          meta_lead_id: string
          negocio_id: string | null
          page_id: string | null
          processado_em: string | null
          recebido_em: string | null
          vendedor_id: string | null
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          campanha_id?: string | null
          campos?: Json | null
          cliente_id?: string | null
          form_id?: string | null
          id?: string
          lead_criado_em?: string | null
          meta_lead_id: string
          negocio_id?: string | null
          page_id?: string | null
          processado_em?: string | null
          recebido_em?: string | null
          vendedor_id?: string | null
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          campanha_id?: string | null
          campos?: Json | null
          cliente_id?: string | null
          form_id?: string | null
          id?: string
          lead_criado_em?: string | null
          meta_lead_id?: string
          negocio_id?: string | null
          page_id?: string | null
          processado_em?: string | null
          recebido_em?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_leads_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_leads_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_leads_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          criado_em: string | null
          criado_por: string | null
          descricao: string | null
          id: string
          periodo_fim: string
          periodo_inicio: string
          status: string | null
          tipo: string | null
          titulo: string
          updated_at: string | null
          user_id: string | null
          valor_atual: number | null
          valor_meta: number | null
        }
        Insert: {
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          periodo_fim: string
          periodo_inicio: string
          status?: string | null
          tipo?: string | null
          titulo: string
          updated_at?: string | null
          user_id?: string | null
          valor_atual?: number | null
          valor_meta?: number | null
        }
        Update: {
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          periodo_fim?: string
          periodo_inicio?: string
          status?: string | null
          tipo?: string | null
          titulo?: string
          updated_at?: string | null
          user_id?: string | null
          valor_atual?: number | null
          valor_meta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      motivos_perda: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          ordem: number | null
          rd_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number | null
          rd_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          rd_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motivos_perda_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mural_comentarios: {
        Row: {
          conteudo: string
          criado_em: string | null
          id: string
          post_id: string | null
          user_id: string | null
        }
        Insert: {
          conteudo: string
          criado_em?: string | null
          id?: string
          post_id?: string | null
          user_id?: string | null
        }
        Update: {
          conteudo?: string
          criado_em?: string | null
          id?: string
          post_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mural_comentarios_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "mural_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mural_comentarios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mural_humor: {
        Row: {
          criado_em: string | null
          dia: string
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          criado_em?: string | null
          dia?: string
          emoji: string
          id?: string
          user_id: string
        }
        Update: {
          criado_em?: string | null
          dia?: string
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mural_humor_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mural_mencoes: {
        Row: {
          comentario_id: string | null
          criado_em: string | null
          id: string
          post_id: string | null
          user_mencionado_id: string | null
        }
        Insert: {
          comentario_id?: string | null
          criado_em?: string | null
          id?: string
          post_id?: string | null
          user_mencionado_id?: string | null
        }
        Update: {
          comentario_id?: string | null
          criado_em?: string | null
          id?: string
          post_id?: string | null
          user_mencionado_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mural_mencoes_comentario_id_fkey"
            columns: ["comentario_id"]
            isOneToOne: false
            referencedRelation: "mural_comentarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mural_mencoes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "mural_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mural_mencoes_user_mencionado_id_fkey"
            columns: ["user_mencionado_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mural_posts: {
        Row: {
          conteudo: string
          criado_em: string | null
          editado_em: string | null
          foto_url: string | null
          id: string
          imagem_url: string | null
          user_id: string | null
        }
        Insert: {
          conteudo: string
          criado_em?: string | null
          editado_em?: string | null
          foto_url?: string | null
          id?: string
          imagem_url?: string | null
          user_id?: string | null
        }
        Update: {
          conteudo?: string
          criado_em?: string | null
          editado_em?: string | null
          foto_url?: string | null
          id?: string
          imagem_url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mural_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mural_reacoes: {
        Row: {
          criado_em: string | null
          id: string
          post_id: string | null
          tipo: string | null
          user_id: string | null
        }
        Insert: {
          criado_em?: string | null
          id?: string
          post_id?: string | null
          tipo?: string | null
          user_id?: string | null
        }
        Update: {
          criado_em?: string | null
          id?: string
          post_id?: string | null
          tipo?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mural_reacoes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "mural_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mural_reacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      negocio_notas: {
        Row: {
          conteudo: string
          criado_em: string | null
          id: string
          negocio_id: string
          pinned: boolean
          user_id: string | null
        }
        Insert: {
          conteudo: string
          criado_em?: string | null
          id?: string
          negocio_id: string
          pinned?: boolean
          user_id?: string | null
        }
        Update: {
          conteudo?: string
          criado_em?: string | null
          id?: string
          negocio_id?: string
          pinned?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "negocio_notas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocio_notas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      negocio_produtos: {
        Row: {
          criado_em: string | null
          desconto: number | null
          id: string
          negocio_id: string
          nome_snapshot: string
          observacao: string | null
          produto_id: string | null
          quantidade: number
          recorrencia: string | null
          valor_unit: number
        }
        Insert: {
          criado_em?: string | null
          desconto?: number | null
          id?: string
          negocio_id: string
          nome_snapshot: string
          observacao?: string | null
          produto_id?: string | null
          quantidade?: number
          recorrencia?: string | null
          valor_unit?: number
        }
        Update: {
          criado_em?: string | null
          desconto?: number | null
          id?: string
          negocio_id?: string
          nome_snapshot?: string
          observacao?: string | null
          produto_id?: string | null
          quantidade?: number
          recorrencia?: string | null
          valor_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "negocio_produtos_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocio_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      negocio_tags: {
        Row: {
          negocio_id: string
          tag_id: string
        }
        Insert: {
          negocio_id: string
          tag_id: string
        }
        Update: {
          negocio_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negocio_tags_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocio_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      negocios: {
        Row: {
          anotacao_motivo_perda: string | null
          apolice_anterior_numero: string | null
          campanha: string | null
          cargo_contato: string | null
          cep: string | null
          cep_negocio: string | null
          cliente_id: string | null
          comissao_pct: number | null
          comissao_valor: number | null
          corretor_id: string | null
          cpf_2: string | null
          cpf_cnpj: string | null
          created_at: string | null
          custom_fields: Json | null
          data_fechamento: string | null
          data_primeiro_contato: string | null
          data_proxima_tarefa: string | null
          data_ultimo_contato: string | null
          duplicado_de: string | null
          email_negocio: string | null
          empresa: string | null
          equipe_id: string | null
          etapa: string
          fechado_por: string | null
          fonte: string | null
          fonte_origem: string | null
          funcionario_clt: string | null
          funil_id: string
          id: string
          idade_beneficiarios: string | null
          mensalidade_atual: number | null
          meta_ad_id: string | null
          meta_campaign_id: string | null
          modelo_veiculo: string | null
          motivo_perda: string | null
          motivo_perda_id: string | null
          motivo_troca_plano: string | null
          obs: string | null
          operadora: string | null
          origem_id: string | null
          particular: boolean | null
          pausada: boolean | null
          placa: string | null
          placa_veiculo: string | null
          plano_atual: string | null
          possui_hospital_pref: boolean | null
          possui_plano: boolean | null
          premio: number | null
          previsao_fechamento: string | null
          produto: string | null
          qual_hospital: string | null
          qualificacao: number | null
          rastreador: string | null
          rd_id: string | null
          seguradora: string | null
          seguradora_atual: string | null
          status: string
          telefone_negocio: string | null
          tipo_cnpj: string | null
          tipo_seguro: string | null
          titulo: string | null
          updated_at: string | null
          valor_recorrente: number | null
          valor_unico: number | null
          vencimento: string | null
          vendedor_id: string | null
          vendedor_legado_id: string | null
          vigencia_seguro_fim: string | null
          vigencia_seguro_ini: string | null
        }
        Insert: {
          anotacao_motivo_perda?: string | null
          apolice_anterior_numero?: string | null
          campanha?: string | null
          cargo_contato?: string | null
          cep?: string | null
          cep_negocio?: string | null
          cliente_id?: string | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          corretor_id?: string | null
          cpf_2?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          data_fechamento?: string | null
          data_primeiro_contato?: string | null
          data_proxima_tarefa?: string | null
          data_ultimo_contato?: string | null
          duplicado_de?: string | null
          email_negocio?: string | null
          empresa?: string | null
          equipe_id?: string | null
          etapa: string
          fechado_por?: string | null
          fonte?: string | null
          fonte_origem?: string | null
          funcionario_clt?: string | null
          funil_id: string
          id?: string
          idade_beneficiarios?: string | null
          mensalidade_atual?: number | null
          meta_ad_id?: string | null
          meta_campaign_id?: string | null
          modelo_veiculo?: string | null
          motivo_perda?: string | null
          motivo_perda_id?: string | null
          motivo_troca_plano?: string | null
          obs?: string | null
          operadora?: string | null
          origem_id?: string | null
          particular?: boolean | null
          pausada?: boolean | null
          placa?: string | null
          placa_veiculo?: string | null
          plano_atual?: string | null
          possui_hospital_pref?: boolean | null
          possui_plano?: boolean | null
          premio?: number | null
          previsao_fechamento?: string | null
          produto?: string | null
          qual_hospital?: string | null
          qualificacao?: number | null
          rastreador?: string | null
          rd_id?: string | null
          seguradora?: string | null
          seguradora_atual?: string | null
          status?: string
          telefone_negocio?: string | null
          tipo_cnpj?: string | null
          tipo_seguro?: string | null
          titulo?: string | null
          updated_at?: string | null
          valor_recorrente?: number | null
          valor_unico?: number | null
          vencimento?: string | null
          vendedor_id?: string | null
          vendedor_legado_id?: string | null
          vigencia_seguro_fim?: string | null
          vigencia_seguro_ini?: string | null
        }
        Update: {
          anotacao_motivo_perda?: string | null
          apolice_anterior_numero?: string | null
          campanha?: string | null
          cargo_contato?: string | null
          cep?: string | null
          cep_negocio?: string | null
          cliente_id?: string | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          corretor_id?: string | null
          cpf_2?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          data_fechamento?: string | null
          data_primeiro_contato?: string | null
          data_proxima_tarefa?: string | null
          data_ultimo_contato?: string | null
          duplicado_de?: string | null
          email_negocio?: string | null
          empresa?: string | null
          equipe_id?: string | null
          etapa?: string
          fechado_por?: string | null
          fonte?: string | null
          fonte_origem?: string | null
          funcionario_clt?: string | null
          funil_id?: string
          id?: string
          idade_beneficiarios?: string | null
          mensalidade_atual?: number | null
          meta_ad_id?: string | null
          meta_campaign_id?: string | null
          modelo_veiculo?: string | null
          motivo_perda?: string | null
          motivo_perda_id?: string | null
          motivo_troca_plano?: string | null
          obs?: string | null
          operadora?: string | null
          origem_id?: string | null
          particular?: boolean | null
          pausada?: boolean | null
          placa?: string | null
          placa_veiculo?: string | null
          plano_atual?: string | null
          possui_hospital_pref?: boolean | null
          possui_plano?: boolean | null
          premio?: number | null
          previsao_fechamento?: string | null
          produto?: string | null
          qual_hospital?: string | null
          qualificacao?: number | null
          rastreador?: string | null
          rd_id?: string | null
          seguradora?: string | null
          seguradora_atual?: string | null
          status?: string
          telefone_negocio?: string | null
          tipo_cnpj?: string | null
          tipo_seguro?: string | null
          titulo?: string | null
          updated_at?: string | null
          valor_recorrente?: number | null
          valor_unico?: number | null
          vencimento?: string | null
          vendedor_id?: string | null
          vendedor_legado_id?: string | null
          vigencia_seguro_fim?: string | null
          vigencia_seguro_ini?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "negocios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_duplicado_de_fkey"
            columns: ["duplicado_de"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_fechado_por_fkey"
            columns: ["fechado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_motivo_perda_id_fkey"
            columns: ["motivo_perda_id"]
            isOneToOne: false
            referencedRelation: "motivos_perda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "origens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_vendedor_legado_id_fkey"
            columns: ["vendedor_legado_id"]
            isOneToOne: false
            referencedRelation: "vendedores_legado"
            referencedColumns: ["id"]
          },
        ]
      }
      negocios_suhai_state: {
        Row: {
          created_at: string | null
          etapa_sdr: string
          finalizado_em: string | null
          fluxo_id: string | null
          instancia_id: string | null
          motivo: string | null
          negocio_id: string
          proxima_acao_em: string | null
          remoto_jid: string | null
          ultima_msg_em: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          etapa_sdr?: string
          finalizado_em?: string | null
          fluxo_id?: string | null
          instancia_id?: string | null
          motivo?: string | null
          negocio_id: string
          proxima_acao_em?: string | null
          remoto_jid?: string | null
          ultima_msg_em?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          etapa_sdr?: string
          finalizado_em?: string | null
          fluxo_id?: string | null
          instancia_id?: string | null
          motivo?: string | null
          negocio_id?: string
          proxima_acao_em?: string | null
          remoto_jid?: string | null
          ultima_msg_em?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "negocios_suhai_state_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "sdr_fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_suhai_state_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_suhai_state_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: true
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          criado_em: string | null
          descricao: string | null
          id: string
          lida: boolean | null
          link: string | null
          tipo: string
          titulo: string
          user_id: string | null
        }
        Insert: {
          criado_em?: string | null
          descricao?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          tipo: string
          titulo: string
          user_id?: string | null
        }
        Update: {
          criado_em?: string | null
          descricao?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          tipo?: string
          titulo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      origens: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          id: string
          nome: string
          rd_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          id?: string
          nome: string
          rd_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          id?: string
          nome?: string
          rd_id?: string | null
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          preco_base: number | null
          rd_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          preco_base?: number | null
          rd_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          preco_base?: number | null
          rd_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas: {
        Row: {
          apolice_id: string | null
          arquivo_url: string | null
          cliente_id: string | null
          cpf_cnpj_segurado: string | null
          created_at: string | null
          data_validade: string | null
          emissao: string | null
          fonte: string | null
          forma_pagamento: string | null
          id: string
          iof: number | null
          nome_segurado: string | null
          numero: string | null
          observacao: string | null
          placa: string | null
          premio: number | null
          premio_liquido: number | null
          premio_total: number | null
          produto: string | null
          proposta_assinada: boolean | null
          proposta_endosso: string | null
          qtd_parcelas: number | null
          ramo: string | null
          seguradora: string | null
          status: string | null
          status_assinatura: string | null
          updated_at: string | null
          vigencia_fim: string | null
          vigencia_ini: string | null
        }
        Insert: {
          apolice_id?: string | null
          arquivo_url?: string | null
          cliente_id?: string | null
          cpf_cnpj_segurado?: string | null
          created_at?: string | null
          data_validade?: string | null
          emissao?: string | null
          fonte?: string | null
          forma_pagamento?: string | null
          id?: string
          iof?: number | null
          nome_segurado?: string | null
          numero?: string | null
          observacao?: string | null
          placa?: string | null
          premio?: number | null
          premio_liquido?: number | null
          premio_total?: number | null
          produto?: string | null
          proposta_assinada?: boolean | null
          proposta_endosso?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          seguradora?: string | null
          status?: string | null
          status_assinatura?: string | null
          updated_at?: string | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
        }
        Update: {
          apolice_id?: string | null
          arquivo_url?: string | null
          cliente_id?: string | null
          cpf_cnpj_segurado?: string | null
          created_at?: string | null
          data_validade?: string | null
          emissao?: string | null
          fonte?: string | null
          forma_pagamento?: string | null
          id?: string
          iof?: number | null
          nome_segurado?: string | null
          numero?: string | null
          observacao?: string | null
          placa?: string | null
          premio?: number | null
          premio_liquido?: number | null
          premio_total?: number | null
          produto?: string | null
          proposta_assinada?: boolean | null
          proposta_endosso?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          seguradora?: string | null
          status?: string | null
          status_assinatura?: string | null
          updated_at?: string | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propostas_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_crm_config: {
        Row: {
          api_token: string
          ativo: boolean
          criado_em: string
          id: number
          last_sync_at: string | null
          observacao: string | null
          updated_at: string
        }
        Insert: {
          api_token: string
          ativo?: boolean
          criado_em?: string
          id?: number
          last_sync_at?: string | null
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          api_token?: string
          ativo?: boolean
          criado_em?: string
          id?: number
          last_sync_at?: string | null
          observacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rd_responsaveis_alias: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          email: string
          id: string
          nome_planilha: string
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          email: string
          id?: string
          nome_planilha: string
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          email?: string
          id?: string
          nome_planilha?: string
        }
        Relationships: []
      }
      rdstation_cache: {
        Row: {
          atualizado_em: string
          chave: string
          valor: Json
        }
        Insert: {
          atualizado_em?: string
          chave: string
          valor: Json
        }
        Update: {
          atualizado_em?: string
          chave?: string
          valor?: Json
        }
        Relationships: []
      }
      rdstation_mapeamento_campos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          entidade: string
          id: number
          mapeamento: Json
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          entidade: string
          id?: number
          mapeamento?: Json
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          entidade?: string
          id?: number
          mapeamento?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rdstation_mapeamento_campos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rdstation_oauth: {
        Row: {
          access_token: string | null
          expires_at: string | null
          id: number
          refresh_token: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          expires_at?: string | null
          id?: number
          refresh_token?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          expires_at?: string | null
          id?: number
          refresh_token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rdstation_syncs: {
        Row: {
          concluido_em: string | null
          erros: string[] | null
          id: string
          iniciado_em: string | null
          qtd_atualizados: number | null
          qtd_criados: number | null
          qtd_erros: number | null
          qtd_lidos: number | null
          recurso: string
          status: string
          user_id: string | null
        }
        Insert: {
          concluido_em?: string | null
          erros?: string[] | null
          id?: string
          iniciado_em?: string | null
          qtd_atualizados?: number | null
          qtd_criados?: number | null
          qtd_erros?: number | null
          qtd_lidos?: number | null
          recurso: string
          status?: string
          user_id?: string | null
        }
        Update: {
          concluido_em?: string | null
          erros?: string[] | null
          id?: string
          iniciado_em?: string | null
          qtd_atualizados?: number | null
          qtd_criados?: number | null
          qtd_erros?: number | null
          qtd_lidos?: number | null
          recurso?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rdstation_syncs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_avaliacoes: {
        Row: {
          avaliador_id: string | null
          criado_em: string | null
          feedback: string | null
          funcionario_id: string
          gestao_avaliacao_id: string | null
          id: string
          metas: string | null
          nota_geral: number | null
          periodo: string
          pontos_fortes: string | null
          pontos_melhoria: string | null
        }
        Insert: {
          avaliador_id?: string | null
          criado_em?: string | null
          feedback?: string | null
          funcionario_id: string
          gestao_avaliacao_id?: string | null
          id?: string
          metas?: string | null
          nota_geral?: number | null
          periodo: string
          pontos_fortes?: string | null
          pontos_melhoria?: string | null
        }
        Update: {
          avaliador_id?: string | null
          criado_em?: string | null
          feedback?: string | null
          funcionario_id?: string
          gestao_avaliacao_id?: string | null
          id?: string
          metas?: string | null
          nota_geral?: number | null
          periodo?: string
          pontos_fortes?: string | null
          pontos_melhoria?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_avaliacoes_avaliador_id_fkey"
            columns: ["avaliador_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_avaliacoes_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "rh_funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_avaliacoes_gestao_avaliacao_id_fkey"
            columns: ["gestao_avaliacao_id"]
            isOneToOne: false
            referencedRelation: "gestao_equipe_avaliacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_banco_horas: {
        Row: {
          criado_em: string | null
          data: string
          entrada: string | null
          funcionario_id: string
          horas_devidas: number | null
          horas_extras: number | null
          horas_trab: number | null
          id: string
          obs: string | null
          retorno_almoco: string | null
          saida: string | null
          saida_almoco: string | null
        }
        Insert: {
          criado_em?: string | null
          data: string
          entrada?: string | null
          funcionario_id: string
          horas_devidas?: number | null
          horas_extras?: number | null
          horas_trab?: number | null
          id?: string
          obs?: string | null
          retorno_almoco?: string | null
          saida?: string | null
          saida_almoco?: string | null
        }
        Update: {
          criado_em?: string | null
          data?: string
          entrada?: string | null
          funcionario_id?: string
          horas_devidas?: number | null
          horas_extras?: number | null
          horas_trab?: number | null
          id?: string
          obs?: string | null
          retorno_almoco?: string | null
          saida?: string | null
          saida_almoco?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_banco_horas_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "rh_funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_beneficios: {
        Row: {
          fim: string | null
          funcionario_id: string
          id: string
          inicio: string | null
          obs: string | null
          tipo: string
          valor: number | null
        }
        Insert: {
          fim?: string | null
          funcionario_id: string
          id?: string
          inicio?: string | null
          obs?: string | null
          tipo: string
          valor?: number | null
        }
        Update: {
          fim?: string | null
          funcionario_id?: string
          id?: string
          inicio?: string | null
          obs?: string | null
          tipo?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_beneficios_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "rh_funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_cargos: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          descricao: string | null
          id: string
          nome: string
          salario_base: number | null
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          descricao?: string | null
          id?: string
          nome: string
          salario_base?: number | null
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          salario_base?: number | null
        }
        Relationships: []
      }
      rh_comissoes: {
        Row: {
          anexo_nome: string | null
          anexo_path: string | null
          competencia: string | null
          created_at: string | null
          created_by: string | null
          decidido_em: string | null
          descricao: string | null
          duvida_texto: string | null
          id: string
          resposta_rh: string | null
          status: string
          updated_at: string | null
          valor: number
          vendedor_id: string
        }
        Insert: {
          anexo_nome?: string | null
          anexo_path?: string | null
          competencia?: string | null
          created_at?: string | null
          created_by?: string | null
          decidido_em?: string | null
          descricao?: string | null
          duvida_texto?: string | null
          id?: string
          resposta_rh?: string | null
          status?: string
          updated_at?: string | null
          valor: number
          vendedor_id: string
        }
        Update: {
          anexo_nome?: string | null
          anexo_path?: string | null
          competencia?: string | null
          created_at?: string | null
          created_by?: string | null
          decidido_em?: string | null
          descricao?: string | null
          duvida_texto?: string | null
          id?: string
          resposta_rh?: string | null
          status?: string
          updated_at?: string | null
          valor?: number
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_comissoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_comissoes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_desligamentos: {
        Row: {
          acerto_valor: number | null
          data: string
          exame_demissional: boolean | null
          funcionario_id: string
          id: string
          motivo: string | null
          registrado_em: string | null
          registrado_por: string | null
          tipo: string
        }
        Insert: {
          acerto_valor?: number | null
          data: string
          exame_demissional?: boolean | null
          funcionario_id: string
          id?: string
          motivo?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          tipo: string
        }
        Update: {
          acerto_valor?: number | null
          data?: string
          exame_demissional?: boolean | null
          funcionario_id?: string
          id?: string
          motivo?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_desligamentos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "rh_funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_desligamentos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_documentos: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string
          descricao: string | null
          enviado_em: string | null
          enviado_por: string | null
          funcionario_id: string
          id: string
          tipo: string
          validade: string | null
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url: string
          descricao?: string | null
          enviado_em?: string | null
          enviado_por?: string | null
          funcionario_id: string
          id?: string
          tipo: string
          validade?: string | null
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string
          descricao?: string | null
          enviado_em?: string | null
          enviado_por?: string | null
          funcionario_id?: string
          id?: string
          tipo?: string
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_documentos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_documentos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "rh_funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ferias: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          dias: number | null
          fim: string
          funcionario_id: string
          id: string
          inicio: string
          justificativa: string | null
          motivo_ajustes: string | null
          obs: string | null
          solicitado_em: string | null
          status: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          dias?: number | null
          fim: string
          funcionario_id: string
          id?: string
          inicio: string
          justificativa?: string | null
          motivo_ajustes?: string | null
          obs?: string | null
          solicitado_em?: string | null
          status?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          dias?: number | null
          fim?: string
          funcionario_id?: string
          id?: string
          inicio?: string
          justificativa?: string | null
          motivo_ajustes?: string | null
          obs?: string | null
          solicitado_em?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_ferias_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ferias_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "rh_funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_funcionarios: {
        Row: {
          agencia: string | null
          atualizado_em: string | null
          banco: string | null
          cargo_id: string | null
          cep: string | null
          cidade: string | null
          comissao_pct_meta_batida: number | null
          comissao_pct_padrao: number | null
          conta: string | null
          contato_emerg_fone: string | null
          contato_emerg_nome: string | null
          cpf: string | null
          criado_em: string | null
          data_admissao: string | null
          data_demissao: string | null
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          foto_url: string | null
          id: string
          nome: string
          obs: string | null
          pix: string | null
          rg: string | null
          salario: number | null
          status: string
          telefone: string | null
          user_id: string | null
        }
        Insert: {
          agencia?: string | null
          atualizado_em?: string | null
          banco?: string | null
          cargo_id?: string | null
          cep?: string | null
          cidade?: string | null
          comissao_pct_meta_batida?: number | null
          comissao_pct_padrao?: number | null
          conta?: string | null
          contato_emerg_fone?: string | null
          contato_emerg_nome?: string | null
          cpf?: string | null
          criado_em?: string | null
          data_admissao?: string | null
          data_demissao?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          nome: string
          obs?: string | null
          pix?: string | null
          rg?: string | null
          salario?: number | null
          status?: string
          telefone?: string | null
          user_id?: string | null
        }
        Update: {
          agencia?: string | null
          atualizado_em?: string | null
          banco?: string | null
          cargo_id?: string | null
          cep?: string | null
          cidade?: string | null
          comissao_pct_meta_batida?: number | null
          comissao_pct_padrao?: number | null
          conta?: string | null
          contato_emerg_fone?: string | null
          contato_emerg_nome?: string | null
          cpf?: string | null
          criado_em?: string | null
          data_admissao?: string | null
          data_demissao?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          nome?: string
          obs?: string | null
          pix?: string | null
          rg?: string | null
          salario?: number | null
          status?: string
          telefone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_funcionarios_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "rh_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_funcionarios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_treinamentos: {
        Row: {
          carga_horaria: number | null
          certificado_url: string | null
          criado_em: string | null
          data_fim: string | null
          data_inicio: string | null
          funcionario_id: string
          id: string
          instituicao: string | null
          obs: string | null
          status: string | null
          titulo: string
        }
        Insert: {
          carga_horaria?: number | null
          certificado_url?: string | null
          criado_em?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          funcionario_id: string
          id?: string
          instituicao?: string | null
          obs?: string | null
          status?: string | null
          titulo: string
        }
        Update: {
          carga_horaria?: number | null
          certificado_url?: string | null
          criado_em?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          funcionario_id?: string
          id?: string
          instituicao?: string | null
          obs?: string | null
          status?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_treinamentos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "rh_funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      sdr_fluxos: {
        Row: {
          agente_id: string
          ativo: boolean
          created_at: string | null
          created_by: string | null
          descricao: string | null
          etapa_interacao: string
          etapa_perdido: string
          etapas_tentativas: string[]
          funil_id: string
          horario_util_fim: string
          horario_util_inicio: string
          horas_entre_tentativas: number
          id: string
          nome: string
          prompt_template: string
          updated_at: string | null
        }
        Insert: {
          agente_id: string
          ativo?: boolean
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          etapa_interacao: string
          etapa_perdido: string
          etapas_tentativas: string[]
          funil_id: string
          horario_util_fim?: string
          horario_util_inicio?: string
          horas_entre_tentativas?: number
          id?: string
          nome: string
          prompt_template: string
          updated_at?: string | null
        }
        Update: {
          agente_id?: string
          ativo?: boolean
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          etapa_interacao?: string
          etapa_perdido?: string
          etapas_tentativas?: string[]
          funil_id?: string
          horario_util_fim?: string
          horario_util_inicio?: string
          horas_entre_tentativas?: number
          id?: string
          nome?: string
          prompt_template?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sdr_fluxos_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "ai_agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_fluxos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_fluxos_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
        ]
      }
      seg_importacoes: {
        Row: {
          concluido_em: string | null
          formato: string
          id: string
          iniciado_em: string | null
          nome_arquivo: string | null
          qtd_erros: number | null
          qtd_linhas: number | null
          qtd_pendentes: number | null
          qtd_sincronizadas: number | null
          seguradora_id: string
          tipo: string
          user_id: string | null
        }
        Insert: {
          concluido_em?: string | null
          formato: string
          id?: string
          iniciado_em?: string | null
          nome_arquivo?: string | null
          qtd_erros?: number | null
          qtd_linhas?: number | null
          qtd_pendentes?: number | null
          qtd_sincronizadas?: number | null
          seguradora_id: string
          tipo: string
          user_id?: string | null
        }
        Update: {
          concluido_em?: string | null
          formato?: string
          id?: string
          iniciado_em?: string | null
          nome_arquivo?: string | null
          qtd_erros?: number | null
          qtd_linhas?: number | null
          qtd_pendentes?: number | null
          qtd_sincronizadas?: number | null
          seguradora_id?: string
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seg_imp_seguradora_fk"
            columns: ["seguradora_id"]
            isOneToOne: false
            referencedRelation: "seguradoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_importacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      seg_stage_apolices: {
        Row: {
          acessorios: string | null
          adicional_fracionamento: number | null
          agencia_pagto: string | null
          ano_fabricacao: string | null
          ano_modelo: string | null
          apolice_anterior: string | null
          apolice_id: string | null
          assistencias: Json | null
          banco_pagto: string | null
          bandeira_cartao: string | null
          beneficiario: string | null
          blindagem: string | null
          bonificacao: number | null
          bonus_unico: string | null
          cambio_automatico: string | null
          carroceria: string | null
          cartao_mascarado: string | null
          categoria_risco: string | null
          categoria_tarifaria: string | null
          cep_circulacao: string | null
          cep_pernoite: string | null
          chassi: string | null
          chassi_remarcado: string | null
          classe_bonus: number | null
          clausulas: Json | null
          cliente_criado_auto: boolean
          cliente_id: string | null
          cliente_nome: string | null
          coberturas: Json | null
          coberturas_adicionais: Json | null
          cod_fipe: string | null
          codigo_ci: string | null
          codigo_interno: string | null
          combustivel: string | null
          comissao_pct: number | null
          condutor_cobertura_jovem: string | null
          condutor_cpf: string | null
          condutor_data_nasc: string | null
          condutor_estado_civil: string | null
          condutor_idade: number | null
          condutor_nome: string | null
          condutor_sexo: string | null
          condutor_vinculo: string | null
          congenere: string | null
          conta_pagto: string | null
          contrato: string | null
          cor: string | null
          corretor_bairro: string | null
          corretor_cep: string | null
          corretor_cidade: string | null
          corretor_cnpj: string | null
          corretor_cod_interno: string | null
          corretor_codigo: string | null
          corretor_cpd: string | null
          corretor_email: string | null
          corretor_endereco: string | null
          corretor_filial: string | null
          corretor_inspetoria: string | null
          corretor_lider: string | null
          corretor_nome: string | null
          corretor_participacao: number | null
          corretor_susep: string | null
          corretor_susep_oficial: string | null
          corretor_telefone: string | null
          corretor_uf: string | null
          cpf_apolice_anterior: string | null
          cpf_cnpj: string | null
          cpf_titular_pagto: string | null
          created_at: string | null
          custeio: string | null
          custo_apolice: number | null
          dados: Json | null
          data_emissao: string | null
          data_nascimento: string | null
          data_saida_concessionaria: string | null
          descontos: number | null
          descontos_aplicados: Json | null
          dia_vencimento: number | null
          dispositivo_antifurto: string | null
          encargos: number | null
          endosso: string | null
          erro_msg: string | null
          fator_ajuste: number | null
          faturamento: string | null
          filial_ezze: string | null
          fim_vigencia_anterior: string | null
          forma_pagamento: string | null
          franquias: Json | null
          garagem: string | null
          garagem_escola: string | null
          garagem_trabalho: string | null
          gestor_cartao: string | null
          id: string
          importacao_id: string | null
          iof: number | null
          iof_mensal: number | null
          isento_fiscal: string | null
          item: string | null
          item_anterior: string | null
          item_veiculo: number | null
          juros: number | null
          kit_gas: string | null
          km_anual: number | null
          layout_pdf: string | null
          marca: string | null
          modalidade: string | null
          modelo: string | null
          nome_social: string | null
          nota_fiscal: string | null
          nr_eixos: number | null
          nr_passageiros: number | null
          nr_portas: number | null
          numero: string | null
          parcelas: Json | null
          pcd: string | null
          pdf_texto_bruto: string | null
          periodicidade: string | null
          pernoite_garagem: string | null
          placa: string | null
          premio: number | null
          premio_acessorios: number | null
          premio_app: number | null
          premio_auto: number | null
          premio_blindagem: number | null
          premio_kit_gas: number | null
          premio_liquido: number | null
          premio_liquido_mensal: number | null
          premio_rcf: number | null
          premio_rcv: number | null
          premio_residencial: number | null
          premio_total: number | null
          premio_total_mensal: number | null
          principal_condutor: string | null
          processo_susep: string | null
          produto: string | null
          proposta: string | null
          proprietario_cpf_cnpj: string | null
          proprietario_data_nasc: string | null
          proprietario_nome: string | null
          proprietario_tipo_pessoa: string | null
          proprietario_vinculo: string | null
          protocolo: string | null
          proximo_vencimento: string | null
          qtd_parcelas: number | null
          ramo: string | null
          ramo_codigo: string | null
          ramo_descricao: string | null
          rastreador: string | null
          rastreador_obrigatorio: string | null
          renavam: string | null
          renovacao_seguradora: string | null
          residentes_18_24: string | null
          rule_id: string | null
          segurado_atividade: string | null
          segurado_bairro: string | null
          segurado_cep: string | null
          segurado_cidade: string | null
          segurado_complemento: string | null
          segurado_doc_data_exp: string | null
          segurado_doc_identidade: string | null
          segurado_doc_orgao_exp: string | null
          segurado_email: string | null
          segurado_email2: string | null
          segurado_endereco: string | null
          segurado_estado_civil: string | null
          segurado_nacionalidade: string | null
          segurado_naturalidade: string | null
          segurado_nome_social: string | null
          segurado_numero: string | null
          segurado_pais_nascimento: string | null
          segurado_profissao: string | null
          segurado_renda: number | null
          segurado_telefone: string | null
          segurado_telefone2: string | null
          segurado_uf: string | null
          seguradora_anterior: string | null
          seguradora_id: string
          seguradora_origem: string | null
          servicos: Json | null
          sexo: string | null
          sexo_residentes: string | null
          sincronizado_em: string | null
          sinistro_ult_vigencia: string | null
          status: string
          status_apolice: string | null
          status_operacao: string | null
          subtotal: number | null
          sucursal: string | null
          sucursal_codigo: string | null
          sucursal_nome: string | null
          tabela_referencia: string | null
          tabela_substituta: string | null
          taxa_juros: number | null
          taxas: number | null
          tid_cartao: string | null
          tipo_apolice: string | null
          tipo_franquia_casco: string | null
          tipo_instalacao_antif: string | null
          tipo_isencao: string | null
          tipo_operacao: string | null
          tipo_pessoa: string | null
          tipo_residencia: string | null
          tipo_seguro: string | null
          tipo_seguro_anterior: string | null
          tipo_semireboque: string | null
          tipo_utilizacao: string | null
          tipo_veiculo: string | null
          titular_cartao: string | null
          utilizacao_veiculo: string | null
          validade_cartao: string | null
          valor_acessorios: number | null
          valor_parcela: number | null
          versao: string | null
          vigencia_fim: string | null
          vigencia_ini: string | null
          vigencia_meses: number | null
          vistoria_previa: string | null
          zero_km: string | null
        }
        Insert: {
          acessorios?: string | null
          adicional_fracionamento?: number | null
          agencia_pagto?: string | null
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          apolice_anterior?: string | null
          apolice_id?: string | null
          assistencias?: Json | null
          banco_pagto?: string | null
          bandeira_cartao?: string | null
          beneficiario?: string | null
          blindagem?: string | null
          bonificacao?: number | null
          bonus_unico?: string | null
          cambio_automatico?: string | null
          carroceria?: string | null
          cartao_mascarado?: string | null
          categoria_risco?: string | null
          categoria_tarifaria?: string | null
          cep_circulacao?: string | null
          cep_pernoite?: string | null
          chassi?: string | null
          chassi_remarcado?: string | null
          classe_bonus?: number | null
          clausulas?: Json | null
          cliente_criado_auto?: boolean
          cliente_id?: string | null
          cliente_nome?: string | null
          coberturas?: Json | null
          coberturas_adicionais?: Json | null
          cod_fipe?: string | null
          codigo_ci?: string | null
          codigo_interno?: string | null
          combustivel?: string | null
          comissao_pct?: number | null
          condutor_cobertura_jovem?: string | null
          condutor_cpf?: string | null
          condutor_data_nasc?: string | null
          condutor_estado_civil?: string | null
          condutor_idade?: number | null
          condutor_nome?: string | null
          condutor_sexo?: string | null
          condutor_vinculo?: string | null
          congenere?: string | null
          conta_pagto?: string | null
          contrato?: string | null
          cor?: string | null
          corretor_bairro?: string | null
          corretor_cep?: string | null
          corretor_cidade?: string | null
          corretor_cnpj?: string | null
          corretor_cod_interno?: string | null
          corretor_codigo?: string | null
          corretor_cpd?: string | null
          corretor_email?: string | null
          corretor_endereco?: string | null
          corretor_filial?: string | null
          corretor_inspetoria?: string | null
          corretor_lider?: string | null
          corretor_nome?: string | null
          corretor_participacao?: number | null
          corretor_susep?: string | null
          corretor_susep_oficial?: string | null
          corretor_telefone?: string | null
          corretor_uf?: string | null
          cpf_apolice_anterior?: string | null
          cpf_cnpj?: string | null
          cpf_titular_pagto?: string | null
          created_at?: string | null
          custeio?: string | null
          custo_apolice?: number | null
          dados?: Json | null
          data_emissao?: string | null
          data_nascimento?: string | null
          data_saida_concessionaria?: string | null
          descontos?: number | null
          descontos_aplicados?: Json | null
          dia_vencimento?: number | null
          dispositivo_antifurto?: string | null
          encargos?: number | null
          endosso?: string | null
          erro_msg?: string | null
          fator_ajuste?: number | null
          faturamento?: string | null
          filial_ezze?: string | null
          fim_vigencia_anterior?: string | null
          forma_pagamento?: string | null
          franquias?: Json | null
          garagem?: string | null
          garagem_escola?: string | null
          garagem_trabalho?: string | null
          gestor_cartao?: string | null
          id?: string
          importacao_id?: string | null
          iof?: number | null
          iof_mensal?: number | null
          isento_fiscal?: string | null
          item?: string | null
          item_anterior?: string | null
          item_veiculo?: number | null
          juros?: number | null
          kit_gas?: string | null
          km_anual?: number | null
          layout_pdf?: string | null
          marca?: string | null
          modalidade?: string | null
          modelo?: string | null
          nome_social?: string | null
          nota_fiscal?: string | null
          nr_eixos?: number | null
          nr_passageiros?: number | null
          nr_portas?: number | null
          numero?: string | null
          parcelas?: Json | null
          pcd?: string | null
          pdf_texto_bruto?: string | null
          periodicidade?: string | null
          pernoite_garagem?: string | null
          placa?: string | null
          premio?: number | null
          premio_acessorios?: number | null
          premio_app?: number | null
          premio_auto?: number | null
          premio_blindagem?: number | null
          premio_kit_gas?: number | null
          premio_liquido?: number | null
          premio_liquido_mensal?: number | null
          premio_rcf?: number | null
          premio_rcv?: number | null
          premio_residencial?: number | null
          premio_total?: number | null
          premio_total_mensal?: number | null
          principal_condutor?: string | null
          processo_susep?: string | null
          produto?: string | null
          proposta?: string | null
          proprietario_cpf_cnpj?: string | null
          proprietario_data_nasc?: string | null
          proprietario_nome?: string | null
          proprietario_tipo_pessoa?: string | null
          proprietario_vinculo?: string | null
          protocolo?: string | null
          proximo_vencimento?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          ramo_codigo?: string | null
          ramo_descricao?: string | null
          rastreador?: string | null
          rastreador_obrigatorio?: string | null
          renavam?: string | null
          renovacao_seguradora?: string | null
          residentes_18_24?: string | null
          rule_id?: string | null
          segurado_atividade?: string | null
          segurado_bairro?: string | null
          segurado_cep?: string | null
          segurado_cidade?: string | null
          segurado_complemento?: string | null
          segurado_doc_data_exp?: string | null
          segurado_doc_identidade?: string | null
          segurado_doc_orgao_exp?: string | null
          segurado_email?: string | null
          segurado_email2?: string | null
          segurado_endereco?: string | null
          segurado_estado_civil?: string | null
          segurado_nacionalidade?: string | null
          segurado_naturalidade?: string | null
          segurado_nome_social?: string | null
          segurado_numero?: string | null
          segurado_pais_nascimento?: string | null
          segurado_profissao?: string | null
          segurado_renda?: number | null
          segurado_telefone?: string | null
          segurado_telefone2?: string | null
          segurado_uf?: string | null
          seguradora_anterior?: string | null
          seguradora_id: string
          seguradora_origem?: string | null
          servicos?: Json | null
          sexo?: string | null
          sexo_residentes?: string | null
          sincronizado_em?: string | null
          sinistro_ult_vigencia?: string | null
          status?: string
          status_apolice?: string | null
          status_operacao?: string | null
          subtotal?: number | null
          sucursal?: string | null
          sucursal_codigo?: string | null
          sucursal_nome?: string | null
          tabela_referencia?: string | null
          tabela_substituta?: string | null
          taxa_juros?: number | null
          taxas?: number | null
          tid_cartao?: string | null
          tipo_apolice?: string | null
          tipo_franquia_casco?: string | null
          tipo_instalacao_antif?: string | null
          tipo_isencao?: string | null
          tipo_operacao?: string | null
          tipo_pessoa?: string | null
          tipo_residencia?: string | null
          tipo_seguro?: string | null
          tipo_seguro_anterior?: string | null
          tipo_semireboque?: string | null
          tipo_utilizacao?: string | null
          tipo_veiculo?: string | null
          titular_cartao?: string | null
          utilizacao_veiculo?: string | null
          validade_cartao?: string | null
          valor_acessorios?: number | null
          valor_parcela?: number | null
          versao?: string | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
          vigencia_meses?: number | null
          vistoria_previa?: string | null
          zero_km?: string | null
        }
        Update: {
          acessorios?: string | null
          adicional_fracionamento?: number | null
          agencia_pagto?: string | null
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          apolice_anterior?: string | null
          apolice_id?: string | null
          assistencias?: Json | null
          banco_pagto?: string | null
          bandeira_cartao?: string | null
          beneficiario?: string | null
          blindagem?: string | null
          bonificacao?: number | null
          bonus_unico?: string | null
          cambio_automatico?: string | null
          carroceria?: string | null
          cartao_mascarado?: string | null
          categoria_risco?: string | null
          categoria_tarifaria?: string | null
          cep_circulacao?: string | null
          cep_pernoite?: string | null
          chassi?: string | null
          chassi_remarcado?: string | null
          classe_bonus?: number | null
          clausulas?: Json | null
          cliente_criado_auto?: boolean
          cliente_id?: string | null
          cliente_nome?: string | null
          coberturas?: Json | null
          coberturas_adicionais?: Json | null
          cod_fipe?: string | null
          codigo_ci?: string | null
          codigo_interno?: string | null
          combustivel?: string | null
          comissao_pct?: number | null
          condutor_cobertura_jovem?: string | null
          condutor_cpf?: string | null
          condutor_data_nasc?: string | null
          condutor_estado_civil?: string | null
          condutor_idade?: number | null
          condutor_nome?: string | null
          condutor_sexo?: string | null
          condutor_vinculo?: string | null
          congenere?: string | null
          conta_pagto?: string | null
          contrato?: string | null
          cor?: string | null
          corretor_bairro?: string | null
          corretor_cep?: string | null
          corretor_cidade?: string | null
          corretor_cnpj?: string | null
          corretor_cod_interno?: string | null
          corretor_codigo?: string | null
          corretor_cpd?: string | null
          corretor_email?: string | null
          corretor_endereco?: string | null
          corretor_filial?: string | null
          corretor_inspetoria?: string | null
          corretor_lider?: string | null
          corretor_nome?: string | null
          corretor_participacao?: number | null
          corretor_susep?: string | null
          corretor_susep_oficial?: string | null
          corretor_telefone?: string | null
          corretor_uf?: string | null
          cpf_apolice_anterior?: string | null
          cpf_cnpj?: string | null
          cpf_titular_pagto?: string | null
          created_at?: string | null
          custeio?: string | null
          custo_apolice?: number | null
          dados?: Json | null
          data_emissao?: string | null
          data_nascimento?: string | null
          data_saida_concessionaria?: string | null
          descontos?: number | null
          descontos_aplicados?: Json | null
          dia_vencimento?: number | null
          dispositivo_antifurto?: string | null
          encargos?: number | null
          endosso?: string | null
          erro_msg?: string | null
          fator_ajuste?: number | null
          faturamento?: string | null
          filial_ezze?: string | null
          fim_vigencia_anterior?: string | null
          forma_pagamento?: string | null
          franquias?: Json | null
          garagem?: string | null
          garagem_escola?: string | null
          garagem_trabalho?: string | null
          gestor_cartao?: string | null
          id?: string
          importacao_id?: string | null
          iof?: number | null
          iof_mensal?: number | null
          isento_fiscal?: string | null
          item?: string | null
          item_anterior?: string | null
          item_veiculo?: number | null
          juros?: number | null
          kit_gas?: string | null
          km_anual?: number | null
          layout_pdf?: string | null
          marca?: string | null
          modalidade?: string | null
          modelo?: string | null
          nome_social?: string | null
          nota_fiscal?: string | null
          nr_eixos?: number | null
          nr_passageiros?: number | null
          nr_portas?: number | null
          numero?: string | null
          parcelas?: Json | null
          pcd?: string | null
          pdf_texto_bruto?: string | null
          periodicidade?: string | null
          pernoite_garagem?: string | null
          placa?: string | null
          premio?: number | null
          premio_acessorios?: number | null
          premio_app?: number | null
          premio_auto?: number | null
          premio_blindagem?: number | null
          premio_kit_gas?: number | null
          premio_liquido?: number | null
          premio_liquido_mensal?: number | null
          premio_rcf?: number | null
          premio_rcv?: number | null
          premio_residencial?: number | null
          premio_total?: number | null
          premio_total_mensal?: number | null
          principal_condutor?: string | null
          processo_susep?: string | null
          produto?: string | null
          proposta?: string | null
          proprietario_cpf_cnpj?: string | null
          proprietario_data_nasc?: string | null
          proprietario_nome?: string | null
          proprietario_tipo_pessoa?: string | null
          proprietario_vinculo?: string | null
          protocolo?: string | null
          proximo_vencimento?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          ramo_codigo?: string | null
          ramo_descricao?: string | null
          rastreador?: string | null
          rastreador_obrigatorio?: string | null
          renavam?: string | null
          renovacao_seguradora?: string | null
          residentes_18_24?: string | null
          rule_id?: string | null
          segurado_atividade?: string | null
          segurado_bairro?: string | null
          segurado_cep?: string | null
          segurado_cidade?: string | null
          segurado_complemento?: string | null
          segurado_doc_data_exp?: string | null
          segurado_doc_identidade?: string | null
          segurado_doc_orgao_exp?: string | null
          segurado_email?: string | null
          segurado_email2?: string | null
          segurado_endereco?: string | null
          segurado_estado_civil?: string | null
          segurado_nacionalidade?: string | null
          segurado_naturalidade?: string | null
          segurado_nome_social?: string | null
          segurado_numero?: string | null
          segurado_pais_nascimento?: string | null
          segurado_profissao?: string | null
          segurado_renda?: number | null
          segurado_telefone?: string | null
          segurado_telefone2?: string | null
          segurado_uf?: string | null
          seguradora_anterior?: string | null
          seguradora_id?: string
          seguradora_origem?: string | null
          servicos?: Json | null
          sexo?: string | null
          sexo_residentes?: string | null
          sincronizado_em?: string | null
          sinistro_ult_vigencia?: string | null
          status?: string
          status_apolice?: string | null
          status_operacao?: string | null
          subtotal?: number | null
          sucursal?: string | null
          sucursal_codigo?: string | null
          sucursal_nome?: string | null
          tabela_referencia?: string | null
          tabela_substituta?: string | null
          taxa_juros?: number | null
          taxas?: number | null
          tid_cartao?: string | null
          tipo_apolice?: string | null
          tipo_franquia_casco?: string | null
          tipo_instalacao_antif?: string | null
          tipo_isencao?: string | null
          tipo_operacao?: string | null
          tipo_pessoa?: string | null
          tipo_residencia?: string | null
          tipo_seguro?: string | null
          tipo_seguro_anterior?: string | null
          tipo_semireboque?: string | null
          tipo_utilizacao?: string | null
          tipo_veiculo?: string | null
          titular_cartao?: string | null
          utilizacao_veiculo?: string | null
          validade_cartao?: string | null
          valor_acessorios?: number | null
          valor_parcela?: number | null
          versao?: string | null
          vigencia_fim?: string | null
          vigencia_ini?: string | null
          vigencia_meses?: number | null
          vistoria_previa?: string | null
          zero_km?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seg_stage_apolices_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_apolices_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_apolices_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "seg_importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_apolices_seguradora_id_fkey"
            columns: ["seguradora_id"]
            isOneToOne: false
            referencedRelation: "seguradoras"
            referencedColumns: ["id"]
          },
        ]
      }
      seg_stage_comissoes: {
        Row: {
          abatimento: number | null
          adiantamento: number | null
          agencia: string | null
          agencia_producao: string | null
          aliquota_inss: number | null
          aliquota_irrf: number | null
          aliquota_iss: number | null
          antecipada: string | null
          apolice_id: string | null
          banco: string | null
          base_irpj: number | null
          base_tributaria: number | null
          bilhete: string | null
          carteira: string | null
          certificado: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cnpj_emissao_nf: string | null
          cnpj_filial: string | null
          codigo_interno: string | null
          cofins: number | null
          comissao_bruta: number | null
          comissao_id: string | null
          comissao_liquida: number | null
          comissao_pct: number | null
          comissao_valor: number | null
          competencia: string | null
          conta_corrente: string | null
          corretor_cnpj: string | null
          corretor_endereco: string | null
          corretor_inscricao_inss: string | null
          corretor_inscricao_municipio: string | null
          corretor_nome: string | null
          corretor_susep: string | null
          cpf_cnpj: string | null
          created_at: string | null
          csll: number | null
          dados: Json | null
          data_baixa: string | null
          data_credito: string | null
          data_emissao: string | null
          data_extrato: string | null
          data_pagamento: string | null
          desconto_adiantamento: number | null
          descricao_lancamento: string | null
          descricao_operacao: string | null
          doc_numero: string | null
          endosso: string | null
          erro_msg: string | null
          filial: string | null
          forma_credito: string | null
          id: string
          importacao_id: string | null
          inspetoria: string | null
          inss: number | null
          irrf: number | null
          iss: number | null
          layout_pdf: string | null
          marca_seguradora: string | null
          motivo_recuperacao: string | null
          nat: string | null
          negocio: string | null
          numero_apolice: string | null
          numero_contrato: string | null
          numero_extrato: string | null
          numero_fatura: string | null
          numero_formulario_venda: string | null
          numero_proposta: string | null
          numero_recibo: string | null
          ordem_pagamento: string | null
          outros_creditos_debitos: number | null
          parcela: number | null
          pc_comissao: number | null
          pdf_texto_bruto: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          pis: number | null
          pis_cofins_csll: number | null
          premio: number | null
          premio_liquido: number | null
          premio_taxa: number | null
          produto: string | null
          protocolo: string | null
          ramo_codigo: string | null
          ramo_descricao: string | null
          rce: number | null
          recuperacao: number | null
          saldo_atual: number | null
          saldo_recuperar: number | null
          seguradora_id: string
          seguradora_origem: string | null
          sincronizado_em: string | null
          status: string
          sub_codigo: string | null
          subfatura: string | null
          sucursal: string | null
          supervisor_codigo: string | null
          supervisor_nome: string | null
          susep_favorecida: string | null
          susep_producao: string | null
          tipo_comissao: string | null
          tipo_credito: string | null
          tipo_documento: string | null
          tipo_lancamento: string | null
          tipo_lancamento_codigo: string | null
          tipo_pagamento: string | null
          tipo_zurich: string | null
          total_bruto: number | null
          total_descontos: number | null
          total_inss: number | null
          total_irrf: number | null
          total_iss: number | null
          total_liquido: number | null
          total_parcelas: number | null
          valor_emissao_nf: number | null
        }
        Insert: {
          abatimento?: number | null
          adiantamento?: number | null
          agencia?: string | null
          agencia_producao?: string | null
          aliquota_inss?: number | null
          aliquota_irrf?: number | null
          aliquota_iss?: number | null
          antecipada?: string | null
          apolice_id?: string | null
          banco?: string | null
          base_irpj?: number | null
          base_tributaria?: number | null
          bilhete?: string | null
          carteira?: string | null
          certificado?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cnpj_emissao_nf?: string | null
          cnpj_filial?: string | null
          codigo_interno?: string | null
          cofins?: number | null
          comissao_bruta?: number | null
          comissao_id?: string | null
          comissao_liquida?: number | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          competencia?: string | null
          conta_corrente?: string | null
          corretor_cnpj?: string | null
          corretor_endereco?: string | null
          corretor_inscricao_inss?: string | null
          corretor_inscricao_municipio?: string | null
          corretor_nome?: string | null
          corretor_susep?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          csll?: number | null
          dados?: Json | null
          data_baixa?: string | null
          data_credito?: string | null
          data_emissao?: string | null
          data_extrato?: string | null
          data_pagamento?: string | null
          desconto_adiantamento?: number | null
          descricao_lancamento?: string | null
          descricao_operacao?: string | null
          doc_numero?: string | null
          endosso?: string | null
          erro_msg?: string | null
          filial?: string | null
          forma_credito?: string | null
          id?: string
          importacao_id?: string | null
          inspetoria?: string | null
          inss?: number | null
          irrf?: number | null
          iss?: number | null
          layout_pdf?: string | null
          marca_seguradora?: string | null
          motivo_recuperacao?: string | null
          nat?: string | null
          negocio?: string | null
          numero_apolice?: string | null
          numero_contrato?: string | null
          numero_extrato?: string | null
          numero_fatura?: string | null
          numero_formulario_venda?: string | null
          numero_proposta?: string | null
          numero_recibo?: string | null
          ordem_pagamento?: string | null
          outros_creditos_debitos?: number | null
          parcela?: number | null
          pc_comissao?: number | null
          pdf_texto_bruto?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          pis?: number | null
          pis_cofins_csll?: number | null
          premio?: number | null
          premio_liquido?: number | null
          premio_taxa?: number | null
          produto?: string | null
          protocolo?: string | null
          ramo_codigo?: string | null
          ramo_descricao?: string | null
          rce?: number | null
          recuperacao?: number | null
          saldo_atual?: number | null
          saldo_recuperar?: number | null
          seguradora_id: string
          seguradora_origem?: string | null
          sincronizado_em?: string | null
          status?: string
          sub_codigo?: string | null
          subfatura?: string | null
          sucursal?: string | null
          supervisor_codigo?: string | null
          supervisor_nome?: string | null
          susep_favorecida?: string | null
          susep_producao?: string | null
          tipo_comissao?: string | null
          tipo_credito?: string | null
          tipo_documento?: string | null
          tipo_lancamento?: string | null
          tipo_lancamento_codigo?: string | null
          tipo_pagamento?: string | null
          tipo_zurich?: string | null
          total_bruto?: number | null
          total_descontos?: number | null
          total_inss?: number | null
          total_irrf?: number | null
          total_iss?: number | null
          total_liquido?: number | null
          total_parcelas?: number | null
          valor_emissao_nf?: number | null
        }
        Update: {
          abatimento?: number | null
          adiantamento?: number | null
          agencia?: string | null
          agencia_producao?: string | null
          aliquota_inss?: number | null
          aliquota_irrf?: number | null
          aliquota_iss?: number | null
          antecipada?: string | null
          apolice_id?: string | null
          banco?: string | null
          base_irpj?: number | null
          base_tributaria?: number | null
          bilhete?: string | null
          carteira?: string | null
          certificado?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cnpj_emissao_nf?: string | null
          cnpj_filial?: string | null
          codigo_interno?: string | null
          cofins?: number | null
          comissao_bruta?: number | null
          comissao_id?: string | null
          comissao_liquida?: number | null
          comissao_pct?: number | null
          comissao_valor?: number | null
          competencia?: string | null
          conta_corrente?: string | null
          corretor_cnpj?: string | null
          corretor_endereco?: string | null
          corretor_inscricao_inss?: string | null
          corretor_inscricao_municipio?: string | null
          corretor_nome?: string | null
          corretor_susep?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          csll?: number | null
          dados?: Json | null
          data_baixa?: string | null
          data_credito?: string | null
          data_emissao?: string | null
          data_extrato?: string | null
          data_pagamento?: string | null
          desconto_adiantamento?: number | null
          descricao_lancamento?: string | null
          descricao_operacao?: string | null
          doc_numero?: string | null
          endosso?: string | null
          erro_msg?: string | null
          filial?: string | null
          forma_credito?: string | null
          id?: string
          importacao_id?: string | null
          inspetoria?: string | null
          inss?: number | null
          irrf?: number | null
          iss?: number | null
          layout_pdf?: string | null
          marca_seguradora?: string | null
          motivo_recuperacao?: string | null
          nat?: string | null
          negocio?: string | null
          numero_apolice?: string | null
          numero_contrato?: string | null
          numero_extrato?: string | null
          numero_fatura?: string | null
          numero_formulario_venda?: string | null
          numero_proposta?: string | null
          numero_recibo?: string | null
          ordem_pagamento?: string | null
          outros_creditos_debitos?: number | null
          parcela?: number | null
          pc_comissao?: number | null
          pdf_texto_bruto?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          pis?: number | null
          pis_cofins_csll?: number | null
          premio?: number | null
          premio_liquido?: number | null
          premio_taxa?: number | null
          produto?: string | null
          protocolo?: string | null
          ramo_codigo?: string | null
          ramo_descricao?: string | null
          rce?: number | null
          recuperacao?: number | null
          saldo_atual?: number | null
          saldo_recuperar?: number | null
          seguradora_id?: string
          seguradora_origem?: string | null
          sincronizado_em?: string | null
          status?: string
          sub_codigo?: string | null
          subfatura?: string | null
          sucursal?: string | null
          supervisor_codigo?: string | null
          supervisor_nome?: string | null
          susep_favorecida?: string | null
          susep_producao?: string | null
          tipo_comissao?: string | null
          tipo_credito?: string | null
          tipo_documento?: string | null
          tipo_lancamento?: string | null
          tipo_lancamento_codigo?: string | null
          tipo_pagamento?: string | null
          tipo_zurich?: string | null
          total_bruto?: number | null
          total_descontos?: number | null
          total_inss?: number | null
          total_irrf?: number | null
          total_iss?: number | null
          total_liquido?: number | null
          total_parcelas?: number | null
          valor_emissao_nf?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seg_stage_comissoes_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_comissoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_comissoes_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes_recebidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_comissoes_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "vw_comissoes_vendedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_comissoes_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "seg_importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_comissoes_seguradora_id_fkey"
            columns: ["seguradora_id"]
            isOneToOne: false
            referencedRelation: "seguradoras"
            referencedColumns: ["id"]
          },
        ]
      }
      seg_stage_inadimplencia: {
        Row: {
          apolice_id: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cpf_cnpj: string | null
          created_at: string | null
          dados: Json | null
          dias_atraso: number | null
          erro_msg: string | null
          id: string
          importacao_id: string | null
          item_adesao: string | null
          negocio_id: string | null
          numero_apolice: string | null
          parcela: number | null
          parcelas: string | null
          premio: number | null
          previsao_cancelamento: string | null
          ramo: string | null
          recibo: string | null
          seguradora_id: string
          sexo: string | null
          sincronizado_em: string | null
          status: string
          valor: number | null
          vencimento: string | null
        }
        Insert: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          dias_atraso?: number | null
          erro_msg?: string | null
          id?: string
          importacao_id?: string | null
          item_adesao?: string | null
          negocio_id?: string | null
          numero_apolice?: string | null
          parcela?: number | null
          parcelas?: string | null
          premio?: number | null
          previsao_cancelamento?: string | null
          ramo?: string | null
          recibo?: string | null
          seguradora_id: string
          sexo?: string | null
          sincronizado_em?: string | null
          status?: string
          valor?: number | null
          vencimento?: string | null
        }
        Update: {
          apolice_id?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          dias_atraso?: number | null
          erro_msg?: string | null
          id?: string
          importacao_id?: string | null
          item_adesao?: string | null
          negocio_id?: string | null
          numero_apolice?: string | null
          parcela?: number | null
          parcelas?: string | null
          premio?: number | null
          previsao_cancelamento?: string | null
          ramo?: string | null
          recibo?: string | null
          seguradora_id?: string
          sexo?: string | null
          sincronizado_em?: string | null
          status?: string
          valor?: number | null
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seg_stage_inadimplencia_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_inadimplencia_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_inadimplencia_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "seg_importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_inadimplencia_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_inadimplencia_seguradora_id_fkey"
            columns: ["seguradora_id"]
            isOneToOne: false
            referencedRelation: "seguradoras"
            referencedColumns: ["id"]
          },
        ]
      }
      seg_stage_propostas: {
        Row: {
          apolice_id: string | null
          cliente_criado_auto: boolean | null
          cliente_id: string | null
          cliente_nome: string | null
          comissao_pct: number | null
          corretor_nome: string | null
          corretor_susep: string | null
          cpf_cnpj: string | null
          created_at: string | null
          dados: Json | null
          data_emissao: string | null
          data_proposta: string | null
          erro_msg: string | null
          id: string
          importacao_id: string | null
          negocio_id: string | null
          numero_apolice: string | null
          numero_proposta: string | null
          observacoes: string | null
          placa: string | null
          premio: number | null
          produto: string | null
          ramo: string | null
          seguradora_id: string
          sincronizado_em: string | null
          situacao: string | null
          status: string
          vigencia_fim: string | null
          vigencia_ini: string | null
        }
        Insert: {
          apolice_id?: string | null
          cliente_criado_auto?: boolean | null
          cliente_id?: string | null
          cliente_nome?: string | null
          comissao_pct?: number | null
          corretor_nome?: string | null
          corretor_susep?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_emissao?: string | null
          data_proposta?: string | null
          erro_msg?: string | null
          id?: string
          importacao_id?: string | null
          negocio_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          observacoes?: string | null
          placa?: string | null
          premio?: number | null
          produto?: string | null
          ramo?: string | null
          seguradora_id: string
          sincronizado_em?: string | null
          situacao?: string | null
          status?: string
          vigencia_fim?: string | null
          vigencia_ini?: string | null
        }
        Update: {
          apolice_id?: string | null
          cliente_criado_auto?: boolean | null
          cliente_id?: string | null
          cliente_nome?: string | null
          comissao_pct?: number | null
          corretor_nome?: string | null
          corretor_susep?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_emissao?: string | null
          data_proposta?: string | null
          erro_msg?: string | null
          id?: string
          importacao_id?: string | null
          negocio_id?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          observacoes?: string | null
          placa?: string | null
          premio?: number | null
          produto?: string | null
          ramo?: string | null
          seguradora_id?: string
          sincronizado_em?: string | null
          situacao?: string | null
          status?: string
          vigencia_fim?: string | null
          vigencia_ini?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seg_stage_propostas_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_propostas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_propostas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "seg_importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_propostas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_propostas_seguradora_id_fkey"
            columns: ["seguradora_id"]
            isOneToOne: false
            referencedRelation: "seguradoras"
            referencedColumns: ["id"]
          },
        ]
      }
      seg_stage_sinistros: {
        Row: {
          apolice_id: string | null
          causa: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cpf_cnpj: string | null
          created_at: string | null
          dados: Json | null
          data_aviso: string | null
          data_encerramento: string | null
          data_ocorrencia: string | null
          erro_msg: string | null
          id: string
          importacao_id: string | null
          item: string | null
          item_adesao: string | null
          negocio_id: string | null
          numero_apolice: string | null
          numero_sinistro: string | null
          ramo: string | null
          seguradora_id: string
          sexo: string | null
          sincronizado_em: string | null
          situacao: string | null
          status: string
          valor_indenizacao: number | null
        }
        Insert: {
          apolice_id?: string | null
          causa?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_aviso?: string | null
          data_encerramento?: string | null
          data_ocorrencia?: string | null
          erro_msg?: string | null
          id?: string
          importacao_id?: string | null
          item?: string | null
          item_adesao?: string | null
          negocio_id?: string | null
          numero_apolice?: string | null
          numero_sinistro?: string | null
          ramo?: string | null
          seguradora_id: string
          sexo?: string | null
          sincronizado_em?: string | null
          situacao?: string | null
          status?: string
          valor_indenizacao?: number | null
        }
        Update: {
          apolice_id?: string | null
          causa?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          dados?: Json | null
          data_aviso?: string | null
          data_encerramento?: string | null
          data_ocorrencia?: string | null
          erro_msg?: string | null
          id?: string
          importacao_id?: string | null
          item?: string | null
          item_adesao?: string | null
          negocio_id?: string | null
          numero_apolice?: string | null
          numero_sinistro?: string | null
          ramo?: string | null
          seguradora_id?: string
          sexo?: string | null
          sincronizado_em?: string | null
          situacao?: string | null
          status?: string
          valor_indenizacao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seg_stage_sinistros_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_sinistros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_sinistros_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "seg_importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_sinistros_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seg_stage_sinistros_seguradora_id_fkey"
            columns: ["seguradora_id"]
            isOneToOne: false
            referencedRelation: "seguradoras"
            referencedColumns: ["id"]
          },
        ]
      }
      seguradoras: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      sub_equipe_membros: {
        Row: {
          criado_em: string | null
          sub_equipe_id: string
          user_id: string
        }
        Insert: {
          criado_em?: string | null
          sub_equipe_id: string
          user_id: string
        }
        Update: {
          criado_em?: string | null
          sub_equipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_equipe_membros_sub_equipe_id_fkey"
            columns: ["sub_equipe_id"]
            isOneToOne: false
            referencedRelation: "sub_equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_equipe_membros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_equipes: {
        Row: {
          criado_em: string | null
          equipe_id: string
          id: string
          nome: string
        }
        Insert: {
          criado_em?: string | null
          equipe_id: string
          id?: string
          nome: string
        }
        Update: {
          criado_em?: string | null
          equipe_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_equipes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          acao: string
          criado_em: string
          detalhe: string | null
          id: number
          ip: string | null
          metadata: Json | null
          pathname: string | null
          recurso: string | null
          recurso_id: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_nome: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          detalhe?: string | null
          id?: number
          ip?: string | null
          metadata?: Json | null
          pathname?: string | null
          recurso?: string | null
          recurso_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_nome?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          detalhe?: string | null
          id?: number
          ip?: string | null
          metadata?: Json | null
          pathname?: string | null
          recurso?: string | null
          recurso_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          cor: string | null
          criado_em: string | null
          id: string
          nome: string
          rd_id: string | null
        }
        Insert: {
          cor?: string | null
          criado_em?: string | null
          id?: string
          nome: string
          rd_id?: string | null
        }
        Update: {
          cor?: string | null
          criado_em?: string | null
          id?: string
          nome?: string
          rd_id?: string | null
        }
        Relationships: []
      }
      tarefa_responsaveis: {
        Row: {
          tarefa_id: string
          user_id: string
        }
        Insert: {
          tarefa_id: string
          user_id: string
        }
        Update: {
          tarefa_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_responsaveis_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_responsaveis_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          atribuido_por: string | null
          cliente_id: string | null
          concluida_em: string | null
          created_at: string | null
          criado_por: string | null
          descricao: string | null
          id: string
          negocio_id: string | null
          prazo: string | null
          rd_id: string | null
          responsavel_id: string | null
          status: string | null
          tipo: string | null
          titulo: string
        }
        Insert: {
          atribuido_por?: string | null
          cliente_id?: string | null
          concluida_em?: string | null
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          negocio_id?: string | null
          prazo?: string | null
          rd_id?: string | null
          responsavel_id?: string | null
          status?: string | null
          tipo?: string | null
          titulo: string
        }
        Update: {
          atribuido_por?: string | null
          cliente_id?: string | null
          concluida_em?: string | null
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          negocio_id?: string | null
          prazo?: string | null
          rd_id?: string | null
          responsavel_id?: string | null
          status?: string | null
          tipo?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_atribuido_por_fkey"
            columns: ["atribuido_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tokio_apolices_raw: {
        Row: {
          ano_fabricacao: string | null
          ano_modelo: string | null
          apolice_id: string | null
          bairro: string | null
          cd_corretor: string | null
          cep: string | null
          chassi: string | null
          cidade: string | null
          cliente_id: string | null
          combustivel: string | null
          complemento: string | null
          cor: string | null
          cpf_cnpj: string | null
          criado_em: string | null
          custo_apolice: number | null
          dados_brutos: Json | null
          data_cancelamento: string | null
          data_emissao: string | null
          data_recusa: string | null
          ddd: string | null
          email: string | null
          emissao_endosso: string | null
          endereco: string | null
          fabricante: string | null
          forma_cobranca: string | null
          id: string
          importacao_id: string | null
          modelo: string | null
          motivo_recusa: string | null
          nm_corretor: string | null
          nome_segurado: string | null
          num_apolice: string | null
          num_endosso: string
          num_proposta: string | null
          numero: string | null
          pc_comissao: number | null
          placa: string | null
          premio_liquido: number | null
          premio_total: number | null
          produto: string | null
          qtd_parcelas: number | null
          ramo: string | null
          status_apolice: string | null
          telefone: string | null
          tipo_seguro: string | null
          tp_complemento: string | null
          tp_pessoa: string | null
          uf: string | null
          valor_iof: number | null
          vigencia_fim: string | null
          vigencia_fim_endosso: string | null
          vigencia_ini: string | null
          vigencia_ini_endosso: string | null
          vlr_comissao: number | null
          zerokm: string | null
        }
        Insert: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          apolice_id?: string | null
          bairro?: string | null
          cd_corretor?: string | null
          cep?: string | null
          chassi?: string | null
          cidade?: string | null
          cliente_id?: string | null
          combustivel?: string | null
          complemento?: string | null
          cor?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          custo_apolice?: number | null
          dados_brutos?: Json | null
          data_cancelamento?: string | null
          data_emissao?: string | null
          data_recusa?: string | null
          ddd?: string | null
          email?: string | null
          emissao_endosso?: string | null
          endereco?: string | null
          fabricante?: string | null
          forma_cobranca?: string | null
          id?: string
          importacao_id?: string | null
          modelo?: string | null
          motivo_recusa?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          num_apolice?: string | null
          num_endosso?: string
          num_proposta?: string | null
          numero?: string | null
          pc_comissao?: number | null
          placa?: string | null
          premio_liquido?: number | null
          premio_total?: number | null
          produto?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          status_apolice?: string | null
          telefone?: string | null
          tipo_seguro?: string | null
          tp_complemento?: string | null
          tp_pessoa?: string | null
          uf?: string | null
          valor_iof?: number | null
          vigencia_fim?: string | null
          vigencia_fim_endosso?: string | null
          vigencia_ini?: string | null
          vigencia_ini_endosso?: string | null
          vlr_comissao?: number | null
          zerokm?: string | null
        }
        Update: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          apolice_id?: string | null
          bairro?: string | null
          cd_corretor?: string | null
          cep?: string | null
          chassi?: string | null
          cidade?: string | null
          cliente_id?: string | null
          combustivel?: string | null
          complemento?: string | null
          cor?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          custo_apolice?: number | null
          dados_brutos?: Json | null
          data_cancelamento?: string | null
          data_emissao?: string | null
          data_recusa?: string | null
          ddd?: string | null
          email?: string | null
          emissao_endosso?: string | null
          endereco?: string | null
          fabricante?: string | null
          forma_cobranca?: string | null
          id?: string
          importacao_id?: string | null
          modelo?: string | null
          motivo_recusa?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          num_apolice?: string | null
          num_endosso?: string
          num_proposta?: string | null
          numero?: string | null
          pc_comissao?: number | null
          placa?: string | null
          premio_liquido?: number | null
          premio_total?: number | null
          produto?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          status_apolice?: string | null
          telefone?: string | null
          tipo_seguro?: string | null
          tp_complemento?: string | null
          tp_pessoa?: string | null
          uf?: string | null
          valor_iof?: number | null
          vigencia_fim?: string | null
          vigencia_fim_endosso?: string | null
          vigencia_ini?: string | null
          vigencia_ini_endosso?: string | null
          vlr_comissao?: number | null
          zerokm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tokio_apolices_raw_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_apolices_raw_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_apolices_raw_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_tokio"
            referencedColumns: ["id"]
          },
        ]
      }
      tokio_detalhe_comissao: {
        Row: {
          apolice_id: string | null
          cd_corretor: string | null
          cd_natureza: string | null
          cd_tipo_pagto: string | null
          cliente_id: string | null
          comissao_recebida_id: string | null
          cpf_cnpj: string | null
          criado_em: string | null
          dados_brutos: Json | null
          data_competencia: string | null
          data_emissao: string | null
          data_movimento: string | null
          data_pagamento: string | null
          ds_natureza: string | null
          ds_tipo_pagto: string | null
          extrato_id: string | null
          id: string
          importacao_id: string | null
          nm_corretor: string | null
          nome_segurado: string | null
          num_apolice: string | null
          num_endosso: string | null
          num_extrato: string | null
          num_parcela: number | null
          num_proposta: string | null
          pc_comissao: number | null
          produto: string | null
          qtde_parcela: number | null
          ramo: string | null
          status_apolice: string | null
          tipo_seguro: string | null
          tp_pessoa: string | null
          vlr_comissao_parcela: number | null
          vlr_iof: number | null
          vlr_premio: number | null
          vlr_premio_liquido: number | null
        }
        Insert: {
          apolice_id?: string | null
          cd_corretor?: string | null
          cd_natureza?: string | null
          cd_tipo_pagto?: string | null
          cliente_id?: string | null
          comissao_recebida_id?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_competencia?: string | null
          data_emissao?: string | null
          data_movimento?: string | null
          data_pagamento?: string | null
          ds_natureza?: string | null
          ds_tipo_pagto?: string | null
          extrato_id?: string | null
          id?: string
          importacao_id?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          num_apolice?: string | null
          num_endosso?: string | null
          num_extrato?: string | null
          num_parcela?: number | null
          num_proposta?: string | null
          pc_comissao?: number | null
          produto?: string | null
          qtde_parcela?: number | null
          ramo?: string | null
          status_apolice?: string | null
          tipo_seguro?: string | null
          tp_pessoa?: string | null
          vlr_comissao_parcela?: number | null
          vlr_iof?: number | null
          vlr_premio?: number | null
          vlr_premio_liquido?: number | null
        }
        Update: {
          apolice_id?: string | null
          cd_corretor?: string | null
          cd_natureza?: string | null
          cd_tipo_pagto?: string | null
          cliente_id?: string | null
          comissao_recebida_id?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_competencia?: string | null
          data_emissao?: string | null
          data_movimento?: string | null
          data_pagamento?: string | null
          ds_natureza?: string | null
          ds_tipo_pagto?: string | null
          extrato_id?: string | null
          id?: string
          importacao_id?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          num_apolice?: string | null
          num_endosso?: string | null
          num_extrato?: string | null
          num_parcela?: number | null
          num_proposta?: string | null
          pc_comissao?: number | null
          produto?: string | null
          qtde_parcela?: number | null
          ramo?: string | null
          status_apolice?: string | null
          tipo_seguro?: string | null
          tp_pessoa?: string | null
          vlr_comissao_parcela?: number | null
          vlr_iof?: number | null
          vlr_premio?: number | null
          vlr_premio_liquido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tokio_detalhe_comissao_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_detalhe_comissao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_detalhe_comissao_comissao_recebida_id_fkey"
            columns: ["comissao_recebida_id"]
            isOneToOne: false
            referencedRelation: "comissoes_recebidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_detalhe_comissao_comissao_recebida_id_fkey"
            columns: ["comissao_recebida_id"]
            isOneToOne: false
            referencedRelation: "vw_comissoes_vendedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_detalhe_comissao_extrato_id_fkey"
            columns: ["extrato_id"]
            isOneToOne: false
            referencedRelation: "tokio_extrato_comissoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_detalhe_comissao_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_tokio"
            referencedColumns: ["id"]
          },
        ]
      }
      tokio_extrato_comissoes: {
        Row: {
          cd_corretor: string | null
          competencia: string | null
          criado_em: string | null
          dados_brutos: Json | null
          data_emissao: string | null
          data_pagamento: string | null
          id: string
          importacao_id: string | null
          nm_corretor: string | null
          num_extrato: string
          qtd_detalhes: number | null
          vlr_acrescimos: number | null
          vlr_bruto: number | null
          vlr_descontos: number | null
          vlr_irrf: number | null
          vlr_iss: number | null
          vlr_liquido: number | null
          vlr_total: number | null
        }
        Insert: {
          cd_corretor?: string | null
          competencia?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_emissao?: string | null
          data_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          nm_corretor?: string | null
          num_extrato: string
          qtd_detalhes?: number | null
          vlr_acrescimos?: number | null
          vlr_bruto?: number | null
          vlr_descontos?: number | null
          vlr_irrf?: number | null
          vlr_iss?: number | null
          vlr_liquido?: number | null
          vlr_total?: number | null
        }
        Update: {
          cd_corretor?: string | null
          competencia?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_emissao?: string | null
          data_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          nm_corretor?: string | null
          num_extrato?: string
          qtd_detalhes?: number | null
          vlr_acrescimos?: number | null
          vlr_bruto?: number | null
          vlr_descontos?: number | null
          vlr_irrf?: number | null
          vlr_iss?: number | null
          vlr_liquido?: number | null
          vlr_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tokio_extrato_comissoes_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_tokio"
            referencedColumns: ["id"]
          },
        ]
      }
      tokio_parcelas: {
        Row: {
          agencia: string | null
          apolice_id: string | null
          banco_cobranca: string | null
          cd_corretor: string | null
          cliente_id: string | null
          conta: string | null
          conta_pagar_id: string | null
          cpf_cnpj: string | null
          criado_em: string | null
          dados_brutos: Json | null
          data_baixa: string | null
          data_competencia: string | null
          data_emissao: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          forma_cobranca: string | null
          id: string
          importacao_id: string | null
          nm_corretor: string | null
          nome_segurado: string | null
          num_apolice: string | null
          num_boleto: string | null
          num_endosso: string | null
          num_nota_fiscal: string | null
          num_parcela: number | null
          num_proposta: string | null
          produto: string | null
          qtde_parcela: number | null
          ramo: string | null
          situacao_parcela: string | null
          status_parcela: string | null
          vlr_comissao: number | null
          vlr_desconto: number | null
          vlr_iof: number | null
          vlr_juros: number | null
          vlr_liquido: number | null
          vlr_multa: number | null
          vlr_premio_parcela: number | null
          vlr_total: number | null
        }
        Insert: {
          agencia?: string | null
          apolice_id?: string | null
          banco_cobranca?: string | null
          cd_corretor?: string | null
          cliente_id?: string | null
          conta?: string | null
          conta_pagar_id?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_baixa?: string | null
          data_competencia?: string | null
          data_emissao?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          forma_cobranca?: string | null
          id?: string
          importacao_id?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          num_apolice?: string | null
          num_boleto?: string | null
          num_endosso?: string | null
          num_nota_fiscal?: string | null
          num_parcela?: number | null
          num_proposta?: string | null
          produto?: string | null
          qtde_parcela?: number | null
          ramo?: string | null
          situacao_parcela?: string | null
          status_parcela?: string | null
          vlr_comissao?: number | null
          vlr_desconto?: number | null
          vlr_iof?: number | null
          vlr_juros?: number | null
          vlr_liquido?: number | null
          vlr_multa?: number | null
          vlr_premio_parcela?: number | null
          vlr_total?: number | null
        }
        Update: {
          agencia?: string | null
          apolice_id?: string | null
          banco_cobranca?: string | null
          cd_corretor?: string | null
          cliente_id?: string | null
          conta?: string | null
          conta_pagar_id?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_baixa?: string | null
          data_competencia?: string | null
          data_emissao?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          forma_cobranca?: string | null
          id?: string
          importacao_id?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          num_apolice?: string | null
          num_boleto?: string | null
          num_endosso?: string | null
          num_nota_fiscal?: string | null
          num_parcela?: number | null
          num_proposta?: string | null
          produto?: string | null
          qtde_parcela?: number | null
          ramo?: string | null
          situacao_parcela?: string | null
          status_parcela?: string | null
          vlr_comissao?: number | null
          vlr_desconto?: number | null
          vlr_iof?: number | null
          vlr_juros?: number | null
          vlr_liquido?: number | null
          vlr_multa?: number | null
          vlr_premio_parcela?: number | null
          vlr_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tokio_parcelas_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_parcelas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_parcelas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_parcelas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_tokio"
            referencedColumns: ["id"]
          },
        ]
      }
      tokio_pendencias: {
        Row: {
          apolice_id: string | null
          area_responsavel: string | null
          cd_corretor: string | null
          cliente_id: string | null
          cpf_cnpj: string | null
          criado_em: string | null
          dados_brutos: Json | null
          data_abertura: string | null
          data_limite: string | null
          data_resolucao: string | null
          data_vencimento: string | null
          descricao: string | null
          email: string | null
          id: string
          importacao_id: string | null
          nm_corretor: string | null
          nome_segurado: string | null
          numero_apolice: string | null
          numero_endosso: string | null
          numero_proposta: string | null
          observacao: string | null
          prioridade: string | null
          produto: string | null
          ramo: string | null
          responsavel: string | null
          situacao: string | null
          telefone: string | null
          tipo_pendencia: string | null
          tipo_seguro: string | null
          tp_pessoa: string | null
        }
        Insert: {
          apolice_id?: string | null
          area_responsavel?: string | null
          cd_corretor?: string | null
          cliente_id?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_abertura?: string | null
          data_limite?: string | null
          data_resolucao?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          email?: string | null
          id?: string
          importacao_id?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          numero_apolice?: string | null
          numero_endosso?: string | null
          numero_proposta?: string | null
          observacao?: string | null
          prioridade?: string | null
          produto?: string | null
          ramo?: string | null
          responsavel?: string | null
          situacao?: string | null
          telefone?: string | null
          tipo_pendencia?: string | null
          tipo_seguro?: string | null
          tp_pessoa?: string | null
        }
        Update: {
          apolice_id?: string | null
          area_responsavel?: string | null
          cd_corretor?: string | null
          cliente_id?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_abertura?: string | null
          data_limite?: string | null
          data_resolucao?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          email?: string | null
          id?: string
          importacao_id?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          numero_apolice?: string | null
          numero_endosso?: string | null
          numero_proposta?: string | null
          observacao?: string | null
          prioridade?: string | null
          produto?: string | null
          ramo?: string | null
          responsavel?: string | null
          situacao?: string | null
          telefone?: string | null
          tipo_pendencia?: string | null
          tipo_seguro?: string | null
          tp_pessoa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tokio_pendencias_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_pendencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_pendencias_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_tokio"
            referencedColumns: ["id"]
          },
        ]
      }
      tokio_recusas: {
        Row: {
          area_recusante: string | null
          cd_corretor: string | null
          cliente_id: string | null
          codigo_motivo: string | null
          cpf_cnpj: string | null
          criado_em: string | null
          dados_brutos: Json | null
          data_recusa: string | null
          data_solicitacao: string | null
          descricao_motivo: string | null
          email: string | null
          id: string
          importacao_id: string | null
          motivo_recusa: string | null
          nm_corretor: string | null
          nome_segurado: string | null
          numero_apolice: string | null
          numero_endosso: string | null
          numero_proposta: string | null
          observacao: string | null
          produto: string | null
          ramo: string | null
          status_recusa: string | null
          telefone: string | null
          tipo_seguro: string | null
          tp_pessoa: string | null
        }
        Insert: {
          area_recusante?: string | null
          cd_corretor?: string | null
          cliente_id?: string | null
          codigo_motivo?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_recusa?: string | null
          data_solicitacao?: string | null
          descricao_motivo?: string | null
          email?: string | null
          id?: string
          importacao_id?: string | null
          motivo_recusa?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          numero_apolice?: string | null
          numero_endosso?: string | null
          numero_proposta?: string | null
          observacao?: string | null
          produto?: string | null
          ramo?: string | null
          status_recusa?: string | null
          telefone?: string | null
          tipo_seguro?: string | null
          tp_pessoa?: string | null
        }
        Update: {
          area_recusante?: string | null
          cd_corretor?: string | null
          cliente_id?: string | null
          codigo_motivo?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_recusa?: string | null
          data_solicitacao?: string | null
          descricao_motivo?: string | null
          email?: string | null
          id?: string
          importacao_id?: string | null
          motivo_recusa?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          numero_apolice?: string | null
          numero_endosso?: string | null
          numero_proposta?: string | null
          observacao?: string | null
          produto?: string | null
          ramo?: string | null
          status_recusa?: string | null
          telefone?: string | null
          tipo_seguro?: string | null
          tp_pessoa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tokio_recusas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_recusas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_tokio"
            referencedColumns: ["id"]
          },
        ]
      }
      tokio_renovacoes: {
        Row: {
          ano_modelo: string | null
          apolice_id: string | null
          cd_corretor: string | null
          chassi: string | null
          cliente_id: string | null
          cpf_cnpj: string | null
          criado_em: string | null
          dados_brutos: Json | null
          data_emissao: string | null
          data_renovacao: string | null
          email: string | null
          fabricante: string | null
          forma_pagamento: string | null
          id: string
          importacao_id: string | null
          modelo: string | null
          nm_corretor: string | null
          nome_segurado: string | null
          numero_apolice: string | null
          numero_proposta: string | null
          numero_renovacao: string | null
          observacao: string | null
          pc_comissao: number | null
          placa: string | null
          premio_atual: number | null
          premio_renovacao: number | null
          produto: string | null
          qtd_parcelas: number | null
          ramo: string | null
          situacao_renovacao: string | null
          status_renovacao: string | null
          telefone: string | null
          tipo_seguro: string | null
          tp_pessoa: string | null
          vigencia_fim: string | null
          vigencia_fim_atual: string | null
          vigencia_ini: string | null
          vigencia_ini_atual: string | null
          vlr_comissao: number | null
        }
        Insert: {
          ano_modelo?: string | null
          apolice_id?: string | null
          cd_corretor?: string | null
          chassi?: string | null
          cliente_id?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_emissao?: string | null
          data_renovacao?: string | null
          email?: string | null
          fabricante?: string | null
          forma_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          modelo?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          numero_renovacao?: string | null
          observacao?: string | null
          pc_comissao?: number | null
          placa?: string | null
          premio_atual?: number | null
          premio_renovacao?: number | null
          produto?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          situacao_renovacao?: string | null
          status_renovacao?: string | null
          telefone?: string | null
          tipo_seguro?: string | null
          tp_pessoa?: string | null
          vigencia_fim?: string | null
          vigencia_fim_atual?: string | null
          vigencia_ini?: string | null
          vigencia_ini_atual?: string | null
          vlr_comissao?: number | null
        }
        Update: {
          ano_modelo?: string | null
          apolice_id?: string | null
          cd_corretor?: string | null
          chassi?: string | null
          cliente_id?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_emissao?: string | null
          data_renovacao?: string | null
          email?: string | null
          fabricante?: string | null
          forma_pagamento?: string | null
          id?: string
          importacao_id?: string | null
          modelo?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          numero_apolice?: string | null
          numero_proposta?: string | null
          numero_renovacao?: string | null
          observacao?: string | null
          pc_comissao?: number | null
          placa?: string | null
          premio_atual?: number | null
          premio_renovacao?: number | null
          produto?: string | null
          qtd_parcelas?: number | null
          ramo?: string | null
          situacao_renovacao?: string | null
          status_renovacao?: string | null
          telefone?: string | null
          tipo_seguro?: string | null
          tp_pessoa?: string | null
          vigencia_fim?: string | null
          vigencia_fim_atual?: string | null
          vigencia_ini?: string | null
          vigencia_ini_atual?: string | null
          vlr_comissao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tokio_renovacoes_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_renovacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_renovacoes_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_tokio"
            referencedColumns: ["id"]
          },
        ]
      }
      tokio_sinistros: {
        Row: {
          ano_modelo: string | null
          apolice_id: string | null
          causa: string | null
          cd_corretor: string | null
          cep_ocorrencia: string | null
          chassi: string | null
          cidade_ocorrencia: string | null
          cliente_id: string | null
          cpf_cnpj: string | null
          criado_em: string | null
          dados_brutos: Json | null
          data_abertura: string | null
          data_aviso: string | null
          data_comunicacao: string | null
          data_encerramento: string | null
          data_ocorrencia: string | null
          data_pagamento: string | null
          ddd: string | null
          email: string | null
          fabricante: string | null
          fase: string | null
          grupo_causa: string | null
          id: string
          importacao_id: string | null
          local_ocorrencia: string | null
          modelo: string | null
          nm_corretor: string | null
          nome_segurado: string | null
          nr_protocolo: string | null
          num_proposta: string | null
          numero_apolice: string | null
          numero_endosso: string | null
          numero_sinistro: string | null
          observacao: string | null
          placa: string | null
          produto: string | null
          ramo: string | null
          regulador: string | null
          situacao: string | null
          telefone: string | null
          tipo_seguro: string | null
          tp_pessoa: string | null
          uf_ocorrencia: string | null
          valor_indenizacao: number | null
          valor_reserva: number | null
          vistoriador: string | null
          vlr_despesas: number | null
          vlr_franquia: number | null
          vlr_pagamento: number | null
        }
        Insert: {
          ano_modelo?: string | null
          apolice_id?: string | null
          causa?: string | null
          cd_corretor?: string | null
          cep_ocorrencia?: string | null
          chassi?: string | null
          cidade_ocorrencia?: string | null
          cliente_id?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_abertura?: string | null
          data_aviso?: string | null
          data_comunicacao?: string | null
          data_encerramento?: string | null
          data_ocorrencia?: string | null
          data_pagamento?: string | null
          ddd?: string | null
          email?: string | null
          fabricante?: string | null
          fase?: string | null
          grupo_causa?: string | null
          id?: string
          importacao_id?: string | null
          local_ocorrencia?: string | null
          modelo?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          nr_protocolo?: string | null
          num_proposta?: string | null
          numero_apolice?: string | null
          numero_endosso?: string | null
          numero_sinistro?: string | null
          observacao?: string | null
          placa?: string | null
          produto?: string | null
          ramo?: string | null
          regulador?: string | null
          situacao?: string | null
          telefone?: string | null
          tipo_seguro?: string | null
          tp_pessoa?: string | null
          uf_ocorrencia?: string | null
          valor_indenizacao?: number | null
          valor_reserva?: number | null
          vistoriador?: string | null
          vlr_despesas?: number | null
          vlr_franquia?: number | null
          vlr_pagamento?: number | null
        }
        Update: {
          ano_modelo?: string | null
          apolice_id?: string | null
          causa?: string | null
          cd_corretor?: string | null
          cep_ocorrencia?: string | null
          chassi?: string | null
          cidade_ocorrencia?: string | null
          cliente_id?: string | null
          cpf_cnpj?: string | null
          criado_em?: string | null
          dados_brutos?: Json | null
          data_abertura?: string | null
          data_aviso?: string | null
          data_comunicacao?: string | null
          data_encerramento?: string | null
          data_ocorrencia?: string | null
          data_pagamento?: string | null
          ddd?: string | null
          email?: string | null
          fabricante?: string | null
          fase?: string | null
          grupo_causa?: string | null
          id?: string
          importacao_id?: string | null
          local_ocorrencia?: string | null
          modelo?: string | null
          nm_corretor?: string | null
          nome_segurado?: string | null
          nr_protocolo?: string | null
          num_proposta?: string | null
          numero_apolice?: string | null
          numero_endosso?: string | null
          numero_sinistro?: string | null
          observacao?: string | null
          placa?: string | null
          produto?: string | null
          ramo?: string | null
          regulador?: string | null
          situacao?: string | null
          telefone?: string | null
          tipo_seguro?: string | null
          tp_pessoa?: string | null
          uf_ocorrencia?: string | null
          valor_indenizacao?: number | null
          valor_reserva?: number | null
          vistoriador?: string | null
          vlr_despesas?: number | null
          vlr_franquia?: number | null
          vlr_pagamento?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tokio_sinistros_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_sinistros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokio_sinistros_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_tokio"
            referencedColumns: ["id"]
          },
        ]
      }
      user_aliases_rd: {
        Row: {
          alias: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          alias: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          alias?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_aliases_rd_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          deleted_at: string | null
          email: string
          id: string
          mensagem_venda: string | null
          nome: string
          ramal_goto: string | null
          rd_id: string | null
          role: string
          telefone: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email: string
          id: string
          mensagem_venda?: string | null
          nome: string
          ramal_goto?: string | null
          rd_id?: string | null
          role?: string
          telefone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          id?: string
          mensagem_venda?: string | null
          nome?: string
          ramal_goto?: string | null
          rd_id?: string | null
          role?: string
          telefone?: string | null
        }
        Relationships: []
      }
      vendas_celebracoes: {
        Row: {
          criado_em: string | null
          funil_nome: string | null
          id: string
          mensagem: string | null
          negocio_id: string | null
          valor: number | null
          vendedor_id: string | null
          vendedor_nome: string | null
        }
        Insert: {
          criado_em?: string | null
          funil_nome?: string | null
          id?: string
          mensagem?: string | null
          negocio_id?: string | null
          valor?: number | null
          vendedor_id?: string | null
          vendedor_nome?: string | null
        }
        Update: {
          criado_em?: string | null
          funil_nome?: string | null
          id?: string
          mensagem?: string | null
          negocio_id?: string | null
          valor?: number | null
          vendedor_id?: string | null
          vendedor_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_celebracoes_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_celebracoes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedores_legado: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      whatsapp_conversa_agentes: {
        Row: {
          agente_ativo: boolean
          agente_id: string | null
          created_at: string | null
          id: string
          instancia_id: string
          intervencao_solicitada: boolean
          intervencao_solicitada_em: string | null
          remoto_jid: string
          updated_at: string | null
        }
        Insert: {
          agente_ativo?: boolean
          agente_id?: string | null
          created_at?: string | null
          id?: string
          instancia_id: string
          intervencao_solicitada?: boolean
          intervencao_solicitada_em?: string | null
          remoto_jid: string
          updated_at?: string | null
        }
        Update: {
          agente_ativo?: boolean
          agente_id?: string | null
          created_at?: string | null
          id?: string
          instancia_id?: string
          intervencao_solicitada?: boolean
          intervencao_solicitada_em?: string | null
          remoto_jid?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversa_agentes_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "ai_agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversa_agentes_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instancias: {
        Row: {
          agente_ativo: boolean | null
          agente_id: string | null
          api_key: string | null
          created_at: string | null
          evolution_url: string | null
          id: string
          nome: string
          numero: string | null
          qrcode: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          agente_ativo?: boolean | null
          agente_id?: string | null
          api_key?: string | null
          created_at?: string | null
          evolution_url?: string | null
          id?: string
          nome: string
          numero?: string | null
          qrcode?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          agente_ativo?: boolean | null
          agente_id?: string | null
          api_key?: string | null
          created_at?: string | null
          evolution_url?: string | null
          id?: string
          nome?: string
          numero?: string | null
          qrcode?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instancias_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "ai_agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instancias_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens: {
        Row: {
          cliente_id: string | null
          conteudo: string | null
          created_at: string | null
          deletada: boolean
          deletada_em: string | null
          direcao: string
          evolution_id: string | null
          id: string
          instancia_id: string | null
          lida: boolean | null
          midia_duracao: number | null
          midia_mimetype: string | null
          midia_nome: string | null
          midia_url: string | null
          negocio_id: string | null
          remoto_jid: string
          remoto_nome: string | null
          remoto_numero: string | null
          tipo: string | null
          transcricao: string | null
        }
        Insert: {
          cliente_id?: string | null
          conteudo?: string | null
          created_at?: string | null
          deletada?: boolean
          deletada_em?: string | null
          direcao: string
          evolution_id?: string | null
          id?: string
          instancia_id?: string | null
          lida?: boolean | null
          midia_duracao?: number | null
          midia_mimetype?: string | null
          midia_nome?: string | null
          midia_url?: string | null
          negocio_id?: string | null
          remoto_jid: string
          remoto_nome?: string | null
          remoto_numero?: string | null
          tipo?: string | null
          transcricao?: string | null
        }
        Update: {
          cliente_id?: string | null
          conteudo?: string | null
          created_at?: string | null
          deletada?: boolean
          deletada_em?: string | null
          direcao?: string
          evolution_id?: string | null
          id?: string
          instancia_id?: string | null
          lida?: boolean | null
          midia_duracao?: number | null
          midia_mimetype?: string | null
          midia_nome?: string | null
          midia_url?: string | null
          negocio_id?: string | null
          remoto_jid?: string
          remoto_nome?: string | null
          remoto_numero?: string | null
          tipo?: string | null
          transcricao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      apolices_filtros: {
        Row: {
          ramos: string[] | null
          seguradoras: string[] | null
        }
        Relationships: []
      }
      financeiro_dre_mensal: {
        Row: {
          competencia: string | null
          ir_retido: number | null
          outros_descontos: number | null
          receita_bruta: number | null
          receita_liquida: number | null
          resultado: number | null
          total_despesas: number | null
        }
        Relationships: []
      }
      financeiro_dre_projetado: {
        Row: {
          competencia: string | null
          despesas_fixas: number | null
          despesas_variaveis: number | null
          ir_retido: number | null
          outros_descontos: number | null
          receita_bruta: number | null
          receita_liquida: number | null
          resultado: number | null
          total_despesas: number | null
        }
        Relationships: []
      }
      financeiro_dre_real: {
        Row: {
          competencia: string | null
          despesas_fixas: number | null
          despesas_variaveis: number | null
          ir_retido: number | null
          outros_descontos: number | null
          receita_bruta: number | null
          receita_liquida: number | null
          resultado: number | null
          total_despesas: number | null
        }
        Relationships: []
      }
      financeiro_faturamento_seguradora: {
        Row: {
          bruto: number | null
          codigo: string | null
          competencia: string | null
          ir_retido: number | null
          liquido: number | null
          outros_descontos: number | null
          qtd_comissoes: number | null
          seguradora: string | null
        }
        Relationships: []
      }
      meta_vendas_por_campanha: {
        Row: {
          campanha_meta_id: string | null
          campanha_nome: string | null
          em_andamento: number | null
          perdas: number | null
          receita_total: number | null
          ticket_medio: number | null
          vendas: number | null
        }
        Relationships: []
      }
      vw_comissoes_vendedor: {
        Row: {
          ano_competencia: number | null
          apolice_id: string | null
          apolice_numero: string | null
          cliente_id: string | null
          cliente_nome: string | null
          comissao_pct_meta_batida: number | null
          comissao_pct_padrao: number | null
          competencia: string | null
          data_recebimento: string | null
          id: string | null
          mes_competencia: number | null
          meta_batida: boolean | null
          obs: string | null
          parcela: number | null
          pct_aplicado: number | null
          produto: string | null
          seguradora: string | null
          status: string | null
          total_parcelas: number | null
          valor_seguradora: number | null
          valor_vendedor: number | null
          vendedor_id: string | null
          vendedor_nome: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_recebidas_apolice_id_fkey"
            columns: ["apolice_id"]
            isOneToOne: false
            referencedRelation: "apolices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_recebidas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_recebidas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _rh_policies: { Args: { tbl: unknown }; Returns: undefined }
      apolices_stats: {
        Args: {
          p_busca?: string
          p_ramo?: string
          p_seguradora?: string
          p_status?: string
          p_vendedor_id?: string
        }
        Returns: {
          comissao_total: number
          premio_total: number
          total: number
          vencendo_30d: number
        }[]
      }
      atualiza_metas_de_vendedor: {
        Args: { p_vendedor_id: string }
        Returns: undefined
      }
      can_edit_rh: { Args: never; Returns: boolean }
      can_see_user: { Args: { target_id: string }; Returns: boolean }
      current_user_role: { Args: never; Returns: string }
      excluir_usuario_com_handoff: {
        Args: {
          p_admin_id: string
          p_leader_override?: string
          p_user_id: string
        }
        Returns: Json
      }
      financeiro_senha_definida: { Args: never; Returns: boolean }
      fn_app_role: { Args: never; Returns: string }
      fn_is_admin: { Args: never; Returns: boolean }
      fn_is_admin_or_financeiro: { Args: never; Returns: boolean }
      fn_lider_ve: { Args: { target_uid: string }; Returns: boolean }
      fn_pode_ver_dados_de: { Args: { target_uid: string }; Returns: boolean }
      hist_log: {
        Args: {
          p_cliente_id: string
          p_descricao: string
          p_negocio_id: string
          p_tipo?: string
          p_titulo: string
        }
        Returns: undefined
      }
      integrador_enq: {
        Args: { p_evento: string; p_payload: Json }
        Returns: undefined
      }
      integrador_next_responsavel: {
        Args: { p_webhook_id: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_lider: { Args: never; Returns: boolean }
      is_funil_emissao_implantacao: {
        Args: { target_funil: string }
        Returns: boolean
      }
      is_grupo_admin: {
        Args: { p_grupo: string; p_user: string }
        Returns: boolean
      }
      is_grupo_membro: {
        Args: { p_grupo: string; p_user: string }
        Returns: boolean
      }
      is_lider: { Args: never; Returns: boolean }
      is_lider_de: { Args: { target: string }; Returns: boolean }
      is_member_of_equipe: { Args: { target_equipe: string }; Returns: boolean }
      is_member_of_gestao: { Args: never; Returns: boolean }
      is_member_of_posvenda: { Args: never; Returns: boolean }
      is_owner_funcionario: { Args: { fid: string }; Returns: boolean }
      is_rh_team: { Args: never; Returns: boolean }
      meta_batida: {
        Args: { p_ano: number; p_mes: number; p_user_id: string }
        Returns: boolean
      }
      meta_proximo_vendedor: { Args: { p_form_id: string }; Returns: string }
      pt_norm: { Args: { t: string }; Returns: string }
      rd_resolver_responsavel: { Args: { p_nome: string }; Returns: string }
      set_financeiro_senha: { Args: { nova: string }; Returns: undefined }
      set_senha_financeiro: { Args: { nova: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      tem_acesso_financeiro: { Args: never; Returns: boolean }
      totais_funil: {
        Args: { p_funil_id: string; p_vendedor_ids?: string[] }
        Returns: {
          premio_total: number
          status: string
          total: number
        }[]
      }
      usuario_lider_fallback: { Args: { p_user_id: string }; Returns: string }
      verificar_senha_financeiro: { Args: { senha: string }; Returns: boolean }
      verify_financeiro_senha: { Args: { tentativa: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
