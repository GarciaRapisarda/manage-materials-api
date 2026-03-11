"use client";

import { useState } from "react";
import type { Category } from "@/types/category";
import { UNIT_OPTIONS, isValidUnit } from "@/lib/units";
import styles from "./AddMaterialModal.module.css";

interface AddMaterialModalProps {
  categories: Category[];
  onClose: () => void;
  onCreate: (body: {
    categoryId: string;
    name: string;
    description: string;
    price: number;
    unit: string;
    brand: string;
  }) => Promise<void>;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function AddMaterialModal({
  categories,
  onClose,
  onCreate,
}: AddMaterialModalProps) {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [brand, setBrand] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!categoryId.trim()) errors.categoryId = "La categoría es obligatoria";
    const normName = normalizeText(name);
    if (!normName) errors.name = "El nombre es obligatorio";
    const priceNum = parseFloat(price);
    if (price !== "" && (Number.isNaN(priceNum) || priceNum < 0)) {
      errors.price = "El precio debe ser un número mayor o igual a 0";
    }
    const normUnit = normalizeText(unit);
    if (normUnit && !isValidUnit(normUnit)) {
      errors.unit = "Unidad no válida. Seleccione una de la lista.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    const normName = normalizeText(name);
    const normDesc = normalizeText(description);
    const normUnit = normalizeText(unit);
    const normBrand = normalizeText(brand);
    const priceNum = price === "" ? 0 : parseFloat(price);

    setSaving(true);
    try {
      await onCreate({
        categoryId: categoryId.trim(),
        name: normName,
        description: normDesc,
        price: priceNum,
        unit: normUnit,
        brand: normBrand,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
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
      aria-labelledby="add-modal-title"
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 id="add-modal-title">Nuevo material</h2>
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
            <label htmlFor="add-categoryId">Categoría *</label>
            <select
              id="add-categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={fieldErrors.categoryId ? styles.inputError : ""}
              disabled={saving}
            >
              <option value="">— Seleccione categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId && (
              <span className={styles.fieldError}>
                {fieldErrors.categoryId}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="add-name">Nombre *</label>
            <input
              id="add-name"
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
            <label htmlFor="add-description">Descripción</label>
            <input
              id="add-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="add-price">Precio</label>
            <input
              id="add-price"
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              className={fieldErrors.price ? styles.inputError : ""}
              disabled={saving}
            />
            {fieldErrors.price && (
              <span className={styles.fieldError}>{fieldErrors.price}</span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="add-unit">Unidad</label>
            <select
              id="add-unit"
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
            </select>
            {fieldErrors.unit && (
              <span className={styles.fieldError}>{fieldErrors.unit}</span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="add-brand">Marca</label>
            <input
              id="add-brand"
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
              {saving ? "Creando..." : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
