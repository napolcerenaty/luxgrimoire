import { useState, useEffect, useMemo, useRef } from "react";
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

function SelectFilter({ column, options }) {
  const val = column.getFilterValue() ?? "";
  return (
    <div className="col-filter">
      <select value={val} onChange={(e) => column.setFilterValue(e.target.value || undefined)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

const STATUS_COLORS = {
  OWNED:       "#5cb85c",
  WISHLIST:    "#f0ad4e",
  PREORDER:    "#5bc0de",
  LOANED_OUT:  "#9b59b6",
  SOLD:        "#e74c3c",
  GIFTED_AWAY: "#95a5a6",
};

const READ_COLORS = {
  READ:    "#5cb85c",
  READING: "#5bc0de",
  UNREAD:  "#555",
  DNF:     "#e74c3c",
};

const boolFilterFn = (row, columnId, filterValue) => {
  const cellVal = row.getValue(columnId);
  return String(cellVal) === filterValue;
};

const ALL_COLUMNS = [
  "language","author","title","series","volume","editionName","features",
  "readingStatus","ownershipStatus","condition","purchaseDate","allocatedPrice","saleDate","salePrice","saleVenue",
];
const DEFAULT_VISIBLE = new Set([
  "language","author","title","series","volume","editionName","readingStatus","ownershipStatus",
]);

export default function CollectionPage({ onBookClick = null }) {
  const { t } = useI18n();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState(
    Object.fromEntries(ALL_COLUMNS.map((c) => [c, DEFAULT_VISIBLE.has(c)]))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    fetch("http://localhost:8080/api/user/collection", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowColPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const statusOptions = useMemo(() => [
    { value: "", label: t("col.all") },
    { value: "OWNED",       label: t("col.owned") },
    { value: "WISHLIST",    label: t("col.wishlist") },
    { value: "PREORDER",    label: t("col.preorder") },
    { value: "LOANED_OUT",  label: t("col.loaned_out") },
    { value: "SOLD",        label: t("col.sold") },
    { value: "GIFTED_AWAY", label: t("col.gifted_away") },
  ], [t]);

  const readOptions = useMemo(() => [
    { value: "", label: t("col.all") },
    { value: "READ",    label: "READ" },
    { value: "READING", label: "READING" },
    { value: "UNREAD",  label: "UNREAD" },
    { value: "DNF",     label: "DNF" },
  ], [t]);

  const columns = useMemo(() => [
    { accessorKey: "language",   header: t("col.language"),   cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "author",     header: t("col.author"),     cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "title",      header: t("col.title"),      cell: (i) => onBookClick
        ? <span className="book-title-link" onClick={() => onBookClick(i.getValue())}>{i.getValue()}</span>
        : i.getValue(), filterFn: "includesString" },
    { accessorKey: "series",     header: t("col.series"),     cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "volume",     header: t("col.volume"),     cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "editionName",header: t("col.edition"),    cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "features",   header: t("col.features"),   cell: (i) => i.getValue(), filterFn: "includesString" },
    {
      accessorKey: "readingStatus",
      header: t("col.read"),
      cell: (i) => {
        const v = i.getValue() || "UNREAD";
        return <span className="status-badge" style={{ color: READ_COLORS[v] || "#90c8e0" }}>{v}</span>;
      },
      filterFn: (row, _, filterValue) => !filterValue || row.getValue("readingStatus") === filterValue,
    },
    {
      accessorKey: "ownershipStatus",
      header: t("col.ownershipStatus"),
      cell: (i) => {
        const v = i.getValue() || "OWNED";
        const key = v.toLowerCase();
        return (
          <span className="status-badge" style={{ color: STATUS_COLORS[v] || "#90c8e0" }}>
            {t(`col.${key}`) || v}
          </span>
        );
      },
      filterFn: (row, _, filterValue) => !filterValue || row.getValue("ownershipStatus") === filterValue,
    },
    { accessorKey: "condition",     header: t("col.condition"),     cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "purchaseDate",  header: t("col.purchaseDate"),  cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "allocatedPrice",header: t("col.allocatedPrice"),cell: (i) => i.getValue() != null ? Number(i.getValue()).toFixed(2) : null, filterFn: "includesString" },
    { accessorKey: "saleDate",      header: t("col.saleDate"),      cell: (i) => i.getValue(), filterFn: "includesString" },
    { accessorKey: "salePrice",     header: t("col.salePrice"),     cell: (i) => i.getValue() != null ? Number(i.getValue()).toFixed(2) : null, filterFn: "includesString" },
    { accessorKey: "saleVenue",     header: t("col.saleVenue") || "Sale Venue", cell: (i) => i.getValue(), filterFn: "includesString" },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const selectFilterCols = new Set(["readingStatus", "ownershipStatus"]);

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
      <div className="collection-toolbar">
        <p className="collection-meta">
          {t("col.showing", { filtered: filteredCount, total: data.length })}
        </p>
        <div className="col-picker-wrap" ref={pickerRef}>
          <button className="col-toggle-btn" onClick={() => setShowColPicker((v) => !v)}>
            ⚙ {t("col.toggleColumns")}
          </button>
          {showColPicker && (
            <div className="col-picker-panel">
              {ALL_COLUMNS.map((colId) => (
                <label key={colId} className="col-picker-row">
                  <input
                    type="checkbox"
                    checked={columnVisibility[colId] !== false}
                    onChange={(e) =>
                      setColumnVisibility((prev) => ({ ...prev, [colId]: e.target.checked }))
                    }
                  />
                  <span>{table.getColumn(colId)?.columnDef.header || colId}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="collection-table-wrapper">
        <table className="collection-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const colId = header.column.id;
                  const sorted = header.column.getIsSorted();
                  return (
                    <th key={header.id} className={`col-${colId.toLowerCase()}`}>
                      <button
                        className="col-header-btn"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" && <span className="sort-arrow">▲</span>}
                        {sorted === "desc" && <span className="sort-arrow">▼</span>}
                      </button>
                      {selectFilterCols.has(colId)
                        ? <SelectFilter column={header.column} options={colId === "ownershipStatus" ? statusOptions : readOptions} />
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
