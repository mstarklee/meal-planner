import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { HouseholdProvider } from './context/HouseholdProvider'
import { RequireAuth, RequireHousehold } from './routes/guards'
import AppShell from './components/AppShell'
import Login from './routes/Login'
import Onboarding from './routes/Onboarding'
import Today from './routes/Today'
import Plan from './routes/Plan'
import Recipes from './routes/Recipes'
import Shop from './routes/Shop'
import Pantry from './routes/Pantry'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <HouseholdProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route element={<RequireHousehold />}>
                <Route element={<AppShell />}>
                  <Route index element={<Today />} />
                  <Route path="plan" element={<Plan />} />
                  <Route path="recipes" element={<Recipes />} />
                  <Route path="shop" element={<Shop />} />
                  <Route path="pantry" element={<Pantry />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </HouseholdProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
