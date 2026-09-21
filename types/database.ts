export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'user' | 'superadmin'

export interface Profile {
  max_businesses?: number | null
  id: string
  full_name: string | null
  phone: string | null
  avatar_url?: string | null
  role: UserRole
  is_active?: boolean
  created_at: string
  updated_at: string
}

export interface Business {
  id: string
  owner_id: string
  name: string
  description?: string | null
  logo_url?: string | null
  category: string
  slug: string
  phone?: string | null
  address?: string | null
  opening_time?: string | null
  closing_time?: string | null
  max_daily_appointments?: number
  is_active?: boolean
  created_at: string
  updated_at: string
}

export interface Service {
  id: string
  business_id: string
  name: string
  description?: string | null
  duration_minutes: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Staff {
  id: string
  business_id: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AppointmentStatus = 'waiting' | 'serving' | 'completed' | 'cancelled'

export interface Appointment {
  id: string
  business_id: string
  service_id?: string | null
  staff_id?: string | null
  customer_name: string
  customer_phone?: string | null
  queue_number: number
  status: AppointmentStatus
  estimated_wait_minutes: number
  appointment_date: string
  created_at: string
  updated_at: string
  // Optional joined relations for UI rendering
  service?: Service | null
  staff?: Staff | null
}

export interface Database {
  public: {
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
    Tables: {
      profiles: {
        Row: { [K in keyof Profile]: Profile[K] }
        Relationships: []
        Insert: Pick<Profile, 'id'> & Partial<Omit<Profile, 'id'>>
        Update: Partial<Omit<Profile, 'id'>>
      }
      businesses: {
        Row: { [K in keyof Business]: Business[K] }
        Relationships: []
        Insert: Omit<Business, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Business, 'id' | 'owner_id'>>
      }
      services: {
        Row: { [K in keyof Service]: Service[K] }
        Relationships: []
        Insert: Omit<Service, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Service, 'id' | 'business_id'>>
      }
      staff: {
        Row: { [K in keyof Staff]: Staff[K] }
        Relationships: []
        Insert: Omit<Staff, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Staff, 'id' | 'business_id'>>
      }
      appointments: {
        Row: { [K in keyof Appointment]: Appointment[K] }
        Relationships: []
        Insert: Omit<Appointment, 'id' | 'created_at' | 'updated_at' | 'service' | 'staff'> & {
          id?: string
          status?: AppointmentStatus
          estimated_wait_minutes?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Appointment, 'id' | 'business_id'>>
      }
    }
  }
}
