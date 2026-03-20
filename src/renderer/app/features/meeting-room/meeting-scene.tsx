import { useState, useEffect } from 'react';
import type { ReviewerConfig, ManagerConfig, LLMProvider } from '../../../../shared/types';
import idleSheet from '../../../assets/sprites/robot/Idle.png';
import styles from './meeting-scene.module.css';

const SHEET_W = 3414;
const SHEET_H = 3654;
const COLS = 5;
const CELL = SHEET_W / COLS;

const MGR_SIZE = 150;
const MGR_SCALE = MGR_SIZE / CELL;
const MGR_BG_W = Math.round(SHEET_W * MGR_SCALE);
const MGR_BG_H = Math.round(SHEET_H * MGR_SCALE);

const REV_SIZE = 100;
const REV_SCALE = REV_SIZE / CELL;
const REV_BG_W = Math.round(SHEET_W * REV_SCALE);
const REV_BG_H = Math.round(SHEET_H * REV_SCALE);

const PROVIDER_HUE: Record<LLMProvider, number> = {
  'claude-cli': 20,
  'codex-cli': 280,
  'gemini-cli': 200,
};

function useFrameCycle(fps: number): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (fps <= 0) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % COLS), 1000 / fps);
    return () => clearInterval(id);
  }, [fps]);
  return frame;
}

function useBob(active: boolean): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!active) return;
    let t = 0;
    const id = setInterval(() => {
      t += 0.15;
      setOffset(Math.sin(t) * 3);
    }, 50);
    return () => clearInterval(id);
  }, [active]);
  return active ? offset : 0;
}

type ManagerRobotProps = {
  manager: ManagerConfig;
  bubbleText: string;
  loading: boolean;
};

function ManagerRobot({ manager, bubbleText, loading }: ManagerRobotProps) {
  const frame = useFrameCycle(5);
  const bob = useBob(true);
  const hue = PROVIDER_HUE[manager.provider] ?? 0;

  const bgPosX = -frame * MGR_SIZE;
  const bgPosY = 0;

  return (
    <div className={styles.managerStation}>
      <div className={styles.managerBubble}>
        {loading ? 'Presenting summary\u2026' : bubbleText}
      </div>
      <div
        className={styles.managerSprite}
        style={{
          backgroundImage: `url(${idleSheet})`,
          backgroundSize: `${MGR_BG_W}px ${MGR_BG_H}px`,
          backgroundPosition: `${bgPosX}px ${bgPosY}px`,
          filter: `hue-rotate(${hue}deg)`,
          transform: `translateY(${bob}px)`,
        }}
      />
      <div className={styles.desk} />
      <span className={styles.managerLabel}>Manager</span>
      <span className={styles.providerBadge}>{{ 'claude-cli': 'Claude', 'codex-cli': 'Codex', 'gemini-cli': 'Gemini' }[manager.provider]}</span>
    </div>
  );
}

type ReviewerRobotProps = {
  config: ReviewerConfig;
};

function ReviewerRobot({ config }: ReviewerRobotProps) {
  const frame = useFrameCycle(2);
  const hue = PROVIDER_HUE[config.provider] ?? 0;

  const bgPosX = -frame * REV_SIZE;
  const bgPosY = 0;

  return (
    <div className={styles.reviewerStation}>
      <div
        className={styles.reviewerSprite}
        style={{
          backgroundImage: `url(${idleSheet})`,
          backgroundSize: `${REV_BG_W}px ${REV_BG_H}px`,
          backgroundPosition: `${bgPosX}px ${bgPosY}px`,
          filter: `hue-rotate(${hue}deg)`,
        }}
      />
      <div className={styles.desk} />
      <span className={styles.reviewerLabel}>{config.role}</span>
      <span className={styles.providerBadge}>{{ 'claude-cli': 'Claude', 'codex-cli': 'Codex', 'gemini-cli': 'Gemini' }[config.provider]}</span>
    </div>
  );
}

type Props = {
  reviewers: ReviewerConfig[];
  manager: ManagerConfig;
  summarySnippet: string;
  loading: boolean;
  managerDrafting?: boolean;
};

export function MeetingScene({ reviewers, manager, summarySnippet, loading, managerDrafting }: Props) {
  const half = Math.ceil(reviewers.length / 2);
  const leftReviewers = reviewers.slice(0, half);
  const rightReviewers = reviewers.slice(half);

  return (
    <div className={styles.scene} role="img" aria-label="Meeting room with manager robot presenting and reviewer robots watching">
      <span className={styles.sceneLabel}>Meeting Room</span>
      <div className={styles.room}>
        <ManagerRobot manager={manager} bubbleText={managerDrafting ? 'Thinking\u2026' : summarySnippet} loading={loading || !!managerDrafting} />
        <div className={styles.reviewerRow}>
          {leftReviewers.map((r) => (
            <ReviewerRobot key={r.id} config={r} />
          ))}
          {rightReviewers.map((r) => (
            <ReviewerRobot key={r.id} config={r} />
          ))}
        </div>
      </div>
    </div>
  );
}
