export type AllowedCommand = {
  executable: string;
  description: string;
  readOnly: boolean;
};

export const DEFAULT_ALLOWED_COMMANDS: AllowedCommand[] = [
  { executable: 'git', description: 'Git read-only operations', readOnly: true },
];

const SAFE_GIT_SUBCOMMANDS = new Set([
  'diff',
  'log',
  'show',
  'status',
  'branch',
  'tag',
  'rev-parse',
  'for-each-ref',
  'ls-files',
  'blame',
  'shortlog',
]);

export function isCommandAllowed(executable: string): boolean {
  return DEFAULT_ALLOWED_COMMANDS.some((c) => c.executable === executable);
}

export function isCommandReadOnly(executable: string): boolean {
  return DEFAULT_ALLOWED_COMMANDS.some(
    (c) => c.executable === executable && c.readOnly,
  );
}

export function isGitSubcommandSafe(args: string[]): boolean {
  const subcommand = args[0];
  if (!subcommand) return false;
  return SAFE_GIT_SUBCOMMANDS.has(subcommand);
}
