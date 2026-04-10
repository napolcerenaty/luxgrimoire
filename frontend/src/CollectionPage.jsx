import { useState, useEffect, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from "@tanstack/react-table";
import "./CollectionPage.css";
import { useI18n } from "./i18n";

function BoolCell({ value }) {
  return value ? (
    <span className="bool-check">✓</span>
  ) : (
    <span className="bool-cross">✗</span>
  );
}

function BoolFilter({ column, t }) {
  const val = column.getFilterValue() ?? "";
  return (
    <div className="col-filter">
      <select value={val} onChange={(e) => column.setFilterValue(e.target.value || undefined)}>
        <option value="">{t("col.all")}</option>
        <option value="true">{t("col.yes")}</option>
        <option value="false">{t("col.no")}</option>
      </select>
    </div>
  );
}

function TextFilter({ column, t }) {
  const val = column.getFilterValue() ?? "";
  return (
    <div className="col-filter">
      <input
        value={val}
        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
        placeholder={t("col.filterHint")}
      />
    </div>
  );
}

const boolFilterFn = (row, columnId, filterValue) => {
  const cellVal = row.getValue(columnId);
  return String(cellVal) === filterValue;
};

export default function CollectionPage({ onBookClick = null }) {
  const { t } = useI18n();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);

  useEffect(() => {
    fetch("http://localhost:8080/api/collection")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  const columns = useMemo(() => [
    { accessorKey: "language", header: t("col.language"), cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "author",   header: t("col.author"),   cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "title",    header: t("col.title"),    cell: (i) => onBookClick ? <span className="book-title-link" onClick={() => onBookClick(i.getValue())}>{i.getValue()}</span> : i.getValue(), filterFn: "includesString" },
    { accessorKey: "series",   header: t("col.series"),   cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "volume",   header: t("col.volume"),   cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "edition",  header: t("col.edition"),  cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "features", header: t("col.features"), cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "read",    header: t("col.read"),    cell: (i) => <BoolCell value={i.getValue()} />, filterFn: boolFilterFn },
    { accessorKey: "forSale", header: t("col.forSale"), cell: (i) => <BoolCell value={i.getValue()} />, filterFn: boolFilterFn },
    { accessorKey: "notes",    header: t("col.notes"),    cell: (i) => i.getValue(), filterFn: "includesString" },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const boolCols = new Set(["read", "forSale"]);

  if (loading) return (
    <div className="status-container">
      <div className="spinner" />
      <span>{t("col.loading")}</span>
    </div>
  );
  if (error) return (
    <div className="status-container">
      <p className="error-text">{t("col.error", { msg: error })}</p>
      <p>{t("col.errorHint")}</p>
    </div>
  );

  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="collection-page">
      <p className="collection-meta">
        {t("col.showing", { filtered: filteredCount, total: data.length })}
      </p>
      <div className="collection-table-wrapper">
        <table className="collection-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isBool = boolCols.has(header.column.id);
                  const sorted = header.column.getIsSorted();
                  return (
                    <th key={header.id} className={`col-${header.column.id.toLowerCase()}`}>
                      <button
                        className="col-header-btn"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" && <span className="sort-arrow">▲</span>}
                        {sorted === "desc" && <span className="sort-arrow">▼</span>}
                      </button>
                      {isBool
                        ? <BoolFilter column={header.column} t={t} />
                        : <TextFilter column={header.column} t={t} />
                      }
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
