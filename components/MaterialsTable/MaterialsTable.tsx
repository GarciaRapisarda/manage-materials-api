import type { Material } from "@/types/material";
import type { DuplicateGroupInfo } from "@/lib/duplicates";
import { formatPrice, formatDate, displayValue } from "@/lib/formatters";
import styles from "./MaterialsTable.module.css";

interface MaterialsTableProps {
  materials: Material[];
  duplicateGroups: Map<string, DuplicateGroupInfo>;
  duplicateToKeep: Set<string>;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: (checked: boolean) => void;
  onEdit: (material: Material) => void;
}

function DuplicateGroupCell({
  currentId,
  group,
  isKept,
  isSelected,
}: {
  currentId: string;
  group: DuplicateGroupInfo;
  isKept: boolean;
  isSelected: boolean;
}) {
  const sortedIds = [...group.ids].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b, undefined, { numeric: true });
  });
  return (
    <span className={styles.duplicateInfo}>
      {isKept ? (
        <span className={styles.keptBadge}>Se conserva (menor ID)</span>
      ) : isSelected ? (
        <span className={styles.toDeleteBadge}>Para eliminar</span>
      ) : null}
      <span className={styles.duplicateCount}>{group.count} en grupo</span>
      <span className={styles.duplicateIds}>
        IDs:{" "}
        {sortedIds.map((id, i) => (
          <span key={id}>
            {i > 0 && ", "}
            {id === currentId ? (
              <strong className={styles.currentId}>{id}</strong>
            ) : (
              id
            )}
          </span>
        ))}
      </span>
    </span>
  );
}

export function MaterialsTable({
  materials,
  duplicateGroups,
  duplicateToKeep,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onEdit,
}: MaterialsTableProps) {
  const visibleSelected = materials.filter((m) => selectedIds.has(m.id)).length;
  const allVisibleSelected = materials.length > 0 && visibleSelected === materials.length;
  const someVisibleSelected = visibleSelected > 0;

  function handleSelectAllChange(e: React.ChangeEvent<HTMLInputElement>) {
    onSelectAll(e.target.checked);
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thCheck}>
              <input
                type="checkbox"
                checked={allVisibleSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                }}
                onChange={handleSelectAllChange}
                aria-label="Seleccionar todos los visibles"
              />
            </th>
            <th className={styles.th}>ID</th>
            <th className={styles.th}>Nombre</th>
            <th className={styles.th}>Descripción</th>
            <th className={styles.th}>Precio</th>
            <th className={styles.th}>Unidad</th>
            <th className={styles.th}>Marca</th>
            <th className={styles.th}>Sin cotizar</th>
            <th className={styles.th}>Temporal</th>
            <th className={styles.th}>Actualizado</th>
            <th className={styles.thGroup}>Grupo duplicado</th>
            <th className={styles.thActions}>Editar</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => {
            const group = duplicateGroups.get(m.id);
            return (
              <tr
                key={m.id}
                className={`${styles.tr} ${group ? styles.duplicate : ""}`}
              >
                <td className={styles.tdCheck}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(m.id)}
                    onChange={() => onToggleSelection(m.id)}
                    aria-label={`Seleccionar ${m.name}`}
                  />
                </td>
                <td className={styles.tdId}>
                  <code className={styles.idBadge} title={`ID: ${m.id}`}>
                    {displayValue(m.id)}
                  </code>
                </td>
                <td className={styles.td}>{displayValue(m.name)}</td>
                <td className={styles.td}>{displayValue(m.description)}</td>
                <td className={styles.tdNum}>{formatPrice(m.price)}</td>
                <td className={styles.td}>{displayValue(m.unit)}</td>
                <td className={styles.td}>{displayValue(m.brand)}</td>
                <td className={styles.td}>{m.unquoted ? "Sí" : "No"}</td>
                <td className={styles.td}>{m.temporary ? "Sí" : "No"}</td>
                <td className={styles.td}>{formatDate(m.updated_at)}</td>
                <td className={styles.tdGroup}>
                  {group ? (
                    <DuplicateGroupCell
                      currentId={m.id}
                      group={group}
                      isKept={duplicateToKeep.has(m.id)}
                      isSelected={selectedIds.has(m.id)}
                    />
                  ) : (
                    <span className={styles.noDuplicate}>—</span>
                  )}
                </td>
                <td className={styles.tdActions}>
                  <button
                    type="button"
                    onClick={() => onEdit(m)}
                    className={styles.editBtn}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
