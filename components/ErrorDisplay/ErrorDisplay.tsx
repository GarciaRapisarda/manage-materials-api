import styles from "./ErrorDisplay.module.css";

interface ErrorDisplayProps {
  message: string;
}

export function ErrorDisplay({ message }: ErrorDisplayProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.icon}>⚠</div>
      <h2 className={styles.title}>Error al cargar</h2>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
