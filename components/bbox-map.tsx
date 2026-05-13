"use client";

import { useEffect, useRef } from "react";
// @ts-ignore - leaflet types not installed
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface BBox {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
}

interface BboxMapProps {
  initialBbox: BBox | null;
  layerBounds?: {
    minx: number;
    miny: number;
    maxx: number;
    maxy: number;
  };
  onBboxChange: (bbox: BBox | null) => void;
}

export default function BboxMap({
  initialBbox,
  layerBounds,
  onBboxChange
}: BboxMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const rectangleRef = useRef<any>(null);
  const drawingRef = useRef<{
    isDrawing: boolean;
    startLatLng: any;
  }>({ isDrawing: false, startLatLng: null });
  const tempRectangleRef = useRef<any>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center (Berlin)
    let center: [number, number] = [52.52, 13.405];
    let zoom = 10;

    // Use layer bounds if available
    if (layerBounds) {
      center = [
        (layerBounds.miny + layerBounds.maxy) / 2,
        (layerBounds.minx + layerBounds.maxx) / 2
      ];
    }

    const map = L.map(mapContainerRef.current, {
      center,
      zoom,
      zoomControl: true
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // Invalidate size after a short delay to ensure proper rendering in dialog
    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    // Fit to layer bounds if available
    if (layerBounds) {
      map.fitBounds([
        [layerBounds.miny, layerBounds.minx],
        [layerBounds.maxy, layerBounds.maxx]
      ]);
    }

    // If there's an existing bbox, display it
    if (initialBbox) {
      const rect = L.rectangle(
        [
          [initialBbox.miny, initialBbox.minx],
          [initialBbox.maxy, initialBbox.maxx]
        ],
        {
          color: "#4c68c7",
          weight: 2,
          fillOpacity: 0.2
        }
      ).addTo(map);
      rectangleRef.current = rect;
      map.fitBounds(rect.getBounds(), { padding: [50, 50] });
    }

    // Mouse events for drawing rectangle
    map.on("mousedown", (e: any) => {
      if (e.originalEvent.shiftKey) return; // Allow shift+drag for pan

      drawingRef.current = {
        isDrawing: true,
        startLatLng: e.latlng
      };

      // Remove existing rectangles
      if (rectangleRef.current) {
        map.removeLayer(rectangleRef.current);
        rectangleRef.current = null;
      }
      if (tempRectangleRef.current) {
        map.removeLayer(tempRectangleRef.current);
        tempRectangleRef.current = null;
      }

      map.dragging.disable();
    });

    map.on("mousemove", (e: any) => {
      if (!drawingRef.current.isDrawing || !drawingRef.current.startLatLng)
        return;

      const bounds = L.latLngBounds(drawingRef.current.startLatLng, e.latlng);

      if (tempRectangleRef.current) {
        tempRectangleRef.current.setBounds(bounds);
      } else {
        tempRectangleRef.current = L.rectangle(bounds, {
          color: "#4c68c7",
          weight: 2,
          fillOpacity: 0.2,
          dashArray: "5, 5"
        }).addTo(map);
      }
    });

    map.on("mouseup", (e: any) => {
      if (!drawingRef.current.isDrawing || !drawingRef.current.startLatLng) {
        return;
      }

      map.dragging.enable();

      const startLatLng = drawingRef.current.startLatLng;
      const endLatLng = e.latlng;

      // Reset drawing state
      drawingRef.current = { isDrawing: false, startLatLng: null };

      // Remove temp rectangle
      if (tempRectangleRef.current) {
        map.removeLayer(tempRectangleRef.current);
        tempRectangleRef.current = null;
      }

      // Check if the rectangle has a meaningful size
      const latDiff = Math.abs(startLatLng.lat - endLatLng.lat);
      const lngDiff = Math.abs(startLatLng.lng - endLatLng.lng);

      if (latDiff < 0.0001 && lngDiff < 0.0001) {
        // Too small, likely a click - ignore
        return;
      }

      // Create final rectangle
      const bounds = L.latLngBounds(startLatLng, endLatLng);
      const rect = L.rectangle(bounds, {
        color: "#4c68c7",
        weight: 2,
        fillOpacity: 0.2
      }).addTo(map);

      rectangleRef.current = rect;

      // Notify parent of new bbox
      onBboxChange({
        minx: bounds.getWest(),
        miny: bounds.getSouth(),
        maxx: bounds.getEast(),
        maxy: bounds.getNorth()
      });
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        rectangleRef.current = null;
        tempRectangleRef.current = null;
        drawingRef.current = { isDrawing: false, startLatLng: null };
      }
    };
  }, [layerBounds, initialBbox, onBboxChange]);

  // Function to clear the rectangle (exposed via parent's clear button)
  const clearRectangle = () => {
    if (mapInstanceRef.current && rectangleRef.current) {
      mapInstanceRef.current.removeLayer(rectangleRef.current);
      rectangleRef.current = null;
    }
    onBboxChange(null);
  };

  return (
    <div
      ref={mapContainerRef}
      className="w-full rounded-md border"
      style={{ cursor: "crosshair", height: "100%", minHeight: "400px" }}
    />
  );
}
