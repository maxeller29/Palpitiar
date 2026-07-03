import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { getPatient, savePatient, deletePatient } from '../lib/localStorage'

export function PatientForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState({
    name: '', phone: '', email: '', birth_date: '', cpf: '', address: '', notes: '',
  })

  useEffect(() => {
    if (id) {
      const p = getPatient(id)
      if (p) setForm({ name: p.name, phone: p.phone, email: p.email || '', birth_date: p.birth_date || '', cpf: p.cpf || '', address: p.address || '', notes: p.notes || '' })
    }
  }, [id])

  const fields: Array<[string, keyof typeof form, string, string]> = [
    ['NOME COMPLETO *', 'name', 'text', 'Ex: Maria Silva'],
    ['TELEFONE / WHATSAPP *', 'phone', 'tel', '(11) 99999-9999'],
    ['E-MAIL', 'email', 'email', 'maria@email.com'],
    ['DATA DE NASCIMENTO', 'birth_date', 'date', ''],
    ['CPF', 'cpf', 'text', '000.000.000-00'],
    ['ENDEREÇO', 'address', 'text', 'Rua, número, bairro…'],
  ]

  function handleSave() {
    if (!form.name.trim() || !form.phone.trim()) { alert('Nome e telefone são obrigatórios'); return }
    savePatient({ ...form, ...(isEdit ? { id } : {}) })
    navigate(isEdit ? `/pacientes/${id}` : '/pacientes')
  }

  function handleDelete() {
    if (!confirm('Excluir este paciente e todos os seus registros?')) return
    deletePatient(id!); navigate('/pacientes')
  }

  return (
    <div className="flex flex-col min-h-svh bg-[#f8f0f4]">
      <header className="bg-[#8b1a4a] text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={22} /></button>
        <h1 className="font-bold text-base">{isEdit ? 'EDITAR PACIENTE' : 'NOVO PACIENTE'}</h1>
      </header>

      <div className="flex-1 p-4 space-y-4">
        {fields.map(([label, key, type, placeholder]) => (
          <div key={key}>
            <label className="block text-xs font-bold text-[#8b1a4a] mb-1 tracking-wide">{label}</label>
            <input type={type} value={form[key]} placeholder={placeholder}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border-2 border-[#e8c4d8] text-sm outline-none focus:border-[#8b1a4a] bg-white" />
          </div>
        ))}

        <div>
          <label className="block text-xs font-bold text-[#8b1a4a] mb-1 tracking-wide">OBSERVAÇÕES</label>
          <textarea value={form.notes} rows={3}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Alergias, contraindicações, histórico relevante…"
            className="w-full px-4 py-3 rounded-xl border-2 border-[#e8c4d8] text-sm outline-none focus:border-[#8b1a4a] bg-white resize-none" />
        </div>

        <button onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 bg-[#8b1a4a] text-white rounded-xl py-4 font-bold text-base">
          <Save size={20} />
          {isEdit ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR PACIENTE'}
        </button>

        {isEdit && (
          <button onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 border-2 border-red-300 text-red-500 rounded-xl py-3.5 font-semibold text-sm">
            <Trash2 size={18} /> Excluir paciente
          </button>
        )}
      </div>
    </div>
  )
}
