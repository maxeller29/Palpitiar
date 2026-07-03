import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInDays, differenceInMonths } from 'date-fns'
import { ArrowLeft, Search, UserPlus, ChevronRight, Clock, AlertTriangle } from 'lucide-react'
import { getPatients, getAllSessions } from '../lib/db'
import type { Patient } from '../types'

interface PatientWithMeta extends Patient {
  daysSinceLast?: number
  monthsSinceLast?: number
}

export function PatientsHome() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<PatientWithMeta[]>([])
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      const pts = await getPatients()
      const sessions = await getAllSessions()
      const now = new Date()
      const enriched = pts.map(p => {
        const last = sessions
          .filter(s => s.patient_id === p.id)
          .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())[0]
        return {
          ...p,
          daysSinceLast: last ? differenceInDays(now, new Date(last.session_date)) : undefined,
          monthsSinceLast: last ? differenceInMonths(now, new Date(last.session_date)) : undefined,
        }
      })
      setPatients(enriched)
    })()
  }, [])

  const filtered = patients.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.phone.includes(search)
  )

  function alertCount() {
    return patients.filter(p => p.monthsSinceLast !== undefined && p.monthsSinceLast >= 3).length
  }

  return (
    <div className="flex flex-col min-h-svh">
      {/* Header */}
      <header className="bg-[#8b1a4a] text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/')} className="p-1">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold flex-1">PACIENTES</h1>
        <button onClick={() => { setShowSearch(s => !s); setTimeout(() => searchRef.current?.focus(), 50) }} className="p-1">
          <Search size={22} />
        </button>
        <button onClick={() => navigate('/pacientes/novo')} className="p-1">
          <UserPlus size={22} />
        </button>
      </header>

      {/* Search bar */}
      {showSearch && (
        <div className="bg-[#c4779e] px-4 py-2">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Nome ou telefone…"
            className="w-full px-4 py-2.5 rounded-xl bg-white text-gray-800 text-sm outline-none placeholder-gray-400"
          />
        </div>
      )}

      {/* Alert banner */}
      {!search && alertCount() > 0 && (
        <button
          onClick={() => {/* future: filter by alert */}}
          className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-3"
        >
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
          <span className="text-sm text-amber-800">
            <strong>{alertCount()}</strong> {alertCount() === 1 ? 'paciente' : 'pacientes'} sem retorno há 3+ meses
          </span>
        </button>
      )}

      {/* Patient list */}
      <div className="flex-1 divide-y divide-[#e8c4d8]">
        {filtered.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">
            {search ? 'Nenhum resultado' : 'Nenhum paciente cadastrado'}
          </div>
        )}

        {filtered.map(p => {
          const isAlert = p.monthsSinceLast !== undefined && p.monthsSinceLast >= 3
          return (
            <button
              key={p.id}
              onClick={() => navigate(`/pacientes/${p.id}`)}
              className="w-full flex items-center gap-4 px-4 py-4 bg-white active:bg-[#f8f0f4] transition-colors text-left"
            >
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-[#e8c4d8] flex items-center justify-center flex-shrink-0">
                <span className="text-[#8b1a4a] font-bold text-base">
                  {p.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">{p.name}</p>
                <p className="text-sm text-gray-500">{p.phone}</p>
                {p.daysSinceLast !== undefined && (
                  <p className={`text-xs flex items-center gap-1 mt-0.5 ${isAlert ? 'text-amber-600' : 'text-gray-400'}`}>
                    <Clock size={11} />
                    {isAlert && '⚠ '}
                    {p.daysSinceLast === 0 ? 'Atendida hoje' :
                      p.monthsSinceLast! >= 1
                        ? `${p.monthsSinceLast} ${p.monthsSinceLast === 1 ? 'mês' : 'meses'} sem retorno`
                        : `${p.daysSinceLast} dias atrás`}
                  </p>
                )}
              </div>

              <ChevronRight size={18} className="text-[#c4a0b8] flex-shrink-0" />
            </button>
          )
        })}
      </div>

      {/* FAB new patient */}
      <button
        onClick={() => navigate('/pacientes/novo')}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#8b1a4a] shadow-xl flex items-center justify-center active:scale-95 transition-transform z-20"
      >
        <UserPlus size={24} color="white" />
      </button>
    </div>
  )
}
