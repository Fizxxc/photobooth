export function OverlayPicker({
  overlays,
  selectedOverlayId,
  onChange
}: {
  overlays: Array<{ id: string; label: string }>;
  selectedOverlayId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-600">Choose overlay</label>
      <select
        value={selectedOverlayId}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-300 px-4 py-3"
      >
        {overlays.map((overlay) => (
          <option key={overlay.id} value={overlay.id}>{overlay.label}</option>
        ))}
      </select>
    </div>
  );
}
