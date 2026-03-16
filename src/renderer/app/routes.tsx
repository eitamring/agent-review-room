import type { Screen } from './App';

export type Route = {
  id: Screen;
  label: string;
  shortcut: string;
};

export const ROUTES: Route[] = [
  { id: 'setup', label: 'Setup', shortcut: '1' },
  { id: 'live-review', label: 'Live Review', shortcut: '2' },
  { id: 'meeting-room', label: 'Meeting Room', shortcut: '3' },
];
