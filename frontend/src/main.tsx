import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Polyfill global object for sockjs-client in Vite
if (typeof (window as any).global === 'undefined') {
  (window as any).global = window;
}

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
