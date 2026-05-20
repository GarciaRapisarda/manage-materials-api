"use client";

import { useState, useRef, memo } from "react";
import { parseChunk } from "@/lib/chunk-parser";
import {
  matchChunkToMaterials,
  isPendingMaterialId,
  type ChunkPreviewItem,
} from "@/lib/chunk-matcher";
import { alumetalToParsed, type AlumetalMaterial } from "@/lib/alumetal-importer";
import {
  fetchAllMaterials,
  patchMaterial,
  createMaterial,
} from "@/services/materials";
import { enrichPreviewCreates } from "@/lib/chunk-import-enrich";
import {
  analyzeImportPreview,
  estimateLlmMinutes,
  IMPORT_PREVIEW_ROW_CAP,
  LARGE_IMPORT_THRESHOLD,
  type ImportPlan,
} from "@/lib/import-plan";
import { getStoredToken } from "@/lib/auth";
import { formatPrice } from "@/lib/formatters";
import { isValidUnit, UNIT_OPTIONS } from "@/lib/units";
import type { Material } from "@/types/material";
import type { Category } from "@/types/category";
import styles from "./ChunkImportSection.module.css";

interface ChunkImportSectionProps {
  categories: Category[];
  onSuccess: () => void;
}

function ChunkImportSectionInner({
  categories,
  onSuccess,
}: ChunkImportSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [chunkText, setChunkText] = useState("");
  const [preview, setPreview] = useState<ChunkPreviewItem[] | null>(null);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [categorizing, setCategorizing] = useState(false);
  const [categorizeError, setCategorizeError] = useState<string | null>(null);
  const [categorizeStatus, setCategorizeStatus] = useState<string | null>(null);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [categoriesAssigned, setCategoriesAssigned] = useState(false);
  const [executeProgress, setExecuteProgress] = useState<string | null>(null);
  const [previewFilter, setPreviewFilter] = useState<"all" | "create" | "update">("all");
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<{
    updated: number;
    created: number;
    failed: string | null;
  } | null>(null);
  const [alumetalError, setAlumetalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const matchMaterialsRef = useRef<Material[] | null>(null);

  async function getMaterialsForMatch(): Promise<Material[]> {
    if (matchMaterialsRef.current) {
      return matchMaterialsRef.current;
    }
    const token = getStoredToken();
    if (!token) {
      throw new Error("Sin sesión");
    }
    setCategorizeStatus("Cargando materiales para comparar...");
    const res = await fetchAllMaterials(token);
    matchMaterialsRef.current = res.data;
    return res.data;
  }

  function normalizeCategoryName(s: string): string {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/,/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resolveCategoryId(categoryName: string): string {
    if (!categoryName?.trim()) return "";
    const normalized = normalizeCategoryName(categoryName);
    const c = categories.find(
      (cat) =>
        cat.name === categoryName ||
        cat.name.toLowerCase() === categoryName.toLowerCase() ||
        normalizeCategoryName(cat.name) === normalized
    );
    return c?.id ?? "";
  }

  function getFallbackCategoryId(): string {
    return categories.length > 0
      ? resolveCategoryId("Otros") || categories[0].id
      : "";
  }

  async function assignCategories(itemsPreview: ChunkPreviewItem[]) {
    const toCreateCount = itemsPreview.filter((p) => p.action === "create").length;
    if (toCreateCount === 0) {
      setCategoriesAssigned(true);
      return itemsPreview;
    }

    setCategorizing(true);
    setCategorizeError(null);
    setCategorizeStatus("Asignando categorías...");
    try {
      const enriched = await enrichPreviewCreates(
        itemsPreview,
        resolveCategoryId,
        getFallbackCategoryId(),
        setCategorizeStatus
      );
      if (enriched.llmCount > 0) {
        setCategorizeStatus(
          `${enriched.mappedCount} por sourceCategory · ${enriched.llmCount} con LLM`
        );
      } else {
        setCategorizeStatus(
          `${enriched.mappedCount} por sourceCategory (sin LLM)`
        );
      }
      setCategoriesAssigned(true);
      return enriched.items;
    } catch (err) {
      setCategorizeError(
        err instanceof Error ? err.message : "Error al categorizar"
      );
      setCategorizeStatus(null);
      setCategoriesAssigned(false);
      return itemsPreview;
    } finally {
      setCategorizing(false);
    }
  }

  async function prepareImportPreview(itemsPreview: ChunkPreviewItem[]) {
    const plan = analyzeImportPreview(itemsPreview, resolveCategoryId);
    setImportPlan(plan);
    setPreview(itemsPreview);
    setIncluded(new Set(itemsPreview.map((_, i) => i)));
    setExecResult(null);
    setCategoriesAssigned(false);

    const needsConfirm =
      plan.createsNeedLlm > 0 && plan.total >= LARGE_IMPORT_THRESHOLD;
    if (needsConfirm) {
      setCategorizeStatus(null);
      return;
    }

    const withCategory = await assignCategories(itemsPreview);
    setPreview(withCategory);
  }

  function handleAlumetalFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAlumetalError(null);
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          const text = reader.result as string;
          const data = JSON.parse(text) as AlumetalMaterial[] | { data: AlumetalMaterial[] };
          const items: AlumetalMaterial[] = Array.isArray(data)
            ? data
            : "data" in data && Array.isArray(data.data)
              ? data.data
              : [];
          if (items.length === 0) {
            setAlumetalError("El JSON no contiene un array de materiales");
            return;
          }
          const first = items[0];
          if (
            typeof first?.name !== "string" ||
            typeof first?.price !== "number"
          ) {
            setAlumetalError(
              "Formato inválido. Esperado: array de { name, price, sourceCategory?, unit? }"
            );
            return;
          }
          const parsed = alumetalToParsed(items);
          const matchMaterials = await getMaterialsForMatch();
          const itemsPreview = matchChunkToMaterials(parsed, matchMaterials);
          await prepareImportPreview(itemsPreview);
        } catch (err) {
          setAlumetalError(
            err instanceof Error ? err.message : "Error al leer el archivo"
          );
        }
      })();
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  async function handleParse() {
    setCategorizeError(null);
    try {
      const parsed = parseChunk(chunkText);
      const matchMaterials = await getMaterialsForMatch();
      const items = matchChunkToMaterials(parsed, matchMaterials);
      await prepareImportPreview(items);
    } catch (err) {
      setCategorizeError(
        err instanceof Error ? err.message : "Error al comparar con la API"
      );
    }
  }

  async function handleAssignCategoriesClick() {
    if (!preview) return;
    const withCategory = await assignCategories(preview);
    setPreview(withCategory);
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
      if (isPendingMaterialId(item.matchedMaterial.id)) continue;
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

    if (!failed && toCreate.length > 0) {
      const fallbackCategoryId = categories[0]?.id ?? "";
      const concurrency = 8;
      let next = 0;
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (next < toCreate.length && !failed) {
            const item = toCreate[next++];
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
              if (created % 50 === 0 || created === toCreate.length) {
                setExecuteProgress(
                  `Creando ${created}/${toCreate.length}...`
                );
              }
            } catch {
              failed = item.parsed.name;
            }
          }
        })
      );
    }

    setExecuting(false);
    setExecuteProgress(null);
    setExecResult({ updated, created, failed });
    if (!failed) {
      matchMaterialsRef.current = null;
      onSuccess();
    }
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
  const previewTruncated = filteredPreview.length > IMPORT_PREVIEW_ROW_CAP;
  const visiblePreview = previewTruncated
    ? filteredPreview.slice(0, IMPORT_PREVIEW_ROW_CAP)
    : filteredPreview;
  const includedCount = preview ? [...included].length : 0;
  const allIncluded = Boolean(preview && includedCount === preview.length);
  const needsCategoryAssign = Boolean(
    importPlan &&
      importPlan.create > 0 &&
      importPlan.createsNeedLlm > 0 &&
      importPlan.total >= LARGE_IMPORT_THRESHOLD &&
      !categoriesAssigned
  );

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
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleAlumetalFile}
              className={styles.hiddenInput}
              aria-label="Cargar JSON de scrapers (Alumetal, Todo Proyectable, Edify, Moreno)"
            />
            <button
              type="button"
              className={styles.alumetalBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={categorizing}
            >
              {categorizing
                ? "Categorizando con LLM..."
                : "Cargar desde JSON (scrapers)"}
            </button>
            <span className={styles.toolbarSep}>o</span>
            <button
              type="button"
              className={styles.parseBtn}
              onClick={handleParse}
              disabled={!chunkText.trim() || categorizing}
            >
              {categorizing ? "Asignando..." : "Parsear chunk y comparar"}
            </button>
          </div>
          {alumetalError && (
            <p className={styles.resultError}>{alumetalError}</p>
          )}

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
                  {categorizeStatus ?? "Procesando..."}
                </p>
              )}
              {!categorizing && categorizeStatus && (
                <p className={styles.categorizing}>{categorizeStatus}</p>
              )}
              {categorizeError && (
                <p className={styles.resultError}>{categorizeError}</p>
              )}

              {importPlan && (
                <div className={styles.planBox}>
                  <strong>Plan de importación</strong> ({importPlan.total}{" "}
                  filas)
                  <ul>
                    <li>
                      {importPlan.create} crear · {importPlan.update} actualizar
                      · {importPlan.skip} sin cambios
                    </li>
                    <li>
                      Categoría sin LLM: {importPlan.createsLocal} · con LLM:{" "}
                      {importPlan.createsNeedLlm}
                      {importPlan.createsNeedLlm > 0 &&
                        ` (${importPlan.llmApiCalls} requests API · ${importPlan.llmOpenAiBatches} lotes OpenAI · ${estimateLlmMinutes(importPlan)} min aprox.)`}
                    </li>
                    {importPlan.createsNoContext > 0 && (
                      <li>
                        {importPlan.createsNoContext} sin sourceCategory (van a
                        LLM)
                      </li>
                    )}
                    {importPlan.unmatchedContexts.length > 0 && (
                      <li>
                        Contextos sin match en API:{" "}
                        {importPlan.unmatchedContexts.join("; ")}
                      </li>
                    )}
                  </ul>
                  {needsCategoryAssign && (
                    <div className={styles.planActions}>
                      <button
                        type="button"
                        className={styles.assignBtn}
                        onClick={() => void handleAssignCategoriesClick()}
                        disabled={categorizing}
                      >
                        {categorizing
                          ? "Asignando..."
                          : `Asignar categorías (${importPlan.createsNeedLlm} con LLM)`}
                      </button>
                    </div>
                  )}
                </div>
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
                      {visiblePreview.map(({ item, i }) => (
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
                {previewTruncated && (
                  <p className={styles.previewNote}>
                    Vista previa: primeras {IMPORT_PREVIEW_ROW_CAP} filas de{" "}
                    {filteredPreview.length}. La ejecución aplica a los{" "}
                    {includedCount} seleccionados del total ({preview.length}).
                  </p>
                )}
              </div>

              <div className={styles.execToolbar}>
                <button
                  type="button"
                  className={styles.execBtn}
                  onClick={handleExecute}
                  disabled={
                    executing ||
                    categorizing ||
                    needsCategoryAssign ||
                    includedCount === 0 ||
                    (createCount > 0 && !createsReady)
                  }
                >
                  {executing
                    ? executeProgress ?? "Ejecutando..."
                    : needsCategoryAssign
                      ? "Asigná categorías antes de ejecutar"
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

export const ChunkImportSection = memo(ChunkImportSectionInner);
