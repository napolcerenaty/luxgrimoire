'use client'

import React from 'react'

interface Column<T> {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onEdit?: (row: T) => void
  onDelete?: (row: T) => void
}

function DataTable<T>({ columns, data, onEdit, onDelete }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-800">
      <table className="w-full text-sm text-stone-200">
        <thead>
          <tr className="border-b border-stone-800 bg-stone-900/80">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400"
              >
                {col.label}
              </th>
            ))}
            {(onEdit || onDelete) && (
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={(row as Record<string, unknown>).id as string ?? index}
              className="border-b border-stone-800/50 bg-stone-900 hover:bg-stone-800/50 transition-colors"
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-stone-300">
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
              {(onEdit || onDelete) && (
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(row)}
                        className="bg-amber-400/10 text-amber-400 border border-amber-400/20 px-3 py-1 rounded text-xs font-medium hover:bg-amber-400/20 transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(row)}
                        className="bg-red-900/50 text-red-300 px-3 py-1 rounded text-xs hover:bg-red-900 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (onEdit || onDelete ? 1 : 0)}
                className="px-4 py-8 text-center text-stone-500"
              >
                No records found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default DataTable
