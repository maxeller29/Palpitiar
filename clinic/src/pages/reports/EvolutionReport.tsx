import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft } from 'lucide-react'
import { getAllSessions } from '../../lib/db'

interface MonthData {
  label: string
  count: number
  key: string
}

export function EvolutionReport() {
  const navigate = useNavigate()
  const [months, setMonths] = useState<MonthData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const sessions = await getAllSessions()
      const now = new Date()
      const data: MonthData[] = []

      for (let i = 5; i >= 0; i--) {
        const ref = subMonths(now, i)
        const start = startOfMonth(ref)
        const end = endOfMonth(ref)
        const count = sessions.filter(s => {
          const d = new Date(s.session_date + 'T12:00')
          return d >= start && d <= end
        }).length
        data.push({
          key: format(ref, 'yyyy-MM'),
          label: format(ref, 'MMM/yy', { locale: ptBR }),
          count,
        })
      }

      setMonths(data)
      setLoading(false)
    })()
  }, [])

  const maxCount = Math.max(...months.map(m => m.count), 1)
  const total = months.reduce((s, m) => s + m.count, 0)

  return (
    <div className="flex flex-col min-h-svh bg-[#f0f4f8]">
      <header className="bg-[#1a4a7a] text-white px-4 py-3 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate('/relatorios')} className="p-1"><ArrowLeft size={22} /></button>
        <div className="flex-1">
          <h1 className="font-bold text-base">Evolução de Atendimentos</h1>
          <p className="text-xs text-blue-200">Últimos 6 meses</p>
        </div>
      </header>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Carregando…</div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl p-4 border-2 border-blue-200">
              <p className="text-2xl font-extrabold text-[#1a4a7a]">{total}</p>
              <p className="text-xs text-gray-500">Atendimentos nos últimos 6 meses</p>
            </div>
            <div className="bg-white rounded-xl p-4 border-2 border-blue-200">
              <p className="text-2xl font-extrabold text-[#1a4a7a]">{Math.round(total / 6)}</p>
              <p className="text-xs text-gray-500">Média mensal</p>
            </div>
          </div>

          {/* Bar chart */}
          <div className="bg-white rounded-xl border-2 border-blue-200 p-4">
            <p className="text-xs font-bold text-gray-500 mb-4 tracking-wider">ATENDIMENTOS POR MÊS</p>
            <div className="flex items-end gap-2 h-36">
              {months.map(m => {
                const pct = maxCount > 0 ? (m.count / maxCount) * 100 : 0
                const isCurrentMonth = m.key === format(new Date(), 'yyyy-MM')
                return (
                  <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-[#1a4a7a]">{m.count || ''}</span>
                    <div className="w-full flex items-end" style={{ height: '80px' }}>
                      <div
                        className={`w-full rounded-t-md transition-all ${isCurrentMonth ? 'bg-[#1a4a7a]' : 'bg-blue-200'}`}
                        style={{ height: `${Math.max(pct, m.count > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 capitalize">{m.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border-2 border-blue-200 overflow-hidden">
            {months.map((m, i) => (
              <div key={m.key} className={`flex items-center px-4 py-3 ${i > 0 ? 'border-t border-blue-100' : ''}`}>
                <span className="flex-1 text-sm capitalize text-gray-700">{format(new Date(m.key + '-01'), 'MMMM yyyy', { locale: ptBR })}</span>
                <span className="font-bold text-[#1a4a7a]">{m.count} atend.</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
