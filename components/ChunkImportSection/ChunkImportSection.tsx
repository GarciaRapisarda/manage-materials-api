"use client";

import { useState } from "react";
import { parseChunk } from "@/lib/chunk-parser";
import {
  matchChunkToMaterials,
  type ChunkPreviewItem,
} from "@/lib/chunk-matcher";
import { patchMaterial, createMaterial } from "@/services/materials";
import { categorizeMaterials } from "@/services/categorize";
import { getStoredToken } from "@/lib/auth";
import { formatPrice } from "@/lib/formatters";
import { isValidUnit, UNIT_OPTIONS } from "@/lib/units";
import type { Material } from "@/types/material";
import type { Category } from "@/types/category";
import styles from "./ChunkImportSection.module.css";

interface ChunkImportSectionProps {
  materials: Material[];
  categories: Category[];
  onSuccess: () => void;
}

export function ChunkImportSection({
  materials,
  categories,
  onSuccess,
}: ChunkImportSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [chunkText, setChunkText] = useState("");
  const [preview, setPreview] = useState<ChunkPreviewItem[] | null>(null);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [categorizing, setCategorizing] = useState(false);
  const [categorizeError, setCategorizeError] = useState<string | null>(null);
  const [previewFilter, setPreviewFilter] = useState<"all" | "create" | "update">("all");
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<{
    updated: number;
    created: number;
    failed: string | null;
  } | null>(null);

  async function handleParse() {
    const parsed = parseChunk(chunkText);
    const items = matchChunkToMaterials(parsed, materials);
    setPreview(items);
    setIncluded(new Set(items.map((_, i) => i)));
    setExecResult(null);
    setCategorizeError(null);

    const toCreate = items.filter((p) => p.action === "create");
    if (toCreate.length > 0) {
      setCategorizing(true);
      try {
        const results = await categorizeMaterials(
          toCreate.map((p) => ({
            name: p.parsed.name,
            sectionContext: p.parsed.sectionContext,
          }))
        );
        setPreview((prev) => {
          if (!prev) return prev;
          const createIndices = prev
            .map((p, i) => (p.action === "create" ? i : -1))
            .filter((i) => i >= 0);
          return prev.map((item, i) => {
            const idx = createIndices.indexOf(i);
            if (idx >= 0 && results[idx]) {
              return { ...item, llmResult: results[idx] };
            }
            return item;
          });
        });
      } catch (e) {
        setCategorizeError(e instanceof Error ? e.message : "Error al categorizar");
      } finally {
        setCategorizing(false);
      }
    }
  }

  function toggleInclude(index: number) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function selectAll(checked: boolean) {
    if (!preview) return;
    setIncluded(checked ? new Set(preview.map((_, i) => i)) : new Set());
  }

  function updateItemField(
    index: number,
    field: "categoryId" | "unit" | "name",
    value: string
  ) {
    setPreview((prev) => {
      if (!prev || index < 0 || index >= prev.length) return prev;
      const item = prev[index];
      if (item.action !== "create") return prev;
      const next = [...prev];
      next[index] = {
        ...item,
        userOverride: {
          ...item.userOverride,
          [field]: value,
        },
      };
      return next;
    });
  }

  function getEffectiveCategoryId(item: ChunkPreviewItem): string {
    if (item.action !== "create") return "";
    return (
      item.userOverride?.categoryId ??
      item.llmResult?.categoryId ??
      ""
    );
  }

  function getEffectiveUnit(item: ChunkPreviewItem): string {
    if (item.action !== "create") return "";
    return (
      item.userOverride?.unit ??
      item.llmResult?.unit ??
      "u"
    );
  }

  function getEffectiveName(item: ChunkPreviewItem): string {
    return item.userOverride?.name ?? item.parsed.name;
  }

  async function handleExecute() {
    if (!preview) return;
    const token = getStoredToken();
    if (!token) return;

    const toRun = preview.filter((_, i) => included.has(i));
    const toUpdate = toRun.filter((p) => p.action === "update");
    const toCreate = toRun.filter((p) => p.action === "create");

    const createsWithoutCategory = toCreate.filter(
      (p) =>
        !p.llmResult?.categoryId &&
        !p.userOverride?.categoryId
    );
    if (createsWithoutCategory.length > 0) {
      alert(
        "Algunos materiales nuevos no tienen categoría. Esperá la asignación con LLM o seleccioná la categoría manualmente en el preview."
      );
      return;
    }

    const confirmed = window.confirm(
      `¿Ejecutar? ${toUpdate.length} actualización${toUpdate.length !== 1 ? "es" : ""}, ${toCreate.length} alta${toCreate.length !== 1 ? "s" : ""}.`
    );
    if (!confirmed) return;

    setExecuting(true);
    setExecResult(null);

    let updated = 0;
    let created = 0;
    let failed: string | null = null;

    for (const item of toUpdate) {
      if (!item.matchedMaterial || item.parsed.price == null) continue;
      try {
        await patchMaterial(
          item.matchedMaterial.id,
          { price: item.parsed.price },
          token
        );
        updated++;
      } catch (e) {
        failed = item.parsed.name;
        break;
      }
    }

    if (!failed) {
      const fallbackCategoryId = categories[0]?.id ?? "";
      for (const item of toCreate) {
        const catId = getEffectiveCategoryId(item);
        const unitVal = getEffectiveUnit(item);
        const categoryId =
          categories.find(
            (c) =>
              c.id === catId ||
              String(Number(c.id)) === catId
          )?.id ?? fallbackCategoryId;
        const unit = unitVal && isValidUnit(unitVal) ? unitVal : "u";
        try {
          await createMaterial(
            {
              categoryId,
              name: getEffectiveName(item),
              description: item.parsed.sectionContext ?? "",
              price: item.parsed.price ?? 0,
              unit,
              brand: "",
            },
            token
          );
          created++;
        } catch (e) {
          failed = item.parsed.name;
          break;
        }
      }
    }

    setExecuting(false);
    setExecResult({ updated, created, failed });
    if (!failed) onSuccess();
  }

  const updateCount = preview?.filter((p, i) => included.has(i) && p.action === "update").length ?? 0;
  const createCount = preview?.filter((p, i) => included.has(i) && p.action === "create").length ?? 0;
  const createsReady = preview
    ? preview
        .filter((p, i) => included.has(i) && p.action === "create")
        .every(
          (p) =>
            p.llmResult?.categoryId ||
            p.userOverride?.categoryId
        )
    : true;
  const filteredWithIndex =
    preview?.map((item, i) => ({ item, i })) ?? [];
  const filteredPreview =
    previewFilter === "all"
      ? filteredWithIndex
      : filteredWithIndex.filter(({ item }) =>
          previewFilter === "create"
            ? item.action === "create"
            : item.action === "update"
        );
  const includedCount = preview ? [...included].length : 0;
  const allIncluded = Boolean(preview && includedCount === preview.length);

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? "▼" : "▶"} Importar desde chunk
      </button>

      {expanded && (
        <div className={styles.content}>
          <textarea
            className={styles.textarea}
            placeholder="Pegá aquí el chunk (MD/TXT) con materiales y precios..."
            value={chunkText}
            onChange={(e) => setChunkText(e.target.value)}
            rows={8}
          />
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.parseBtn}
              onClick={handleParse}
              disabled={!chunkText.trim() || categorizing}
            >
              {categorizing ? "Asignando..." : "Parsear y comparar"}
            </button>
          </div>

          {preview && preview.length > 0 && (
            <>
              <div className={styles.summary}>
                <span className={styles.badgeUpdate}>
                  {preview.filter((p) => p.action === "update").length} a actualizar
                </span>
                <span className={styles.badgeCreate}>
                  {preview.filter((p) => p.action === "create").length} a crear
                </span>
                <span className={styles.badgeSkip}>
                  {preview.filter((p) => p.action === "skip").length} sin cambios
                </span>
              </div>

              {categorizing && (
                <p className={styles.categorizing}>
                  Asignando categorías y unidades con LLM...
                </p>
              )}
              {categorizeError && (
                <p className={styles.resultError}>{categorizeError}</p>
              )}

              <div className={styles.previewWrapper}>
                <div className={styles.previewToolbar}>
                  <div className={styles.filterGroup}>
                    <span className={styles.filterLabel}>Ver:</span>
                    <button
                      type="button"
                      className={previewFilter === "all" ? styles.filterBtnActive : styles.filterBtn}
                      onClick={() => setPreviewFilter("all")}
                    >
                      Todos ({preview.length})
                    </button>
                    <button
                      type="button"
                      className={previewFilter === "create" ? styles.filterBtnActive : styles.filterBtn}
                      onClick={() => setPreviewFilter("create")}
                    >
                      Solo a crear ({preview.filter((p) => p.action === "create").length})
                    </button>
                    <button
                      type="button"
                      className={previewFilter === "update" ? styles.filterBtnActive : styles.filterBtn}
                      onClick={() => setPreviewFilter("update")}
                    >
                      Solo a actualizar ({preview.filter((p) => p.action === "update").length})
                    </button>
                  </div>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={allIncluded}
                      onChange={(e) => selectAll(e.target.checked)}
                      aria-label="Incluir todos"
                    />
                    Incluir todos
                  </label>
                  <span className={styles.count}>
                    {includedCount} de {preview.length} seleccionados
                  </span>
                </div>
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.thCheck} />
                        <th className={styles.th}>Acción</th>
                        <th className={styles.th}>Nombre (chunk)</th>
                        <th className={styles.th}>Material existente</th>
                        <th className={styles.th}>Precio actual</th>
                        <th className={styles.th}>Precio nuevo</th>
                        <th className={styles.th}>Unidad</th>
                        <th className={styles.th}>Categoría</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPreview.map(({ item, i }) => (
                        <tr key={i} className={styles.tr}>
                          <td className={styles.tdCheck}>
                            <input
                              type="checkbox"
                              checked={included.has(i)}
                              onChange={() => toggleInclude(i)}
                              aria-label={`Incluir ${item.parsed.name}`}
                            />
                          </td>
                          <td className={styles.td}>
                            <span
                              className={
                                item.action === "update"
                                  ? styles.badgeUpdate
                                  : item.action === "skip"
                                    ? styles.badgeSkip
                                    : styles.badgeCreate
                              }
                            >
                              {item.action === "update"
                                ? "Actualizar"
                                : item.action === "skip"
                                  ? "Sin cambios"
                                  : "Crear"}
                            </span>
                          </td>
                          <td className={styles.tdName}>
                            {item.action === "create" ? (
                              <input
                                type="text"
                                value={getEffectiveName(item)}
                                onChange={(e) =>
                                  updateItemField(i, "name", e.target.value)
                                }
                                className={styles.cellInput}
                                title="Editar nombre"
                              />
                            ) : (
                              <span title={item.parsed.name}>
                                {item.parsed.name}
                              </span>
                            )}
                          </td>
                          <td className={styles.td}>
                            {item.matchedMaterial ? (
                              <span className={styles.matched}>
                                ID {item.matchedMaterial.id}:{" "}
                                {item.matchedMaterial.name}
                              </span>
                            ) : (
                              <span className={styles.noMatch}>—</span>
                            )}
                          </td>
                          <td className={styles.tdNum}>
                            {item.matchedMaterial != null
                              ? formatPrice(item.matchedMaterial.price)
                              : "—"}
                          </td>
                          <td className={styles.tdNum}>
                            {item.parsed.price != null
                              ? formatPrice(item.parsed.price)
                              : "Sin cotizar"}
                          </td>
                          <td className={styles.td}>
                            {item.action === "create" ? (
                              categorizing ? (
                                "…"
                              ) : (
                                <select
                                  value={
                                    getEffectiveUnit(item) || "u"
                                  }
                                  onChange={(e) =>
                                    updateItemField(i, "unit", e.target.value)
                                  }
                                  className={styles.cellSelect}
                                  aria-label={`Unidad para ${item.parsed.name}`}
                                >
                                  {UNIT_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              )
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className={styles.td}>
                            {item.action === "create" ? (
                              categorizing ? (
                                "…"
                              ) : (
                                <select
                                  value={
                                    getEffectiveCategoryId(item) ||
                                    categories[0]?.id ||
                                    ""
                                  }
                                  onChange={(e) =>
                                    updateItemField(
                                      i,
                                      "categoryId",
                                      e.target.value
                                    )
                                  }
                                  className={styles.cellSelect}
                                  aria-label={`Categoría para ${item.parsed.name}`}
                                >
                                  {categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                              )
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={styles.execToolbar}>
                <button
                  type="button"
                  className={styles.execBtn}
                  onClick={handleExecute}
                  disabled={
                    executing ||
                    categorizing ||
                    includedCount === 0 ||
                    (createCount > 0 && !createsReady)
                  }
                >
                  {executing
                    ? "Ejecutando..."
                    : `Ejecutar (${updateCount} actualizar, ${createCount} crear)`}
                </button>
              </div>

              {execResult && (
                <div
                  className={
                    execResult.failed ? styles.resultError : styles.resultSuccess
                  }
                >
                  {execResult.failed ? (
                    <>
                      {execResult.updated} actualizado
                      {execResult.updated !== 1 ? "s" : ""},{" "}
                      {execResult.created} creado
                      {execResult.created !== 1 ? "s" : ""}. Error en:{" "}
                      {execResult.failed}
                    </>
                  ) : (
                    <>
                      {execResult.updated} actualizado
                      {execResult.updated !== 1 ? "s" : ""},{" "}
                      {execResult.created} creado
                      {execResult.created !== 1 ? "s" : ""} correctamente.
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {preview && preview.length === 0 && (
            <p className={styles.empty}>No se encontraron materiales en el chunk.</p>
          )}
        </div>
      )}
    </section>
  );
}
