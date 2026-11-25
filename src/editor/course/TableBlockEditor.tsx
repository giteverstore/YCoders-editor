import { Plus, Trash2 } from 'lucide-react'
import type { ContentBlock } from '../../content/blocks/block.schemas'

export const TABLE_MAX_COLUMNS = 20
export const TABLE_MAX_ROWS = 200
type TableData = Extract<ContentBlock, { type: 'table' }>['data']

export function normalizeTableData(data: TableData): TableData {
  const headers = data.headers.slice(0, TABLE_MAX_COLUMNS)
  return { headers, rows: data.rows.slice(0, TABLE_MAX_ROWS).map((row) => headers.map((_, index) => row[index] ?? '')) }
}
export function addTableColumn(data: TableData): TableData { const value = normalizeTableData(data); if (value.headers.length >= TABLE_MAX_COLUMNS) return value; return { headers: [...value.headers, `Column ${value.headers.length + 1}`], rows: value.rows.map((row) => [...row, '']) } }
export function removeTableColumn(data: TableData, index: number): TableData { const value = normalizeTableData(data); if (value.headers.length <= 1) return value; return { headers: value.headers.filter((_, item) => item !== index), rows: value.rows.map((row) => row.filter((_, item) => item !== index)) } }
export function addTableRow(data: TableData): TableData { const value = normalizeTableData(data); return value.rows.length >= TABLE_MAX_ROWS ? value : { ...value, rows: [...value.rows, value.headers.map(() => '')] } }
export function removeTableRow(data: TableData, index: number): TableData { const value = normalizeTableData(data); return { ...value, rows: value.rows.filter((_, item) => item !== index) } }
export function renameTableHeader(data: TableData, index: number, value: string): TableData { const normalized = normalizeTableData(data); return { ...normalized, headers: normalized.headers.map((header, item) => item === index ? value : header) } }

export function TableBlockEditor({ block, onChange }: { block: Extract<ContentBlock, { type: 'table' }>; onChange: (block: Extract<ContentBlock, { type: 'table' }>) => void }) {
  const data = normalizeTableData(block.data), update = (next: TableData) => onChange({ ...block, data: next })
  return <div className="table-builder"><div className="table-builder__scroll"><table><thead><tr>{data.headers.map((header, column) => <th key={column}><input aria-label={`Column ${column + 1} header`} value={header} onChange={(event) => update(renameTableHeader(data, column, event.target.value))} /><button type="button" aria-label={`Delete column ${column + 1}`} disabled={data.headers.length <= 1} onClick={() => update(removeTableColumn(data, column))}><Trash2 size={13} /></button></th>)}<th className="table-builder__row-actions"><span className="sr-only">Row actions</span></th></tr></thead><tbody>{data.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}><input aria-label={`Row ${rowIndex + 1}, column ${column + 1}`} value={cell} onChange={(event) => update({ ...data, rows: data.rows.map((current, index) => index === rowIndex ? current.map((value, item) => item === column ? event.target.value : value) : current) })} /></td>)}<td className="table-builder__row-actions"><button type="button" aria-label={`Delete row ${rowIndex + 1}`} onClick={() => update(removeTableRow(data, rowIndex))}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div><div className="table-builder__actions"><button className="button button--secondary" type="button" disabled={data.rows.length >= TABLE_MAX_ROWS} onClick={() => update(addTableRow(data))}><Plus size={14} /> Add row</button><button className="button button--secondary" type="button" disabled={data.headers.length >= TABLE_MAX_COLUMNS} onClick={() => update(addTableColumn(data))}><Plus size={14} /> Add column</button><span>{data.rows.length} rows · {data.headers.length} columns</span></div></div>
}
