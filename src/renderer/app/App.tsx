import { useState, useCallback, useRef } from 'react';
import { Shell } from './layout/shell';
import { SetupScreen } from './features/setup';
import { LiveReviewScreen } from './features/live-review';
import { MeetingRoomScreen } from './features/meeting-room';
import type { ReviewSession } from '../../shared/types';

export type Screen = 'setup' | 'live-review' | 'meeting-room';

export function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [activeSession, setActiveSession] = useState<ReviewSession | null>(null);
  const setupSubmitRef = useRef<(() => void) | null>(null);

  const handleStart = useCallback((session: ReviewSession) => {
    setActiveSession(session);
    setScreen('live-review');
  }, []);

  const handleResumeSession = useCallback((session: ReviewSession) => {
    setActiveSession(session);
    const dest: Screen =
      session.status === 'completed' || session.status === 'meeting'
        ? 'meeting-room'
        : 'live-review';
    setScreen(dest);
  }, []);

  const handleNewReview = useCallback(() => {
    setActiveSession(null);
    setScreen('setup');
  }, []);

  const handleExportMarkdown = useCallback(() => {
    if (activeSession) window.api.export.markdown(activeSession.id);
  }, [activeSession]);

  const handleExportJSON = useCallback(() => {
    if (activeSession) window.api.export.json(activeSession.id);
  }, [activeSession]);

  const handleStopReview = useCallback(() => {
    if (activeSession) window.api.review.stop(activeSession.id);
  }, [activeSession]);

  const handleStartReview = useCallback(() => {
    setupSubmitRef.current?.();
  }, []);

  return (
    <Shell
      screen={screen}
      onNavigate={setScreen}
      onExportMarkdown={handleExportMarkdown}
      onExportJSON={handleExportJSON}
      onStopReview={handleStopReview}
      onStartReview={handleStartReview}
    >
      {screen === 'setup' && (
        <SetupScreen onStart={handleStart} onResumeSession={handleResumeSession} submitRef={setupSubmitRef} />
      )}
      {screen === 'live-review' && (
        <LiveReviewScreen
          session={activeSession}
          onMeetingRoom={() => setScreen('meeting-room')}
        />
      )}
      {screen === 'meeting-room' && (
        <MeetingRoomScreen
          session={activeSession}
          onBack={() => setScreen('live-review')}
          onNewReview={handleNewReview}
        />
      )}
    </Shell>
  );
}
