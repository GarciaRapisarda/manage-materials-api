"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "@/lib/auth";
import { deleteMaterial } from "@/services/materials";
import { formatDate, formatPrice } from "@/lib/formatters";
import styles from "./DuplicateReviewView.module.css";

type ReviewMember = {
  id: string;
  name: string;
  price: number;
  updatedAt: string;
};

type ReviewGroup = {
  source: "mechanical" | "llm";
  keepId: string;
  deleteIds: string[];
  names: string[];
  members?: ReviewMember[];
};

type ReviewFile = {
  generatedAt: string;
  materialCount: number;
  mechanicalGroupCount: number;
  llmConfirmedCount: number;
  skippedDifferent: number;
  skippedUnsure: number;
  deleteCount: number;
  groups: ReviewGroup[];
};

type MaterialInfo = { name: string; price: number; updatedAt: string };

type ResolvedGroup = ReviewGroup & { keepId: string; deleteIds: string[] };

export function DuplicateReviewView() {
  const router = useRouter();
  const [review, setReview] = useState<ReviewFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "mechanical" | "llm">("all");
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const reviewRes = await fetch("/api/duplicate-review");
        const reviewJson = (await reviewRes.json()) as ReviewFile & { error?: string };
        if (!reviewRes.ok) {
          throw new Error(reviewJson.error ?? "No se pudo leer la revisión");
        }
        if (cancelled) return;
        setReview(reviewJson);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al cargar la revisión");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const groups = useMemo(() => {
    if (!review) return [];
    const source =
      filter === "all" ? review.groups : review.groups.filter((group) => group.source === filter);
    return source.map((group) => resolveByLatestUpdate(group));
  }, [review, filter]);

  const selectedDeleteIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      for (const id of memberIds(group)) {
        if (markedForDelete(group, id, overrides)) ids.push(id);
      }
    }
    return ids;
  }, [groups, overrides]);

  function toggle(id: string) {
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function info(group: ReviewGroup, id: string, fallback: string): MaterialInfo {
    const member = group.members?.find((item) => item.id === id);
    return member ?? { name: fallback, price: 0, updatedAt: "" };
  }

  async function handleDelete() {
    const token = getStoredToken();
    if (!token || selectedDeleteIds.length === 0) return;
    const confirmed = window.confirm(
      `¿Eliminar ${selectedDeleteIds.length} materiales? Los que queden sin marcar se conservan.`
    );
    if (!confirmed) return;
    setDeleting(true);
    setResult(null);
    const concurrency = 8;
    let next = 0;
    let deleted = 0;
    let failed: string | null = null;
    const ids = selectedDeleteIds;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next < ids.length && !failed) {
          const id = ids[next++];
          try {
            await deleteMaterial(id, token);
            deleted++;
            if (deleted % 50 === 0 || deleted === ids.length) {
              setProgress(`Eliminando ${deleted}/${ids.length}...`);
            }
          } catch {
            failed = id;
          }
        }
      })
    );
    setDeleting(false);
    setProgress(null);
    setResult(
      failed
        ? `Se eliminaron ${deleted}. Falló el id ${failed}.`
        : `Se eliminaron ${deleted} materiales.`
    );
    if (!failed) {
      await fetch("/api/duplicate-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletedIds: ids }),
      });
      setReview((prev) => (prev ? dropDeleted(prev, ids) : prev));
      setOverrides(new Set());
    }
  }

  if (loading) {
    return <p className={styles.status}>Cargando revisión...</p>;
  }
  if (error || !review) {
    return <p className={styles.error}>{error ?? "Sin revisión"}</p>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Revisión de duplicados</h1>
          <p className={styles.subtitle}>
            {review.materialCount.toLocaleString("es-AR")} materiales ·{" "}
            {review.groups.length} grupos · {review.deleteCount} para eliminar ·{" "}
            {review.skippedDifferent} descartados por el modelo · {review.skippedUnsure} en duda.
            El más reciente arranca sin marcar; podés cambiar cuál se conserva.
          </p>
        </div>
        <a href="/" className={styles.link}>
          Volver al listado
        </a>
      </header>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={filter === "all" ? styles.filterOn : styles.filter}
          onClick={() => setFilter("all")}
        >
          Todos ({review.groups.length})
        </button>
        <button
          type="button"
          className={filter === "mechanical" ? styles.filterOn : styles.filter}
          onClick={() => setFilter("mechanical")}
        >
          Mecánicos ({review.mechanicalGroupCount})
        </button>
        <button
          type="button"
          className={filter === "llm" ? styles.filterOn : styles.filter}
          onClick={() => setFilter("llm")}
        >
          Modelo ({review.llmConfirmedCount})
        </button>
        <button
          type="button"
          className={styles.deleteBtn}
          disabled={deleting || selectedDeleteIds.length === 0}
          onClick={() => void handleDelete()}
        >
          Eliminar {selectedDeleteIds.length} marcados
        </button>
      </div>
      {progress && <p className={styles.status}>{progress}</p>}
      {result && <p className={styles.status}>{result}</p>}
      <ul className={styles.groups}>
        {groups.map((group) => {
          const ids = memberIds(group).sort((a, b) => {
            const mark = Number(markedForDelete(group, a, overrides)) - Number(markedForDelete(group, b, overrides));
            if (mark !== 0) return mark;
            return updatedTime(group, b) - updatedTime(group, a);
          });
          return (
            <li key={`${group.source}-${memberIds(group).slice().sort().join("-")}`} className={styles.group}>
              <p className={styles.badge}>
                {group.source === "mechanical" ? "Mecánico" : "Modelo"}
              </p>
              {ids.map((id) => {
                const marked = markedForDelete(group, id, overrides);
                return (
                  <Row
                    key={id}
                    role={marked ? "Se elimina" : "Se conserva"}
                    id={id}
                    item={info(group, id, id)}
                    checked={marked}
                    onToggle={() => toggle(id)}
                  />
                );
              })}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function memberIds(group: ReviewGroup) {
  return [group.keepId, ...group.deleteIds];
}

function updatedTime(group: ReviewGroup, id: string) {
  const raw = group.members?.find((member) => member.id === id)?.updatedAt ?? "";
  return new Date(raw || 0).getTime();
}

function markedForDelete(group: ResolvedGroup, id: string, overrides: Set<string>) {
  const suggested = group.deleteIds.includes(id);
  return overrides.has(id) ? !suggested : suggested;
}

function dropDeleted(review: ReviewFile, deletedIds: string[]): ReviewFile {
  const deleted = new Set(deletedIds);
  const groups = review.groups.flatMap((group) => {
    const remaining = memberIds(group).filter((id) => !deleted.has(id));
    if (remaining.length < 2) return [];
    const members = group.members?.filter((member) => !deleted.has(member.id));
    const keepId = remaining.includes(group.keepId)
      ? group.keepId
      : [...remaining].sort((a, b) => updatedTime(group, b) - updatedTime(group, a))[0];
    return [{
      ...group,
      keepId,
      deleteIds: remaining.filter((id) => id !== keepId),
      members,
    }];
  });
  return {
    ...review,
    groups,
    mechanicalGroupCount: groups.filter((group) => group.source === "mechanical").length,
    llmConfirmedCount: groups.filter((group) => group.source === "llm").length,
    deleteCount: groups.reduce((sum, group) => sum + group.deleteIds.length, 0),
  };
}

function resolveByLatestUpdate(group: ReviewGroup): ResolvedGroup {
  const ids = [group.keepId, ...group.deleteIds];
  const updatedAt = (id: string) => group.members?.find((member) => member.id === id)?.updatedAt ?? "";
  const keepId = [...ids].sort((a, b) => {
    const ta = new Date(updatedAt(a) || 0).getTime();
    const tb = new Date(updatedAt(b) || 0).getTime();
    if (tb !== ta) return tb - ta;
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b, undefined, { numeric: true });
  })[0];
  return {
    ...group,
    keepId,
    deleteIds: ids.filter((id) => id !== keepId),
  };
}

function Row({
  role,
  id,
  item,
  checked,
  onToggle,
}: {
  role: string;
  id: string;
  item: MaterialInfo;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={role === "Se conserva" ? styles.keep : styles.remove}>
      <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Eliminar ${id}`} />
      <span className={styles.role}>{role}</span>
      <span className={styles.id}>{id}</span>
      <span className={styles.name}>{item.name}</span>
      <span className={styles.price}>{item.price ? formatPrice(item.price) : "—"}</span>
      <span className={styles.date}>{item.updatedAt ? formatDate(item.updatedAt) : "—"}</span>
    </div>
  );
}
