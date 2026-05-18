export function geojsonToCsv(geoJsonData: {
  features: Array<{
    properties: Record<string, any>;
    geometry?: {
      type?: string;
      coordinates?: any;
    } | null;
  }>;
}): string {
  if (!geoJsonData.features || geoJsonData.features.length === 0) {
    console.error("GeoJSON has no features.");
    return "geojson has no features";
  }

  const headerSet = new Set<string>();
  let hasExportableLatLon = false;

  const getLatLon = (
    geometry?: {
      type?: string;
      coordinates?: any;
    } | null
  ): { lat: number; lon: number } | null => {
    if (!geometry) {
      return null;
    }

    if (
      geometry.type === "Point" &&
      Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length >= 2
    ) {
      const [lon, lat] = geometry.coordinates;
      return { lat, lon };
    }

    if (
      geometry.type === "MultiPoint" &&
      Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length === 1 &&
      Array.isArray(geometry.coordinates[0]) &&
      geometry.coordinates[0].length >= 2
    ) {
      const [lon, lat] = geometry.coordinates[0];
      return { lat, lon };
    }

    return null;
  };

  for (const feature of geoJsonData.features) {
    const props = feature.properties;

    if (props && typeof props === "object") {
      Object.keys(props).forEach((key) => headerSet.add(key));
    }

    if (getLatLon(feature.geometry)) {
      hasExportableLatLon = true;
    }
  }

  const headers = Array.from(headerSet);

  if (hasExportableLatLon) {
    headers.push("lat", "lon");
  }

  const csvRows: string[] = [headers.join(",")];

  const escapeCsvValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "";
    }

    const stringValue = String(value);

    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  };

  for (const feature of geoJsonData.features) {
    const latLon = getLatLon(feature.geometry);

    const values = headers.map((key) => {
      if (key === "lat") {
        return escapeCsvValue(latLon?.lat);
      }

      if (key === "lon") {
        return escapeCsvValue(latLon?.lon);
      }

      return escapeCsvValue(feature.properties?.[key] ?? "");
    });

    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}
