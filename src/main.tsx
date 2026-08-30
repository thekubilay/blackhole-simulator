import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTouchClass } from './ui/touch'

// dokunmatik dalı CSS'e ilk boyamadan önce bildirilir (mobil yerleşim zıplamasın)
applyTouchClass()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
