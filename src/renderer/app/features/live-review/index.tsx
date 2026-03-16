import { useEffect, useRef, useState, useCallback, useDeferredValue } from 'react';
import type { ReviewSession, ReviewEvent, Finding, AgentState } from '../../../../shared/types';
import type { PermissionRequest } from '../../../../preload/api';
import { SplitPane } from '../../layout/split-pane';
import { Badge } from '../../components/badge';
import { CodeBlock } from '../../components/code-block';
import { Dialog } from '../../components/dialog';
import { RoomScene } from './room-scene';
import styles from './live-review.module.css';

type Props = {
  session: ReviewSession | null;
  onMeetingRoom: () => void;
};

type AgentInfo = { state: AgentState; label: string };

type ActivityItem = { agentId: string; text: string; at: string };

const ERROR_PATTERN = /error:|failed:|parse error:/i;

function isErrorActivity(text: string): boolean {
  return ERROR_PATTERN.test(text);
}

function FindingDetail({ finding, onBack }: { finding: Finding; onBack: () => void }) {
  return (
    <div className={styles.inspector}>
      <button type="button" className={styles.backBtn} onClick={onBack}>
        &larr; Back to findings
      </button>
      <div className={styles.detailBadges}>
        <Badge
          label={finding.severity}
          variant={finding.severity === 'critical' || finding.severity === 'high' ? 'danger' : finding.severity === 'medium' ? 'warning' : 'neutral'}
        />
        <Badge label={`confidence: ${finding.confidence}`} variant="info" />
      </div>
      <h3 className={styles.detailTitle}>{finding.title}</h3>
      <p className={styles.detailSummary}>{finding.summary}</p>

      {finding.evidence.length > 0 && (
        <>
          <div className={styles.detailSectionLabel}>Evidence</div>
          <div className={styles.evidenceList}>
            {finding.evidence.map((ev, i) => (
              <CodeBlock
                key={i}
                code={ev.excerpt ?? ''}
                filePath={ev.path}
                startLine={ev.line ?? 1}
              />
            ))}
          </div>
        </>
      )}

      <div className={styles.detailSectionLabel}>Recommendation</div>
      <p className={styles.recommendation}>{finding.recommendation}</p>
    </div>
  );
}

