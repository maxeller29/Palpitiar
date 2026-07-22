import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { getUltrasoundApplications } from '../lib/db'
import type { UltrasoundApplication, UltrasoundTip } from '../types'
import { ULTRASOUND_TIPS, ULTRASOUND_PRICE_PER_SHOT } from '../types'

const INPUT = 'w-full px-3 py-2 rounded-lg border border-[#e8ddf4] text-sm bg-white outline-none'

function currency(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function UltrasoundReport() {
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]

  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [applications, setApplications] = useState<UltrasoundApplication[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setApplications(await getUltrasoundApplications())
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(
    () => applications.filter(a => a.session_date >= startDate && a.session_date <= endDate),
    [applications, startDate, endDate]
  )

  const byPatient = useMemo(() => {
    const map = new Map<string, { name: string; byTip: Record<UltrasoundTip, number>; total: number }>()
    for (const a of filtered) {
      const key = a.patient_id
      if (!map.has(key)) {
        map.set(key, {
          name: a.patient?.name || 'Paciente removido',
          byTip: { '1.5': 0, '3.0': 0, '4.5': 0, '8.0': 0 },
          total: 0,
        })
      }
      const entry = map.get(key)!
      entry.byTip[a.tip] += a.shots
      entry.total += a.shots
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [filtered])

  const grandTotal = byPatient.reduce((s, p) => s + p.total, 0)

  return (
    <div className="flex flex-col min-h-svh bg-[#faf7fd]">
      <header className="bg-[#5b21b6] text-white px-4 py-3 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate('/ultrassom')} className="p-1"><ArrowLeft size={22} /></button>
        <h1 className="font-bold text-base">RELATÓRIO DE ATENDIMENTOS</h1>
      </header>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Carregando…</div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-600 mb-1">DE</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={INPUT} />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-600 mb-1">ATÉ</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={INPUT} />
            </div>
          </div>

          <button
            onClick={() => { setStartDate(today); setEndDate(today) }}
            className="text-xs text-[#5b21b6] underline font-semibold"
          >
            Voltar para hoje
          </button>

          {/* Grand total */}
          <div className="bg-white rounded-xl p-4 border-2 border-[#dccbf0] flex items-center justify-between">
            <div>
              <p className="text-xs text-[#5b21b6] font-semibold">Total de disparos no período</p>
              <p className="text-2xl font-extrabold text-[#5b21b6] mt-1">{grandTotal}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#5b21b6] font-semibold">Valor devido (locação)</p>
              <p className="text-xl font-extrabold text-[#5b21b6] mt-1">{currency(grandTotal * ULTRASOUND_PRICE_PER_SHOT)}</p>
            </div>
          </div>

          {byPatient.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhum atendimento no período selecionado</div>
          )}

          <div className="space-y-2">
            {byPatient.map(p => (
              <div key={p.name} className="bg-white border border-[#e8ddf4] rounded-xl p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm text-gray-800">{p.name}</p>
                  <p className="text-sm font-bold text-[#5b21b6]">{currency(p.total * ULTRASOUND_PRICE_PER_SHOT)}</p>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {ULTRASOUND_TIPS.map(t => (
                    <div key={t}>
                      <p className="text-xs text-gray-400">{t}</p>
                      <p className="text-sm font-semibold text-gray-700">{p.byTip[t]}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2 text-right">Total: {p.total} disparos</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
