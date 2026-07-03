import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format, startOfWeek, addDays, isToday, isSameDay, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Clock, Trash2, CheckCircle, Circle } from 'lucide-react'
import { getAppointments, saveAppointment, deleteAppointment, getPatients, getTreatments } from '../lib/db'
import type { Appointment, Patient, Treatment } from '../types'

export function AgendaPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    patient_id: searchParams.get('paciente') || '',
    treatment_id: '',
    appointment_date: format(new Date(), 'yyyy-MM-dd') + 'T09:00',
    duration_minutes: 60,
    notes: '',
  })

  useEffect(() => {
    void (async () => {
      await reload()
      setPatients(await getPatients())
      setTreatments(await getTreatments())
    })()
  }, [])

  async function reload() { setAppointments(await getAppointments()) }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const dayAppts = appointments
    .filter(a => isSameDay(parseISO(a.appointment_date), selectedDate) && a.status !== 'cancelled')
    .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))

  async function handleSave() {
    if (!form.patient_id || !form.appointment_date) { alert('Selecione o paciente e o horário'); return }
    await saveAppointment({
      patient_id: form.patient_id,
      treatment_id: form.treatment_id || undefined,
      appointment_date: new Date(form.appointment_date).toISOString(),
      duration_minutes: Number(form.duration_minutes),
      status: 'scheduled',
      notes: form.notes,
    })
    setShowForm(false)
    setForm({ patient_id: '', treatment_id: '', appointment_date: format(selectedDate, 'yyyy-MM-dd') + 'T09:00', duration_minutes: 60, notes: '' })
    await reload()
  }

  const dayNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

  return (
    <div className="flex flex-col min-h-svh">
      {/* Header */}
      <header className="bg-[#1a4a7a] text-white px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/')} className="p-1"><ArrowLeft size={22} /></button>
          <h1 className="font-bold text-base flex-1">AGENDA</h1>
          <button onClick={() => {
            setForm(f => ({ ...f, appointment_date: format(selectedDate, 'yyyy-MM-dd') + 'T09:00' }))
            setShowForm(true)
          }} className="p-1"><Plus size={22} /></button>
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-1 mb-2">
          <button onClick={() => setWeekStart(d => addDays(d, -7))} className="p-1.5 rounded-lg bg-white/10">
            <ChevronLeft size={16} />
          </button>
          <span className="flex-1 text-center text-sm font-semibold capitalize">
            {format(weekStart, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          <button onClick={() => setWeekStart(d => addDays(d, 7))} className="p-1.5 rounded-lg bg-white/10">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, i) => {
            const hasAppt = appointments.some(a => isSameDay(parseISO(a.appointment_date), day) && a.status !== 'cancelled')
            const sel = isSameDay(day, selectedDate)
            const tod = isToday(day)
            return (
              <button key={i} onClick={() => setSelectedDate(day)}
                className={`flex flex-col items-center py-1.5 rounded-xl ${sel ? 'bg-white text-[#1a4a7a]' : tod ? 'bg-white/20' : ''}`}>
                <span className="text-[10px] font-bold opacity-70">{dayNames[i]}</span>
                <span className="text-sm font-bold">{format(day, 'd')}</span>
                {hasAppt && <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${sel ? 'bg-[#1a4a7a]' : 'bg-white/70'}`} />}
              </button>
            )
          })}
        </div>
      </header>

      {/* Day label */}
      <div className="bg-[#dce8f4] px-4 py-2.5 flex items-center justify-between">
        <p className="text-sm font-bold text-[#1a4a7a] capitalize">
          {isToday(selectedDate) ? 'Hoje' : format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </p>
        <span className="text-xs text-[#4a7aaa] font-semibold">{dayAppts.length} agendamentos</span>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[#edf4fc] p-4 space-y-3 border-b-2 border-[#1a4a7a]">
          <p className="text-xs font-bold text-[#1a4a7a] tracking-wider">NOVO AGENDAMENTO</p>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">PACIENTE *</label>
            <select value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-[#b8d0ea] text-sm bg-white outline-none">
              <option value="">Selecionar…</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">PROCEDIMENTO</label>
            <select value={form.treatment_id} onChange={e => setForm(f => ({ ...f, treatment_id: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-[#b8d0ea] text-sm bg-white outline-none">
              <option value="">Selecionar…</option>
              {treatments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">DATA E HORA *</label>
              <input type="datetime-local" value={form.appointment_date}
                onChange={e => setForm(f => ({ ...f, appointment_date: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-[#b8d0ea] text-sm bg-white outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">DURAÇÃO</label>
              <select value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-lg border border-[#b8d0ea] text-sm bg-white outline-none">
                {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">OBSERVAÇÕES</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-[#b8d0ea] text-sm bg-white outline-none resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl border border-gray-300 text-sm text-gray-600 font-semibold">Cancelar</button>
            <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-[#1a4a7a] text-white text-sm font-bold">SALVAR</button>
          </div>
        </div>
      )}

      {/* Appointments */}
      <div className="flex-1 divide-y divide-[#dce8f4]">
        {dayAppts.length === 0 && !showForm && (
          <div className="py-16 text-center text-gray-400 text-sm">Nenhum agendamento</div>
        )}
        {dayAppts.map(appt => (
          <div key={appt.id} className="flex items-center gap-3 px-4 py-4 bg-white">
            <button onClick={() => void (async () => {
              await saveAppointment({ ...appt, status: appt.status === 'completed' ? 'scheduled' : 'completed' })
              await reload()
            })()} className="flex-shrink-0">
              {appt.status === 'completed'
                ? <CheckCircle size={24} className="text-green-500" />
                : <Circle size={24} className="text-[#4a7aaa]" />}
            </button>

            <button onClick={() => navigate(`/pacientes/${appt.patient_id}`)} className="flex-1 min-w-0 text-left">
              <p className="font-bold text-gray-800 text-sm truncate">{appt.patient?.name}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <Clock size={11} />
                {format(parseISO(appt.appointment_date), 'HH:mm')} · {appt.duration_minutes}min
                {appt.treatment?.name ? ` · ${appt.treatment.name}` : ''}
              </p>
              {appt.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{appt.notes}</p>}
            </button>

            <button onClick={() => { if (confirm('Excluir?')) void (async () => { await deleteAppointment(appt.id); await reload() })() }}
              className="p-2 flex-shrink-0">
              <Trash2 size={16} className="text-gray-300" />
            </button>
          </div>
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => { setForm(f => ({ ...f, appointment_date: format(selectedDate, 'yyyy-MM-dd') + 'T09:00' })); setShowForm(true) }}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#1a4a7a] shadow-xl flex items-center justify-center z-20">
        <Plus size={26} color="white" />
      </button>
    </div>
  )
}
