import { useNavigate } from 'react-router-dom'
import { Users, Calendar, Stethoscope, BarChart2 } from 'lucide-react'

export function Home() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-svh">
      <header className="bg-[#8b1a4a] text-white px-5 py-4 flex items-center gap-3">
        <Stethoscope size={24} />
        <div>
          <h1 className="text-lg font-bold leading-tight">Dra. Andréa Eller</h1>
          <p className="text-[#f0c0d8] text-xs">Harmonização Orofacial e Corporal</p>
        </div>
      </header>

      <div className="flex flex-col flex-1">
        <button
          onClick={() => navigate('/pacientes')}
          className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#e8c4d8] active:bg-[#d4a8c4] transition-colors border-b-2 border-[#c4a0b8]"
        >
          <div className="w-16 h-16 rounded-full bg-[#8b1a4a] flex items-center justify-center shadow-lg">
            <Users size={30} color="white" />
          </div>
          <span className="text-2xl font-extrabold text-[#8b1a4a] tracking-wide">PACIENTES</span>
        </button>

        <button
          onClick={() => navigate('/agenda')}
          className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#b8d0ea] active:bg-[#9ebcda] transition-colors border-b-2 border-[#9ab8d8]"
        >
          <div className="w-16 h-16 rounded-full bg-[#1a4a7a] flex items-center justify-center shadow-lg">
            <Calendar size={30} color="white" />
          </div>
          <span className="text-2xl font-extrabold text-[#1a4a7a] tracking-wide">AGENDA</span>
        </button>

        <button
          onClick={() => navigate('/relatorios')}
          className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#b8e4d0] active:bg-[#9ed4bc] transition-colors"
        >
          <div className="w-16 h-16 rounded-full bg-[#1a6b45] flex items-center justify-center shadow-lg">
            <BarChart2 size={30} color="white" />
          </div>
          <span className="text-2xl font-extrabold text-[#1a6b45] tracking-wide">RELATÓRIOS</span>
        </button>
      </div>
    </div>
  )
}
