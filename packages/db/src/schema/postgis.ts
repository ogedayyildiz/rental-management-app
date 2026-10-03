import { sql } from 'drizzle-orm';
import { customType } from 'drizzle-orm/pg-core';

export interface LonLat {
  lon: number;
  lat: number;
}

/** Parses the hex EWKB that PostGIS returns for a POINT column. */
function parseEwkbPoint(hex: string): LonLat {
  const buf = Buffer.from(hex, 'hex');
  const le = buf.readUInt8(0) === 1;
  const type = le ? buf.readUInt32LE(1) : buf.readUInt32BE(1);
  const offset = type & 0x20000000 ? 9 : 5; // skip embedded SRID if present
  const read = (o: number) => (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
  return { lon: read(offset), lat: read(offset + 8) };
}

/** WGS84 point stored as geometry(Point, 4326); exposed as { lon, lat }. */
export const point = customType<{ data: LonLat; driverData: string }>({
  dataType: () => 'geometry(Point, 4326)',
  toDriver: (v) => sql`ST_SetSRID(ST_MakePoint(${v.lon}, ${v.lat}), 4326)`,
  fromDriver: (v) => parseEwkbPoint(v),
});

/** WGS84 polygon stored as geometry(Polygon, 4326); written as a GeoJSON geometry. */
export const polygon = customType<{ data: object; driverData: string }>({
  dataType: () => 'geometry(Polygon, 4326)',
  toDriver: (v) => sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(v)}), 4326)`,
  // Raw EWKB; select with ST_AsGeoJSON when the shape itself is needed.
  fromDriver: (v) => v as unknown as object,
});
