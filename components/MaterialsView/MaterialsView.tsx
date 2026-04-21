"use client";

import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  useDeferredValue,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { getStoredToken, clearStoredToken } from "@/lib/auth";
import { fetchAllMaterials, deleteMaterial, patchMaterial, createMaterial } from "@/services/materials";
import { fetchCategories } from "@/services/categories";
import {
  getDuplicateGroupsByNormalizedName,
  getDuplicateCleanupSelection,
} from "@/lib/duplicates";
import { MaterialsTable } from "@/components/MaterialsTable/MaterialsTable";
import { EditMaterialModal } from "@/components/EditMaterialModal/EditMaterialModal";
import { AddMaterialModal } from "@/components/AddMaterialModal/AddMaterialModal";
import { ChunkImportSection } from "@/components/ChunkImportSection/ChunkImportSection";
import { Loading } from "@/components/Loading/Loading";
import { ErrorDisplay } from "@/components/ErrorDisplay/ErrorDisplay";
import type { Material } from "@/types/material";
import type { Category } from "@/types/category";
import {
  downloadCSV,
  downloadExcel,
  getExportFilename,
} from "@/lib/export";
import styles from "./MaterialsView.module.css";

interface QuickFilters {
  onlyDuplicates: boolean;
  noBrand: boolean;
  noDescription: boolean;
  noPrice: boolean;
  onlyTemporary: boolean;
  onlyUnquoted: boolean;
}

