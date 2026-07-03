import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { getPatients } from '../../lib/db'
import type { Patient } from '../../types'

interface BirthdayPatient extends Patient {
  day: number
}

export function BirthdayReport() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<BirthdayPatient[]>([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const currentMonth = now.getMonth() + 1

  useEffect(() => {
    void (async () => {
      const pts = await getPatients()
      const result: BirthdayPatient[] = pts
        .filter(p => {
          if (!p.birth_date) return false
          const month = parseInt(p.birth_date.split('-')[1])
          return month === currentMonth
        })
        .map(p => ({ ...p, day: parseInt(p.birth_date!.split('-')[2]) }))
        .sort((a, b) => a.day - b.day)
      setPatients(result)
      setLoading(false)
    })()
  }, [])

  const monthName = format(now, 'MMMM', { locale: ptBR })

  return (
    <div className="flex flex-col min-h-svh bg-[#f8f4ff]">
      <header className="bg-purple-700 text-white px-4 py-3 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate('/relatorios')} className="p-1"><ArrowLeft size={22} /></button>
        <div className="flex-1">
          <h1 className="font-bold text-base">Aniversariantes</h1>
          <p className="text-xs text-purple-200 capitalize">{monthName} de {now.getFullYear()}</p>
        </div>
      </header>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Carregando…</div>
      ) : (
        <div className="p-4">
          {patients.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <p className="text-4xl mb-3">🎂</p>
              <p className="text-sm capitalize">Nenhum aniversariante em {monthName}</p>
            </div>
          ) : (
            <>
              <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 mb-4">
                <p className="text-2xl font-extrabold text-purple-700">{patients.length}</p>
                <p className="text-xs text-gray-500 capitalize">aniversariante{patients.length > 1 ? 's' : ''} em {monthName}</p>
              </div>
              <div className="bg-white rounded-xl border-2 border-purple-200 overflow-hidden">
                {patients.map((p, i) => (
                  <button key={p.id}
                    onClick={() => navigate(`/pacientes/${p.id}`)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-purple-50 ${i > 0 ? 'border-t border-purple-100' : ''}`}>
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-purple-700 font-bold text-sm">
                        {p.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">
                        Dia {p.day} de {monthName}
                        {p.phone && ` · ${p.phone}`}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
