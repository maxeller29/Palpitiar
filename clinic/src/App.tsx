import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { PatientsHome } from './pages/PatientsHome'
import { PatientDetail } from './pages/PatientDetail'
import { PatientForm } from './pages/PatientForm'
import { AgendaPage } from './pages/AgendaPage'

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
        </Routes>
      </div>
    </BrowserRouter>
  )
}
