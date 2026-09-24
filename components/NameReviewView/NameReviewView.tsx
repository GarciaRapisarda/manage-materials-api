"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "@/lib/auth";
import { formatDate, formatPrice } from "@/lib/formatters";
import { deleteMaterial, patchMaterial } from "@/services/materials";
import styles from "./NameReviewView.module.css";

type Member = { id: string; name: string; price: number; updatedAt: string };

type Group = {
  source: "mechanical" | "llm";
  keepId: string;
  deleteIds: string[];
  cleanName: string;
  members: Member[];
};

type ReviewFile = {
  generatedAt: string;
  materialCount: number;
  mechanicalGroupCount: number;
  llmConfirmedCount: number;
  skippedDifferent: number;
  skippedUnsure: number;
  deleteCount: number;
  groups: Group[];
};

export function NameReviewView() {
  const router = useRouter();
  const [review, setReview] = useState<ReviewFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "mechanical" | "llm">("all");
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
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
        const response = await fetch("/api/name-review");
        const json = (await response.json()) as ReviewFile & { error?: string };
        if (!response.ok) throw new Error(json.error ?? "No se pudo leer la revisión");
        if (!cancelled) setReview(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error al cargar la revisión");
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
    return filter === "all" ? review.groups : review.groups.filter((group) => group.source === filter);
  }, [review, filter]);

  function marked(group: Group, id: string) {
    const suggested = group.deleteIds.includes(id);
    return overrides.has(id) ? !suggested : suggested;
  }

  const selectedIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      for (const member of group.members) {
        if (marked(group, member.id)) ids.push(member.id);
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

  async function handleApply() {
    const token = getStoredToken();
    if (!token || !review || selectedIds.length === 0) return;
    const renames = groups.flatMap((group) => {
      const kept = group.members.filter((member) => !marked(group, member.id));
      if (kept.length !== 1) return [];
      const keeper = kept[0];
      if (keeper.name === group.cleanName) return [];
      return [{ id: keeper.id, name: group.cleanName }];
    });
    const confirmed = window.confirm(
      `¿Eliminar ${selectedIds.length} materiales y renombrar ${renames.length}? Los que queden sin marcar se conservan.`
    );
    if (!confirmed) return;
    setApplying(true);
    setResult(null);
    const concurrency = 8;
    let next = 0;
    let deleted = 0;
    let failed: string | null = null;
    const ids = selectedIds;
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
    let renamed = 0;
    if (!failed) {
      let renameNext = 0;
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (renameNext < renames.length && !failed) {
            const row = renames[renameNext++];
            try {
              await patchMaterial(row.id, { name: row.name }, token);
              renamed++;
              setProgress(`Renombrando ${renamed}/${renames.length}...`);
            } catch {
              failed = row.id;
            }
          }
        })
      );
    }
    setApplying(false);
    setProgress(null);
    setResult(
      failed
        ? `Se eliminaron ${deleted} y se renombraron ${renamed}. Falló el id ${failed}.`
        : `Se eliminaron ${deleted} materiales y se renombraron ${renamed}.`
    );
    if (!failed) {
      await fetch("/api/name-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletedIds: ids }),
      });
      setReview((prev) => {
        if (!prev) return prev;
        const deletedSet = new Set(ids);
        const nextGroups = prev.groups.flatMap((group) => {
          const members = group.members.filter((member) => !deletedSet.has(member.id));
          if (members.length < 2) return [];
          const keepId = members.some((member) => member.id === group.keepId) ? group.keepId : members[0].id;
          return [{
            ...group,
            keepId,
            members,
            deleteIds: members.map((member) => member.id).filter((id) => id !== keepId),
          }];
        });
        return {
          ...prev,
          groups: nextGroups,
          deleteCount: nextGroups.reduce((sum, group) => sum + group.deleteIds.length, 0),
        };
      });
      setOverrides(new Set());
    }
  }

  if (loading) return <p className={styles.status}>Cargando revisión...</p>;
  if (error || !review) return <p className={styles.error}>{error ?? "Sin revisión"}</p>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Revisión de nombres</h1>
          <p className={styles.subtitle}>
            {review.materialCount.toLocaleString("es-AR")} materiales · {review.groups.length} grupos ·{" "}
            {review.deleteCount} para eliminar · {review.skippedDifferent} distintos · {review.skippedUnsure} en duda.
            Generada el {formatDate(review.generatedAt)}. El más reciente arranca sin marcar.
          </p>
        </div>
        <a href="/" className={styles.link}>
          Volver al listado
        </a>
      </header>
      <div className={styles.toolbar}>
        <button type="button" className={filter === "all" ? styles.filterOn : styles.filter} onClick={() => setFilter("all")}>
          Todos ({review.groups.length})
        </button>
        <button type="button" className={filter === "mechanical" ? styles.filterOn : styles.filter} onClick={() => setFilter("mechanical")}>
          Mecánicos ({review.mechanicalGroupCount})
        </button>
        <button type="button" className={filter === "llm" ? styles.filterOn : styles.filter} onClick={() => setFilter("llm")}>
          Modelo ({review.llmConfirmedCount})
        </button>
        <button type="button" className={styles.deleteBtn} disabled={applying || selectedIds.length === 0} onClick={() => void handleApply()}>
          Aplicar {selectedIds.length} marcados
        </button>
      </div>
      {progress && <p className={styles.status}>{progress}</p>}
      {result && <p className={styles.status}>{result}</p>}
      <ul className={styles.groups}>
        {groups.map((group) => {
          const ids = [...group.members].sort((a, b) => Number(marked(group, a.id)) - Number(marked(group, b.id)));
          return (
            <li key={`${group.source}-${group.members.map((member) => member.id).join("-")}`} className={styles.group}>
              <p className={styles.badge}>{group.source === "mechanical" ? "Mecánico" : "Modelo"}</p>
              <p className={styles.clean}>Nombre limpio: {group.cleanName}</p>
              {ids.map((member) => {
                const checked = marked(group, member.id);
                return (
                  <div key={member.id} className={checked ? styles.remove : styles.keep}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(member.id)} aria-label={`Eliminar ${member.id}`} />
                    <span className={styles.role}>{checked ? "Se elimina" : "Se conserva"}</span>
                    <span className={styles.id}>{member.id}</span>
                    <span className={styles.name}>{member.name}</span>
                    <span className={styles.price}>{member.price ? formatPrice(member.price) : "—"}</span>
                    <span className={styles.date}>{member.updatedAt ? formatDate(member.updatedAt) : "—"}</span>
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
