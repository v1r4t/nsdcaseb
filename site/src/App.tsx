import { BrowserRouter, Route, Routes } from 'react-router-dom';
import SiteHeader from './components/SiteHeader';
import { AuthProvider } from './lib/auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Register from './pages/Register';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-white/40">
            National Student Data Corps, Amrita Vishwa Vidyapeetham
          </footer>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}