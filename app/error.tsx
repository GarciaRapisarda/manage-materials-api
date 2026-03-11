"use client";

import { ErrorDisplay } from "@/components/ErrorDisplay/ErrorDisplay";
import styles from "./page.module.css";

export default function MaterialsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Administración de Materiales</h1>
      </header>
      <ErrorDisplay message={error.message} />
      <button onClick={reset} className={styles.retry}>
        Reintentar
      </button>
    </main>
  );
}
