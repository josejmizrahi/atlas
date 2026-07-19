export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      actors: {
        Row: {
          contact: Json
          created_at: string
          display_name: string
          id: string
          kind: Database["public"]["Enums"]["actor_kind"]
          legal_name: string | null
          org_id: string
          sensitivity: Database["public"]["Enums"]["sensitivity_level"]
          tax_id: string | null
        }
        Insert: {
          contact?: Json
          created_at?: string
          display_name: string
          id?: string
          kind: Database["public"]["Enums"]["actor_kind"]
          legal_name?: string | null
          org_id: string
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          tax_id?: string | null
        }
        Update: {
          contact?: Json
          created_at?: string
          display_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["actor_kind"]
          legal_name?: string | null
          org_id?: string
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      aggregate_metrics: {
        Row: {
          dimensions: Json
          id: string
          metric_key: string
          produced_at: string
          produced_by_job: string
          sample_size: number
          value: number
        }
        Insert: {
          dimensions?: Json
          id?: string
          metric_key: string
          produced_at?: string
          produced_by_job: string
          sample_size: number
          value: number
        }
        Update: {
          dimensions?: Json
          id?: string
          metric_key?: string
          produced_at?: string
          produced_by_job?: string
          sample_size?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "aggregate_metrics_produced_by_job_fkey"
            columns: ["produced_by_job"]
            isOneToOne: false
            referencedRelation: "anonymization_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      anonymization_jobs: {
        Row: {
          authorized_by: string
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          k_threshold: number
          org_id: string
          requested_by: string
          spec: Json
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          template_version_id: string | null
        }
        Insert: {
          authorized_by: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          k_threshold?: number
          org_id: string
          requested_by: string
          spec: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          template_version_id?: string | null
        }
        Update: {
          authorized_by?: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          k_threshold?: number
          org_id?: string
          requested_by?: string
          spec?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          template_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anonymization_jobs_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymization_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymization_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymization_jobs_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_relations: {
        Row: {
          created_at: string
          deal_id: string
          from_asset: string
          id: string
          relation: string
          to_asset: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          from_asset: string
          id?: string
          relation: string
          to_asset: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          from_asset?: string
          id?: string
          relation?: string
          to_asset?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_relations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_relations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "asset_relations_from_asset_fkey"
            columns: ["from_asset"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_relations_to_asset_fkey"
            columns: ["to_asset"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_versions: {
        Row: {
          asset_id: string
          content_hash: string | null
          created_at: string
          created_from_evidence_id: string | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string | null
          version_no: number
        }
        Insert: {
          asset_id: string
          content_hash?: string | null
          created_at?: string
          created_from_evidence_id?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          version_no: number
        }
        Update: {
          asset_id?: string
          content_hash?: string | null
          created_at?: string
          created_from_evidence_id?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_versions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_versions_evidence_fk"
            columns: ["created_from_evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_items"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          classification: Database["public"]["Enums"]["data_classification"]
          created_at: string
          created_by: string | null
          custodian_actor_id: string | null
          deal_id: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["asset_kind"]
          owner_actor_id: string | null
          sensitivity: Database["public"]["Enums"]["sensitivity_level"]
          status: Database["public"]["Enums"]["asset_status"]
          title: string
          updated_at: string
        }
        Insert: {
          classification?: Database["public"]["Enums"]["data_classification"]
          created_at?: string
          created_by?: string | null
          custodian_actor_id?: string | null
          deal_id: string
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["asset_kind"]
          owner_actor_id?: string | null
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          status?: Database["public"]["Enums"]["asset_status"]
          title: string
          updated_at?: string
        }
        Update: {
          classification?: Database["public"]["Enums"]["data_classification"]
          created_at?: string
          created_by?: string | null
          custodian_actor_id?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          owner_actor_id?: string | null
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          status?: Database["public"]["Enums"]["asset_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_custodian_actor_id_fkey"
            columns: ["custodian_actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "assets_owner_actor_id_fkey"
            columns: ["owner_actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          deal_id: string | null
          details: Json | null
          id: number
          object_id: string | null
          object_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          deal_id?: string | null
          details?: Json | null
          id?: never
          object_id?: string | null
          object_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          deal_id?: string | null
          details?: Json | null
          id?: never
          object_id?: string | null
          object_type?: string
        }
        Relationships: []
      }
      canonical_concepts: {
        Row: {
          description: string | null
          id: string
          key: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      deal_actors: {
        Row: {
          actor_id: string
          channel: string | null
          created_at: string
          deal_id: string
          decision_authority: string | null
          delay_risk: number | null
          entered_at: string | null
          exited_at: string | null
          fee_estimate: number | null
          id: string
          represents: string | null
          role: string
          sensitivity: Database["public"]["Enums"]["sensitivity_level"]
        }
        Insert: {
          actor_id: string
          channel?: string | null
          created_at?: string
          deal_id: string
          decision_authority?: string | null
          delay_risk?: number | null
          entered_at?: string | null
          exited_at?: string | null
          fee_estimate?: number | null
          id?: string
          represents?: string | null
          role: string
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
        }
        Update: {
          actor_id?: string
          channel?: string | null
          created_at?: string
          deal_id?: string
          decision_authority?: string | null
          delay_risk?: number | null
          entered_at?: string | null
          exited_at?: string | null
          fee_estimate?: number | null
          id?: string
          represents?: string | null
          role?: string
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
        }
        Relationships: [
          {
            foreignKeyName: "deal_actors_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_actors_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_actors_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_memberships: {
        Row: {
          added_by: string | null
          created_at: string
          deal_id: string
          id: string
          max_sensitivity: Database["public"]["Enums"]["sensitivity_level"]
          profile_id: string
          role: Database["public"]["Enums"]["deal_role"]
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          deal_id: string
          id?: string
          max_sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          profile_id: string
          role: Database["public"]["Enums"]["deal_role"]
        }
        Update: {
          added_by?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          max_sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          profile_id?: string
          role?: Database["public"]["Enums"]["deal_role"]
        }
        Relationships: [
          {
            foreignKeyName: "deal_memberships_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_memberships_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_memberships_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          closed_at: string | null
          codename: string
          created_at: string
          created_by: string | null
          currency: string
          current_stage_key: string | null
          drop_reason: string | null
          id: string
          opened_at: string
          org_id: string
          status: Database["public"]["Enums"]["deal_status"]
          template_version_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          codename: string
          created_at?: string
          created_by?: string | null
          currency?: string
          current_stage_key?: string | null
          drop_reason?: string | null
          id?: string
          opened_at?: string
          org_id: string
          status?: Database["public"]["Enums"]["deal_status"]
          template_version_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          codename?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          current_stage_key?: string | null
          drop_reason?: string | null
          id?: string
          opened_at?: string
          org_id?: string
          status?: Database["public"]["Enums"]["deal_status"]
          template_version_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          alternatives: Json
          authority_actor: string | null
          created_at: string
          deal_id: string
          description: string | null
          id: string
          impact_amount: number | null
          impact_days: number | null
          outcome: Database["public"]["Enums"]["decision_status"]
          proposed_by_actor: string | null
          requested_at: string
          resolved_at: string | null
          rule_candidate: boolean
          sensitivity: Database["public"]["Enums"]["sensitivity_level"]
          title: string
        }
        Insert: {
          alternatives?: Json
          authority_actor?: string | null
          created_at?: string
          deal_id: string
          description?: string | null
          id?: string
          impact_amount?: number | null
          impact_days?: number | null
          outcome?: Database["public"]["Enums"]["decision_status"]
          proposed_by_actor?: string | null
          requested_at: string
          resolved_at?: string | null
          rule_candidate?: boolean
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          title: string
        }
        Update: {
          alternatives?: Json
          authority_actor?: string | null
          created_at?: string
          deal_id?: string
          description?: string | null
          id?: string
          impact_amount?: number | null
          impact_days?: number | null
          outcome?: Database["public"]["Enums"]["decision_status"]
          proposed_by_actor?: string | null
          requested_at?: string
          resolved_at?: string | null
          rule_candidate?: boolean
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_authority_actor_fkey"
            columns: ["authority_actor"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "decisions_proposed_by_actor_fkey"
            columns: ["proposed_by_actor"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
        ]
      }
      dependencies: {
        Row: {
          blocked_id: string
          blocked_type: Database["public"]["Enums"]["linked_object_type"]
          blocks_on_id: string
          blocks_on_type: Database["public"]["Enums"]["linked_object_type"]
          cause: Database["public"]["Enums"]["friction_category"] | null
          created_at: string
          deal_id: string
          description: string | null
          id: string
          resolved_at: string | null
        }
        Insert: {
          blocked_id: string
          blocked_type: Database["public"]["Enums"]["linked_object_type"]
          blocks_on_id: string
          blocks_on_type: Database["public"]["Enums"]["linked_object_type"]
          cause?: Database["public"]["Enums"]["friction_category"] | null
          created_at?: string
          deal_id: string
          description?: string | null
          id?: string
          resolved_at?: string | null
        }
        Update: {
          blocked_id?: string
          blocked_type?: Database["public"]["Enums"]["linked_object_type"]
          blocks_on_id?: string
          blocks_on_type?: Database["public"]["Enums"]["linked_object_type"]
          cause?: Database["public"]["Enums"]["friction_category"] | null
          created_at?: string
          deal_id?: string
          description?: string | null
          id?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dependencies_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependencies_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      event_asset_links: {
        Row: {
          asset_id: string
          event_id: string
          id: string
          link_role: string
        }
        Insert: {
          asset_id: string
          event_id: string
          id?: string
          link_role?: string
        }
        Update: {
          asset_id?: string
          event_id?: string
          id?: string
          link_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_asset_links_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_asset_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_asset_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_deal_timeline"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          actor_id: string
          event_id: string
          id: string
          role: Database["public"]["Enums"]["participant_role"]
        }
        Insert: {
          actor_id: string
          event_id: string
          id?: string
          role: Database["public"]["Enums"]["participant_role"]
        }
        Update: {
          actor_id?: string
          event_id?: string
          id?: string
          role?: Database["public"]["Enums"]["participant_role"]
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_deal_timeline"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          confidence: number | null
          deal_id: string
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          occurred_at: string
          origin: Database["public"]["Enums"]["record_origin"]
          payload: Json
          recorded_at: string
          recorded_by: string | null
          sensitivity: Database["public"]["Enums"]["sensitivity_level"]
          stage_key: string | null
          summary: string
        }
        Insert: {
          confidence?: number | null
          deal_id: string
          id?: string
          kind: Database["public"]["Enums"]["event_kind"]
          occurred_at: string
          origin?: Database["public"]["Enums"]["record_origin"]
          payload?: Json
          recorded_at?: string
          recorded_by?: string | null
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          stage_key?: string | null
          summary: string
        }
        Update: {
          confidence?: number | null
          deal_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          occurred_at?: string
          origin?: Database["public"]["Enums"]["record_origin"]
          payload?: Json
          recorded_at?: string
          recorded_by?: string | null
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          stage_key?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "events_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_items: {
        Row: {
          captured_at: string | null
          classification: Database["public"]["Enums"]["data_classification"]
          content_hash: string | null
          created_at: string
          deal_id: string
          external_ref: string | null
          id: string
          ingested_at: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          metadata: Json
          sensitivity: Database["public"]["Enums"]["sensitivity_level"]
          source_id: string | null
          storage_path: string | null
        }
        Insert: {
          captured_at?: string | null
          classification?: Database["public"]["Enums"]["data_classification"]
          content_hash?: string | null
          created_at?: string
          deal_id: string
          external_ref?: string | null
          id?: string
          ingested_at?: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          metadata?: Json
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          source_id?: string | null
          storage_path?: string | null
        }
        Update: {
          captured_at?: string | null
          classification?: Database["public"]["Enums"]["data_classification"]
          content_hash?: string | null
          created_at?: string
          deal_id?: string
          external_ref?: string | null
          id?: string
          ingested_at?: string
          kind?: Database["public"]["Enums"]["evidence_kind"]
          metadata?: Json
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          source_id?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "evidence_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "evidence_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_links: {
        Row: {
          created_at: string
          evidence_id: string
          id: string
          linked_id: string
          linked_type: Database["public"]["Enums"]["linked_object_type"]
        }
        Insert: {
          created_at?: string
          evidence_id: string
          id?: string
          linked_id: string
          linked_type: Database["public"]["Enums"]["linked_object_type"]
        }
        Update: {
          created_at?: string
          evidence_id?: string
          id?: string
          linked_id?: string
          linked_type?: Database["public"]["Enums"]["linked_object_type"]
        }
        Relationships: [
          {
            foreignKeyName: "evidence_links_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_items"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_sources: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["source_kind"]
          label: string
          org_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["source_kind"]
          label: string
          org_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["source_kind"]
          label?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      field_assertions: {
        Row: {
          asserted_by_agent: string | null
          asserted_by_profile: string | null
          based_on_evidence_id: string | null
          confidence: number | null
          created_at: string
          deal_id: string
          field_key: string
          id: string
          note: string | null
          status: Database["public"]["Enums"]["assertion_status"]
          subject_id: string
          subject_type: string
          supersedes_id: string | null
          value: Json
        }
        Insert: {
          asserted_by_agent?: string | null
          asserted_by_profile?: string | null
          based_on_evidence_id?: string | null
          confidence?: number | null
          created_at?: string
          deal_id: string
          field_key: string
          id?: string
          note?: string | null
          status: Database["public"]["Enums"]["assertion_status"]
          subject_id: string
          subject_type: string
          supersedes_id?: string | null
          value: Json
        }
        Update: {
          asserted_by_agent?: string | null
          asserted_by_profile?: string | null
          based_on_evidence_id?: string | null
          confidence?: number | null
          created_at?: string
          deal_id?: string
          field_key?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["assertion_status"]
          subject_id?: string
          subject_type?: string
          supersedes_id?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "field_assertions_asserted_by_profile_fkey"
            columns: ["asserted_by_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_assertions_based_on_evidence_id_fkey"
            columns: ["based_on_evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_assertions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_assertions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "field_assertions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "field_assertions"
            referencedColumns: ["id"]
          },
        ]
      }
      field_mappings: {
        Row: {
          canonical_concept_id: string
          id: string
          note: string | null
          source_field: string
          template_version_id: string
        }
        Insert: {
          canonical_concept_id: string
          id?: string
          note?: string | null
          source_field: string
          template_version_id: string
        }
        Update: {
          canonical_concept_id?: string
          id?: string
          note?: string | null
          source_field?: string
          template_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_mappings_canonical_concept_id_fkey"
            columns: ["canonical_concept_id"]
            isOneToOne: false
            referencedRelation: "canonical_concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_mappings_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          deal_id: string | null
          error: string | null
          finished_at: string | null
          id: string
          source_id: string
          started_at: string | null
          stats: Json
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          deal_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          source_id: string
          started_at?: string | null
          stats?: Json
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          deal_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          source_id?: string
          started_at?: string | null
          stats?: Json
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_jobs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "ingestion_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "evidence_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          is_admin: boolean
          org_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_admin?: boolean
          org_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_admin?: boolean
          org_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      request_responses: {
        Row: {
          clarifications: number
          evidence_id: string | null
          id: string
          note: string | null
          quality: number | null
          request_id: string
          responded_at: string
        }
        Insert: {
          clarifications?: number
          evidence_id?: string | null
          id?: string
          note?: string | null
          quality?: number | null
          request_id: string
          responded_at: string
        }
        Update: {
          clarifications?: number
          evidence_id?: string | null
          id?: string
          note?: string | null
          quality?: number | null
          request_id?: string
          responded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_responses_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "v_open_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          asset_id: string | null
          created_at: string
          deal_id: string
          detail: string | null
          due_at: string | null
          first_response_at: string | null
          id: string
          origin: Database["public"]["Enums"]["record_origin"]
          requested_at: string
          requested_by_actor: string
          requested_from_actor: string
          satisfied_at: string | null
          sensitivity: Database["public"]["Enums"]["sensitivity_level"]
          status: Database["public"]["Enums"]["request_status"]
          title: string
          wait_cause: Database["public"]["Enums"]["friction_category"] | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          deal_id: string
          detail?: string | null
          due_at?: string | null
          first_response_at?: string | null
          id?: string
          origin?: Database["public"]["Enums"]["record_origin"]
          requested_at: string
          requested_by_actor: string
          requested_from_actor: string
          satisfied_at?: string | null
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          wait_cause?: Database["public"]["Enums"]["friction_category"] | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          deal_id?: string
          detail?: string | null
          due_at?: string | null
          first_response_at?: string | null
          id?: string
          origin?: Database["public"]["Enums"]["record_origin"]
          requested_at?: string
          requested_by_actor?: string
          requested_from_actor?: string
          satisfied_at?: string | null
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"]
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
          wait_cause?: Database["public"]["Enums"]["friction_category"] | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "requests_requested_by_actor_fkey"
            columns: ["requested_by_actor"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_requested_from_actor_fkey"
            columns: ["requested_from_actor"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_templates: {
        Row: {
          id: string
          key: string
          name: string
        }
        Insert: {
          id?: string
          key: string
          name: string
        }
        Update: {
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      template_versions: {
        Row: {
          created_at: string
          fields: Json
          id: string
          published_at: string | null
          stages: Json
          template_id: string
          version: string
        }
        Insert: {
          created_at?: string
          fields?: Json
          id?: string
          published_at?: string | null
          stages: Json
          template_id: string
          version: string
        }
        Update: {
          created_at?: string
          fields?: Json
          id?: string
          published_at?: string | null
          stages?: Json
          template_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "schema_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_tasks: {
        Row: {
          assertion_id: string | null
          created_at: string
          deal_id: string
          id: string
          priority: number
          question: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          retro_week: string | null
          status: Database["public"]["Enums"]["validation_status"]
        }
        Insert: {
          assertion_id?: string | null
          created_at?: string
          deal_id: string
          id?: string
          priority?: number
          question: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retro_week?: string | null
          status?: Database["public"]["Enums"]["validation_status"]
        }
        Update: {
          assertion_id?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          priority?: number
          question?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retro_week?: string | null
          status?: Database["public"]["Enums"]["validation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "validation_tasks_assertion_id_fkey"
            columns: ["assertion_id"]
            isOneToOne: false
            referencedRelation: "field_assertions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "validation_tasks_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_current_state: {
        Row: {
          asserted_by_agent: string | null
          asserted_by_profile: string | null
          based_on_evidence_id: string | null
          confidence: number | null
          created_at: string | null
          deal_id: string | null
          field_key: string | null
          status: Database["public"]["Enums"]["assertion_status"] | null
          subject_id: string | null
          subject_type: string | null
          value: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "field_assertions_asserted_by_profile_fkey"
            columns: ["asserted_by_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_assertions_based_on_evidence_id_fkey"
            columns: ["based_on_evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_assertions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_assertions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      v_deal_metrics: {
        Row: {
          actor_count: number | null
          avg_days_per_request: number | null
          codename: string | null
          current_stage_key: string | null
          deal_id: string | null
          document_count: number | null
          event_count: number | null
          open_requests: number | null
          opened_at: string | null
          pending_decisions: number | null
          pending_validations: number | null
          request_count: number | null
          status: Database["public"]["Enums"]["deal_status"] | null
        }
        Insert: {
          actor_count?: never
          avg_days_per_request?: never
          codename?: string | null
          current_stage_key?: string | null
          deal_id?: string | null
          document_count?: never
          event_count?: never
          open_requests?: never
          opened_at?: string | null
          pending_decisions?: never
          pending_validations?: never
          request_count?: never
          status?: Database["public"]["Enums"]["deal_status"] | null
        }
        Update: {
          actor_count?: never
          avg_days_per_request?: never
          codename?: string | null
          current_stage_key?: string | null
          deal_id?: string | null
          document_count?: never
          event_count?: never
          open_requests?: never
          opened_at?: string | null
          pending_decisions?: never
          pending_validations?: never
          request_count?: never
          status?: Database["public"]["Enums"]["deal_status"] | null
        }
        Relationships: []
      }
      v_deal_timeline: {
        Row: {
          confidence: number | null
          deal_id: string | null
          evidence_count: number | null
          id: string | null
          kind: Database["public"]["Enums"]["event_kind"] | null
          occurred_at: string | null
          origin: Database["public"]["Enums"]["record_origin"] | null
          pending_validations: number | null
          sensitivity: Database["public"]["Enums"]["sensitivity_level"] | null
          stage_key: string | null
          summary: string | null
        }
        Insert: {
          confidence?: number | null
          deal_id?: string | null
          evidence_count?: never
          id?: string | null
          kind?: Database["public"]["Enums"]["event_kind"] | null
          occurred_at?: string | null
          origin?: Database["public"]["Enums"]["record_origin"] | null
          pending_validations?: never
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"] | null
          stage_key?: string | null
          summary?: string | null
        }
        Update: {
          confidence?: number | null
          deal_id?: string | null
          evidence_count?: never
          id?: string | null
          kind?: Database["public"]["Enums"]["event_kind"] | null
          occurred_at?: string | null
          origin?: Database["public"]["Enums"]["record_origin"] | null
          pending_validations?: never
          sensitivity?: Database["public"]["Enums"]["sensitivity_level"] | null
          stage_key?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      v_open_requests: {
        Row: {
          days_to_first_response: number | null
          days_waiting: number | null
          deal_id: string | null
          due_at: string | null
          id: string | null
          requested_at: string | null
          requested_by: string | null
          requested_from: string | null
          status: Database["public"]["Enums"]["request_status"] | null
          title: string | null
          wait_cause: Database["public"]["Enums"]["friction_category"] | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_metrics"
            referencedColumns: ["deal_id"]
          },
        ]
      }
    }
    Functions: {
      assert_field: {
        Args: {
          p_agent?: string
          p_confidence?: number
          p_deal: string
          p_evidence?: string
          p_field_key: string
          p_note?: string
          p_status: Database["public"]["Enums"]["assertion_status"]
          p_subject_id: string
          p_subject_type: string
          p_value: Json
        }
        Returns: string
      }
      confirm_assertion: { Args: { p_assertion: string }; Returns: undefined }
    }
    Enums: {
      actor_kind: "person" | "organization"
      assertion_status:
        | "observed"
        | "inferred"
        | "confirmed"
        | "disputed"
        | "superseded"
      asset_kind:
        | "target_company"
        | "equity_stake"
        | "document"
        | "offer"
        | "loi"
        | "spa"
        | "financial_model"
        | "contract"
        | "nda"
        | "bank_account"
        | "spv"
        | "condition_precedent"
        | "other"
      asset_status:
        | "draft"
        | "active"
        | "signed"
        | "satisfied"
        | "expired"
        | "archived"
      data_classification:
        | "deal_confidential"
        | "reusable_candidate"
        | "anonymized_aggregate"
        | "platform_operational"
      deal_role:
        | "owner"
        | "scribe"
        | "analyst"
        | "advisor"
        | "viewer"
        | "ai_agent"
      deal_status:
        | "active"
        | "paused"
        | "dropped"
        | "closed"
        | "integrating"
        | "archived"
      decision_status:
        | "proposed"
        | "approved"
        | "rejected"
        | "deferred"
        | "superseded"
      event_kind:
        | "email_received"
        | "email_sent"
        | "document_uploaded"
        | "document_shared"
        | "request_sent"
        | "request_answered"
        | "meeting_held"
        | "call_held"
        | "offer_submitted"
        | "offer_revised"
        | "approval_granted"
        | "approval_denied"
        | "nda_signed"
        | "loi_signed"
        | "contract_signed"
        | "access_granted"
        | "transfer_confirmed"
        | "stage_changed"
        | "note_added"
        | "correction"
        | "other"
      evidence_kind:
        | "email"
        | "file"
        | "whatsapp_export"
        | "meeting_minute"
        | "note"
        | "link"
        | "other"
      friction_category:
        | "info_unavailable"
        | "info_disordered"
        | "info_incorrect"
        | "info_duplicated"
        | "no_owner"
        | "no_authorization"
        | "misaligned_incentives"
        | "negotiation"
        | "third_party_dependency"
        | "legal_requirement"
        | "bank_requirement"
        | "signature"
        | "money_transfer"
        | "version_churn"
        | "context_loss"
        | "trust"
      job_status: "pending" | "processing" | "done" | "failed"
      linked_object_type:
        | "event"
        | "asset"
        | "assertion"
        | "decision"
        | "request"
        | "deal_actor"
      participant_role:
        | "initiator"
        | "receiver"
        | "participant"
        | "approver"
        | "witness"
      record_origin: "manual" | "ingested" | "inferred"
      request_status: "open" | "partially_answered" | "answered" | "withdrawn"
      sensitivity_level: "standard" | "sensitive" | "restricted"
      source_kind: "manual" | "gmail" | "gdrive" | "whatsapp" | "api"
      validation_status:
        | "pending"
        | "confirmed"
        | "corrected"
        | "rejected"
        | "deferred"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      actor_kind: ["person", "organization"],
      assertion_status: [
        "observed",
        "inferred",
        "confirmed",
        "disputed",
        "superseded",
      ],
      asset_kind: [
        "target_company",
        "equity_stake",
        "document",
        "offer",
        "loi",
        "spa",
        "financial_model",
        "contract",
        "nda",
        "bank_account",
        "spv",
        "condition_precedent",
        "other",
      ],
      asset_status: [
        "draft",
        "active",
        "signed",
        "satisfied",
        "expired",
        "archived",
      ],
      data_classification: [
        "deal_confidential",
        "reusable_candidate",
        "anonymized_aggregate",
        "platform_operational",
      ],
      deal_role: [
        "owner",
        "scribe",
        "analyst",
        "advisor",
        "viewer",
        "ai_agent",
      ],
      deal_status: [
        "active",
        "paused",
        "dropped",
        "closed",
        "integrating",
        "archived",
      ],
      decision_status: [
        "proposed",
        "approved",
        "rejected",
        "deferred",
        "superseded",
      ],
      event_kind: [
        "email_received",
        "email_sent",
        "document_uploaded",
        "document_shared",
        "request_sent",
        "request_answered",
        "meeting_held",
        "call_held",
        "offer_submitted",
        "offer_revised",
        "approval_granted",
        "approval_denied",
        "nda_signed",
        "loi_signed",
        "contract_signed",
        "access_granted",
        "transfer_confirmed",
        "stage_changed",
        "note_added",
        "correction",
        "other",
      ],
      evidence_kind: [
        "email",
        "file",
        "whatsapp_export",
        "meeting_minute",
        "note",
        "link",
        "other",
      ],
      friction_category: [
        "info_unavailable",
        "info_disordered",
        "info_incorrect",
        "info_duplicated",
        "no_owner",
        "no_authorization",
        "misaligned_incentives",
        "negotiation",
        "third_party_dependency",
        "legal_requirement",
        "bank_requirement",
        "signature",
        "money_transfer",
        "version_churn",
        "context_loss",
        "trust",
      ],
      job_status: ["pending", "processing", "done", "failed"],
      linked_object_type: [
        "event",
        "asset",
        "assertion",
        "decision",
        "request",
        "deal_actor",
      ],
      participant_role: [
        "initiator",
        "receiver",
        "participant",
        "approver",
        "witness",
      ],
      record_origin: ["manual", "ingested", "inferred"],
      request_status: ["open", "partially_answered", "answered", "withdrawn"],
      sensitivity_level: ["standard", "sensitive", "restricted"],
      source_kind: ["manual", "gmail", "gdrive", "whatsapp", "api"],
      validation_status: [
        "pending",
        "confirmed",
        "corrected",
        "rejected",
        "deferred",
      ],
    },
  },
} as const
