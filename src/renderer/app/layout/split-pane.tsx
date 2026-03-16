import type { ReactNode } from 'react';
import styles from './split-pane.module.css';

type SplitPaneProps = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  leftWidth?: number;
  rightWidth?: number;
};

export function SplitPane({
  left,
  center,
  right,
  leftWidth = 240,
  rightWidth = 320,
}: SplitPaneProps) {
  return (
    <div className={styles.container}>
      <aside
        className={styles.left}
        style={{ width: leftWidth }}
        aria-label="Reviewer roster"
      >
        {left}
      </aside>
      <div className={styles.center}>{center}</div>
      <aside
        className={styles.right}
        style={{ width: rightWidth }}
        aria-label="Detail inspector"
      >
        {right}
      </aside>
    </div>
  );
}
