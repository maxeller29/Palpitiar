import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { format, startOfWeek, addDays, isToday, isSameDay, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Clock, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { getAppointments, saveAppointment, deleteAppointment, getPatients, getTreatments } from '../lib/localStorage'
import type { Appointment, Patient, Treatment } from '../types'

export function Agenda() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [showForm, setShowForm] = useState(!!searchParams.get('new'))
  const [patients, setPatients] = useState<Patient[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])

  const [form, setForm] = useState({
    patient_id: searchParams.get('patient') || '',
    treatment_id: '',
    appointment_date: format(selectedDate, 'yyyy-MM-dd') + 'T09:00',
    duration_minutes: 60,
    notes: '',
  })

  useEffect(() => {
    reload()
    setPatients(getPatients())
    setTreatments(getTreatments())
  }, [])

  function reload() {
    setAppointments(getAppointments())
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const dayAppointments = appointments
    .filter(a => isSameDay(parseISO(a.appointment_date), selectedDate))
    .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))

  function handleSave() {
    if (!form.patient_id || !form.appointment_date) {
      alert('Selecione o paciente e o horário')
      return
    }
    saveAppointment({
      patient_id: form.patient_id,
      treatment_id: form.treatment_id || undefined,
      appointment_date: new Date(form.appointment_date).toISOString(),
      duration_minutes: Number(form.duration_minutes),
      status: 'scheduled',
      notes: form.notes,
    })
    setShowForm(false)
    reload()
  }

  function statusIcon(status: Appointment['status']) {
    if (status === 'completed') return <CheckCircle size={14} className="text-green-500" />
    if (status === 'cancelled') return <XCircle size={14} className="text-red-400" />
    return <Clock size={14} className="text-blue-500" />
  }

  function toggleStatus(appt: Appointment) {
    const next: Appointment['status'] = appt.status === 'scheduled' ? 'completed' : 'scheduled'
    saveAppointment({ ...appt, status: next })
    reload()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Week nav */}
      <div className="bg-white px-4 pt-3 pb-2 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setWeekStart(d => addDays(d, -7))}><ChevronLeft size={20} className="text-gray-400" /></button>
          <span className="text-sm font-medium text-gray-700 capitalize">
            {format(weekStart, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          <button onClick={() => setWeekStart(d => addDays(d, 7))}><ChevronRight size={20} className="text-gray-400" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(day => {
            const hasAppt = appointments.some(a => isSameDay(parseISO(a.appointment_date), day))
            const sel = isSameDay(day, selectedDate)
            const tod = isToday(day)
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`flex flex-col items-center py-1 rounded-lg ${sel ? 'bg-purple-700 text-white' : tod ? 'text-purple-700' : 'text-gray-600'}`}
              >
                <span className="text-xs">{format(day, 'EE', { locale: ptBR }).slice(0, 3)}</span>
                <span className="text-sm font-semibold">{format(day, 'd')}</span>
                {hasAppt && <div className={`w-1 h-1 rounded-full mt-0.5 ${sel ? 'bg-white/70' : 'bg-purple-400'}`} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day label */}
      <div className="px-4 py-2 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700 capitalize">
          {isToday(selectedDate) ? 'Hoje' : format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
          <span className="text-gray-400 font-normal ml-1">({dayAppointments.length} agendamentos)</span>
        </p>
        <button onClick={() => { setForm(f => ({ ...f, appointment_date: format(selectedDate, 'yyyy-MM-dd') + 'T09:00' })); setShowForm(true) }}
          className="flex items-center gap-1 text-purple-700 text-sm font-medium">
          <Plus size={16} /> Novo
        </button>
      </div>

      {/* Appointments */}
      <div className="flex-1 overflow-auto px-4 pb-4 space-y-2">
        {showForm && (
          <div className="bg-purple-50 rounded-xl p-4 space-y-3 border border-purple-100 mb-3">
            <p className="font-medium text-sm text-gray-700">Novo agendamento</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Paciente *</label>
              <select value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white outline-none">
                <option value="">Selecionar…</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tratamento</label>
              <select value={form.treatment_id} onChange={e => setForm(f => ({ ...f, treatment_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white outline-none">
                <option value="">Selecionar…</option>
                {treatments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data e horário *</label>
              <input type="datetime-local" value={form.appointment_date}
                onChange={e => setForm(f => ({ ...f, appointment_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Duração (min)</label>
              <select value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white outline-none">
                {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Observações</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600">Cancelar</button>
              <button onClick={handleSave} className="flex-1 py-2 rounded-lg bg-purple-700 text-white text-sm font-medium">Salvar</button>
            </div>
          </div>
        )}

        {dayAppointments.length === 0 && !showForm && (
          <div className="text-center py-12 text-gray-400 text-sm">Nenhum agendamento neste dia</div>
        )}

        {dayAppointments.map(appt => (
          <div key={appt.id} className={`bg-white border rounded-xl p-3 shadow-sm flex items-center gap-3 ${appt.status === 'cancelled' ? 'opacity-50' : ''}`}>
            <button onClick={() => toggleStatus(appt)} className="flex-shrink-0">
              {statusIcon(appt.status)}
            </button>
            <Link to={`/patients/${appt.patient_id}`} className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{appt.patient?.name}</p>
              <p className="text-xs text-gray-500">
                {format(parseISO(appt.appointment_date), 'HH:mm')} · {appt.duration_minutes}min
                {appt.treatment?.name ? ` · ${appt.treatment.name}` : ''}
              </p>
              {appt.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{appt.notes}</p>}
            </Link>
            <button onClick={() => { if (confirm('Excluir agendamento?')) { deleteAppointment(appt.id); reload() } }}>
              <Trash2 size={14} className="text-gray-300" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
