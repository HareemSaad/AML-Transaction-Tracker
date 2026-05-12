import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import MasterDashboard from './pages/MasterDashboard'
import UserDashboard from './pages/UserDashboard'
import TransferPortal from './pages/TransferPortal'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/master" replace />} />
          <Route path="/master" element={<MasterDashboard />} />
          <Route path="/user" element={<UserDashboard />} />
          <Route path="/transfer" element={<TransferPortal />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
