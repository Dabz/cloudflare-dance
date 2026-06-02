import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import App from './App'
import Room from './Room'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/room/:id',
    element: <Room />,
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
