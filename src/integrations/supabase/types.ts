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
      acumuladores: {
        Row: {
          ativo: boolean
          cliente_id: string
          codigo: number
          created_at: string
          descricao: string
          id: string
        }
        Insert: {
          ativo?: boolean
          cliente_id: string
          codigo: number
          created_at?: string
          descricao: string
          id?: string
        }
        Update: {
          ativo?: boolean
          cliente_id?: string
          codigo?: number
          created_at?: string
          descricao?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acumuladores_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ativo: boolean
          cnpj: string
          codigo_empresa_dominio: number
          created_at: string
          endereco: string | null
          id: string
          municipio: string | null
          municipio_ibge: string | null
          razao_social: string
          uf: string | null
        }
        Insert: {
          ativo?: boolean
          cnpj: string
          codigo_empresa_dominio: number
          created_at?: string
          endereco?: string | null
          id?: string
          municipio?: string | null
          municipio_ibge?: string | null
          razao_social: string
          uf?: string | null
        }
        Update: {
          ativo?: boolean
          cnpj?: string
          codigo_empresa_dominio?: number
          created_at?: string
          endereco?: string | null
          id?: string
          municipio?: string | null
          municipio_ibge?: string | null
          razao_social?: string
          uf?: string | null
        }
        Relationships: []
      }
      competencias: {
        Row: {
          arquivo_origem: string | null
          cliente_id: string
          concluida_em: string | null
          created_at: string
          exportada_em: string | null
          id: string
          notas_classificadas: number
          periodo: string
          status: Database["public"]["Enums"]["competencia_status"]
          total_notas: number
        }
        Insert: {
          arquivo_origem?: string | null
          cliente_id: string
          concluida_em?: string | null
          created_at?: string
          exportada_em?: string | null
          id?: string
          notas_classificadas?: number
          periodo: string
          status?: Database["public"]["Enums"]["competencia_status"]
          total_notas?: number
        }
        Update: {
          arquivo_origem?: string | null
          cliente_id?: string
          concluida_em?: string | null
          created_at?: string
          exportada_em?: string | null
          id?: string
          notas_classificadas?: number
          periodo?: string
          status?: Database["public"]["Enums"]["competencia_status"]
          total_notas?: number
        }
        Relationships: [
          {
            foreignKeyName: "competencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      notas_fiscais: {
        Row: {
          acumulador_id: string | null
          cancelada: boolean
          classificado_em: string | null
          classificado_por: string | null
          cnae_descricao: string | null
          competencia_id: string
          created_at: string
          data_competencia: string | null
          desconto: number
          emissao_nfe: string | null
          id: string
          id_externo: string
          numero_nfe: string | null
          observacao: string | null
          prestador_cnpj: string | null
          prestador_endereco: string | null
          prestador_municipio: string | null
          prestador_municipio_ibge: string | null
          prestador_razao: string | null
          prestador_uf: string | null
          raw_data: Json | null
          servico_municipal: string | null
          updated_at: string
          valor_contabil: number | null
          valor_nfe: number | null
        }
        Insert: {
          acumulador_id?: string | null
          cancelada?: boolean
          classificado_em?: string | null
          classificado_por?: string | null
          cnae_descricao?: string | null
          competencia_id: string
          created_at?: string
          data_competencia?: string | null
          desconto?: number
          emissao_nfe?: string | null
          id?: string
          id_externo: string
          numero_nfe?: string | null
          observacao?: string | null
          prestador_cnpj?: string | null
          prestador_endereco?: string | null
          prestador_municipio?: string | null
          prestador_municipio_ibge?: string | null
          prestador_razao?: string | null
          prestador_uf?: string | null
          raw_data?: Json | null
          servico_municipal?: string | null
          updated_at?: string
          valor_contabil?: number | null
          valor_nfe?: number | null
        }
        Update: {
          acumulador_id?: string | null
          cancelada?: boolean
          classificado_em?: string | null
          classificado_por?: string | null
          cnae_descricao?: string | null
          competencia_id?: string
          created_at?: string
          data_competencia?: string | null
          desconto?: number
          emissao_nfe?: string | null
          id?: string
          id_externo?: string
          numero_nfe?: string | null
          observacao?: string | null
          prestador_cnpj?: string | null
          prestador_endereco?: string | null
          prestador_municipio?: string | null
          prestador_municipio_ibge?: string | null
          prestador_razao?: string | null
          prestador_uf?: string | null
          raw_data?: Json | null
          servico_municipal?: string | null
          updated_at?: string
          valor_contabil?: number | null
          valor_nfe?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_acumulador_id_fkey"
            columns: ["acumulador_id"]
            isOneToOne: false
            referencedRelation: "acumuladores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_classificado_por_fkey"
            columns: ["classificado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "competencias"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cliente_id: string | null
          created_at: string
          email: string
          id: string
          nome: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          email: string
          id: string
          nome?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      existe_escritorio: { Args: never; Returns: boolean }
      is_escritorio: { Args: never; Returns: boolean }
      meu_cliente_id: { Args: never; Returns: string }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      promover_primeiro_escritorio: {
        Args: { _user_id: string }
        Returns: boolean
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      usuarios_com_status: {
        Args: never
        Returns: {
          cliente_id: string
          cliente_razao: string
          created_at: string
          email: string
          email_confirmed_at: string
          id: string
          nome: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
    }
    Enums: {
      competencia_status: "aberta" | "concluida" | "exportada"
      user_role: "escritorio" | "cliente"
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
    Enums: {
      competencia_status: ["aberta", "concluida", "exportada"],
      user_role: ["escritorio", "cliente"],
    },
  },
} as const
