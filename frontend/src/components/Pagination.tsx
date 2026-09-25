import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Paginated } from '@/api/types';
import { Button } from './Button';
export function Pagination({ meta, onPage, busy = false }: {meta: Paginated<unknown>['meta']; onPage: (page: number) => void; busy?: boolean}) {
  if (meta.totalPages <= 1) return null;
  return <nav className="pager" aria-label="Pagination"><p className="pager__status">{(meta.page-1)*meta.limit+1}–{Math.min(meta.page*meta.limit,meta.total)} of {meta.total}</p><div className="pager__buttons">
    <Button variant="secondary" disabled={busy || meta.page <= 1} onClick={() => onPage(meta.page-1)} aria-label="Previous page"><ChevronLeft size={16}/> Previous</Button>
    <Button variant="secondary" disabled={busy || meta.page >= meta.totalPages} onClick={() => onPage(meta.page+1)} aria-label="Next page">Next <ChevronRight size={16}/></Button>
  </div></nav>;
}
