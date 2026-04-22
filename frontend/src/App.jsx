// src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import LandingPage from './pages/LandingPage'
import LibraryPage from './pages/LibraryPage'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import SessionsPage from './pages/SessionsPage'
import StudyPage from './pages/StudyPage'
import WikiPage from './pages/WikiPage'
import NewSessionPage from './pages/NewSessionPage'

const queryClient = new QueryClient()

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />
          <Route path="/library" element={<PrivateRoute><LibraryPage /></PrivateRoute>} />
          <Route path="/sessions" element={<PrivateRoute><SessionsPage /></PrivateRoute>} />
          <Route path="/sessions/new" element={<PrivateRoute><NewSessionPage /></PrivateRoute>} />
          <Route path="/wiki" element={<PrivateRoute><WikiPage /></PrivateRoute>} />
          <Route path="/study/:sessionId" element={<PrivateRoute><StudyPage /></PrivateRoute>} />
          <Route path="/dashboard" element={<Navigate to="/library" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}