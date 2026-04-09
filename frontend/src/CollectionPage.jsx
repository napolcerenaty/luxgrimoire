import { useState, useEffect, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from "@tanstack/react-table";
import "./CollectionPage.css";

function BoolCell({ value }) {
  return value ? (
    <span className="bool-check">✓</span>
  ) : (
    <span className="bool-cross">✗</span>
  );
}

function BoolFilter({ column }) {
  const val = column.getFilterValue() ?? "";
  return (
    <div className="col-filter">
      <select value={val} onChange={(e) => column.setFilterValue(e.target.value || undefined)}>
        <option value="">All</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </div>
  );
}

function TextFilter({ column }) {
  const val = column.getFilterValue() ?? "";
  return (
    <div className="col-filter">
      <input
        value={val}
        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
        placeholder="Filter…"
      />
    </div>
  );
}

const boolFilterFn = (row, columnId, filterValue) => {
  const cellVal = row.getValue(columnId);
  return String(cellVal) === filterValue;
};

export default function CollectionPage() {
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
    {
      accessorKey: "language",
      header: "Language",
      cell: (info) => info.getValue(),
      filterFn: "includesString",
    },
    {
      accessorKey: "author",
      header: "Author",
      cell: (info) => info.getValue(),
      filterFn: "includesString",
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: (info) => info.getValue(),
      filterFn: "includesString",
    },
    {
      accessorKey: "series",
      header: "Series",
      cell: (info) => info.getValue(),
      filterFn: "includesString",
    },
    {
      accessorKey: "volume",
      header: "Vol.",
      cell: (info) => info.getValue(),
      filterFn: "includesString",
    },
    {
      accessorKey: "edition",
      header: "Edition",
      cell: (info) => info.getValue(),
      filterFn: "includesString",
    },
    {
      accessorKey: "features",
      header: "Features",
      cell: (info) => info.getValue(),
      filterFn: "includesString",
    },
    {
      accessorKey: "read",
      header: "Read",
      cell: (info) => <BoolCell value={info.getValue()} />,
      filterFn: boolFilterFn,
    },
    {
      accessorKey: "forSale",
      header: "For Sale",
      cell: (info) => <BoolCell value={info.getValue()} />,
      filterFn: boolFilterFn,
    },
    {
      accessorKey: "notes",
      header: "Notes",
      cell: (info) => info.getValue(),
      filterFn: "includesString",
    },
  ], []);

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
      <span>Loading collection…</span>
    </div>
  );
  if (error) return (
    <div className="status-container">
      <p className="error-text">⚠ Could not load collection: {error}</p>
    </div>
  );

  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="collection-page">
      <p className="collection-meta">
        Showing <span>{filteredCount}</span> of <span>{data.length}</span> entries
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
                    <th key={header.id} className={`col-${header.column.id.toLowerCase().replace("forsale","forsale")}`}>
                      <button
                        className="col-header-btn"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" && <span className="sort-arrow">▲</span>}
                        {sorted === "desc" && <span className="sort-arrow">▼</span>}
                      </button>
                      {isBool
                        ? <BoolFilter column={header.column} />
                        : <TextFilter column={header.column} />
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
