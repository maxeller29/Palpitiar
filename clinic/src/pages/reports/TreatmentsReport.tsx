import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft } from 'lucide-react'
import { getAllSessions, getTreatments } from '../../lib/db'
import type { Treatment } from '../../types'

interface TreatmentCount extends Treatment {
  count: number
}

export function TreatmentsReport() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState<TreatmentCount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const sessions = await getAllSessions()
      const treatments = await getTreatments()
      const map: Record<string, number> = {}
      for (const s of sessions) map[s.treatment_id] = (map[s.treatment_id] || 0) + 1
      const result: TreatmentCount[] = treatments
        .map(t => ({ ...t, count: map[t.id] || 0 }))
        .filter(t => t.count > 0)
        .sort((a, b) => b.count - a.count)
      setCounts(result)
      setLoading(false)
    })()
  }, [])

  const total = counts.reduce((s, t) => s + t.count, 0)

  return (
    <div className="flex flex-col min-h-svh bg-[#f8f0f4]">
      <header className="bg-[#8b1a4a] text-white px-4 py-3 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate('/relatorios')} className="p-1"><ArrowLeft size={22} /></button>
        <div className="flex-1">
          <h1 className="font-bold text-base">Tratamentos Realizados</h1>
          <p className="text-xs text-[#f0c0d8]">
            {format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
      </header>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Carregando…</div>
      ) : counts.length === 0 ? (
        <div className="p-8 text-center text-gray-400">Nenhum atendimento registrado</div>
      ) : (
        <div className="p-4 space-y-3">
          <div className="bg-white rounded-xl p-4 border-2 border-[#e8c4d8]">
            <p className="text-2xl font-extrabold text-[#8b1a4a]">{total}</p>
            <p className="text-xs text-gray-500">Total de atendimentos</p>
          </div>

          <div className="bg-white rounded-xl overflow-hidden border-2 border-[#e8c4d8]">
            {counts.map((t, i) => {
              const pct = Math.round((t.count / total) * 100)
              return (
                <div key={t.id} className={`px-4 py-3 ${i > 0 ? 'border-t border-[#f0e0ec]' : ''}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-gray-800">{t.name}</span>
                    <span className="text-sm font-bold text-[#8b1a4a]">{t.count}×</span>
                  </div>
                  <div className="h-2 bg-[#f0e0ec] rounded-full overflow-hidden">
                    <div className="h-full bg-[#8b1a4a] rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pct}% dos atendimentos</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
