import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, differenceInDays, differenceInMonths } from 'date-fns'
import { ArrowLeft, Edit2, Plus, Camera, Trash2, ChevronDown, ChevronUp, CalendarPlus, AlertTriangle } from 'lucide-react'
import { getPatient, getSessions, getPhotos, saveSession, deleteSession, savePhoto, deletePhoto, getTreatments, addTreatment } from '../lib/localStorage'
import type { Patient, TreatmentSession, PatientPhoto, Treatment } from '../types'

// ── Constants ────────────────────────────────────────────────────────────────

const SECTION_HEAD = 'bg-[#8b1a4a] text-white px-4 py-3 font-bold text-sm tracking-wider flex items-center justify-between'
const INPUT = 'w-full px-3 py-2.5 rounded-lg border border-[#e8c4d8] text-sm bg-white outline-none'

const BOTOX_AREAS = ['Testa', 'Glabela', 'Olhos', 'Bunny Lines', 'DAO', 'Platisma', 'Queixo', 'Sorriso gengival']
const FACIAL_AREAS = ['Ristow', 'ASA', 'Sulco', 'Top model', 'CK0', 'CK', 'CK2', 'Queixo', 'Mandíbula', 'Happy face/Modiolo', 'Olheira']
const ULTRASSOM_AREAS = ['Full Face', 'Testa', 'Olhos - Pálp. sup.', 'Olhos - Pálp. inf.', 'Boca', 'Terço inferior', 'Papada', 'Submento', 'Pescoço']
const PONTEIRAS = ['1.5', '3.0', '4.5']

// ── Types ────────────────────────────────────────────────────────────────────

type AreaMap = Record<string, string>
type UltrassomEntry = { shots: string; ponteira: string }
type UltrassomMap = Record<string, UltrassomEntry>

