import Dashboard from './components/Dashboard'
import { ToastProvider } from './components/Toast'
import './App.css'

function App() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  )
}

export default App
