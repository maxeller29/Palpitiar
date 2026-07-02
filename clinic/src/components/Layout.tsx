import { NavLink, Outlet } from 'react-router-dom'
import { Users, Calendar, LayoutDashboard, Stethoscope } from 'lucide-react'

export function Layout() {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-1 py-2 px-4 text-xs font-medium transition-colors ${
      isActive ? 'text-purple-700' : 'text-gray-500 hover:text-purple-600'
    }`

  return (
    <div className="flex flex-col min-h-svh max-w-2xl mx-auto bg-white shadow-sm">
      {/* Header */}
      <header className="bg-purple-700 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Stethoscope size={22} />
        <div>
          <h1 className="text-base font-semibold leading-none">Dra. Andréa Eller</h1>
          <p className="text-purple-200 text-xs">Harmonização Orofacial e Corporal</p>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white border-t border-gray-200 flex justify-around safe-pb z-10">
        <NavLink to="/" end className={navClass}>
          <LayoutDashboard size={20} />
          <span>Início</span>
        </NavLink>
        <NavLink to="/patients" className={navClass}>
          <Users size={20} />
          <span>Pacientes</span>
        </NavLink>
        <NavLink to="/agenda" className={navClass}>
          <Calendar size={20} />
          <span>Agenda</span>
        </NavLink>
      </nav>
    </div>
  )
}