interface DoseData {
  type: 'botox' | 'facial' | 'ultrassom'
  areas: AreaMap | UltrassomMap
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTreatmentType(name: string): 'botox' | 'facial' | 'labial' | 'ultrassom' | 'other' {
  const n = name.toLowerCase()
  if (n.includes('toxina') || n.includes('botul')) return 'botox'
  if (n.includes('ultrassom') || n.includes('microfoc')) return 'ultrassom'
  if (n.includes('preench') || n.includes('preenchedor')) return n.includes('labial') ? 'labial' : 'facial'
  return 'other'
}

function parseDoseLines(dose?: string): string[] {
  if (!dose) return []
  try {
    const d = JSON.parse(dose) as DoseData
    if (d.type === 'botox') {
      return Object.entries(d.areas as AreaMap)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}U`)
    }
    if (d.type === 'facial') {
      return Object.entries(d.areas as AreaMap)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
    }
    if (d.type === 'ultrassom') {
      return Object.entries(d.areas as UltrassomMap)
        .filter(([, v]) => v.shots || v.ponteira)
        .map(([k, v]) => `${k}: ${v.shots || '0'} disp. · ponteira ${v.ponteira || '?'}mm`)
    }
  } catch {
    return [dose]
  }
  return []
}

// ── Main component ────────────────────────────────────────────────────────────

export function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [patient, setPatient] = useState<Patient | null>(null)
  const [sessions, setSessions] = useState<TreatmentSession[]>([])
  const [photos, setPhotos] = useState<PatientPhoto[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [sessionForm, setSessionForm] = useState({
    treatment_id: '',
    session_date: new Date().toISOString().split('T')[0],
    next_session_date: '',
    notes: '',
    custom_treatment: '',
  })
  const [showCustom, setShowCustom] = useState(false)
  const [botoxData, setBotoxData] = useState<AreaMap>({})
  const [facialData, setFacialData] = useState<AreaMap>({})
  const [ultrassomData, setUltrassomData] = useState<UltrassomMap>({})

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    reload()
    setTreatments(getTreatments())
  }, [id])

  function reload() {
    if (!id) return
    const p = getPatient(id)
    if (!p) { navigate('/pacientes'); return }
    setPatient(p)
    setSessions(getSessions(id))
    setPhotos(getPhotos(id))
  }

  const selectedTreatment = treatments.find(t => t.id === sessionForm.treatment_id)
  const treatmentType = selectedTreatment ? getTreatmentType(selectedTreatment.name) : ''

  function handleTreatmentChange(tid: string) {
    setSessionForm(f => ({ ...f, treatment_id: tid }))
    setBotoxData({})
    setFacialData({})
    setUltrassomData({})
  }

  function resetForm() {
    setSessionForm({
      treatment_id: '',
      session_date: new Date().toISOString().split('T')[0],
      next_session_date: '',
      notes: '',
      custom_treatment: '',
    })
    setBotoxData({})
    setFacialData({})
    setUltrassomData({})
    setShowCustom(false)
  }

  function handleAddSession() {
    if (!id) return
    let tid = sessionForm.treatment_id
    if (showCustom && sessionForm.custom_treatment.trim()) {
      const t = addTreatment(sessionForm.custom_treatment.trim(), 'Outro')
      setTreatments(getTreatments())
      tid = t.id
    }
    if (!tid || !sessionForm.session_date) { alert('Selecione o tratamento e a data'); return }

    let dose = ''
    if (treatmentType === 'botox') {
      const areas = Object.fromEntries(Object.entries(botoxData).filter(([, v]) => v))
      if (Object.keys(areas).length) dose = JSON.stringify({ type: 'botox', areas })
    } else if (treatmentType === 'facial') {
      const areas = Object.fromEntries(Object.entries(facialData).filter(([, v]) => v))
      if (Object.keys(areas).length) dose = JSON.stringify({ type: 'facial', areas })
    } else if (treatmentType === 'ultrassom') {
      const areas = Object.fromEntries(
        Object.entries(ultrassomData).filter(([, v]) => v.shots || v.ponteira)
      )
      if (Object.keys(areas).length) dose = JSON.stringify({ type: 'ultrassom', areas })
    }

    saveSession({
      patient_id: id,
      treatment_id: tid,
      session_date: sessionForm.session_date,
      notes: sessionForm.notes,
      dose,
      next_session_date: sessionForm.next_session_date || undefined,
    })
    setShowSessionForm(false)
    resetForm()
    reload()
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !id) return
    const reader = new FileReader()
    reader.onload = ev => { savePhoto(id, ev.target?.result as string, undefined); reload() }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  if (!patient) return <div className="p-8 text-center text-gray-400">Carregando…</div>

  const lastSession = sessions[0]
  const daysSince = lastSession ? differenceInDays(new Date(), new Date(lastSession.session_date)) : null
  const monthsSince = lastSession ? differenceInMonths(new Date(), new Date(lastSession.session_date)) : null
  const isAlert = monthsSince !== null && monthsSince >= 3

  const predefinedTreatments = treatments.filter(t => t.is_predefined)

  return (
    <div className="flex flex-col min-h-svh bg-[#f8f0f4]">
      <header className="bg-[#8b1a4a] text-white px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/pacientes')} className="p-1"><ArrowLeft size={22} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">{patient.name}</h1>
            {daysSince !== null ? (
              <p className={`text-xs flex items-center gap-1 ${isAlert ? 'text-amber-300' : 'text-[#f0c0d8]'}`}>
                {isAlert && <AlertTriangle size={11} />}
                {isAlert
                  ? `${monthsSince} meses sem retorno ⚠`
                  : daysSince === 0 ? 'Atendida hoje' : `Última consulta: ${daysSince} dias atrás`}
              </p>
            ) : (
              <p className="text-xs text-[#f0c0d8]">Sem consultas registradas</p>
            )}
          </div>
          <button onClick={() => navigate(`/pacientes/${id}/editar`)} className="p-1"><Edit2 size={20} /></button>
          <button onClick={() => navigate(`/agenda?paciente=${id}`)} className="p-1"><CalendarPlus size={20} /></button>
        </div>
      </header>

      <div className="flex-1 pb-6 space-y-1">

        {/* ── DADOS ── */}
        <section>
          <div className={SECTION_HEAD}>DADOS DO PACIENTE</div>
          <div className="bg-white divide-y divide-[#f0e0ec]">
            {([ ['Telefone', patient.phone], ['E-mail', patient.email],
                ['Nascimento', patient.birth_date ? format(new Date(patient.birth_date + 'T12:00'), 'dd/MM/yyyy') : null],
                ['CPF', patient.cpf], ['Endereço', patient.address],
              ] as [string, string | undefined | null][]).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="px-4 py-3 flex gap-3">
                <span className="text-xs font-bold text-[#8b1a4a] w-24 flex-shrink-0 pt-0.5">{k}</span>
                <span className="text-sm text-gray-700">{v}</span>
              </div>
            ))}
            {patient.notes && (
              <div className="px-4 py-3">
                <p className="text-xs font-bold text-[#8b1a4a] mb-1">OBSERVAÇÕES</p>
                <p className="text-sm text-gray-700">{patient.notes}</p>
              </div>
            )}
          </div>
        </section>

        {/* ── TRATAMENTOS ── */}
        <section>
          <div className={SECTION_HEAD}>
            TRATAMENTOS REALIZADOS
            <button
              onClick={() => { setShowSessionForm(s => !s); if (showSessionForm) resetForm() }}
              className="bg-white/20 rounded-lg px-3 py-1 text-xs font-bold flex items-center gap-1">
              <Plus size={14} /> REGISTRAR
            </button>
          </div>

          {showSessionForm && (
            <div className="bg-[#fdf0f6] p-4 space-y-4 border-b border-[#e8c4d8]">

              {/* Datas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">DATA *</label>
                  <input type="date" value={sessionForm.session_date}
                    onChange={e => setSessionForm(f => ({ ...f, session_date: e.target.value }))}
                    className={INPUT} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">PRÓX. RETORNO</label>
                  <input type="date" value={sessionForm.next_session_date}
                    onChange={e => setSessionForm(f => ({ ...f, next_session_date: e.target.value }))}
                    className={INPUT} />
                </div>
              </div>

              {/* Seleção de tratamento */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2">TRATAMENTO *</label>
                {!showCustom ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {predefinedTreatments.map(t => (
                        <button key={t.id} type="button"
                          onClick={() => handleTreatmentChange(t.id)}
                          className={`px-3 py-2.5 rounded-lg text-sm text-left border transition-colors leading-tight ${
                            sessionForm.treatment_id === t.id
                              ? 'bg-[#8b1a4a] text-white border-[#8b1a4a] font-semibold'
                              : 'bg-white text-gray-700 border-[#e8c4d8]'
                          }`}>
                          {t.name}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => setShowCustom(true)}
                      className="mt-2 text-xs text-[#8b1a4a] underline">
                      + Outro tratamento…
                    </button>
                  </>
                ) : (
                  <>
                    <input type="text" placeholder="Nome do tratamento"
                      value={sessionForm.custom_treatment}
                      onChange={e => setSessionForm(f => ({ ...f, custom_treatment: e.target.value }))}
                      className={INPUT} />
                    <button type="button"
                      onClick={() => { setShowCustom(false); setSessionForm(f => ({ ...f, treatment_id: '', custom_treatment: '' })) }}
                      className="mt-1 text-xs text-gray-400 underline">
                      Usar lista
                    </button>
                  </>
                )}
              </div>

              {/* Subformulário: Toxina Botulínica */}
              {treatmentType === 'botox' && (
                <div className="border border-[#e8c4d8] rounded-lg p-3 bg-white">
                  <p className="text-xs font-bold text-[#8b1a4a] mb-3">ÁREAS DE APLICAÇÃO — TOXINA BOTULÍNICA (unidades)</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {BOTOX_AREAS.map(area => (
                      <div key={area}>
                        <label className="block text-xs text-gray-500 mb-0.5">{area}</label>
                        <div className="flex items-center gap-1">
                          <input type="number" min="0" placeholder="0"
                            value={botoxData[area] || ''}
                            onChange={e => setBotoxData(d => ({ ...d, [area]: e.target.value }))}
                            className="flex-1 px-2 py-2 rounded border border-[#e8c4d8] text-sm bg-white outline-none" />
                          <span className="text-xs text-gray-400">U</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subformulário: Preenchedor Facial */}
              {treatmentType === 'facial' && (
                <div className="border border-[#e8c4d8] rounded-lg p-3 bg-white">
                  <p className="text-xs font-bold text-[#8b1a4a] mb-3">ÁREAS DE APLICAÇÃO — PREENCHEDOR FACIAL (ác. hialurônico)</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {FACIAL_AREAS.map(area => (
                      <div key={area}>
                        <label className="block text-xs text-gray-500 mb-0.5">{area}</label>
                        <input type="text" placeholder="ex: 0.5ml"
                          value={facialData[area] || ''}
                          onChange={e => setFacialData(d => ({ ...d, [area]: e.target.value }))}
                          className="w-full px-2 py-2 rounded border border-[#e8c4d8] text-sm bg-white outline-none" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subformulário: Ultrassom Microfocado */}
              {treatmentType === 'ultrassom' && (
                <div className="border border-[#e8c4d8] rounded-lg p-3 bg-white">
                  <p className="text-xs font-bold text-[#8b1a4a] mb-3">ÁREAS DE APLICAÇÃO — ULTRASSOM MICROFOCADO</p>
                  <div className="space-y-3">
                    {ULTRASSOM_AREAS.map(area => (
                      <div key={area} className="pb-3 border-b border-[#f0e0ec] last:border-0 last:pb-0">
                        <p className="text-xs font-semibold text-gray-600 mb-1.5">{area}</p>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-gray-400">Disparos</label>
                            <input type="number" min="0" placeholder="0"
                              value={ultrassomData[area]?.shots || ''}
                              onChange={e => setUltrassomData(d => ({
                                ...d,
                                [area]: { ponteira: d[area]?.ponteira || '', shots: e.target.value },
                              }))}
                              className="w-full mt-0.5 px-2 py-2 rounded border border-[#e8c4d8] text-sm bg-white outline-none" />
                          </div>
                          <div className="w-32">
                            <label className="text-xs text-gray-400">Ponteira (mm)</label>
                            <select value={ultrassomData[area]?.ponteira || ''}
                              onChange={e => setUltrassomData(d => ({
                                ...d,
                                [area]: { shots: d[area]?.shots || '', ponteira: e.target.value },
                              }))}
                              className="w-full mt-0.5 px-2 py-2 rounded border border-[#e8c4d8] text-sm bg-white outline-none">
                              <option value="">—</option>
                              {PONTEIRAS.map(p => <option key={p} value={p}>{p}mm</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">OBSERVAÇÕES</label>
                <textarea rows={3} value={sessionForm.notes}
                  onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#e8c4d8] text-sm bg-white outline-none resize-none"
                  placeholder="Anotações adicionais sobre o atendimento…" />
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setShowSessionForm(false); resetForm() }}
                  className="flex-1 py-3 rounded-xl border border-gray-300 text-sm text-gray-600 font-semibold">
                  Cancelar
                </button>
                <button onClick={handleAddSession}
                  className="flex-1 py-3 rounded-xl bg-[#8b1a4a] text-white text-sm font-bold">
                  SALVAR
                </button>
              </div>
            </div>
          )}

          <div className="bg-white divide-y divide-[#f0e0ec]">
            {sessions.length === 0 && (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">Nenhum atendimento registrado</p>
            )}
            {sessions.map(s => (
              <SessionRow key={s.id} session={s} onDelete={() => { deleteSession(s.id); reload() }} />
            ))}
          </div>
        </section>

        {/* ── FOTOS ── */}
        <section>
          <div className={SECTION_HEAD}>
            FOTOS
            <div className="flex gap-2">
              <button onClick={() => cameraRef.current?.click()}
                className="bg-white/20 rounded-lg px-3 py-1 text-xs font-bold flex items-center gap-1">
                <Camera size={14} /> CÂMERA
              </button>
              <button onClick={() => galleryRef.current?.click()}
                className="bg-white/20 rounded-lg px-3 py-1 text-xs font-bold">
                GALERIA
              </button>
            </div>
          </div>
          {/* capture="environment" abre câmera traseira diretamente */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
          {/* sem capture, o SO exibe picker com câmera + galeria */}
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />

          {photos.length === 0 ? (
            <div className="bg-white py-10 flex flex-col items-center gap-3 text-gray-300">
              <Camera size={40} />
              <p className="text-sm">Nenhuma foto cadastrada</p>
            </div>
          ) : (
            <div className="bg-white grid grid-cols-3 gap-0.5 p-0.5">
              {photos.map(photo => (
                <div key={photo.id} className="relative aspect-square">
                  <img src={photo.url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { if (confirm('Excluir foto?')) { deletePhoto(photo.id); reload() } }}
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-1">
                    <Trash2 size={11} color="white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}

// ── SessionRow ────────────────────────────────────────────────────────────────

function SessionRow({ session, onDelete }: { session: TreatmentSession; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const doseLines = parseDoseLines(session.dose)

  return (
    <div>
      <button className="w-full flex items-center px-4 py-3.5 gap-3 text-left active:bg-[#fdf8fb]"
        onClick={() => setOpen(o => !o)}>
        <div className="flex-1">
          <p className="font-semibold text-sm text-gray-800">{session.treatment?.name || 'Atendimento'}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {format(new Date(session.session_date + 'T12:00'), 'dd/MM/yyyy')}
            {session.next_session_date && ` · Retorno: ${format(new Date(session.next_session_date + 'T12:00'), 'dd/MM/yyyy')}`}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-[#c4a0b8]" /> : <ChevronDown size={16} className="text-[#c4a0b8]" />}
      </button>

      {open && (
        <div className="bg-[#fdf8fb] px-4 pb-3 space-y-2 border-t border-[#f0e0ec]">
          {doseLines.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-bold text-[#8b1a4a] mb-1">ÁREAS TRATADAS</p>
              <div className="space-y-0.5">
                {doseLines.map((line, i) => (
                  <p key={i} className="text-xs text-gray-700">{line}</p>
                ))}
              </div>
            </div>
          )}
          {session.notes && (
            <p className="text-xs pt-1">
              <span className="font-bold text-[#8b1a4a]">Obs: </span>{session.notes}
            </p>
          )}
          <button onClick={onDelete} className="flex items-center gap-1 text-xs text-red-400 pt-1">
            <Trash2 size={12} /> Excluir registro
          </button>
        </div>
      )}
    </div>
  )
}
