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
  { name: 'Toxina Botulínica', category: 'Facial', is_predefined: true },
  { name: 'Bioestimulador', category: 'Facial', is_predefined: true },
  { name: 'Preenchedor Facial', category: 'Facial', is_predefined: true },
  { name: 'Preenchedor Labial', category: 'Facial', is_predefined: true },
  { name: 'Ultrassom Microfocado', category: 'Facial', is_predefined: true },
  { name: 'Fios de PDO', category: 'Facial', is_predefined: true },
]
