"use client";

import type { FeatureCollection, Point } from "geojson";
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Machine } from "@/lib/api";
import { STATUS_COLOR } from "@/lib/format";

// Copied into public/ by scripts/copy-maplibre-worker.mjs
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

// OpenStreetMap raster tiles for development. For production, set
// NEXT_PUBLIC_MAP_STYLE_URL to a hosted vector style (e.g. MapTiler).
const DEV_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function toGeoJson(machines: Machine[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: machines
      .filter((m) => m.lat != null && m.lon != null)
      .map((m) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [m.lon!, m.lat!] },
        properties: {
          id: m.id,
          name: m.name,
          color: STATUS_COLOR[m.status],
          hasErrors: m.activeErrorCodes.length > 0,
        },
      })),
  };
}

export function MachineMap({ machines, className = "" }: { machines: Machine[]; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const router = useRouter();
  // Data for the initial load; later updates go through setData below.
  const latest = useRef(machines);

  useEffect(() => {
    if (!container.current) return;
    const m = new MapLibreMap({
      container: container.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? DEV_STYLE,
      center: [28.98, 41.05],
      zoom: 9,
    });
    m.addControl(new NavigationControl(), "top-right");
    m.on("load", () => {
      m.addSource("machines", { type: "geojson", data: toGeoJson(latest.current) });
      // Red halo for machines with active error codes
      m.addLayer({
        id: "machine-errors",
        type: "circle",
        source: "machines",
        filter: ["==", ["get", "hasErrors"], true],
        paint: { "circle-radius": 12, "circle-color": "#dc2626", "circle-opacity": 0.3 },
      });
      m.addLayer({
        id: "machine-points",
        type: "circle",
        source: "machines",
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      m.on("click", "machine-points", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) router.push(`/machines/${id}`);
      });
      const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      m.on("mouseenter", "machine-points", (e: MapLayerMouseEvent) => {
        m.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (f?.geometry.type === "Point") {
          popup
            .setLngLat(f.geometry.coordinates as [number, number])
            .setText(String(f.properties?.name ?? ""))
            .addTo(m);
        }
      });
      m.on("mouseleave", "machine-points", () => {
        m.getCanvas().style.cursor = "";
        popup.remove();
      });
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, [router]);

  useEffect(() => {
    latest.current = machines;
    const source = map.current?.getSource<GeoJSONSource>("machines");
    source?.setData(toGeoJson(machines));
  }, [machines]);

  return <div ref={container} className={`overflow-hidden rounded-lg border border-border ${className}`} />;
}
