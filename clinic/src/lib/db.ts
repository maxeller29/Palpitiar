/**
 * Abstraction layer: uses Supabase when env vars are set, localStorage otherwise.
 * This lets the app work locally without any config, and in production with full cloud sync.
 */
import type { Patient, TreatmentSession, PatientPhoto, Appointment, Treatment, UltrasoundApplication, UltrasoundTip } from '../types'
import * as local from './localStorage'

const USE_SUPABASE = !!(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
)

async function sb() {
  if (!USE_SUPABASE) throw new Error('Supabase not configured')
  const { supabase } = await import('./supabase')
  return supabase
}

// ── Treatments ───────────────────────────────────────────────────────────────

export async function getTreatments(): Promise<Treatment[]> {
  if (!USE_SUPABASE) return local.getTreatments()
  const client = await sb()
  const { data } = await client.from('treatments').select('*').order('category').order('name')
  return (data || []) as Treatment[]
}

export async function addTreatment(name: string, category: string): Promise<Treatment> {
  if (!USE_SUPABASE) return local.addTreatment(name, category)
  const client = await sb()
  const { data } = await client.from('treatments').insert({ name, category, is_predefined: false }).select().single()
  return data as Treatment
}

// ── Patients ─────────────────────────────────────────────────────────────────

export async function getPatients(): Promise<Patient[]> {
  if (!USE_SUPABASE) return local.getPatients()
  const client = await sb()
  const { data } = await client.from('patients').select('*').order('updated_at', { ascending: false })
  return (data || []) as Patient[]
}

export async function getPatient(id: string): Promise<Patient | undefined> {
  if (!USE_SUPABASE) return local.getPatient(id)
  const client = await sb()
  const { data } = await client.from('patients').select('*').eq('id', id).single()
  return data as Patient | undefined
}

