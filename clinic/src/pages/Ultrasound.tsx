import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isToday } from 'date-fns'
import { ArrowLeft, Search, ChevronRight, FileBarChart, UserPlus } from 'lucide-react'
import { getPatients, getUltrasoundApplications, savePatient } from '../lib/db'
import type { Patient } from '../types'
import { ULTRASOUND_PRICE_PER_SHOT } from '../types'

function currency(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function Ultrasound() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<Patient[]>([])
  const [search, setSearch] = useState('')
  const [todayShots, setTodayShots] = useState(0)
  const [todayPatientCount, setTodayPatientCount] = useState(0)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void (async () => {
      setPatients(await getPatients())
      const apps = await getUltrasoundApplications()
      const todayApps = apps.filter(a => isToday(new Date(a.session_date + 'T12:00')))
      setTodayShots(todayApps.reduce((sum, a) => sum + a.shots, 0))
      setTodayPatientCount(new Set(todayApps.map(a => a.patient_id)).size)
    })()
  }, [])

  const filtered = search
    ? patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.phone.includes(search))
    : patients

  async function handleQuickAdd() {
    const name = quickName.trim()
    if (!name) { alert('Informe o nome da paciente'); return }
    setSaving(true)
    // Cadastro rápido: só o nome, os demais dados ficam para completar depois em Pacientes
    const patient = await savePatient({ name, phone: '' })
    setSaving(false)
    navigate(`/ultrassom/${patient.id}`)
  }

  return (
    <div className="flex flex-col min-h-svh bg-[#faf7fd]">
      <header className="bg-[#5b21b6] text-white px-4 py-3 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1"><ArrowLeft size={22} /></button>
        <h1 className="font-bold text-base flex-1">ULTRASSOM MICROFOCADO</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* Today's stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 border-2 border-[#dccbf0]">
            <p className="text-xs text-[#5b21b6] font-semibold">Disparos hoje</p>
            <p className="text-3xl font-extrabold text-[#5b21b6] mt-1">{todayShots}</p>
            <p className="text-xs text-gray-400 mt-0.5">{currency(todayShots * ULTRASOUND_PRICE_PER_SHOT)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border-2 border-[#dccbf0]">
            <p className="text-xs text-[#5b21b6] font-semibold">Pacientes hoje</p>
            <p className="text-3xl font-extrabold text-[#5b21b6] mt-1">{todayPatientCount}</p>
          </div>
        </div>

        <button
          onClick={() => navigate('/ultrassom/relatorio')}
          className="w-full flex items-center justify-center gap-2 bg-white border-2 border-[#5b21b6] text-[#5b21b6] rounded-xl py-3 text-sm font-bold"
        >
          <FileBarChart size={18} />
          RELATÓRIO DE ATENDIMENTOS
        </button>

        {/* Patient search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar paciente para registrar disparos…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#dccbf0] text-sm outline-none bg-white"
          />
        </div>

        {/* Quick add: cadastra só com o nome, para não travar o atendimento */}
        {!showQuickAdd ? (
          <button
            onClick={() => { setShowQuickAdd(true); setQuickName(search) }}
            className="w-full flex items-center justify-center gap-2 bg-[#f3ecfa] text-[#5b21b6] rounded-xl py-2.5 text-sm font-bold border border-[#dccbf0]"
          >
            <UserPlus size={16} />
            NOVA PACIENTE (CADASTRO RÁPIDO)
          </button>
        ) : (
          <div className="bg-[#f3ecfa] rounded-xl p-3 space-y-2 border border-[#dccbf0]">
            <label className="block text-xs font-bold text-gray-600">NOME DA PACIENTE *</label>
            <input
              type="text"
              autoFocus
              placeholder="Ex: Maria Silva"
              value={quickName}
              onChange={e => setQuickName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-[#e8ddf4] text-sm bg-white outline-none"
            />
            <p className="text-xs text-gray-400">Telefone, CPF e demais dados podem ser completados depois em Pacientes.</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowQuickAdd(false); setQuickName('') }}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleQuickAdd}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-[#5b21b6] text-white text-sm font-bold disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Iniciar atendimento'}
              </button>
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            {search ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado ainda'}
          </div>
        )}

        <div className="space-y-2">
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/ultrassom/${p.id}`)}
              className="w-full flex items-center justify-between bg-white border border-[#e8ddf4] rounded-xl p-3 shadow-sm text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#dccbf0] text-[#5b21b6] font-bold flex items-center justify-center text-sm">
                  {p.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </div>
                <p className="font-semibold text-sm text-gray-800">{p.name}</p>
              </div>
              <ChevronRight size={16} className="text-[#c4a8de]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
