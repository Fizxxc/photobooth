import { formatIDR } from '@/lib/utils';

export function MetricCard({ label, value, currency = false }: { label: string; value: number; currency?: boolean }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-950">{currency ? formatIDR(value) : value}</p>
    </div>
  );
}
