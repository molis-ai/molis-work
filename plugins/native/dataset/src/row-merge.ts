/** Merge visible table rows with rows hidden by the current filter.
 * `filterQuery` must be the filter that produced `visibleRows`, not a newer query. */

export interface DatasetDraftRow {
  readonly id: string;
  readonly cells?: Readonly<Record<string, string>>;
}

export interface DatasetDraftColumn {
  readonly id: string;
}

export function mergeDatasetDraftRows<Row extends DatasetDraftRow>(
  selectedRows: readonly Row[] | undefined,
  visibleRows: readonly Row[] | undefined,
  columns: readonly DatasetDraftColumn[] | undefined,
  filterQuery: string | undefined,
): Row[] {
  const needle = String(filterQuery || "").trim().toLowerCase();
  const matches = (row: Row) => {
    if (!needle) return true;
    return (columns || []).some((column) => String(row.cells?.[column.id] ?? "").toLowerCase().includes(needle));
  };
  const visible = new Map((visibleRows || []).map((row) => [row.id, row]));
  const rows: Row[] = [];
  const seen = new Set<string>();
  (selectedRows || []).forEach((row) => {
    seen.add(row.id);
    const fromDom = visible.get(row.id);
    if (fromDom) {
      rows.push(fromDom);
      return;
    }
    if (!matches(row)) rows.push(row);
  });
  visible.forEach((row, id) => {
    if (!seen.has(id)) rows.push(row);
  });
  return rows;
}
