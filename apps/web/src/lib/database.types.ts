
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "campaign_members": {
                  Row: {
                    "campaign_id": string,"joined_at": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"joined_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Update: {
                    "campaign_id"?: string,"joined_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaign_members_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campaign_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"campaigns": {
                  Row: {
                    "created_at": string,"description": string,"gm_id": string,"id": string,"invite_code": string,"name": string,"settings": NonNullable<Json>,"template_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string,"gm_id": string,"id"?: string,"invite_code": string,"name": string,"settings"?: NonNullable<Json>,"template_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"gm_id"?: string,"id"?: string,"invite_code"?: string,"name"?: string,"settings"?: NonNullable<Json>,"template_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaigns_gm_id_fkey"
      columns: ["gm_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campaigns_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "templates"
      referencedColumns: ["id"]
    }
                  ]
                },"character_changes": {
                  Row: {
                    "campaign_id": string,"character_id": string,"created_at": string,"id": number,"new_value": Json | null,"old_value": Json | null,"op": string,"op_id": string,"op_index": number,"path": (string)[],"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"character_id": string,"created_at"?: string,"id"?: never,"new_value"?: Json | null,"old_value"?: Json | null,"op": string,"op_id": string,"op_index": number,"path": (string)[],"user_id"?: string | null
                  }
                  Update: {
                    "campaign_id"?: string,"character_id"?: string,"created_at"?: string,"id"?: never,"new_value"?: Json | null,"old_value"?: Json | null,"op"?: string,"op_id"?: string,"op_index"?: number,"path"?: (string)[],"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "character_changes_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "character_changes_character_id_fkey"
      columns: ["character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "character_changes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"characters": {
                  Row: {
                    "campaign_id": string,"created_at": string,"data": NonNullable<Json>,"id": string,"is_library": boolean,"kind": Database["public"]['Enums']["character_kind"],"name": string,"owner_id": string,"portrait_path": string | null,"status": Database["public"]['Enums']["character_status"],"template_version_id": string,"updated_at": string,"version": number,"visibility": Database["public"]['Enums']["character_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"is_library"?: boolean,"kind"?: Database["public"]['Enums']["character_kind"],"name"?: string,"owner_id": string,"portrait_path"?: string | null,"status"?: Database["public"]['Enums']["character_status"],"template_version_id": string,"updated_at"?: string,"version"?: number,"visibility"?: Database["public"]['Enums']["character_visibility"]
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"is_library"?: boolean,"kind"?: Database["public"]['Enums']["character_kind"],"name"?: string,"owner_id"?: string,"portrait_path"?: string | null,"status"?: Database["public"]['Enums']["character_status"],"template_version_id"?: string,"updated_at"?: string,"version"?: number,"visibility"?: Database["public"]['Enums']["character_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "characters_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "characters_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "characters_template_version_id_fkey"
      columns: ["template_version_id"]
isOneToOne: false
      referencedRelation: "template_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"combatant_secrets": {
                  Row: {
                    "campaign_id": string,"combatant_id": string,"resources": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"combatant_id": string,"resources"?: NonNullable<Json>
                  }
                  Update: {
                    "campaign_id"?: string,"combatant_id"?: string,"resources"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "combatant_secrets_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "combatant_secrets_combatant_id_fkey"
      columns: ["combatant_id"]
isOneToOne: true
      referencedRelation: "combatants"
      referencedColumns: ["id"]
    }
                  ]
                },"combatants": {
                  Row: {
                    "campaign_id": string,"character_id": string | null,"conditions": NonNullable<Json>,"created_at": string,"encounter_id": string,"hidden": boolean,"id": string,"initiative": number | null,"label": string,"order_index": number,"public_status": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"character_id"?: string | null,"conditions"?: NonNullable<Json>,"created_at"?: string,"encounter_id": string,"hidden"?: boolean,"id"?: string,"initiative"?: number | null,"label": string,"order_index"?: number,"public_status"?: string | null
                  }
                  Update: {
                    "campaign_id"?: string,"character_id"?: string | null,"conditions"?: NonNullable<Json>,"created_at"?: string,"encounter_id"?: string,"hidden"?: boolean,"id"?: string,"initiative"?: number | null,"label"?: string,"order_index"?: number,"public_status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "combatants_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "combatants_character_id_fkey"
      columns: ["character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "combatants_encounter_id_fkey"
      columns: ["encounter_id"]
isOneToOne: false
      referencedRelation: "encounters"
      referencedColumns: ["id"]
    }
                  ]
                },"encounters": {
                  Row: {
                    "campaign_id": string,"created_at": string,"current_combatant_id": string | null,"id": string,"name": string,"round": number,"status": Database["public"]['Enums']["encounter_status"],"turn_index": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"current_combatant_id"?: string | null,"id"?: string,"name"?: string,"round"?: number,"status"?: Database["public"]['Enums']["encounter_status"],"turn_index"?: number,"updated_at"?: string
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"current_combatant_id"?: string | null,"id"?: string,"name"?: string,"round"?: number,"status"?: Database["public"]['Enums']["encounter_status"],"turn_index"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "encounters_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "encounters_current_combatant_id_fkey"
      columns: ["current_combatant_id"]
isOneToOne: false
      referencedRelation: "combatants"
      referencedColumns: ["id"]
    }
                  ]
                },"folders": {
                  Row: {
                    "campaign_id": string,"created_at": string,"id": string,"name": string,"parent_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"id"?: string,"name": string,"parent_id"?: string | null
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"parent_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "folders_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "folders_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "folders"
      referencedColumns: ["id"]
    }
                  ]
                },"handout_recipients": {
                  Row: {
                    "campaign_id": string,"handout_id": string,"revealed_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"handout_id": string,"revealed_at"?: string,"user_id": string
                  }
                  Update: {
                    "campaign_id"?: string,"handout_id"?: string,"revealed_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "handout_recipients_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handout_recipients_handout_id_fkey"
      columns: ["handout_id"]
isOneToOne: false
      referencedRelation: "handouts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handout_recipients_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"handouts": {
                  Row: {
                    "body": string,"campaign_id": string,"created_at": string,"created_by": string | null,"folder_id": string | null,"id": string,"image_path": string | null,"revealed_at": string | null,"revealed_to_all": boolean,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"campaign_id": string,"created_at"?: string,"created_by"?: string | null,"folder_id"?: string | null,"id"?: string,"image_path"?: string | null,"revealed_at"?: string | null,"revealed_to_all"?: boolean,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"campaign_id"?: string,"created_at"?: string,"created_by"?: string | null,"folder_id"?: string | null,"id"?: string,"image_path"?: string | null,"revealed_at"?: string | null,"revealed_to_all"?: boolean,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "handouts_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handouts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handouts_folder_id_fkey"
      columns: ["folder_id"]
isOneToOne: false
      referencedRelation: "folders"
      referencedColumns: ["id"]
    }
                  ]
                },"item_secrets": {
                  Row: {
                    "campaign_id": string,"item_id": string,"real_description": string,"real_modifiers": NonNullable<Json>,"real_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"item_id": string,"real_description"?: string,"real_modifiers"?: NonNullable<Json>,"real_name": string
                  }
                  Update: {
                    "campaign_id"?: string,"item_id"?: string,"real_description"?: string,"real_modifiers"?: NonNullable<Json>,"real_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_secrets_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_secrets_item_id_fkey"
      columns: ["item_id"]
isOneToOne: true
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "campaign_id": string,"created_at": string,"data": NonNullable<Json>,"description": string,"equipped": boolean,"holder_id": string | null,"holder_type": Database["public"]['Enums']["holder_type"],"id": string,"identified": boolean,"modifiers": NonNullable<Json>,"name": string,"quantity": number,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"data"?: NonNullable<Json>,"description"?: string,"equipped"?: boolean,"holder_id"?: string | null,"holder_type": Database["public"]['Enums']["holder_type"],"id"?: string,"identified"?: boolean,"modifiers"?: NonNullable<Json>,"name": string,"quantity"?: number,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"description"?: string,"equipped"?: boolean,"holder_id"?: string | null,"holder_type"?: Database["public"]['Enums']["holder_type"],"id"?: string,"identified"?: boolean,"modifiers"?: NonNullable<Json>,"name"?: string,"quantity"?: number,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"loot_pools": {
                  Row: {
                    "campaign_id": string,"created_at": string,"id": string,"mode": Database["public"]['Enums']["loot_mode"],"name": string,"revealed": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"id"?: string,"mode"?: Database["public"]['Enums']["loot_mode"],"name": string,"revealed"?: boolean
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"id"?: string,"mode"?: Database["public"]['Enums']["loot_mode"],"name"?: string,"revealed"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "loot_pools_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"map_marks": {
                  Row: {
                    "author_id": string,"campaign_id": string,"color": string,"created_at": string,"data": NonNullable<Json>,"gm_only": boolean,"id": string,"kind": string,"map_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"campaign_id": string,"color"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"gm_only"?: boolean,"id"?: string,"kind": string,"map_id": string
                  }
                  Update: {
                    "author_id"?: string,"campaign_id"?: string,"color"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"gm_only"?: boolean,"id"?: string,"kind"?: string,"map_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "map_marks_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "map_marks_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "map_marks_map_id_fkey"
      columns: ["map_id"]
isOneToOne: false
      referencedRelation: "maps"
      referencedColumns: ["id"]
    }
                  ]
                },"map_tokens": {
                  Row: {
                    "campaign_id": string,"character_id": string | null,"color": string,"combatant_id": string | null,"created_at": string,"hidden": boolean,"id": string,"label": string,"map_id": string,"size": number,"updated_at": string,"x": number,"y": number
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"character_id"?: string | null,"color"?: string,"combatant_id"?: string | null,"created_at"?: string,"hidden"?: boolean,"id"?: string,"label": string,"map_id": string,"size"?: number,"updated_at"?: string,"x"?: number,"y"?: number
                  }
                  Update: {
                    "campaign_id"?: string,"character_id"?: string | null,"color"?: string,"combatant_id"?: string | null,"created_at"?: string,"hidden"?: boolean,"id"?: string,"label"?: string,"map_id"?: string,"size"?: number,"updated_at"?: string,"x"?: number,"y"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "map_tokens_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "map_tokens_character_id_fkey"
      columns: ["character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "map_tokens_combatant_id_fkey"
      columns: ["combatant_id"]
isOneToOne: false
      referencedRelation: "combatants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "map_tokens_map_id_fkey"
      columns: ["map_id"]
isOneToOne: false
      referencedRelation: "maps"
      referencedColumns: ["id"]
    }
                  ]
                },"maps": {
                  Row: {
                    "active": boolean,"campaign_id": string,"cell_meters": number,"cell_px": number,"cols": number,"created_at": string,"diagonal": string,"fog": string,"fog_enabled": boolean,"id": string,"image_h": number,"image_path": string | null,"image_w": number,"name": string,"offset_x": number,"offset_y": number,"revealed": boolean,"rows": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"campaign_id": string,"cell_meters"?: number,"cell_px"?: number,"cols"?: number,"created_at"?: string,"diagonal"?: string,"fog"?: string,"fog_enabled"?: boolean,"id"?: string,"image_h"?: number,"image_path"?: string | null,"image_w"?: number,"name": string,"offset_x"?: number,"offset_y"?: number,"revealed"?: boolean,"rows"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"campaign_id"?: string,"cell_meters"?: number,"cell_px"?: number,"cols"?: number,"created_at"?: string,"diagonal"?: string,"fog"?: string,"fog_enabled"?: boolean,"id"?: string,"image_h"?: number,"image_path"?: string | null,"image_w"?: number,"name"?: string,"offset_x"?: number,"offset_y"?: number,"revealed"?: boolean,"rows"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "maps_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"notes": {
                  Row: {
                    "author_id": string,"body": string,"campaign_id": string,"created_at": string,"folder_id": string | null,"id": string,"kind": string,"search": unknown,"session_date": string | null,"tags": (string)[],"title": string,"updated_at": string,"visibility": Database["public"]['Enums']["note_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body"?: string,"campaign_id": string,"created_at"?: string,"folder_id"?: string | null,"id"?: string,"kind"?: string,"search"?: never,"session_date"?: string | null,"tags"?: (string)[],"title"?: string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["note_visibility"]
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"campaign_id"?: string,"created_at"?: string,"folder_id"?: string | null,"id"?: string,"kind"?: string,"search"?: never,"session_date"?: string | null,"tags"?: (string)[],"title"?: string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["note_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notes_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notes_folder_id_fkey"
      columns: ["folder_id"]
isOneToOne: false
      referencedRelation: "folders"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"created_at": string,"display_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"created_at"?: string,"display_name": string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rolls": {
                  Row: {
                    "campaign_id": string,"character_id": string | null,"created_at": string,"expression": string,"id": string,"label": string,"offline": boolean,"result": NonNullable<Json>,"total": number,"user_id": string | null,"visibility": Database["public"]['Enums']["roll_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"character_id"?: string | null,"created_at"?: string,"expression": string,"id"?: string,"label": string,"offline"?: boolean,"result": NonNullable<Json>,"total": number,"user_id"?: string | null,"visibility"?: Database["public"]['Enums']["roll_visibility"]
                  }
                  Update: {
                    "campaign_id"?: string,"character_id"?: string | null,"created_at"?: string,"expression"?: string,"id"?: string,"label"?: string,"offline"?: boolean,"result"?: NonNullable<Json>,"total"?: number,"user_id"?: string | null,"visibility"?: Database["public"]['Enums']["roll_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "rolls_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rolls_character_id_fkey"
      columns: ["character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rolls_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"template_versions": {
                  Row: {
                    "created_at": string,"id": string,"schema": NonNullable<Json>,"template_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"schema": NonNullable<Json>,"template_id": string,"version": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"schema"?: NonNullable<Json>,"template_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "template_versions_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "templates"
      referencedColumns: ["id"]
    }
                  ]
                },"templates": {
                  Row: {
                    "created_at": string,"current_version": number,"id": string,"name": string,"owner_id": string | null,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_version"?: number,"id"?: string,"name": string,"owner_id"?: string | null,"slug": string
                  }
                  Update: {
                    "created_at"?: string,"current_version"?: number,"id"?: string,"name"?: string,"owner_id"?: string | null,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "templates_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_combatants":
{ Args: { "p_character": string,"p_count"?: number,"p_encounter": string,"p_hidden"?: boolean,"p_resources"?: Json }; Returns: {
              "campaign_id": string,
"character_id": string | null,
"conditions": NonNullable<Json>,
"created_at": string,
"encounter_id": string,
"hidden": boolean,
"id": string,
"initiative": number | null,
"label": string,
"order_index": number,
"public_status": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "combatants"
        isOneToOne: false
        isSetofReturn: true
      } },
"adjust_combatant_resource":
{ Args: { "p_combatant": string,"p_delta": number,"p_resource": string,"p_set"?: number }; Returns: Json
                           },
"advance_turn":
{ Args: { "p_encounter": string,"p_step"?: number }; Returns: {
              "campaign_id": string,
"created_at": string,
"current_combatant_id": string | null,
"id": string,
"name": string,
"round": number,
"status": Database["public"]['Enums']["encounter_status"],
"turn_index": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "encounters"
        isOneToOne: true
        isSetofReturn: false
      } },
"apply_character_ops":
{ Args: { "p_character": string,"p_op_id": string,"p_ops": Json }; Returns: Json
                           },
"copy_item":
{ Args: { "p_holder_id"?: string,"p_holder_type": Database["public"]['Enums']["holder_type"],"p_item": string,"p_quantity"?: number }; Returns: {
              "campaign_id": string,
"created_at": string,
"data": NonNullable<Json>,
"description": string,
"equipped": boolean,
"holder_id": string | null,
"holder_type": Database["public"]['Enums']["holder_type"],
"id": string,
"identified": boolean,
"modifiers": NonNullable<Json>,
"name": string,
"quantity": number,
"sort": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_campaign":
{ Args: { "p_description"?: string,"p_name": string,"p_template_slug": string }; Returns: {
              "created_at": string,
"description": string,
"gm_id": string,
"id": string,
"invite_code": string,
"name": string,
"settings": NonNullable<Json>,
"template_id": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "campaigns"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_character":
{ Args: { "p_campaign": string,"p_data": Json,"p_is_library"?: boolean,"p_kind"?: Database["public"]['Enums']["character_kind"],"p_name": string,"p_visibility"?: Database["public"]['Enums']["character_visibility"] }; Returns: {
              "campaign_id": string,
"created_at": string,
"data": NonNullable<Json>,
"id": string,
"is_library": boolean,
"kind": Database["public"]['Enums']["character_kind"],
"name": string,
"owner_id": string,
"portrait_path": string | null,
"status": Database["public"]['Enums']["character_status"],
"template_version_id": string,
"updated_at": string,
"version": number,
"visibility": Database["public"]['Enums']["character_visibility"]
            }
                          SetofOptions: {
        from: "*"
        to: "characters"
        isOneToOne: true
        isSetofReturn: false
      } },
"identify_item":
{ Args: { "p_item": string }; Returns: {
              "campaign_id": string,
"created_at": string,
"data": NonNullable<Json>,
"description": string,
"equipped": boolean,
"holder_id": string | null,
"holder_type": Database["public"]['Enums']["holder_type"],
"id": string,
"identified": boolean,
"modifiers": NonNullable<Json>,
"name": string,
"quantity": number,
"sort": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"join_campaign":
{ Args: { "p_code": string }; Returns: string
                           },
"regenerate_invite_code":
{ Args: { "p_campaign": string }; Returns: string
                           },
"set_active_map":
{ Args: { "p_campaign": string,"p_map": string }; Returns: undefined
                           },
"sort_initiative":
{ Args: { "p_encounter": string }; Returns: undefined
                           },
"take_loot_item":
{ Args: { "p_character": string,"p_item": string }; Returns: {
              "campaign_id": string,
"created_at": string,
"data": NonNullable<Json>,
"description": string,
"equipped": boolean,
"holder_id": string | null,
"holder_type": Database["public"]['Enums']["holder_type"],
"id": string,
"identified": boolean,
"modifiers": NonNullable<Json>,
"name": string,
"quantity": number,
"sort": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "character_kind": "pc"|"npc"|"monster","character_status": "draft"|"active"|"archived","character_visibility": "public"|"gm","encounter_status": "prep"|"active"|"ended","holder_type": "character"|"loot"|"library"|"party","loot_mode": "distribute"|"free_pick","member_role": "gm"|"player","note_visibility": "private"|"gm"|"public","roll_visibility": "public"|"gm"|"self_gm"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "character_kind": ["pc", "npc", "monster"],"character_status": ["draft", "active", "archived"],"character_visibility": ["public", "gm"],"encounter_status": ["prep", "active", "ended"],"holder_type": ["character", "loot", "library", "party"],"loot_mode": ["distribute", "free_pick"],"member_role": ["gm", "player"],"note_visibility": ["private", "gm", "public"],"roll_visibility": ["public", "gm", "self_gm"]
          }
        }
} as const
