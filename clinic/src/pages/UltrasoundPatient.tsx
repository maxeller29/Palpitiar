import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Plus, Trash2, Zap } from 'lucide-react'
import {
  getPatient, getUltrasoundApplicationsForPatient, getLastUltrasoundCounter,
  addUltrasoundApplication, deleteUltrasoundApplication, isLatestUltrasoundApplicationForTip,
} from '../lib/db'
import type { Patient, UltrasoundApplication, UltrasoundTip } from '../types'
import { ULTRASOUND_TIPS, ULTRASOUND_PRICE_PER_SHOT } from '../types'

const INPUT = 'w-full px-3 py-2.5 rounded-lg border border-[#e8ddf4] text-sm bg-white outline-none'

function currency(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function UltrasoundPatient() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [patient, setPatient] = useState<Patient | null>(null)
  const [applications, setApplications] = useState<UltrasoundApplication[]>([])
  const [latestFlags, setLatestFlags] = useState<Record<string, boolean>>({})
  const [counters, setCounters] = useState<Record<UltrasoundTip, number>>({ '1.5': 0, '3.0': 0, '4.5': 0, '8.0': 0 })

  const [showForm, setShowForm] = useState(false)
  const [tip, setTip] = useState<UltrasoundTip>('1.5')
  const [counterReading, setCounterReading] = useState('')
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    if (!id) return
    void reload()
  }, [id])

  async function reload() {
    if (!id) return
    const p = await getPatient(id)
    if (!p) { navigate('/ultrassom'); return }
    setPatient(p)
    const apps = await getUltrasoundApplicationsForPatient(id)
    setApplications(apps)
    const flags: Record<string, boolean> = {}
    for (const a of apps) flags[a.id] = await isLatestUltrasoundApplicationForTip(a.id)
    setLatestFlags(flags)
    const entries = await Promise.all(ULTRASOUND_TIPS.map(async t => [t, await getLastUltrasoundCounter(t)] as const))
    setCounters(Object.fromEntries(entries) as Record<UltrasoundTip, number>)
  }

  const readingNum = Number(counterReading)
  const previewShots = counterReading !== '' && !Number.isNaN(readingNum)
    ? readingNum - counters[tip]
    : null

  async function handleSave() {
    if (!id || counterReading === '' || Number.isNaN(readingNum)) {
      alert('Informe a leitura do contador')
      return
    }
    if (readingNum < counters[tip]) {
      alert(`O contador da ponteira ${tip} não pode ser menor que a última leitura registrada (${counters[tip]})`)
      return
    }
    await addUltrasoundApplication(id, tip, readingNum, sessionDate)
    setShowForm(false)
    setCounterReading('')
    await reload()
  }

  async function handleDelete(appId: string) {
    if (!confirm('Excluir este registro? Isso restaura o contador desta ponteira para o valor anterior.')) return
    await deleteUltrasoundApplication(appId)
    await reload()
  }

  if (!patient) return <div className="p-8 text-center text-gray-400">Carregando…</div>

  const totals = ULTRASOUND_TIPS.map(t => ({
    tip: t,
    shots: applications.filter(a => a.tip === t).reduce((s, a) => s + a.shots, 0),
  }))
  const totalShots = totals.reduce((s, t) => s + t.shots, 0)

  return (
    <div className="flex flex-col min-h-svh bg-[#faf7fd]">
      <header className="bg-[#5b21b6] text-white px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/ultrassom')} className="p-1"><ArrowLeft size={22} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">{patient.name}</h1>
            <p className="text-xs text-[#dccbf0]">Ultrassom Microfocado</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Summary */}
        <div className="bg-white rounded-xl p-4 border-2 border-[#dccbf0]">
          <p className="text-xs text-[#5b21b6] font-semibold mb-2">RESUMO DO PACIENTE</p>
          <div className="grid grid-cols-4 gap-2 text-center mb-2">
            {totals.map(t => (
              <div key={t.tip}>
                <p className="text-xs text-[#a78bce]">{t.tip}</p>
                <p className="font-bold text-[#5b21b6]">{t.shots}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-[#e8ddf4] pt-2">
            <p className="text-sm font-semibold text-gray-700">Total: {totalShots} disparos</p>
            <p className="text-sm font-bold text-[#5b21b6]">{currency(totalShots * ULTRASOUND_PRICE_PER_SHOT)}</p>
          </div>
        </div>

        <button
          onClick={() => setShowForm(s => !s)}
          className="w-full flex items-center justify-center gap-2 bg-[#5b21b6] text-white rounded-xl py-3 text-sm font-bold"
        >
          <Plus size={18} />
          REGISTRAR PONTEIRA
        </button>

        {showForm && (
          <div className="bg-[#f3ecfa] rounded-xl p-4 space-y-3 border border-[#dccbf0]">
            <p className="font-bold text-sm text-gray-700">Nova leitura de contador</p>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">PONTEIRA *</label>
              <div className="grid grid-cols-4 gap-2">
                {ULTRASOUND_TIPS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTip(t)}
                    className={`py-2 rounded-lg text-sm font-semibold border ${
                      tip === t ? 'bg-[#5b21b6] text-white border-[#5b21b6]' : 'bg-white text-gray-600 border-[#e8ddf4]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Última leitura registrada: {counters[tip]}</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">DATA</label>
              <input
                type="date"
                value={sessionDate}
                onChange={e => setSessionDate(e.target.value)}
                className={INPUT}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">CONTADOR DO APARELHO (ao final da aplicação) *</label>
              <input
                type="number"
                inputMode="numeric"
                value={counterReading}
                onChange={e => setCounterReading(e.target.value)}
                placeholder={`Ex: ${counters[tip] + 100}`}
                className={INPUT}
              />
              {previewShots !== null && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${previewShots >= 0 ? 'text-[#5b21b6]' : 'text-red-500'}`}>
                  <Zap size={11} />
                  {previewShots >= 0
                    ? `${previewShots} disparos nesta ponteira (${currency(previewShots * ULTRASOUND_PRICE_PER_SHOT)})`
                    : 'Contador menor que a última leitura'}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 font-semibold">Cancelar</button>
              <button onClick={handleSave} className="flex-1 py-2.5 rounded-lg bg-[#5b21b6] text-white text-sm font-bold">Salvar</button>
            </div>
          </div>
        )}

        {/* History */}
        <div>
          <p className="font-bold text-sm text-gray-700 mb-2">HISTÓRICO DE REGISTROS</p>
          {applications.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">Nenhum registro ainda</div>
          )}
          <div className="space-y-2">
            {applications.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-white border border-[#e8ddf4] rounded-xl p-3 shadow-sm">
                <div>
                  <p className="font-semibold text-sm text-gray-800">Ponteira {a.tip} · {a.shots} disparos</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(a.session_date + 'T12:00'), 'dd/MM/yyyy')} · Contador: {a.counter_reading} · {currency(a.shots * ULTRASOUND_PRICE_PER_SHOT)}
                  </p>
                </div>
                {latestFlags[a.id] && (
                  <button onClick={() => handleDelete(a.id)} className="text-red-400 p-1">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
