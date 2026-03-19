import { useMemo, useState, useEffect, useRef } from 'react';
import type { AgentState, LLMProvider } from '../../../../shared/types';
import idleSheet from '../../../assets/sprites/robot/Idle.png';
import walkSheet from '../../../assets/sprites/robot/Walk.png';
import runSheet from '../../../assets/sprites/robot/Walk02.png';
import jumpSheet from '../../../assets/sprites/robot/Jump.png';
import styles from './pixel-agent.module.css';

const SIZE = 200;
const SHEET_W = 3414;
const SHEET_H = 3654;
const COLS = 5;
const CELL = SHEET_W / COLS;
const SCALE = SIZE / CELL;
const BG_W = Math.round(SHEET_W * SCALE);
const BG_H = Math.round(SHEET_H * SCALE);
const ROW_H = Math.round(BG_H / COLS);
const WANDER_RANGE = 40;

type Props = {
  color: string;
  role: string;
  state: AgentState | null;
  statusText: string;
  label: string;
  provider: LLMProvider;
};

type Cfg = { sheet: string; row: number; fps: number; speed: number };

const STATE_MAP: Record<string, Cfg> = {
  planning:  { sheet: idleSheet, row: 0, fps: 2,  speed: 0 },
  reading:   { sheet: walkSheet, row: 0, fps: 6,  speed: 1.5 },
  searching: { sheet: runSheet,  row: 0, fps: 10, speed: 2.5 },
  comparing: { sheet: walkSheet, row: 1, fps: 5,  speed: 1.0 },
  drafting:  { sheet: idleSheet, row: 1, fps: 3,  speed: 0 },
  blocked:   { sheet: jumpSheet, row: 0, fps: 6,  speed: 0 },
  done:      { sheet: idleSheet, row: 0, fps: 1,  speed: 0 },
};
const DEFAULT_CFG: Cfg = { sheet: idleSheet, row: 0, fps: 2, speed: 0 };

const PROVIDER_HUE: Record<string, number> = {
  'claude-cli': 20,
  'codex-cli': 280,
  'gemini-cli': 200,
};

function providerHue(provider: LLMProvider): number {
  return PROVIDER_HUE[provider] ?? 0;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '\u2026';
}

export function PixelAgent({ color: _color, role, state, statusText, label, provider }: Props) {
  const cfg = state ? (STATE_MAP[state] ?? DEFAULT_CFG) : DEFAULT_CFG;
  const hue = useMemo(() => providerHue(provider), [provider]);

  const [frame, setFrame] = useState(0);
  const [posX, setPosX] = useState(0);
  const [facingLeft, setFacingLeft] = useState(false);
  const [paused, setPaused] = useState(false);
  const targetRef = useRef(0);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Frame cycling
  useEffect(() => {
    if (cfg.fps <= 0) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % COLS), 1000 / cfg.fps);
    return () => clearInterval(id);
  }, [cfg.fps]);

  // Wandering: pick random targets, walk toward them, pause, repeat
  useEffect(() => {
    if (cfg.speed <= 0) { setPosX(0); setPaused(false); return; }

    const pickTarget = () => {
      targetRef.current = (Math.random() - 0.5) * 2 * WANDER_RANGE;
    };
    pickTarget();

    const id = setInterval(() => {
      if (paused) return;

      setPosX((x) => {
        const target = targetRef.current;
        const diff = target - x;

        if (Math.abs(diff) < 1) {
          // Arrived — pause briefly then pick new target
          setPaused(true);
          clearTimeout(pauseTimerRef.current);
          pauseTimerRef.current = setTimeout(() => {
            pickTarget();
            setPaused(false);
          }, 800 + Math.random() * 1500);
          return x;
        }

        const step = Math.sign(diff) * Math.min(cfg.speed, Math.abs(diff));
        setFacingLeft(diff < 0);
        return x + step;
      });
    }, 30);

    return () => {
      clearInterval(id);
      clearTimeout(pauseTimerRef.current);
    };
  }, [cfg.speed, paused]);

  const bgPosX = -frame * SIZE;
  const bgPosY = -(cfg.row * ROW_H);
  const bubbleText = truncate(label || statusText, 50);
  const isIdle = paused || cfg.speed <= 0;

  // When paused, show idle sheet; when walking, show the configured sheet
  const activeSheet = isIdle && cfg.speed > 0 ? idleSheet : cfg.sheet;

  return (
    <div className={styles.station} aria-label={`${role}: ${statusText}`}>
      {state === 'blocked' && (
        <div className={styles.alertBubble} aria-label="Needs permission">!</div>
      )}

      {bubbleText && (
        <div className={styles.speechBubble} title={label || statusText}>
          {bubbleText}
        </div>
      )}

      <div
        className={styles.sprite}
        style={{
          backgroundImage: `url(${activeSheet})`,
          backgroundSize: `${BG_W}px ${BG_H}px`,
          backgroundPosition: `${bgPosX}px ${bgPosY}px`,
          filter: `hue-rotate(${hue}deg)`,
          transform: `translateX(${posX}px)${facingLeft ? ' scaleX(-1)' : ''}`,
        }}
      />

      <div className={styles.desk} />
      <span className={styles.label}>{role}</span>
      <span className={styles.status}>{statusText}</span>

      <span className={styles.providerBadge}>{{ 'claude-cli': 'Claude', 'codex-cli': 'Codex', 'gemini-cli': 'Gemini' }[provider]}</span>
    </div>
  );
}
