'use client';

import { useEffect, useMemo, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import { updateBoothLocation } from '@/app/actions/admin';

type BoothLocationItem = {
  id: string;
  name: string;
  location_name?: string | null;
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_notes?: string | null;
};

export function BoothLocationCard({ booths }: { booths: BoothLocationItem[] }) {
  const [selectedId, setSelectedId] = useState(booths[0]?.id ?? '');

  const selectedBooth = useMemo(
    () => booths.find((item) => item.id === selectedId) ?? booths[0] ?? null,
    [booths, selectedId]
  );

  const [locationName, setLocationName] = useState(selectedBooth?.location_name ?? selectedBooth?.name ?? '');
  const [locationAddress, setLocationAddress] = useState(selectedBooth?.location_address ?? '');
  const [locationLat, setLocationLat] = useState(
    selectedBooth?.location_lat != null ? String(selectedBooth.location_lat) : ''
  );
  const [locationLng, setLocationLng] = useState(
    selectedBooth?.location_lng != null ? String(selectedBooth.location_lng) : ''
  );
  const [locationNotes, setLocationNotes] = useState(selectedBooth?.location_notes ?? '');

  useEffect(() => {
    setLocationName(selectedBooth?.location_name ?? selectedBooth?.name ?? '');
    setLocationAddress(selectedBooth?.location_address ?? '');
    setLocationLat(selectedBooth?.location_lat != null ? String(selectedBooth.location_lat) : '');
    setLocationLng(selectedBooth?.location_lng != null ? String(selectedBooth.location_lng) : '');
    setLocationNotes(selectedBooth?.location_notes ?? '');
  }, [selectedBooth]);

  async function useCurrentLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationLat(String(position.coords.latitude));
        setLocationLng(String(position.coords.longitude));
      },
      () => {
        // ignore
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const lat = Number(locationLat);
  const lng = Number(locationLng);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);

  const mapSrc = hasPoint
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01}%2C${lat - 0.01}%2C${lng + 0.01}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`
    : null;

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex items-center gap-2 text-brand-600">
        <MapPin className="h-4 w-4" />
        <p className="text-xs font-semibold uppercase tracking-[0.25em]">Booth location</p>
      </div>

      <h3 className="mt-2 text-xl font-bold text-slate-950">Atur lokasi realtime booth</h3>

      <form action={updateBoothLocation} className="mt-5 space-y-4">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700">Pilih booth</label>
          <select
            name="boothId"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          >
            {booths.map((booth) => (
              <option key={booth.id} value={booth.id}>
                {booth.name}
              </option>
            ))}
          </select>
        </div>

        <input
          name="locationName"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder="Nama lokasi"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
        />

        <textarea
          name="locationAddress"
          value={locationAddress}
          onChange={(e) => setLocationAddress(e.target.value)}
          rows={3}
          placeholder="Alamat booth"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
        />

        <div className="grid gap-3 md:grid-cols-2">
          <input
            name="locationLat"
            value={locationLat}
            onChange={(e) => setLocationLat(e.target.value)}
            placeholder="Latitude"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          />
          <input
            name="locationLng"
            value={locationLng}
            onChange={(e) => setLocationLng(e.target.value)}
            placeholder="Longitude"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          />
        </div>

        <textarea
          name="locationNotes"
          value={locationNotes}
          onChange={(e) => setLocationNotes(e.target.value)}
          rows={3}
          placeholder="Catatan lokasi"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
        />

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={useCurrentLocation}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900"
          >
            <LocateFixed className="h-4 w-4" />
            Gunakan lokasi saat ini
          </button>

          <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
            Simpan lokasi booth
          </button>
        </div>
      </form>

      {mapSrc ? (
        <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-200">
          <iframe
            src={mapSrc}
            className="h-[300px] w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : null}
    </section>
  );
}