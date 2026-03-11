"use client";

import { useState, useEffect } from "react";
import type { Material } from "@/types/material";
import type { Category } from "@/types/category";
import { UNIT_OPTIONS, isValidUnit } from "@/lib/units";
import styles from "./EditMaterialModal.module.css";

interface EditMaterialModalProps {
  material: Material | null;
  categories: Category[];
  onClose: () => void;
  onSave: (id: string, payload: Record<string, unknown>) => Promise<void>;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function EditMaterialModal({
  material,
  categories,
  onClose,
  onSave,
}: EditMaterialModalProps) {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [brand, setBrand] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (material) {
      setCategoryId(material.categoryId ?? "");
      setName(material.name ?? "");
      setDescription(material.description ?? "");
      setPrice(String(material.price ?? 0));
      setUnit(material.unit ?? "");
      setBrand(material.brand ?? "");
      setError(null);
      setFieldErrors({});
    }
  }, [material]);

  if (!material) return null;

  function validate(): boolean {
    const errors: Record<string, string> = {};
    const normName = normalizeText(name);
    if (!normName) errors.name = "El nombre es obligatorio";
    const priceNum = parseFloat(price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      errors.price = "El precio debe ser un número mayor o igual a 0";
    }
    const normUnit = normalizeText(unit);
    if (
      normUnit &&
      !isValidUnit(normUnit) &&
      normUnit !== (material?.unit ?? "")
    ) {
      errors.unit = `Unidad no válida. Seleccione una de la lista.`;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!material) return;
    setError(null);
    if (!validate()) return;

    const normCategoryId = normalizeText(categoryId);
    const normName = normalizeText(name);
    const normDesc = normalizeText(description);
    const normUnit = normalizeText(unit);
    const normBrand = normalizeText(brand);
    const priceNum = parseFloat(price);

    const payload: Record<string, unknown> = {};
    if ((material.categoryId ?? "") !== normCategoryId)
      payload.categoryId = normCategoryId ? normCategoryId : null;
    if (material.name !== normName) payload.name = normName;
    if (material.description !== normDesc) payload.description = normDesc;
    if (material.price !== priceNum) payload.price = priceNum;
    if (material.unit !== normUnit) payload.unit = normUnit;
    if ((material.brand ?? "") !== normBrand)
      payload.brand = normBrand || null;

    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await onSave(material.id, payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className={styles.overlay}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 id="edit-modal-title">Editar material</h2>
          <p className={styles.idRef}>ID: {material.id}</p>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeBtn}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="edit-categoryId">Categoría</label>
            <select
              id="edit-categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={saving}
            >
              <option value="">— Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="edit-name">Nombre *</label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldErrors.name ? styles.inputError : ""}
              disabled={saving}
            />
            {fieldErrors.name && (
              <span className={styles.fieldError}>{fieldErrors.name}</span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="edit-description">Descripción</label>
            <input
              id="edit-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="edit-price">Precio *</label>
            <input
              id="edit-price"
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={fieldErrors.price ? styles.inputError : ""}
              disabled={saving}
            />
            {fieldErrors.price && (
              <span className={styles.fieldError}>{fieldErrors.price}</span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="edit-unit">Unidad</label>
            <select
              id="edit-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={fieldErrors.unit ? styles.inputError : ""}
              disabled={saving}
            >
              <option value="">—</option>
              {UNIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {unit &&
                !UNIT_OPTIONS.some((o) => o.value === unit) && (
                  <option value={unit}>{unit}</option>
                )}
            </select>
            {fieldErrors.unit && (
              <span className={styles.fieldError}>{fieldErrors.unit}</span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="edit-brand">Marca</label>
            <input
              id="edit-brand"
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              disabled={saving}
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button
              type="button"
              onClick={onClose}
              className={styles.cancelBtn}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