export function MaterialsView() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [quickFilters, setQuickFilters] = useState<QuickFilters>({
    onlyDuplicates: false,
    noBrand: false,
    noDescription: false,
    noPrice: false,
    onlyTemporary: false,
    onlyUnquoted: false,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteState, setDeleteState] = useState<{
    inProgress: boolean;
    current: number;
    total: number;
    currentName: string;
  } | null>(null);
  const [deleteResult, setDeleteResult] = useState<{
    success: number;
    failedAt: { id: string; name: string } | null;
  } | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [, startFilterTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);
  const filteredMaterialsRef = useRef<Material[]>([]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    fetchAllMaterials(token)
      .then((res) => {
        setMaterials(res.data);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.includes("401")) {
          clearStoredToken();
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Error al cargar");
      })
      .finally(() => setLoading(false));

    fetchCategories(token)
      .then((res) => setCategories(res.data ?? []))
      .catch(() => setCategories([]));
  }, [router]);

  const duplicateGroups = useMemo(
    () =>
      materials
        ? getDuplicateGroupsByNormalizedName(materials)
        : new Map<string, { count: number; ids: string[] }>(),
    [materials]
  );

  const { toSelect: duplicateToSelect, toKeep: duplicateToKeep } = useMemo(
    () => getDuplicateCleanupSelection(duplicateGroups),
    [duplicateGroups]
  );

  const filteredMaterials = useMemo(() => {
    if (!materials) return [];
    let result = materials;
    const q = deferredSearch.trim();
    if (q) {
      const lower = q.toLowerCase();
      result = result.filter((m) => m.name.toLowerCase().includes(lower));
    }
    if (quickFilters.onlyDuplicates) {
      result = result.filter((m) => duplicateGroups.has(m.id));
    }
    if (quickFilters.noBrand) {
      result = result.filter((m) => !m.brand || m.brand.trim() === "");
    }
    if (quickFilters.noDescription) {
      result = result.filter((m) => !m.description || m.description.trim() === "");
    }
    if (quickFilters.noPrice) {
      result = result.filter((m) => m.price == null || m.price === 0);
    }
    if (quickFilters.onlyTemporary) {
      result = result.filter((m) => m.temporary);
    }
    if (quickFilters.onlyUnquoted) {
      result = result.filter((m) => m.unquoted);
    }
    return result;
  }, [materials, deferredSearch, quickFilters, duplicateGroups]);

  filteredMaterialsRef.current = filteredMaterials;

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDeleteResult(null);
  }, []);

  const selectAll = useCallback((checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const visibleIds = filteredMaterialsRef.current.map((m) => m.id);
      if (checked) {
        visibleIds.forEach((id) => next.add(id));
      } else {
        visibleIds.forEach((id) => next.delete(id));
      }
      return next;
    });
    setDeleteResult(null);
  }, []);

  const handleEditMaterial = useCallback((m: Material) => {
    setEditingMaterial(m);
  }, []);

  const handleChunkImportSuccess = useCallback(() => {
    const token = getStoredToken();
    if (token) {
      fetchAllMaterials(token).then((res) => setMaterials(res.data));
    }
  }, []);

  function selectDuplicatesForCleanup() {
    setSelectedIds(new Set(duplicateToSelect));
    setDeleteResult(null);
  }

  const setQuickFilter = useCallback(
    (key: keyof QuickFilters, value: boolean) => {
      startFilterTransition(() => {
        setQuickFilters((prev) => ({ ...prev, [key]: value }));
      });
    },
    []
  );

  function exportAll(format: "csv" | "xlsx") {
    if (!materials) return;
    const fn = getExportFilename("materiales-todos", format);
    if (format === "xlsx") downloadExcel(materials, fn);
    else downloadCSV(materials, fn);
  }

  function exportVisible(format: "csv" | "xlsx") {
    const fn = getExportFilename("materiales-visibles", format);
    if (format === "xlsx") downloadExcel(filteredMaterials, fn);
    else downloadCSV(filteredMaterials, fn);
  }

  async function handleDeleteSelected() {
    const token = getStoredToken();
    if (!token || !materials) return;

    const toDelete = Array.from(selectedIds);
    const total = toDelete.length;

    const confirmed = window.confirm(
      `¿Eliminar ${total} material${total !== 1 ? "es" : ""} seleccionado${total !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setDeleteState({ inProgress: true, current: 0, total, currentName: "" });
    setDeleteResult(null);

    const materialById = new Map(materials.map((m) => [m.id, m]));
    let successCount = 0;
    let failedAt: { id: string; name: string } | null = null;

    for (let i = 0; i < toDelete.length; i++) {
      const id = toDelete[i];
      const material = materialById.get(id);
      const name = material?.name ?? id;

      setDeleteState({ inProgress: true, current: i + 1, total, currentName: name });

      try {
        await deleteMaterial(id, token);
        successCount++;
      } catch {
        failedAt = { id, name };
        break;
      }
    }

    setDeleteState(null);
    setDeleteResult({ success: successCount, failedAt });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < successCount; i++) {
        next.delete(toDelete[i]);
      }
      return next;
    });

    const tokenCheck = getStoredToken();
    if (tokenCheck) {
      const res = await fetchAllMaterials(tokenCheck);
      setMaterials(res.data);
    }
  }

  async function handleCreateMaterial(body: {
    categoryId: string;
    name: string;
    description: string;
    price: number;
    unit: string;
    brand: string;
  }) {
    const token = getStoredToken();
    if (!token) return;
    const created = await createMaterial(body, token);
    setMaterials((prev) => (prev ? [created, ...prev] : [created]));
  }

  async function handleSaveMaterial(
    id: string,
    payload: Record<string, unknown>
  ) {
    const token = getStoredToken();
    if (!token) return;

    await patchMaterial(id, payload, token);

    setMaterials((prev) => {
      if (!prev) return prev;
      return prev.map((m) => {
        if (m.id !== id) return m;
        const merged: Material = {
          ...m,
          ...payload,
          updated_at:
            (payload.updated_at as string) ?? new Date().toISOString(),
        };
        return merged;
      });
    });
  }

  function handleLogout() {
    clearStoredToken();
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>Administración de Materiales</h1>
        </header>
        <Loading />
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>Administración de Materiales</h1>
        </header>
        <ErrorDisplay message={error} />
        <button onClick={handleLogout} className={styles.logout}>
          Cerrar sesión
        </button>
      </main>
    );
  }

  if (!materials) return null;

  const duplicateCount = duplicateGroups.size;
  const selectedCount = selectedIds.size;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Administración de Materiales</h1>
          <p className={styles.subtitle}>
            {filteredMaterials.length} de {materials.length} material
            {materials.length !== 1 ? "es" : ""}
            {(search ||
              Object.values(quickFilters).some(Boolean)) &&
              " (filtrados)"}
            {duplicateCount > 0 && ` · ${duplicateCount} duplicado${duplicateCount > 1 ? "s" : ""}`}
            {selectedCount > 0 && ` · ${selectedCount} seleccionado${selectedCount > 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setAddingMaterial(true)}
          className={styles.addBtn}
        >
          Nuevo material
        </button>
        <button onClick={handleLogout} className={styles.logout}>
          Cerrar sesión
        </button>
      </header>
      <ChunkImportSection
        materials={materials}
        categories={categories}
        onSuccess={handleChunkImportSuccess}
      />
      <div className={styles.toolbar}>
        <input
          type="search"
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.search}
          aria-label="Buscar por nombre"
        />
        <div className={styles.quickFilters}>
          <label className={styles.filterChip}>
            <input
              type="checkbox"
              checked={quickFilters.onlyDuplicates}
              onChange={(e) =>
                setQuickFilter("onlyDuplicates", e.target.checked)
              }
              aria-label="Solo duplicados"
            />
            Solo duplicados
          </label>
          <label className={styles.filterChip}>
            <input
              type="checkbox"
              checked={quickFilters.noBrand}
              onChange={(e) => setQuickFilter("noBrand", e.target.checked)}
              aria-label="Sin marca"
            />
            Sin marca
          </label>
          <label className={styles.filterChip}>
            <input
              type="checkbox"
              checked={quickFilters.noDescription}
              onChange={(e) =>
                setQuickFilter("noDescription", e.target.checked)
              }
              aria-label="Sin descripción"
            />
            Sin descripción
          </label>
          <label className={styles.filterChip}>
            <input
              type="checkbox"
              checked={quickFilters.noPrice}
              onChange={(e) => setQuickFilter("noPrice", e.target.checked)}
              aria-label="Sin precio"
            />
            Sin precio
          </label>
          <label className={styles.filterChip}>
            <input
              type="checkbox"
              checked={quickFilters.onlyTemporary}
              onChange={(e) =>
                setQuickFilter("onlyTemporary", e.target.checked)
              }
              aria-label="Solo temporarios"
            />
            Temporarios
          </label>
          <label className={styles.filterChip}>
            <input
              type="checkbox"
              checked={quickFilters.onlyUnquoted}
              onChange={(e) =>
                setQuickFilter("onlyUnquoted", e.target.checked)
              }
              aria-label="Solo sin cotizar"
            />
            Sin cotizar
          </label>
        </div>
        <button
          onClick={selectDuplicatesForCleanup}
          disabled={duplicateGroups.size === 0}
          className={styles.selectDuplicatesBtn}
          title="En cada grupo duplicado se conserva el menor ID; el resto queda seleccionado para eliminar"
        >
          Seleccionar duplicados para eliminar
        </button>
        <button
          onClick={handleDeleteSelected}
          disabled={selectedCount === 0 || deleteState !== null}
          className={styles.deleteBtn}
        >
          Eliminar seleccionados
        </button>
        <div className={styles.exportGroup}>
          <div className={styles.exportDropdown}>
            <span className={styles.exportLabel}>Exportar todo:</span>
            <button
              onClick={() => exportAll("csv")}
              className={styles.exportBtn}
              title="CSV compatible con Excel"
            >
              CSV
            </button>
            <button
              onClick={() => exportAll("xlsx")}
              className={styles.exportBtn}
              title="Formato Excel nativo"
            >
              Excel
            </button>
          </div>
          <div className={styles.exportDropdown}>
            <span className={styles.exportLabel}>Exportar visibles:</span>
            <button
              onClick={() => exportVisible("csv")}
              className={styles.exportBtn}
              title="Solo materiales visibles según filtros actuales"
            >
              CSV
            </button>
            <button
              onClick={() => exportVisible("xlsx")}
              className={styles.exportBtn}
              title="Solo materiales visibles según filtros actuales"
            >
              Excel
            </button>
          </div>
        </div>
      </div>
      {selectedCount > 0 && (
        <p className={styles.deleteHint}>
          Se eliminará solo el ID de cada fila seleccionada, no el grupo completo.
        </p>
      )}
      {deleteState && (
        <div className={styles.progress}>
          Eliminando {deleteState.current}/{deleteState.total}
          {deleteState.currentName && `: ${deleteState.currentName}`}
        </div>
      )}
      {deleteResult && !deleteState && (
        <div
          className={
            deleteResult.failedAt ? styles.resultError : styles.resultSuccess
          }
        >
          {deleteResult.failedAt ? (
            <>
              Se eliminaron {deleteResult.success} material
              {deleteResult.success !== 1 ? "es" : ""} correctamente. Error en:{" "}
              {deleteResult.failedAt.name} (ID: {deleteResult.failedAt.id})
            </>
          ) : (
            <>
              Se eliminaron {deleteResult.success} material
              {deleteResult.success !== 1 ? "es" : ""} correctamente.
            </>
          )}
        </div>
      )}
      <MaterialsTable
        materials={filteredMaterials}
        duplicateGroups={duplicateGroups}
        duplicateToKeep={duplicateToKeep}
        selectedIds={selectedIds}
        onToggleSelection={toggleSelection}
        onSelectAll={selectAll}
        onEdit={handleEditMaterial}
      />
      <EditMaterialModal
        material={editingMaterial}
        categories={categories}
        onClose={() => setEditingMaterial(null)}
        onSave={handleSaveMaterial}
      />
      {addingMaterial && (
        <AddMaterialModal
          categories={categories}
          onClose={() => setAddingMaterial(false)}
          onCreate={handleCreateMaterial}
        />
      )}
    </main>
  );
}
