import { useEffect, useState } from 'react';
import { Preloader } from '../../../design/identity/Preloader';

const KEY = 'nsdc:seen-preloader';

/**
 * The kit preloader runs once per browser session. Internal navigation never
 * replays it because this gate lives at the app root; a later reload skips it
 * too, so returning readers go straight to the page.
 */
export default function PreloaderGate() {
  const [show] = useState(() => {
    try {
      return !sessionStorage.getItem(KEY);
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!show) return;
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      // Private mode: the preloader may run again; harmless.
    }
  }, [show]);

  if (!show) return null;
  return <Preloader />;
}
