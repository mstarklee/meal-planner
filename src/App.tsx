import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { HouseholdProvider } from './context/HouseholdProvider'
import { RequireAuth, RequireHousehold } from './routes/guards'
import AppShell from './components/AppShell'
import UpdatePrompt from './components/UpdatePrompt'
import Login from './routes/Login'
import Onboarding from './routes/Onboarding'
import Today from './routes/Today'
import Plan from './routes/Plan'
import Recipes from './routes/Recipes'
import RecipeImport from './routes/RecipeImport'
import RecipeForm from './routes/RecipeForm'
import RecipeDetail from './routes/RecipeDetail'
import Shop from './routes/Shop'
import Pantry from './routes/Pantry'
import Settings from './routes/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <UpdatePrompt />
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
                  <Route path="recipes/import" element={<RecipeImport />} />
                  <Route path="recipes/new" element={<RecipeForm />} />
                  <Route path="recipes/:id" element={<RecipeDetail />} />
                  <Route path="recipes/:id/edit" element={<RecipeForm />} />
                  <Route path="shop" element={<Shop />} />
                  <Route path="pantry" element={<Pantry />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </HouseholdProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
