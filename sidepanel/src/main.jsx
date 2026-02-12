import React from 'react'
import ReactDOM from 'react-dom/client'
import PrismApp from './app/PrismApp.jsx'
import './index.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/floating-input.css'
import './styles/editor.css'
import './styles/theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrismApp />
  </React.StrictMode>,
)
