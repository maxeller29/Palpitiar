import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { differenceInDays, differenceInMonths, format, isToday, isTomorrow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertTriangle, Clock, CalendarCheck, ChevronRight, UserPlus } from 'lucide-react'
import { getPatients, getAllSessions, getAppointments } from '../lib/localStorage'
import type { Patient, TreatmentSession, Appointment } from '../types'

interface PatientAlert {
  patient: Patient
  lastSession: TreatmentSession
  daysSince: number
  monthsSince: number
}

export function Dashboard() {
  const [alerts, setAlerts] = useState<PatientAlert[]>([])
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([])
  const [totalPatients, setTotalPatients] = useState(0)
  const [thisMonthSessions, setThisMonthSessions] = useState(0)

  useEffect(() => {
    const patients = getPatients()
    const sessions = getAllSessions()
    const appointments = getAppointments()

    setTotalPatients(patients.length)

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    setThisMonthSessions(sessions.filter(s => new Date(s.session_date) >= monthStart).length)

    // Today's appointments
    const today = appointments.filter(a => {
      const d = new Date(a.appointment_date)
      return isToday(d) && a.status === 'scheduled'
    })
    setTodayAppointments(today)

    // Alerts: patients who haven't returned in 3+ months
    const alertList: PatientAlert[] = []
    for (const patient of patients) {
      const patientSessions = sessions
        .filter(s => s.patient_id === patient.id)
        .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
      if (patientSessions.length === 0) continue
      const last = patientSessions[0]
      const days = differenceInDays(now, new Date(last.session_date))
      const months = differenceInMonths(now, new Date(last.session_date))
      if (months >= 3) {
        alertList.push({ patient, lastSession: last, daysSince: days, monthsSince: months })
      }
    }
    alertList.sort((a, b) => b.daysSince - a.daysSince)
    setAlerts(alertList)
  }, [])

  return (
    <div className="p-4 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-purple-50 rounded-xl p-4">
          <p className="text-xs text-purple-600 font-medium">Total de Pacientes</p>
          <p className="text-3xl font-bold text-purple-700 mt-1">{totalPatients}</p>
        </div>
        <div className="bg-rose-50 rounded-xl p-4">
          <p className="text-xs text-rose-600 font-medium">Atendimentos no Mês</p>
          <p className="text-3xl font-bold text-rose-700 mt-1">{thisMonthSessions}</p>
        </div>
      </div>

      {/* Today */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <CalendarCheck size={18} className="text-purple-600" />
            Hoje
          </h2>
          <Link to="/agenda" className="text-xs text-purple-600">Ver agenda →</Link>
        </div>
        {todayAppointments.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500 text-center">
            Nenhum agendamento para hoje
          </div>
        ) : (
          <div className="space-y-2">
            {todayAppointments.map(appt => (
              <Link
                key={appt.id}
                to={`/patients/${appt.patient_id}`}
                className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-3 shadow-sm"
              >
                <div>
                  <p className="font-medium text-sm">{appt.patient?.name}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(appt.appointment_date), 'HH:mm')} · {appt.treatment?.name || 'Consulta'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Alerts */}
      {alerts.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-amber-500" />
            Pacientes sem retorno há 3+ meses
          </h2>
          <div className="space-y-2">
            {alerts.slice(0, 10).map(({ patient, lastSession, monthsSince }) => (
              <Link
                key={patient.id}
                to={`/patients/${patient.id}`}
                className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl p-3"
              >
                <div>
                  <p className="font-medium text-sm">{patient.name}</p>
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <Clock size={11} />
                    {monthsSince} {monthsSince === 1 ? 'mês' : 'meses'} desde o último atendimento
                    {lastSession.treatment?.name ? ` · ${lastSession.treatment.name}` : ''}
                  </p>
                </div>
                <ChevronRight size={16} className="text-amber-400" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/patients/new"
          className="flex items-center justify-center gap-2 bg-purple-700 text-white rounded-xl py-3 text-sm font-medium"
        >
          <UserPlus size={18} />
          Novo Paciente
        </Link>
        <Link
          to="/agenda/new"
          className="flex items-center justify-center gap-2 bg-white border border-purple-200 text-purple-700 rounded-xl py-3 text-sm font-medium"
        >
          <CalendarCheck size={18} />
          Agendar
        </Link>
      </div>
    </div>
  )
}
