import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/themes.css'
import './styles/globals.css'

const rootElement = document.querySelector('#root')
if (!rootElement) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
