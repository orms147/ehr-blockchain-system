// Global polyfills - MUST be very first!
import { Buffer } from 'buffer';
import process from 'process';

// Inject into global scope
window.Buffer = Buffer;
window.process = process;
globalThis.Buffer = Buffer;
globalThis.process = process;

// React app
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
