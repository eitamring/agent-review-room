import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { Screen } from '../App';
import { ROUTES } from '../routes';
import styles from './shell.module.css';

type ShellProps = {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  onExportMarkdown?: () => void;
  onExportJSON?: () => void;
  onStopReview?: () => void;
  onStartReview?: () => void;
  children: ReactNode;
};

export function Shell({ screen, onNavigate, onExportMarkdown, onExportJSON, onStopReview, onStartReview, children }: ShellProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 'Enter' && screen === 'setup') {
        e.preventDefault();
        onStartReview?.();
        return;
      }

      if (mod && e.shiftKey && e.key.toLowerCase() === 'e' && screen === 'meeting-room') {
        e.preventDefault();
        onExportJSON?.();
        return;
      }

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'e' && screen === 'meeting-room') {
        e.preventDefault();
        onExportMarkdown?.();
        return;
      }

      if (e.key === 'Escape' && screen === 'live-review') {
        e.preventDefault();
        onStopReview?.();
        return;
      }

      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onNavigate('setup');
        return;
      }

      if (inField) return;
      const route = ROUTES.find((r) => r.shortcut === e.key);
      if (route) onNavigate(route.id);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onNavigate, onExportMarkdown, onExportJSON, onStopReview, onStartReview, screen]);

  return (
    <div className={styles.shell}>
      <header className={styles.header} role="banner">
        <span className={styles.wordmark} aria-label="Agent Review Room">
          Agent Review Room
        </span>
        <nav className={styles.nav} aria-label="Main navigation">
          {ROUTES.map((route) => (
            <button
              key={route.id}
              type="button"
              className={`${styles.navItem} ${screen === route.id ? styles.active : ''}`}
              onClick={() => onNavigate(route.id)}
              aria-current={screen === route.id ? 'page' : undefined}
              title={`${route.label} (${route.shortcut})`}
            >
              {route.label}
            </button>
          ))}
        </nav>
      </header>
      <main className={styles.main} role="main" id="main-content">
        {children}
      </main>
    </div>
  );
}