export async function savePatient(
  data: Omit<Patient, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<Patient> {
  if (!USE_SUPABASE) return local.savePatient(data)
  const client = await sb()
  const now = new Date().toISOString()
  if (data.id) {
    const { id, ...rest } = data
    const { data: row } = await client.from('patients').update({ ...rest, updated_at: now }).eq('id', id).select().single()
    return row as Patient
  }
  const { data: row } = await client.from('patients').insert({ ...data, updated_at: now }).select().single()
  return row as Patient
}

export async function deletePatient(id: string): Promise<void> {
  if (!USE_SUPABASE) { local.deletePatient(id); return }
  const client = await sb()
  await client.from('patients').delete().eq('id', id)
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function getSessions(patientId: string): Promise<TreatmentSession[]> {
  if (!USE_SUPABASE) return local.getSessions(patientId)
  const client = await sb()
  const { data } = await client
    .from('treatment_sessions')
    .select('*, treatment:treatments(*)')
    .eq('patient_id', patientId)
    .order('session_date', { ascending: false })
  return (data || []) as unknown as TreatmentSession[]
}

export async function getAllSessions(): Promise<TreatmentSession[]> {
  if (!USE_SUPABASE) return local.getAllSessions()
  const client = await sb()
  const { data } = await client
    .from('treatment_sessions')
    .select('*, treatment:treatments(*)')
    .order('session_date', { ascending: false })
  return (data || []) as unknown as TreatmentSession[]
}

export async function saveSession(
  data: Omit<TreatmentSession, 'id' | 'created_at' | 'treatment'> & { id?: string }
): Promise<TreatmentSession> {
  if (!USE_SUPABASE) return local.saveSession(data)
  const client = await sb()
  if (data.id) {
    const { id, ...rest } = data
    const { data: row } = await client.from('treatment_sessions').update(rest).eq('id', id).select().single()
    return row as TreatmentSession
  }
  const { data: row } = await client.from('treatment_sessions').insert(data).select().single()
  return row as TreatmentSession
}

export async function deleteSession(id: string): Promise<void> {
  if (!USE_SUPABASE) { local.deleteSession(id); return }
  const client = await sb()
  await client.from('treatment_sessions').delete().eq('id', id)
}

// ── Photos ───────────────────────────────────────────────────────────────────

export async function getPhotos(patientId: string): Promise<PatientPhoto[]> {
  if (!USE_SUPABASE) return local.getPhotos(patientId)
  const client = await sb()
  const { data } = await client
    .from('patient_photos')
    .select('*')
    .eq('patient_id', patientId)
    .order('taken_at', { ascending: false })
  return (data || []) as PatientPhoto[]
}

export async function savePhoto(
  patientId: string, file: File, label?: string, sessionId?: string
): Promise<PatientPhoto> {
  // Convert file to base64 data URL — works in both localStorage and Supabase modes
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => resolve(ev.target?.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  if (!USE_SUPABASE) return local.savePhoto(patientId, base64, label, sessionId)
  const client = await sb()
  const { data: row } = await client.from('patient_photos').insert({
    patient_id: patientId,
    session_id: sessionId,
    url: base64,
    label,
    taken_at: new Date().toISOString(),
  }).select().single()
  return row as PatientPhoto
}

export async function deletePhoto(id: string): Promise<void> {
  if (!USE_SUPABASE) { local.deletePhoto(id); return }
  const client = await sb()
  await client.from('patient_photos').delete().eq('id', id)
}

// ── Appointments ──────────────────────────────────────────────────────────────

export async function getAppointments(): Promise<Appointment[]> {
  if (!USE_SUPABASE) return local.getAppointments()
  const client = await sb()
  const { data } = await client
    .from('appointments')
    .select('*, patient:patients(id,name,phone), treatment:treatments(id,name,category)')
    .order('appointment_date')
  return (data || []) as unknown as Appointment[]
}

export async function saveAppointment(
  data: Omit<Appointment, 'id' | 'created_at' | 'patient' | 'treatment'> & { id?: string }
): Promise<Appointment> {
  if (!USE_SUPABASE) return local.saveAppointment(data)
  const client = await sb()
  if (data.id) {
    const { id, ...rest } = data
    const { data: row } = await client.from('appointments').update(rest).eq('id', id).select().single()
    return row as Appointment
  }
  const { data: row } = await client.from('appointments').insert(data).select().single()
  return row as Appointment
}

export async function deleteAppointment(id: string): Promise<void> {
  if (!USE_SUPABASE) { local.deleteAppointment(id); return }
  const client = await sb()
  await client.from('appointments').delete().eq('id', id)
}

// ── Ultrassom Microfocado ─────────────────────────────────────────────────────

export async function getUltrasoundApplications(): Promise<UltrasoundApplication[]> {
  if (!USE_SUPABASE) return local.getUltrasoundApplications()
  const client = await sb()
  const { data } = await client
    .from('ultrasound_applications')
    .select('*, patient:patients(id,name)')
    .order('created_at', { ascending: false })
  return (data || []) as unknown as UltrasoundApplication[]
}

export async function getUltrasoundApplicationsForPatient(patientId: string): Promise<UltrasoundApplication[]> {
  if (!USE_SUPABASE) return local.getUltrasoundApplicationsForPatient(patientId)
  const client = await sb()
  const { data } = await client
    .from('ultrasound_applications')
    .select('*, patient:patients(id,name)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  return (data || []) as unknown as UltrasoundApplication[]
}

// Last device counter reading recorded for a tip, across all patients (0 if never used)
export async function getLastUltrasoundCounter(tip: UltrasoundTip): Promise<number> {
  if (!USE_SUPABASE) return local.getLastUltrasoundCounter(tip)
  const client = await sb()
  const { data } = await client
    .from('ultrasound_applications')
    .select('counter_reading')
    .eq('tip', tip)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.counter_reading ?? 0
}

export async function addUltrasoundApplication(
  patientId: string, tip: UltrasoundTip, counterReading: number, sessionDate: string
): Promise<UltrasoundApplication> {
  if (!USE_SUPABASE) return local.addUltrasoundApplication(patientId, tip, counterReading, sessionDate)
  const client = await sb()
  const shots = Math.max(0, counterReading - (await getLastUltrasoundCounter(tip)))
  const { data: row } = await client
    .from('ultrasound_applications')
    .insert({ patient_id: patientId, tip, counter_reading: counterReading, shots, session_date: sessionDate })
    .select()
    .single()
  return row as UltrasoundApplication
}

// Only the most recent application for a tip can be safely removed (it restores the counter baseline)
export async function isLatestUltrasoundApplicationForTip(id: string): Promise<boolean> {
  if (!USE_SUPABASE) return local.isLatestUltrasoundApplicationForTip(id)
  const client = await sb()
  const { data: target } = await client.from('ultrasound_applications').select('tip').eq('id', id).single()
  if (!target) return false
  const { data: latest } = await client
    .from('ultrasound_applications')
    .select('id')
    .eq('tip', target.tip)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return latest?.id === id
}

export async function deleteUltrasoundApplication(id: string): Promise<void> {
  if (!USE_SUPABASE) { local.deleteUltrasoundApplication(id); return }
  const client = await sb()
  await client.from('ultrasound_applications').delete().eq('id', id)
}
