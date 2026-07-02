import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, UserPlus, ChevronRight, Clock } from 'lucide-react'
import { differenceInDays, differenceInMonths } from 'date-fns'
import { getPatients, getAllSessions } from '../lib/localStorage'
import type { Patient } from '../types'

interface PatientWithMeta extends Patient {
  lastSessionDate?: string
  daysSinceLast?: number
}

export function PatientList() {
  const [patients, setPatients] = useState<PatientWithMeta[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const pts = getPatients()
    const sessions = getAllSessions()
    const enriched = pts.map(p => {
      const pSessions = sessions
        .filter(s => s.patient_id === p.id)
        .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
      const last = pSessions[0]
      return {
        ...p,
        lastSessionDate: last?.session_date,
        daysSinceLast: last ? differenceInDays(new Date(), new Date(last.session_date)) : undefined,
      }
    })
    setPatients(enriched)
  }, [])

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.phone.includes(search)
  )

  function badgeColor(days?: number) {
    if (days === undefined) return 'bg-gray-100 text-gray-500'
    if (days > 90) return 'bg-amber-100 text-amber-700'
    if (days > 30) return 'bg-blue-50 text-blue-700'
    return 'bg-green-50 text-green-700'
  }

  function lastLabel(days?: number) {
    if (days === undefined) return 'Sem atendimento'
    if (days === 0) return 'Hoje'
    if (days === 1) return 'Ontem'
    const m = Math.floor(days / 30)
    if (m >= 1) return `${m} ${m === 1 ? 'mês' : 'meses'} atrás`
    return `${days} dias atrás`
  }

  return (
    <div className="p-4 space-y-4">
      {/* Search + add */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-purple-400"
          />
        </div>
        <Link
          to="/patients/new"
          className="flex items-center gap-1 bg-purple-700 text-white px-3 py-2.5 rounded-xl text-sm font-medium"
        >
          <UserPlus size={16} />
        </Link>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          {search ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado ainda'}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(p => (
          <Link
            key={p.id}
            to={`/patients/${p.id}`}
            className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-3 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 font-semibold flex items-center justify-center text-sm">
                {p.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <p className="font-medium text-sm">{p.name}</p>
                <p className="text-xs text-gray-500">{p.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor(p.daysSinceLast)}`}>
                <Clock size={10} className="inline mr-1" />
                {lastLabel(p.daysSinceLast)}
              </span>
              <ChevronRight size={16} className="text-gray-400" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
