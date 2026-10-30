import { Suspense, lazy } from 'react';
import type { AnchorHTMLAttributes } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from '../../design/chrome/Header';
import { Footer } from '../../design/chrome/Footer';
import { PageScene } from '../../design/motifs/PageScene';
import { motifFor } from '../../design/motifs/motifs';
import { CursorLayer, RoomLayer } from './components/SceneLayer';
import HeaderActions from './components/HeaderActions';
import PreloaderGate from './components/PreloaderGate';
import AnnouncementBanner from './components/AnnouncementBanner';
import CommandPalette from './components/CommandPalette';
import ErrorBoundary from './components/ErrorBoundary';
import EasterEggs from './components/EasterEggs';
import HashScroll from './components/HashScroll';
import './a11y-eggs.css';
import { AuthProvider } from './lib/auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AdminDoor from './pages/AdminDoor';
import NotFound from './pages/NotFound';
import Register from './pages/Register';
import VerifyPending from './pages/VerifyPending';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';
import Registrations from './pages/Registrations';

const EventDetail = lazy(() => import('./pages/EventDetail'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Archive = lazy(() => import('./pages/Archive'));
const Projects = lazy(() => import('./pages/Projects'));
const Recruit = lazy(() => import('./pages/Recruit'));

const NAV = [
  { label: 'Events', href: '/registrations' },
  { label: 'Archive', href: '/archive' },
  { label: 'Projects', href: '/projects' },
  { label: 'Recruit', href: '/recruit' },
];

const CLUB = {
  name: 'NSDC — National Student Data Corps',
  chapter: 'Amrita Vishwa Vidyapeetham, Bengaluru',
  email: 'nsdcaseb@gmail.com',
  instagram: 'nsdc_avvb',
  linkedin: 'nsdc-avv-b',
  discord: 'https://discord.gg/XeGgzAu93Z',
  founded: 'August 2024',
  foundedISO: '2024-08-01',
  location: 'Bengaluru, IN',
};

/** The kit renders plain anchors; the host supplies the router link. */
function RouterLink({ href, ...props }: { href: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <Link to={href} {...props} />;
}

function Shell() {
  const { pathname } = useLocation();
  const admin = pathname.startsWith('/admin');
  const motif = motifFor(pathname);

  return (
    <>
      {pathname === '/' ? (
        <RoomLayer />
      ) : admin ? null : (
        <PageScene motif={motif} />
      )}

      <div className="relative z-10 flex min-h-screen flex-col">
        <Header
          nav={NAV}
          pathname={pathname}
          dossier="INSIDE · NSDC AMRITA BENGALURU · IST"
          actions={<HeaderActions />}
          linkComponent={RouterLink}
        />
        <AnnouncementBanner />
        <main id="main" tabIndex={-1} className="flex-1">
          <ErrorBoundary>
            {/* Reserve a viewport of height while a lazy route loads. A
                one-line fallback puts the footer at the viewport bottom, and
                the route then pushes it down — measured as CLS 0.36 on
                desktop /recruit. Same box as the page shells (py-12). */}
            <Suspense fallback={<div className="wrap min-h-[100svh] py-12 mono text-quiet">Loading…</div>}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/verify-pending" element={<VerifyPending />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/registrations" element={<Registrations />} />
                <Route path="/registrations/:id" element={<EventDetail />} />
                <Route path="/archive" element={<Archive />} />
                {/* Media page was merged into the archive. */}
                <Route path="/media" element={<Navigate to="/archive" replace />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/recruit" element={<Recruit />} />
                <Route path="/admin" element={<AdminDoor />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
        <Footer club={CLUB} />
      </div>

      <HashScroll />
      <CommandPalette />
      <EasterEggs />
      <CursorLayer />
      <PreloaderGate />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
