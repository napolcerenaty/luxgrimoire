import { useState, useEffect, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from "@tanstack/react-table";
import "./CollectionPage.css";

const COLUMNS = [
  { accessorKey: "language", header: "Język",    size: 80,  filterType: "text" },
  { accessorKey: "author",   header: "Autor",    size: 160, filterType: "text" },
  { accessorKey: "title",    header: "Tytuł",    size: 200, filterType: "text" },
  { accessorKey: "series",   header: "Seria",    size: 160, filterType: "text" },
  { accessorKey: "volume",   header: "Tom",      size: 50,  filterType: "text" },
  { accessorKey: "edition",  header: "Edycja",   size: 140, filterType: "text" },
  { accessorKey: "features", header: "Cechy",    size: 150, filterType: "text" },
  {
    accessorKey: "read",
    header: "Przeczytane",
    size: 100,
    filterType: "bool",
    cell: ({ getValue }) => getValue()
      ? <span className="bool-check">✓</span>
      : <span className="bool-cross">✗</span>,
  },
  {
    accessorKey: "forSale",
    header: "Na sprzedaż",
    size: 100,
    filterType: "bool",
    cell: ({ getValue }) => getValue()
      ? <span className="bool-check">✓</span>
      : <span className="bool-cross">✗</span>,
  },
  { accessorKey: "notes", header: "Notatki", size: 100, filterType: "text" },
];

function BoolFilter({ column }) {
  const val = column.getFilterValue() ?? "";
  return (
    <select
      value={val}
      onChange={(e) => column.setFilterValue(e.target.value === "" ? undefined : e.target.value)}
    >
      <option value="">Wszystkie</option>
      <option value="true">Tak</option>
      <option value="false">Nie</option>
    </select>
  );
}

function TextFilter({ column }) {
  const val = column.getFilterValue() ?? "";
  return (
    <input
      value={val}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder="Filtruj…"
    />
  );
}

function boolFilterFn(row, columnId, filterValue) {
  if (filterValue === undefined || filterValue === "") return true;
  return String(row.getValue(columnId)) === filterValue;
}
boolFilterFn.autoRemove = (val) => val === undefined || val === "";

export default function CollectionPage() {
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [sorting, setSorting]   = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);

  useEffect(() => {
    fetch("http://localhost:8080/api/collection")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const columns = useMemo(() => COLUMNS.map((col) => ({
    ...col,
    filterFn: col.filterType === "bool" ? boolFilterFn : "includesString",
  })), []);

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

  const totalRows    = data.length;
  const filteredRows = table.getFilteredRowModel().rows.length;

  if (loading) return (
    <div className="status-container">
      <div className="spinner" />
      <span>Ładowanie kolekcji…</span>
    </div>
  );
  if (error) return (
    <div className="status-container">
      <p className="error-text">⚠ Nie można załadować danych: {error}</p>
      <p>Upewnij się, że backend Spring Boot działa na porcie 8080.</p>
    </div>
  );

  return (
    <div className="collection-page">
      <p className="collection-meta">
        Pokazuje <span>{filteredRows}</span> z <span>{totalRows}</span> pozycji
      </p>
      <div className="collection-table-wrapper">
        <table className="collection-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const colDef = header.column.columnDef;
                  const sorted = header.column.getIsSorted();
                  return (
                    <th key={header.id} style={{ width: colDef.size }}>
                      <button
                        className="col-header-btn"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(colDef.header, header.getContext())}
                        <span className="sort-arrow">
                          {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "⇅"}
                        </span>
                      </button>
                      <div className="col-filter">
                        {colDef.filterType === "bool"
                          ? <BoolFilter column={header.column} />
                          : <TextFilter column={header.column} />}
                      </div>
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
