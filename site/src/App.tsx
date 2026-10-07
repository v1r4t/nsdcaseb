import { BrowserRouter, Route, Routes } from 'react-router-dom';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import CommandPalette from './components/CommandPalette';
import ContextCursor from './components/ContextCursor';
import { AuthProvider } from './lib/auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import EventDetail from './pages/EventDetail';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';
import Register from './pages/Register';
import Registrations from './pages/Registrations';
import Media from './pages/Media';

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
              <Route path="/registrations" element={<Registrations />} />
              <Route path="/registrations/:id" element={<EventDetail />} />
              <Route path="/media" element={<Media />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <SiteFooter />
        </div>
        <CommandPalette />
        <ContextCursor />
      </AuthProvider>
    </BrowserRouter>
  );
}