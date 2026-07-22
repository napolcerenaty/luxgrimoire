'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, ExternalLink, Check, X, Trash2, RotateCcw, GitMerge } from 'lucide-react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import {
  adminListNewsDrafts, adminIngestScreenshot, adminApproveNews, adminRejectNews,
  adminRetractNews, adminDeleteNews, adminListPossibleDuplicates, adminConfirmDuplicate,
  adminDeclineDuplicate, adminListActionRequired, adminResolveActionRequired,
  adminGetStaleNewsletters, type ApiNewsItem, type NewsItemStatus,
} from '@/lib/api'

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const BTN = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50'

const STATUS_TABS: { value: NewsItemStatus | ''; label: string }[] = [
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'RETRACTED', label: 'Retracted' },
  { value: '', label: 'All' },
]

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function RawSourceView({ item }: { item: ApiNewsItem }) {
  const [show, setShow] = useState(false)
  const source = item.sources?.[0]
  if (!source?.rawContentRef) return null

  const isImage = source.sourceType === 'INSTAGRAM_SCREENSHOT'

  return (
    <div className="mt-2">
      <button onClick={() => setShow((s) => !s)} className="text-xs text-stone-500 hover:text-amber-400 transition-colors">
        {show ? 'Hide source' : 'Verify against source'}
      </button>
      {show && (
        isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={source.rawContentRef} alt="Screenshot source" className="mt-2 max-w-xs rounded-lg border border-stone-700" />
        ) : (
          <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-stone-400 bg-stone-950 border border-stone-800 rounded-lg p-3 whitespace-pre-wrap">
            {source.rawContentRef}
          </pre>
        )
      )}
    </div>
  )
}

