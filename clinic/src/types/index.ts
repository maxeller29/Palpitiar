export interface Patient {
  id: string
  name: string
  phone: string
  email?: string
  birth_date?: string
  cpf?: string
  address?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Treatment {
  id: string
  name: string
  category: string
  is_predefined: boolean
}

export interface TreatmentSession {
  id: string
  patient_id: string
  treatment_id: string
  treatment?: Treatment
  session_date: string
  notes?: string
  products_used?: string
  dose?: string
  next_session_date?: string
  created_at: string
}

export interface PatientPhoto {
  id: string
  patient_id: string
  session_id?: string
  url: string
  label?: string
  taken_at: string
  created_at: string
}

export interface Appointment {
  id: string
  patient_id: string
  patient?: Patient
  treatment_id?: string
  treatment?: Treatment
  appointment_date: string
  duration_minutes: number
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  notes?: string
  created_at: string
}

export const PREDEFINED_TREATMENTS: Omit<Treatment, 'id'>[] = [
  { name: 'Toxina Botulínica (Botox)', category: 'Facial', is_predefined: true },
  { name: 'Preenchimento Labial', category: 'Facial', is_predefined: true },
  { name: 'Preenchimento Facial', category: 'Facial', is_predefined: true },
  { name: 'Preenchimento de Glúteos', category: 'Corporal', is_predefined: true },
  { name: 'Bioestimulador de Colágeno', category: 'Facial', is_predefined: true },
  { name: 'Fios de PDO', category: 'Facial', is_predefined: true },
  { name: 'Skinbooster', category: 'Facial', is_predefined: true },
  { name: 'Lipo de Papada', category: 'Facial', is_predefined: true },
  { name: 'Harmonização Facial Completa', category: 'Facial', is_predefined: true },
  { name: 'Micropigmentação', category: 'Estético', is_predefined: true },
  { name: 'Peeling Químico', category: 'Facial', is_predefined: true },
  { name: 'Consulta/Avaliação', category: 'Geral', is_predefined: true },
]
