import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, TrendingUp, Cake, Syringe } from 'lucide-react'

const REPORTS = [
  {
    path: '/relatorios/retorno',
    icon: Clock,
    title: 'Tempo de Retorno',
    desc: 'Pacientes sem retorno agrupados por tempo de ausência',
    color: 'bg-amber-50 border-amber-200',
    iconBg: 'bg-amber-500',
  },
  {
    path: '/relatorios/tratamentos',
    icon: Syringe,
    title: 'Tratamentos Realizados',
    desc: 'Procedimentos mais frequentes no período',
    color: 'bg-pink-50 border-pink-200',
    iconBg: 'bg-[#8b1a4a]',
  },
  {
    path: '/relatorios/aniversariantes',
    icon: Cake,
    title: 'Aniversariantes',
    desc: 'Pacientes que fazem aniversário este mês',
    color: 'bg-purple-50 border-purple-200',
    iconBg: 'bg-purple-600',
  },
  {
    path: '/relatorios/evolucao',
    icon: TrendingUp,
    title: 'Evolução de Atendimentos',
    desc: 'Quantidade de atendimentos por mês',
    color: 'bg-blue-50 border-blue-200',
    iconBg: 'bg-[#1a4a7a]',
  },
]

export function ReportsHome() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-svh bg-[#f0f8f4]">
      <header className="bg-[#1a6b45] text-white px-4 py-3 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1"><ArrowLeft size={22} /></button>
        <h1 className="font-bold text-base flex-1">RELATÓRIOS</h1>
      </header>

      <div className="p-4 space-y-3">
        {REPORTS.map(r => {
          const Icon = r.icon
          return (
            <button key={r.path} onClick={() => navigate(r.path)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 ${r.color} text-left active:opacity-80 transition-opacity`}>
              <div className={`w-12 h-12 rounded-xl ${r.iconBg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={22} color="white" />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm">{r.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{r.desc}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