function DraftCard({ item, onChanged }: { item: ApiNewsItem; onChanged: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const approve = useMutation({ mutationFn: () => adminApproveNews(item.id), onSuccess: onChanged, onError: (e: Error) => alert(e.message) })
  const reject = useMutation({ mutationFn: () => adminRejectNews(item.id), onSuccess: onChanged, onError: (e: Error) => alert(e.message) })
  const retract = useMutation({ mutationFn: () => adminRetractNews(item.id), onSuccess: onChanged, onError: (e: Error) => alert(e.message) })
  const remove = useMutation({ mutationFn: () => adminDeleteNews(item.id), onSuccess: onChanged, onError: (e: Error) => alert(e.message) })

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-700 text-stone-300">{item.status}</span>
            <span className="text-[10px] uppercase tracking-widest text-amber-500">{item.type}</span>
            {item.possibleDuplicateOfId && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 flex items-center gap-1">
                <GitMerge size={11} /> possible duplicate
              </span>
            )}
          </div>
          <p className="text-stone-100 font-medium">{item.title}</p>
          <p className="text-xs text-stone-500 mt-0.5">{item.companyName}</p>
          {item.summary && <p className="text-sm text-stone-400 mt-1.5">{item.summary}</p>}
          {item.originalSourceUrl && (
            <a href={item.originalSourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-stone-500 hover:text-amber-400 flex items-center gap-1 mt-1.5">
              Source <ExternalLink size={11} />
            </a>
          )}
          <RawSourceView item={item} />
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          {item.status === 'DRAFT' && (
            <>
              <button onClick={() => approve.mutate()} disabled={approve.isPending} className={`${BTN} bg-green-700 text-green-100 hover:bg-green-600 flex items-center gap-1`}>
                <Check size={13} /> Approve
              </button>
              <button onClick={() => reject.mutate()} disabled={reject.isPending} className={`${BTN} bg-stone-700 text-stone-300 hover:bg-stone-600 flex items-center gap-1`}>
                <X size={13} /> Reject
              </button>
            </>
          )}
          {item.status === 'REJECTED' && (
            <button onClick={() => approve.mutate()} disabled={approve.isPending} className={`${BTN} bg-green-700 text-green-100 hover:bg-green-600`}>
              Approve
            </button>
          )}
          {item.status === 'PUBLISHED' && (
            <button onClick={() => retract.mutate()} disabled={retract.isPending} className={`${BTN} bg-amber-800 text-amber-100 hover:bg-amber-700 flex items-center gap-1`}>
              <RotateCcw size={13} /> Retract
            </button>
          )}
          <button onClick={() => setConfirmDelete(true)} className={`${BTN} bg-red-900/40 text-red-400 hover:bg-red-900/60 flex items-center gap-1`}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        message={`Permanently delete "${item.title}"? This cannot be undone — unlike Reject, no audit trail is kept.`}
        onConfirm={() => { remove.mutate(); setConfirmDelete(false) }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function ScreenshotUploader({ onIngested }: { onIngested: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [caption, setCaption] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [base64, setBase64] = useState<string | null>(null)

  const ingest = useMutation({
    mutationFn: () => adminIngestScreenshot(base64!, caption || undefined),
    onSuccess: () => { setPreview(null); setBase64(null); setCaption(''); if (fileRef.current) fileRef.current.value = ''; onIngested() },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const onFile = async (file: File) => {
    const dataUri = await fileToBase64(file)
    setPreview(dataUri)
    setBase64(dataUri)
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 mb-6">
      <h2 className="text-sm font-semibold text-stone-200 mb-3 flex items-center gap-2">
        <Upload size={15} /> Ingest Instagram screenshot
      </h2>
      <div className="flex flex-wrap gap-3 items-start">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="text-xs text-stone-400"
        />
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="h-20 rounded-lg border border-stone-700" />
        )}
      </div>
      <textarea
        rows={2}
        className={`${INP} mt-3`}
        placeholder="Caption text (optional, if not already visible in the screenshot)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      <button
        onClick={() => ingest.mutate()}
        disabled={!base64 || ingest.isPending}
        className={`${BTN} bg-amber-500 text-stone-950 hover:bg-amber-400 mt-3`}
      >
        {ingest.isPending ? 'Classifying…' : 'Ingest as draft'}
      </button>
    </div>
  )
}

function PossibleDuplicatesTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'news', 'possible-duplicates'], queryFn: adminListPossibleDuplicates })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'news'] })
  const confirm = useMutation({ mutationFn: adminConfirmDuplicate, onSuccess: invalidate, onError: (e: Error) => alert(e.message) })
  const decline = useMutation({ mutationFn: adminDeclineDuplicate, onSuccess: invalidate, onError: (e: Error) => alert(e.message) })

  if (isLoading) return <div className="text-stone-400 py-8 text-center text-sm">Loading…</div>
  if (!data?.length) return <div className="text-stone-500 py-8 text-center text-sm">No possible duplicates flagged.</div>

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.id} className="bg-stone-900 border border-purple-900/40 rounded-2xl p-4">
          <p className="text-xs text-stone-500 mb-2">Possible duplicate of: <span className="text-stone-300">{item.possibleDuplicateOf?.title ?? item.possibleDuplicateOfId}</span> ({item.possibleDuplicateOf?.status})</p>
          <p className="text-stone-100 font-medium">{item.title}</p>
          <p className="text-xs text-stone-500 mt-0.5">{item.companyName}</p>
          {item.summary && <p className="text-sm text-stone-400 mt-1.5">{item.summary}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={() => confirm.mutate(item.id)} className={`${BTN} bg-green-700 text-green-100 hover:bg-green-600`}>
              {item.possibleDuplicateOf?.status === 'PUBLISHED' ? 'Confirm as update' : 'Confirm merge'}
            </button>
            <button onClick={() => decline.mutate(item.id)} className={`${BTN} bg-stone-700 text-stone-300 hover:bg-stone-600`}>
              Decline match — keep separate
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ActionRequiredTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'news', 'action-required'], queryFn: adminListActionRequired })
  const resolve = useMutation({
    mutationFn: adminResolveActionRequired,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'news', 'action-required'] }),
    onError: (e: Error) => alert(e.message),
  })

  if (isLoading) return <div className="text-stone-400 py-8 text-center text-sm">Loading…</div>
  if (!data?.length) return <div className="text-stone-500 py-8 text-center text-sm">Nothing needs action right now.</div>

  return (
    <div className="space-y-3">
      {data.map((rec) => (
        <div key={rec.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-100 font-medium">{rec.companyName ?? 'Unknown company'} — subscription confirmation</p>
          <p className="text-xs text-stone-500 mt-0.5">Received {new Date(rec.ingestedAt).toLocaleString()}</p>
          {rec.actionUrl ? (
            <a href={rec.actionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300 mt-2">
              Click to confirm <ExternalLink size={13} />
            </a>
          ) : (
            <p className="text-xs text-stone-600 mt-2">No confirm link detected — check the raw email content manually.</p>
          )}
          <div className="mt-3">
            <button onClick={() => resolve.mutate(rec.id)} className={`${BTN} bg-stone-700 text-stone-300 hover:bg-stone-600`}>
              Mark handled
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function StaleNewslettersTab() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'news', 'stale-newsletters'], queryFn: () => adminGetStaleNewsletters() })

  if (isLoading) return <div className="text-stone-400 py-8 text-center text-sm">Loading…</div>
  if (!data?.length) return <div className="text-stone-500 py-8 text-center text-sm">No companies look stale.</div>

  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-500 mb-3">Newsletter-subscribed companies with no email ingested in the last 60 days — either they stopped sending, or we got dropped from their list.</p>
      {data.map((c) => (
        <div key={c.id} className="bg-stone-900 border border-stone-800 rounded-xl px-4 py-2.5 text-sm text-stone-200">
          {c.name}
        </div>
      ))}
    </div>
  )
}

export default function AdminNewsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'drafts' | 'duplicates' | 'action-required' | 'stale'>('drafts')
  const [statusFilter, setStatusFilter] = useState<NewsItemStatus | ''>('DRAFT')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'news', 'drafts', statusFilter],
    queryFn: () => adminListNewsDrafts({ status: statusFilter || undefined, pageSize: 100 }),
    enabled: tab === 'drafts',
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'news'] })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-100">News moderation</h1>
        <p className="text-stone-500 text-sm mt-0.5">Review AI-ingested drafts before anything goes public</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-stone-800 pb-3">
        {[
          { value: 'drafts', label: 'Drafts' },
          { value: 'duplicates', label: 'Possible Duplicates' },
          { value: 'action-required', label: 'Needs Action' },
          { value: 'stale', label: 'Stale Newsletters' },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value as typeof tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.value ? 'bg-amber-400 text-stone-950' : 'bg-stone-800 text-stone-400 hover:bg-stone-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'drafts' && (
        <>
          <ScreenshotUploader onIngested={refresh} />

          <div className="flex gap-2 flex-wrap mb-4">
            {STATUS_TABS.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s.value ? 'bg-stone-100 text-stone-900' : 'bg-stone-800 text-stone-400 hover:bg-stone-700'}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="text-stone-400 py-16 text-center">Loading…</div>
          ) : !data?.data.length ? (
            <div className="text-center py-16 text-stone-500">Nothing here.</div>
          ) : (
            <div className="space-y-3">
              {data.data.map((item) => <DraftCard key={item.id} item={item} onChanged={refresh} />)}
            </div>
          )}
        </>
      )}

      {tab === 'duplicates' && <PossibleDuplicatesTab />}
      {tab === 'action-required' && <ActionRequiredTab />}
      {tab === 'stale' && <StaleNewslettersTab />}
    </div>
  )
}