function ReviewerDetail({
  reviewer,
  agentInfo,
  activity,
  findings,
  onBack,
  onSelectFinding,
}: {
  reviewer: { id: string; role: string; colorToken: string };
  agentInfo: AgentInfo | undefined;
  activity: ActivityItem[];
  findings: Finding[];
  onBack: () => void;
  onSelectFinding: (id: string) => void;
}) {
  const reviewerActivity = activity.filter((a) => a.agentId === reviewer.id);

  return (
    <div className={styles.inspector}>
      <button type="button" className={styles.backBtn} onClick={onBack}>
        &larr; Back to findings
      </button>
      <div className={styles.detailBadges}>
        <span className={styles.dot} style={{ background: reviewer.colorToken }} />
        <Badge label={reviewer.role} variant="info" />
      </div>
      <h3 className={styles.detailTitle}>{reviewer.role}</h3>
      <p className={styles.reviewerDetailState}>
        {agentInfo ? `${agentInfo.state} — ${agentInfo.label}` : 'queued'}
      </p>

      {findings.length > 0 && (
        <>
          <div className={styles.detailSectionLabel}>Findings</div>
          <ul className={styles.findingList}>
            {findings.map((f) => (
              <li
                key={f.id}
                className={styles.findingItem}
                onClick={() => onSelectFinding(f.id)}
              >
                <Badge
                  label={f.severity}
                  variant={f.severity === 'critical' || f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'neutral'}
                />
                <span className={styles.findingTitle}>{f.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={styles.detailSectionLabel}>Activity</div>
      <div className={styles.reviewerDetailEvents}>
        {reviewerActivity.length === 0 && <p className={styles.muted}>No activity yet.</p>}
        {reviewerActivity.map((a, i) => (
          <div key={i} className={isErrorActivity(a.text) ? styles.noteItemError : styles.noteItem}>
            <span className={styles.noteText}>{a.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LiveReviewScreen({ session, onMeetingRoom }: Props) {
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [sessionStatus, setSessionStatus] = useState(session?.status ?? 'queued');
  const [permissionReq, setPermissionReq] = useState<PermissionRequest | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [selectedReviewerId, setSelectedReviewerId] = useState<string | null>(null);
  const deferredEvents = useDeferredValue(events);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!session) return;
    const poll = async () => {
      const [evts, fresh] = await Promise.all([
        window.api.events.get(session.id),
        window.api.session.get(session.id),
      ]);
      setEvents(evts);
      if (fresh) setSessionStatus(fresh.status);
    };
    poll();
    pollRef.current = setInterval(poll, 1200);
    return () => clearInterval(pollRef.current);
  }, [session]);

  useEffect(() => {
    return window.api.permissions.onRequest((req) => setPermissionReq(req));
  }, []);

  const respondToPermission = useCallback(
    (approved: boolean) => {
      if (!permissionReq) return;
      window.api.permissions.respond(permissionReq.requestId, approved);
      setPermissionReq(null);
    },
    [permissionReq],
  );

  const reviewerRole = permissionReq && session
    ? session.reviewers.find((r) => r.id === permissionReq.agentId)?.role ?? permissionReq.agentId
    : '';

  if (!session) {
    return <div className={styles.empty}><p>No active session. Go to Setup.</p></div>;
  }

  const agentStates = new Map<string, AgentInfo>();
  const activity: ActivityItem[] = [];
  const findings: Finding[] = [];
  const findingAgentMap = new Map<string, string>();

  for (const e of deferredEvents) {
    if (e.type === 'agent.status') {
      agentStates.set(e.agentId, { state: e.state, label: e.label });
      activity.push({ agentId: e.agentId, text: `[${e.state}] ${e.label}`, at: e.at });
    }
    if (e.type === 'agent.note') {
      activity.push({ agentId: e.agentId, text: e.note, at: e.at });
    }
    if (e.type === 'agent.focus') {
      activity.push({ agentId: e.agentId, text: `reading ${e.filePaths.join(', ')}`, at: e.at });
    }
    if (e.type === 'finding.draft' || e.type === 'finding.final') {
      findings.push(e.finding);
      findingAgentMap.set(e.finding.id, e.agentId);
      activity.push({ agentId: e.agentId, text: `finding: ${e.finding.title}`, at: e.at });
    }
    if (e.type === 'meeting.clustered') {
      activity.push({ agentId: 'manager', text: `clustered: ${e.title}`, at: e.at });
    }
    if (e.type === 'meeting.summary') {
      activity.push({ agentId: 'manager', text: 'summary written', at: e.at });
    }
  }

  const isDone = sessionStatus === 'completed';
  const isFailed = sessionStatus === 'failed';

  const lastErrorMessage = isFailed
    ? [...activity].reverse().find((a) => isErrorActivity(a.text))?.text
    : undefined;

  const selectedFinding = selectedFindingId
    ? findings.find((f) => f.id === selectedFindingId) ?? null
    : null;

  const selectedReviewer = selectedReviewerId
    ? session.reviewers.find((r) => r.id === selectedReviewerId) ?? null
    : null;

  function handleSelectFinding(id: string) {
    setSelectedFindingId(id);
    setSelectedReviewerId(null);
  }

  function handleSelectReviewer(id: string) {
    setSelectedReviewerId(id);
    setSelectedFindingId(null);
  }

  function handleBackToList() {
    setSelectedFindingId(null);
    setSelectedReviewerId(null);
  }

  function renderRightPane() {
    if (selectedFinding) {
      return <FindingDetail finding={selectedFinding} onBack={handleBackToList} />;
    }

    if (selectedReviewer) {
      const reviewerFindings = findings.filter((f) => findingAgentMap.get(f.id) === selectedReviewer.id);
      return (
        <ReviewerDetail
          reviewer={selectedReviewer}
          agentInfo={agentStates.get(selectedReviewer.id)}
          activity={activity}
          findings={reviewerFindings}
          onBack={handleBackToList}
          onSelectFinding={handleSelectFinding}
        />
      );
    }

    return (
      <div className={styles.inspector}>
        <h2 className={styles.inspectorTitle}>Findings ({findings.length})</h2>
        {findings.length === 0 ? (
          <p className={styles.muted}>No findings yet.</p>
        ) : (
          <ul className={styles.findingList}>
            {findings.map((f) => (
              <li
                key={f.id}
                className={styles.findingItem}
                onClick={() => handleSelectFinding(f.id)}
              >
                <Badge
                  label={f.severity}
                  variant={f.severity === 'critical' || f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'neutral'}
                />
                <span className={styles.findingTitle}>{f.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <SplitPane
        left={
          <div className={styles.roster}>
            <div className={styles.rosterHeader}>
              <span className={styles.rosterLabel}>Reviewers</span>
              <Badge
                label={isDone ? 'done' : isFailed ? 'failed' : 'running'}
                variant={isDone ? 'success' : isFailed ? 'danger' : 'info'}
              />
            </div>
            <ul className={styles.rosterList}>
              {session.reviewers.map((r) => {
                const info = agentStates.get(r.id);
                return (
                  <li
                    key={r.id}
                    className={
                      selectedReviewerId === r.id
                        ? styles.rosterItemSelected
                        : styles.rosterItem
                    }
                    onClick={() => handleSelectReviewer(r.id)}
                  >
                    <span className={styles.dot} style={{ background: r.colorToken }} />
                    <div className={styles.rosterText}>
                      <span className={styles.rosterRole}>{r.role}</span>
                      <span className={styles.rosterState}>
                        {info ? `${info.state} — ${info.label}` : 'queued'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        }
        center={
          <div className={styles.centerPane}>
            <RoomScene reviewers={session.reviewers} agentStates={agentStates} />
            <div className={styles.activity}>
              <h2 className={styles.activityTitle}>Activity</h2>
              <div className={styles.activityFeed} role="log" aria-live="polite">
                {isFailed && lastErrorMessage && (
                  <div className={styles.errorBanner}>
                    Review failed: {lastErrorMessage}
                  </div>
                )}
                {activity.length === 0 && <p className={styles.muted}>Waiting for activity…</p>}
                {activity.slice(-50).map((n, i) => (
                  <div
                    key={i}
                    className={isErrorActivity(n.text) ? styles.noteItemError : styles.noteItem}
                  >
                    <span className={styles.noteAgent}>{n.agentId}</span>
                    <span className={styles.noteText}>{n.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
        right={renderRightPane()}
      />
      <footer className={styles.footer}>
        <span className={styles.footerStatus}>
          {sessionStatus === 'running' && `${deferredEvents.length} events`}
          {sessionStatus === 'meeting' && 'Generating summary…'}
          {sessionStatus === 'completed' && 'Review complete'}
          {sessionStatus === 'failed' && 'Review failed'}
          {sessionStatus === 'queued' && 'Starting…'}
        </span>
        {isDone && (
          <button type="button" className={styles.meetingBtn} onClick={onMeetingRoom}>
            Meeting Room →
          </button>
        )}
        {sessionStatus === 'running' && (
          <button
            type="button"
            className={styles.stopBtn}
            onClick={() => window.api.review.stop(session.id)}
          >
            Stop Review
          </button>
        )}
      </footer>

      <Dialog
        open={permissionReq !== null}
        title="Permission Request"
        onClose={() => respondToPermission(false)}
      >
        {permissionReq && (
          <div className={styles.permissionBody}>
            <p className={styles.permissionAgent}>
              <strong>{reviewerRole}</strong> wants to run:
            </p>
            <pre className={styles.permissionCommand}>{permissionReq.command} {permissionReq.args.join(' ')}</pre>
            <div className={styles.permissionActions}>
              <button
                type="button"
                className={styles.denyBtn}
                onClick={() => respondToPermission(false)}
              >
                Deny
              </button>
              <button
                type="button"
                className={styles.approveBtn}
                onClick={() => respondToPermission(true)}
              >
                Approve
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
