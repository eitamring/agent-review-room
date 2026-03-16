import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import type { Finding } from '../../shared/types';

const sessionsDir = () => path.join(app.getPath('userData'), 'sessions');

class FindingsStore {
  private findingsFile(sessionId: string): string {
    return path.join(sessionsDir(), sessionId, 'findings.json');
  }

  async write(sessionId: string, findings: Finding[]): Promise<void> {
    const filePath = this.findingsFile(sessionId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(findings, null, 2), 'utf-8');
  }

  async read(sessionId: string): Promise<Finding[]> {
    try {
      const data = await fs.readFile(this.findingsFile(sessionId), 'utf-8');
      return JSON.parse(data) as Finding[];
    } catch {
      return [];
    }
  }
}

export const findingsStore = new FindingsStore();
