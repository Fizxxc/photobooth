export function CaptureStrip({ previews }: { previews: string[] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: 3 }).map((_, index) => {
        const preview = previews[index];
        return preview ? (
          <img key={index} src={preview} alt={`Capture ${index + 1}`} className="aspect-[3/4] rounded-2xl border border-slate-200 object-cover" />
        ) : (
          <div key={index} className="flex aspect-[3/4] items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-400">
            Frame {index + 1}
          </div>
        );
      })}
    </div>
  );
}
