import styles from './code-block.module.css';

type CodeBlockProps = {
  code: string;
  language?: string;
  filePath?: string;
  startLine?: number;
};

export function CodeBlock({ code, language, filePath, startLine = 1 }: CodeBlockProps) {
  const lines = code.split('\n');
  return (
    <figure className={styles.figure}>
      {filePath && (
        <figcaption className={styles.caption}>
          <code>{filePath}</code>
        </figcaption>
      )}
      <pre
        className={styles.pre}
        data-language={language}
        aria-label={filePath ? `Code from ${filePath}` : 'Code block'}
      >
        <code className={styles.code}>
          {lines.map((line, i) => (
            <span key={i} className={styles.line}>
              <span className={styles.lineNumber} aria-hidden="true">
                {startLine + i}
              </span>
              <span className={styles.lineContent}>{line}</span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
