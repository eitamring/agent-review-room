import type { ReviewerConfig, AgentState } from '../../../../shared/types';
import { PixelAgent } from './pixel-agent';
import styles from './room-scene.module.css';

type AgentInfo = { state: AgentState; label: string };

type Props = {
  reviewers: ReviewerConfig[];
  agentStates: Map<string, AgentInfo>;
};

export function RoomScene({ reviewers, agentStates }: Props) {
  return (
    <div className={styles.scene} role="img" aria-label="Review room with robot agent characters">
      <span className={styles.sceneLabel}>Review Room</span>
      <div className={styles.room}>
        <div className={styles.agents}>
          {reviewers.map((r) => {
            const info = agentStates.get(r.id);
            return (
              <PixelAgent
                key={r.id}
                color={r.colorToken}
                role={r.role}
                state={info?.state ?? null}
                statusText={info ? `${info.state} — ${info.label}` : 'queued'}
                label={info?.label ?? ''}
                provider={r.provider}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
