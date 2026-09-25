import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import { initMotion } from './lib/motion';
import './styles/global.css';

// Run before the first paint so the CSS that hides animated elements is only
// applied when animation will actually happen.
initMotion();

const container = document.getElementById('root');
if (container === null) throw new Error('Root element #root not found');

const router = createBrowserRouter([{ path: '*', element:
  <AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider>,
}]);
createRoot(container).render(<StrictMode><RouterProvider router={router}/></StrictMode>);
