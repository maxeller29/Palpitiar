import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { PatientsHome } from './pages/PatientsHome'
import { PatientDetail } from './pages/PatientDetail'
import { PatientForm } from './pages/PatientForm'
import { AgendaPage } from './pages/AgendaPage'
import { ReportsHome } from './pages/ReportsHome'
import { ReturnTimeReport } from './pages/reports/ReturnTimeReport'
import { TreatmentsReport } from './pages/reports/TreatmentsReport'
import { BirthdayReport } from './pages/reports/BirthdayReport'
import { EvolutionReport } from './pages/reports/EvolutionReport'

export default function App() {
  return (
    <BrowserRouter>
      <div className="max-w-lg mx-auto min-h-svh flex flex-col bg-white shadow-xl">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pacientes" element={<PatientsHome />} />
          <Route path="/pacientes/novo" element={<PatientForm />} />
          <Route path="/pacientes/:id" element={<PatientDetail />} />
          <Route path="/pacientes/:id/editar" element={<PatientForm />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/relatorios" element={<ReportsHome />} />
          <Route path="/relatorios/retorno" element={<ReturnTimeReport />} />
          <Route path="/relatorios/tratamentos" element={<TreatmentsReport />} />
          <Route path="/relatorios/aniversariantes" element={<BirthdayReport />} />
          <Route path="/relatorios/evolucao" element={<EvolutionReport />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
