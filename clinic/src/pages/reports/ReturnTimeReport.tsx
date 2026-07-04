import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInDays, differenceInMonths, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft, ChevronRight, AlertTriangle, Clock, CheckCircle, UserX } from 'lucide-react'
import { getPatients, getAllSessions } from '../../lib/db'
import type { Patient } from '../../types'

interface PatientRow extends Patient {
  lastDate?: string
  daysSince?: number
  monthsSince?: number
}

type Group = {
  key: string
  label: string
  sublabel: string
  color: string
  bgColor: string
  borderColor: string
  icon: typeof AlertTriangle
  patients: PatientRow[]
}

function buildGroups(patients: PatientRow[]): Group[] {
  const groups: Group[] = [
    {
      key: 'overdue',
      label: 'Retorno em atraso',
      sublabel: 'Mais de 3 meses',
      color: 'text-red-700',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      icon: AlertTriangle,
      patients: [],
    },
    {
      key: 'attention',
      label: 'Atenção',
      sublabel: '1 a 3 meses',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      icon: Clock,
      patients: [],
    },
    {
      key: 'ok',
      label: 'Em dia',
      sublabel: 'Menos de 1 mês',
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      icon: CheckCircle,
      patients: [],
    },
    {
      key: 'never',
      label: 'Sem atendimento',
      sublabel: 'Nenhuma sessão registrada',
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      icon: UserX,
      patients: [],
    },
  ]

  for (const p of patients) {
    if (p.monthsSince === undefined) {
      groups[3].patients.push(p)
    } else if (p.monthsSince >= 3) {
      groups[0].patients.push(p)
    } else if (p.daysSince! >= 30) {
      groups[1].patients.push(p)
    } else {
      groups[2].patients.push(p)
    }
  }

  return groups
}

export function ReturnTimeReport() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<PatientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['overdue', 'attention']))

  useEffect(() => {
    void (async () => {
      const pts = await getPatients()
      const sessions = await getAllSessions()
      const now = new Date()
      const rows: PatientRow[] = pts.map(p => {
        const last = sessions
          .filter(s => s.patient_id === p.id)
          .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())[0]
        return {
          ...p,
          lastDate: last?.session_date,
          daysSince: last ? differenceInDays(now, new Date(last.session_date)) : undefined,
          monthsSince: last ? differenceInMonths(now, new Date(last.session_date)) : undefined,
        }
      })
      // Sort each patient group by most overdue first
      rows.sort((a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1))
      setPatients(rows)
      setLoading(false)
    })()
  }, [])

  function toggleGroup(key: string) {
    setOpenGroups(s => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const groups = buildGroups(patients)
  const overdueCount = groups[0].patients.length

  return (
    <div className="flex flex-col min-h-svh bg-[#f0f8f4]">
      <header className="bg-[#1a6b45] text-white px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/relatorios')} className="p-1"><ArrowLeft size={22} /></button>
          <div className="flex-1">
            <h1 className="font-bold text-base">Tempo de Retorno</h1>
            <p className="text-xs text-green-200">
              {format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Carregando…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="bg-white rounded-xl p-4 border-2 border-[#b8e4d0]">
              <p className="text-2xl font-extrabold text-[#1a6b45]">{patients.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total de pacientes</p>
            </div>
            <div className={`rounded-xl p-4 border-2 ${overdueCount > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <p className={`text-2xl font-extrabold ${overdueCount > 0 ? 'text-red-600' : 'text-green-600'}`}>{overdueCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">Com retorno em atraso</p>
            </div>
            <div className="bg-white rounded-xl p-4 border-2 border-amber-200">
              <p className="text-2xl font-extrabold text-amber-600">{groups[1].patients.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Precisam de atenção</p>
            </div>
            <div className="bg-white rounded-xl p-4 border-2 border-green-200">
              <p className="text-2xl font-extrabold text-green-600">{groups[2].patients.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Em dia</p>
            </div>
          </div>

          {/* Groups */}
          <div className="px-4 pb-6 space-y-3">
            {groups.filter(g => g.patients.length > 0).map(group => {
              const Icon = group.icon
              const isOpen = openGroups.has(group.key)
              return (
                <div key={group.key} className={`rounded-xl border-2 overflow-hidden ${group.borderColor}`}>
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className={`w-full flex items-center gap-3 px-4 py-3 ${group.bgColor}`}>
                    <Icon size={18} className={group.color} />
                    <div className="flex-1 text-left">
                      <span className={`font-bold text-sm ${group.color}`}>{group.label}</span>
                      <span className="text-xs text-gray-400 ml-2">({group.sublabel})</span>
                    </div>
                    <span className={`text-lg font-extrabold ${group.color}`}>{group.patients.length}</span>
                    <ChevronRight size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </button>

                  {isOpen && (
                    <div className="bg-white divide-y divide-gray-100">
                      {group.patients.map(p => (
                        <button key={p.id}
                          onClick={() => navigate(`/pacientes/${p.id}`)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50">
                          <div className="w-9 h-9 rounded-full bg-[#e8c4d8] flex items-center justify-center flex-shrink-0">
                            <span className="text-[#8b1a4a] font-bold text-xs">
                              {p.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {p.lastDate
                                ? `Última visita: ${format(new Date(p.lastDate + 'T12:00'), "dd/MM/yyyy")}`
                                : 'Nenhuma sessão registrada'}
                            </p>
                          </div>
                          {p.daysSince !== undefined && (
                            <span className={`text-xs font-bold flex-shrink-0 ${group.color}`}>
                              {p.monthsSince! >= 1
                                ? `${p.monthsSince}m`
                                : `${p.daysSince}d`}
                            </span>
                          )}
                          <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
