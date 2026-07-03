// Persistence layer using localStorage as fallback when Supabase is not configured
import type { Patient, TreatmentSession, PatientPhoto, Appointment, Treatment } from '../types'
import { PREDEFINED_TREATMENTS } from '../types'

const KEYS = {
  patients: 'clinic_patients',
  sessions: 'clinic_sessions',
  photos: 'clinic_photos',
  appointments: 'clinic_appointments',
  treatments: 'clinic_treatments_v2',
}

function getAll<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

function saveAll<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data))
}

function uuid(): string {
  return crypto.randomUUID()
}

// ── Treatments ──────────────────────────────────────────────────────────────

export function getTreatments(): Treatment[] {
  const stored = getAll<Treatment>(KEYS.treatments)
  if (stored.length === 0) {
    const defaults = PREDEFINED_TREATMENTS.map((t, i) => ({ ...t, id: `predefined-${i}` }))
    saveAll(KEYS.treatments, defaults)
    return defaults
  }
  return stored
}

export function addTreatment(name: string, category: string): Treatment {
  const all = getTreatments()
  const t: Treatment = { id: uuid(), name, category, is_predefined: false }
  saveAll(KEYS.treatments, [...all, t])
  return t
}

// ── Patients ─────────────────────────────────────────────────────────────────

export function getPatients(): Patient[] {
  return getAll<Patient>(KEYS.patients).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )
}

export function getPatient(id: string): Patient | undefined {
  return getAll<Patient>(KEYS.patients).find(p => p.id === id)
}

export function savePatient(data: Omit<Patient, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Patient {
  const all = getAll<Patient>(KEYS.patients)
  const now = new Date().toISOString()
  if (data.id) {
    const updated = all.map(p => p.id === data.id ? { ...p, ...data, updated_at: now } : p)
    saveAll(KEYS.patients, updated)
    return updated.find(p => p.id === data.id)!
  }
  const newPatient: Patient = { ...data, id: uuid(), created_at: now, updated_at: now }
  saveAll(KEYS.patients, [...all, newPatient])
  return newPatient
}

export function deletePatient(id: string): void {
  saveAll(KEYS.patients, getAll<Patient>(KEYS.patients).filter(p => p.id !== id))
  saveAll(KEYS.sessions, getAll<TreatmentSession>(KEYS.sessions).filter(s => s.patient_id !== id))
  saveAll(KEYS.photos, getAll<PatientPhoto>(KEYS.photos).filter(p => p.patient_id !== id))
  saveAll(KEYS.appointments, getAll<Appointment>(KEYS.appointments).filter(a => a.patient_id !== id))
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export function getSessions(patientId: string): TreatmentSession[] {
  const treatments = getTreatments()
  return getAll<TreatmentSession>(KEYS.sessions)
    .filter(s => s.patient_id === patientId)
    .map(s => ({ ...s, treatment: treatments.find(t => t.id === s.treatment_id) }))
    .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
}

export function getAllSessions(): TreatmentSession[] {
  const treatments = getTreatments()
  return getAll<TreatmentSession>(KEYS.sessions)
    .map(s => ({ ...s, treatment: treatments.find(t => t.id === s.treatment_id) }))
}

export function saveSession(data: Omit<TreatmentSession, 'id' | 'created_at' | 'treatment'> & { id?: string }): TreatmentSession {
  const all = getAll<TreatmentSession>(KEYS.sessions)
  const now = new Date().toISOString()

  // Update patient updated_at
  const patients = getAll<Patient>(KEYS.patients)
  saveAll(KEYS.patients, patients.map(p => p.id === data.patient_id ? { ...p, updated_at: now } : p))

  if (data.id) {
    const updated = all.map(s => s.id === data.id ? { ...s, ...data } : s)
    saveAll(KEYS.sessions, updated)
    return updated.find(s => s.id === data.id)!
  }
  const newSession: TreatmentSession = { ...data, id: uuid(), created_at: now }
  saveAll(KEYS.sessions, [...all, newSession])
  return newSession
}

export function deleteSession(id: string): void {
  saveAll(KEYS.sessions, getAll<TreatmentSession>(KEYS.sessions).filter(s => s.id !== id))
}

// ── Photos ───────────────────────────────────────────────────────────────────

export function getPhotos(patientId: string): PatientPhoto[] {
  return getAll<PatientPhoto>(KEYS.photos)
    .filter(p => p.patient_id === patientId)
    .sort((a, b) => new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime())
}

export function savePhoto(patientId: string, url: string, label?: string, sessionId?: string): PatientPhoto {
  const all = getAll<PatientPhoto>(KEYS.photos)
  const now = new Date().toISOString()
  const photo: PatientPhoto = {
    id: uuid(), patient_id: patientId, session_id: sessionId,
    url, label, taken_at: now, created_at: now,
  }
  saveAll(KEYS.photos, [...all, photo])
  return photo
}

export function deletePhoto(id: string): void {
  saveAll(KEYS.photos, getAll<PatientPhoto>(KEYS.photos).filter(p => p.id !== id))
}

// ── Appointments ──────────────────────────────────────────────────────────────

export function getAppointments(): Appointment[] {
  const patients = getAll<Patient>(KEYS.patients)
  const treatments = getTreatments()
  return getAll<Appointment>(KEYS.appointments)
    .map(a => ({
      ...a,
      patient: patients.find(p => p.id === a.patient_id),
      treatment: treatments.find(t => t.id === a.treatment_id),
    }))
    .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())
}

export function saveAppointment(data: Omit<Appointment, 'id' | 'created_at' | 'patient' | 'treatment'> & { id?: string }): Appointment {
  const all = getAll<Appointment>(KEYS.appointments)
  const now = new Date().toISOString()
  if (data.id) {
    const updated = all.map(a => a.id === data.id ? { ...a, ...data } : a)
    saveAll(KEYS.appointments, updated)
    return updated.find(a => a.id === data.id)!
  }
  const newAppt: Appointment = { ...data, id: uuid(), created_at: now }
  saveAll(KEYS.appointments, [...all, newAppt])
  return newAppt
}

export function deleteAppointment(id: string): void {
  saveAll(KEYS.appointments, getAll<Appointment>(KEYS.appointments).filter(a => a.id !== id))
}
