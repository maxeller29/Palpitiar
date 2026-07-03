import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, differenceInDays, differenceInMonths } from 'date-fns'
import { ArrowLeft, Edit2, Plus, Camera, Trash2, ChevronDown, ChevronUp, CalendarPlus, AlertTriangle } from 'lucide-react'
import { getPatient, getSessions, getPhotos, saveSession, deleteSession, savePhoto, deletePhoto, getTreatments, addTreatment } from '../lib/localStorage'
import type { Patient, TreatmentSession, PatientPhoto, Treatment } from '../types'

const SECTION_HEAD = 'bg-[#8b1a4a] text-white px-4 py-3 font-bold text-sm tracking-wider flex items-center justify-between'

export function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [patient, setPatient] = useState<Patient | null>(null)
  const [sessions, setSessions] = useState<TreatmentSession[]>([])
  const [photos, setPhotos] = useState<PatientPhoto[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [sessionForm, setSessionForm] = useState({
    treatment_id: '', session_date: new Date().toISOString().split('T')[0],
    notes: '', products_used: '', dose: '', next_session_date: '', custom_treatment: '',
  })
  const [showCustom, setShowCustom] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!id) return; reload(); setTreatments(getTreatments()) }, [id])

  function reload() {
    if (!id) return
    const p = getPatient(id)
    if (!p) { navigate('/pacientes'); return }
    setPatient(p); setSessions(getSessions(id)); setPhotos(getPhotos(id))
  }

  function handleAddSession() {
    if (!id) return
    let tid = sessionForm.treatment_id
    if (showCustom && sessionForm.custom_treatment.trim()) {
      const t = addTreatment(sessionForm.custom_treatment.trim(), 'Outro')
      setTreatments(getTreatments()); tid = t.id
    }
    if (!tid || !sessionForm.session_date) { alert('Selecione o tratamento e a data'); return }
    saveSession({
      patient_id: id, treatment_id: tid, session_date: sessionForm.session_date,
      notes: sessionForm.notes, products_used: sessionForm.products_used,
      dose: sessionForm.dose, next_session_date: sessionForm.next_session_date || undefined,
    })
    setShowSessionForm(false)
    setSessionForm({ treatment_id: '', session_date: new Date().toISOString().split('T')[0], notes: '', products_used: '', dose: '', next_session_date: '', custom_treatment: '' })
    setShowCustom(false); reload()
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !id) return
    const reader = new FileReader()
    reader.onload = ev => { savePhoto(id, ev.target?.result as string, undefined); reload() }
    reader.readAsDataURL(file)
  }

  if (!patient) return <div className="p-8 text-center text-gray-400">Carregando…</div>

  const lastSession = sessions[0]
  const daysSince = lastSession ? differenceInDays(new Date(), new Date(lastSession.session_date)) : null
  const monthsSince = lastSession ? differenceInMonths(new Date(), new Date(lastSession.session_date)) : null
  const isAlert = monthsSince !== null && monthsSince >= 3

  const grouped = treatments.reduce<Record<string, Treatment[]>>((acc, t) => {
    acc[t.category] = acc[t.category] || []; acc[t.category].push(t); return acc
  }, {})

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
                {isAlert ? `${monthsSince} meses sem retorno ⚠` :
                  daysSince === 0 ? 'Atendida hoje' : `Última consulta: ${daysSince} dias atrás`}
              </p>
            ) : <p className="text-xs text-[#f0c0d8]">Sem consultas registradas</p>}
          </div>
          <button onClick={() => navigate(`/pacientes/${id}/editar`)} className="p-1"><Edit2 size={20} /></button>
          <button onClick={() => navigate(`/agenda?paciente=${id}`)} className="p-1"><CalendarPlus size={20} /></button>
        </div>
      </header>

      <div className="flex-1 pb-6 space-y-1">
        {/* DADOS */}
        <section>
          <div className={SECTION_HEAD}>DADOS DO PACIENTE</div>
          <div className="bg-white divide-y divide-[#f0e0ec]">
            {[['Telefone', patient.phone], ['E-mail', patient.email],
              ['Nascimento', patient.birth_date ? format(new Date(patient.birth_date + 'T12:00'), 'dd/MM/yyyy') : null],
              ['CPF', patient.cpf], ['Endereço', patient.address]]
              .filter(([, v]) => v).map(([k, v]) => (
              <div key={k as string} className="px-4 py-3 flex gap-3">
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

        {/* TRATAMENTOS */}
        <section>
          <div className={SECTION_HEAD}>
            TRATAMENTOS REALIZADOS
            <button onClick={() => setShowSessionForm(s => !s)}
              className="bg-white/20 rounded-lg px-3 py-1 text-xs font-bold flex items-center gap-1">
              <Plus size={14} /> REGISTRAR
            </button>
          </div>

          {showSessionForm && (
            <div className="bg-[#fdf0f6] p-4 space-y-3 border-b border-[#e8c4d8]">
              <div className="grid grid-cols-2 gap-3">
                {[['DATA *', 'session_date', 'date'], ['PRÓX. RETORNO', 'next_session_date', 'date']].map(([l, k, t]) => (
                  <div key={k}>
                    <label className="block text-xs font-bold text-gray-600 mb-1">{l}</label>
                    <input type={t} value={sessionForm[k as keyof typeof sessionForm]}
                      onChange={e => setSessionForm(f => ({ ...f, [k]: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-[#e8c4d8] text-sm bg-white outline-none" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">TRATAMENTO *</label>
                {!showCustom ? (
                  <>
                    <select value={sessionForm.treatment_id}
                      onChange={e => setSessionForm(f => ({ ...f, treatment_id: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-[#e8c4d8] text-sm bg-white outline-none">
                      <option value="">Selecionar…</option>
                      {Object.entries(grouped).map(([cat, items]) => (
                        <optgroup key={cat} label={cat}>
                          {items.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <button onClick={() => setShowCustom(true)} className="mt-1 text-xs text-[#8b1a4a] underline">+ Outro…</button>
                  </>
                ) : (
                  <>
                    <input type="text" placeholder="Nome do tratamento" value={sessionForm.custom_treatment}
                      onChange={e => setSessionForm(f => ({ ...f, custom_treatment: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-[#e8c4d8] text-sm bg-white outline-none" />
                    <button onClick={() => setShowCustom(false)} className="mt-1 text-xs text-gray-400 underline">Usar lista</button>
                  </>
                )}
              </div>
              {[['PRODUTOS / MATERIAIS', 'products_used'], ['DOSE / QUANTIDADE', 'dose']].map(([l, k]) => (
                <div key={k}>
                  <label className="block text-xs font-bold text-gray-600 mb-1">{l}</label>
                  <input type="text" value={sessionForm[k as keyof typeof sessionForm]}
                    onChange={e => setSessionForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-[#e8c4d8] text-sm bg-white outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">OBSERVAÇÕES</label>
                <textarea rows={2} value={sessionForm.notes}
                  onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#e8c4d8] text-sm bg-white outline-none resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowSessionForm(false)} className="flex-1 py-3 rounded-xl border border-gray-300 text-sm text-gray-600 font-semibold">Cancelar</button>
                <button onClick={handleAddSession} className="flex-1 py-3 rounded-xl bg-[#8b1a4a] text-white text-sm font-bold">SALVAR</button>
              </div>
            </div>
          )}

          <div className="bg-white divide-y divide-[#f0e0ec]">
            {sessions.length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">Nenhum atendimento registrado</p>}
            {sessions.map(s => <SessionRow key={s.id} session={s} onDelete={() => { deleteSession(s.id); reload() }} />)}
          </div>
        </section>

        {/* FOTOS */}
        <section>
          <div className={SECTION_HEAD}>
            FOTOS
            <button onClick={() => photoRef.current?.click()}
              className="bg-white/20 rounded-lg px-3 py-1 text-xs font-bold flex items-center gap-1">
              <Camera size={14} /> ADICIONAR
            </button>
          </div>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
          {photos.length === 0 ? (
            <div className="bg-white py-10 flex flex-col items-center gap-3 text-gray-300">
              <Camera size={40} /><p className="text-sm">Nenhuma foto cadastrada</p>
            </div>
          ) : (
            <div className="bg-white grid grid-cols-3 gap-0.5 p-0.5">
              {photos.map(photo => (
                <div key={photo.id} className="relative aspect-square">
                  <img src={photo.url} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => { if (confirm('Excluir foto?')) { deletePhoto(photo.id); reload() } }}
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

function SessionRow({ session, onDelete }: { session: TreatmentSession; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button className="w-full flex items-center px-4 py-3.5 gap-3 text-left active:bg-[#fdf8fb]" onClick={() => setOpen(o => !o)}>
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
        <div className="bg-[#fdf8fb] px-4 pb-3 space-y-1 border-t border-[#f0e0ec]">
          {session.products_used && <p className="text-xs"><span className="font-bold text-[#8b1a4a]">Produtos: </span>{session.products_used}</p>}
          {session.dose && <p className="text-xs"><span className="font-bold text-[#8b1a4a]">Dose: </span>{session.dose}</p>}
          {session.notes && <p className="text-xs"><span className="font-bold text-[#8b1a4a]">Obs: </span>{session.notes}</p>}
          <button onClick={onDelete} className="flex items-center gap-1 text-xs text-red-400 mt-1">
            <Trash2 size={12} /> Excluir registro
          </button>
        </div>
      )}
    </div>
  )
}
