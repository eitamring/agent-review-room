import fs from 'fs/promises';
import path from 'path';
import type { Finding } from '../../shared/types';
import { resolveSessionPath } from './session-paths';

class FindingsStore {
  private async findingsFile(sessionId: string): Promise<string> {
    return resolveSessionPath(sessionId, 'findings.json');
  }

  async write(sessionId: string, findings: Finding[]): Promise<void> {
    const filePath = await this.findingsFile(sessionId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(findings, null, 2), 'utf-8');
  }

  async read(sessionId: string): Promise<Finding[]> {
    try {
      const data = await fs.readFile(await this.findingsFile(sessionId), 'utf-8');
      return JSON.parse(data) as Finding[];
    } catch {
      return [];
    }
  }
}

export const findingsStore = new FindingsStore();
