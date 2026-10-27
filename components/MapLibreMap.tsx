"use client";

import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { DriverCar, LocationItem } from "@/lib/mapData";
import { Plus, Minus, Crosshair } from "lucide-react";

interface MapLibreMapProps {
  pickup: LocationItem | null;
  dropoff: LocationItem | null;
  driverCars: DriverCar[];
  onSelectMapLocation?: (type: "pickup" | "dropoff", location: LocationItem) => void;
  targetMode?: "pickup" | "dropoff" | null;
  onLocateCurrentLocation?: () => void;
}

export default function MapLibreMap({
  pickup,
  dropoff,
  driverCars,
  onSelectMapLocation,
  targetMode = null,
  onLocateCurrentLocation,
}: MapLibreMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const carMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const pickupMarkerRef = useRef<maplibregl.Marker | null>(null);
  const dropoffMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize MapLibre GL JS with OpenFreeMap
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Tell MapLibre where to load the worker from (required for Next.js / Turbopack)
    maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

    // Central Bengaluru (Vidhana Soudha area)
    const initialLng = 77.5915;
    const initialLat = 12.9778;

    // OpenFreeMap style: liberty or bright (free vector tiles without API key)
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [initialLng, initialLat],
      zoom: 14,
      attributionControl: false,
    });

    // Add clean attribution to bottom-left
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "OpenFreeMap · OpenStreetMap",
      }),
      "bottom-left"
    );

    map.on("load", () => {
      // Add Route Source and Layer for connecting pickup & dropoff
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [],
          },
        },
      });

      // White casing layer for high contrast
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#ffffff",
          "line-width": 8,
          "line-opacity": 0.9,
        },
      });

      // Primary Route line layer (Royal blue matching theme)
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#2563eb",
          "line-width": 5,
          "line-opacity": 0.95,
        },
      });

      setMapLoaded(true);
    });

    // Click handler to drop pin
    map.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      const newLoc: LocationItem = {
        id: `pin_${Date.now()}`,
        name: `Dropped Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        address: "Selected location on map",
        lat,
        lng,
      };

      if (onSelectMapLocation) {
        const mode = targetMode || (!pickup ? "pickup" : "dropoff");
        onSelectMapLocation(mode, newLoc);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Driver Cars on the Map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // Returns distinct top-down SVG per vehicle type
    function getVehicleHTML(car: typeof driverCars[0]): string {
      const rot = car.rotation;
      const shadow = `filter: drop-shadow(0 2px 5px rgba(0,0,0,0.32));`;

      if (car.type === "car") {
        return `
          <div class="vehicle-wrap" style="transform:rotate(${rot}deg);transition:transform 0.6s ease;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
            <svg width="26" height="34" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="${shadow}">
              <!-- Car body -->
              <rect x="4" y="2" width="20" height="32" rx="7" fill="#FFFFFF" stroke="#1e293b" stroke-width="1.6"/>
              <!-- Windshield -->
              <path d="M7 9C7 7 9 6 14 6C19 6 21 7 21 9L20 13H8L7 9Z" fill="#2563EB"/>
              <!-- Roof/cabin windows -->
              <rect x="8" y="14" width="12" height="8" rx="2" fill="#bfdbfe"/>
              <!-- Rear -->
              <path d="M8 23H20L20.5 27C20.5 28 19 29 14 29C9 29 7.5 28 7.5 27L8 23Z" fill="#1e293b"/>
              <!-- Headlights -->
              <rect x="6" y="2.5" width="3.5" height="2" rx="1" fill="#fde68a"/>
              <rect x="18.5" y="2.5" width="3.5" height="2" rx="1" fill="#fde68a"/>
              <!-- Taillights -->
              <rect x="6" y="30" width="3.5" height="2" rx="1" fill="#fca5a5"/>
              <rect x="18.5" y="30" width="3.5" height="2" rx="1" fill="#fca5a5"/>
              <!-- Wheels -->
              <rect x="2" y="8" width="3" height="6" rx="1.5" fill="#475569"/>
              <rect x="23" y="8" width="3" height="6" rx="1.5" fill="#475569"/>
              <rect x="2" y="22" width="3" height="6" rx="1.5" fill="#475569"/>
              <rect x="23" y="22" width="3" height="6" rx="1.5" fill="#475569"/>
            </svg>
          </div>
        `;
      }

      if (car.type === "scooty") {
        return `
          <div class="vehicle-wrap" style="transform:rotate(${rot}deg);transition:transform 0.6s ease;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
            <svg width="22" height="32" viewBox="0 0 22 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="${shadow}">
              <!-- Fork / frame -->
              <rect x="8" y="2" width="6" height="32" rx="3" fill="#4f46e5"/>
              <!-- Handlebar -->
              <rect x="2" y="5" width="18" height="3" rx="1.5" fill="#312e81"/>
              <!-- Front wheel -->
              <ellipse cx="11" cy="31" rx="5" ry="3.5" fill="#1e293b"/>
              <ellipse cx="11" cy="31" rx="3" ry="2" fill="#4f46e5"/>
              <!-- Back seat -->
              <rect x="7" y="12" width="8" height="5" rx="2.5" fill="#6366f1"/>
              <!-- Headlight -->
              <ellipse cx="11" cy="3" rx="3" ry="2" fill="#fde68a"/>
            </svg>
          </div>
        `;
      }

      // Bike
      return `
        <div class="vehicle-wrap" style="transform:rotate(${rot}deg);transition:transform 0.6s ease;width:30px;height:30px;display:flex;align-items:center;justify-content:center;">
          <svg width="20" height="30" viewBox="0 0 20 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="${shadow}">
            <!-- Frame -->
            <rect x="7.5" y="2" width="5" height="30" rx="2.5" fill="#059669"/>
            <!-- Handlebar -->
            <rect x="2" y="5" width="16" height="2.5" rx="1.25" fill="#047857"/>
            <!-- Front wheel -->
            <ellipse cx="10" cy="30" rx="4.5" ry="3" fill="#1e293b"/>
            <ellipse cx="10" cy="30" rx="2.5" ry="1.5" fill="#059669"/>
            <!-- Tank -->
            <rect x="7" y="14" width="6" height="5" rx="2" fill="#10b981"/>
            <!-- Headlight -->
            <ellipse cx="10" cy="3" rx="2.5" ry="1.5" fill="#fde68a"/>
          </svg>
        </div>
      `;
    }

    driverCars.forEach((car) => {
      if (carMarkersRef.current.has(car.id)) {
        const marker = carMarkersRef.current.get(car.id)!;
        marker.setLngLat([car.lng, car.lat]);
        const el = marker.getElement();
        if (el) {
          const wrap = el.querySelector(".vehicle-wrap") as HTMLElement;
          if (wrap) wrap.style.transform = `rotate(${car.rotation}deg)`;
        }
      } else {
        const el = document.createElement("div");
        el.className = "hopon-vehicle-marker cursor-pointer";
        el.innerHTML = getVehicleHTML(car);

        // Type label colour
        const labelColor = car.type === "car" ? "#2563eb" : car.type === "scooty" ? "#4f46e5" : "#059669";

        const popup = new maplibregl.Popup({ offset: 22, closeButton: false }).setHTML(
          `<div style="font-weight:700;font-size:12px;color:#0f172a;">${car.model}</div>
           <div style="font-size:10px;color:${labelColor};font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">${car.type} · HopOn</div>
           <div style="font-size:10px;color:#64748b;">${car.plate}</div>`
        );

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([car.lng, car.lat])
          .setPopup(popup)
          .addTo(map);

        carMarkersRef.current.set(car.id, marker);
      }
    });
  }, [driverCars, mapLoaded]);


  // Update Pickup / Dropoff Markers and Route

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;    // Handle Pickup Marker (Blue matching login page route card)
    if (pickup) {
      const displayName = pickup.name.length > 24 ? pickup.name.slice(0, 22) + "…" : pickup.name;
      if (!pickupMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pickup-marker-wrapper cursor-pointer select-none";
        el.innerHTML = `
          <div class="relative flex flex-col items-center">
            <div class="relative flex items-center justify-center w-8 h-8">
              <div class="absolute w-8 h-8 rounded-full bg-blue-500/25 animate-ping"></div>
              <div class="relative w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center">
                <div class="w-2 h-2 rounded-full bg-white"></div>
              </div>
            </div>
            <div class="mt-1 bg-blue-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap shadow-md border border-blue-400 pickup-name-badge">
              📍 ${displayName}
            </div>
          </div>
        `;
        const popup = new maplibregl.Popup({ offset: 35 }).setHTML(`
          <div style="font-weight:700;font-size:12px;color:#1e40af;">Pickup Location</div>
          <div style="font-size:11px;color:#0f172a;margin-top:2px;font-weight:600;">${pickup.name}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">${pickup.address}</div>
        `);
        pickupMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([pickup.lng, pickup.lat])
          .setPopup(popup)
          .addTo(map);
      } else {
        pickupMarkerRef.current.setLngLat([pickup.lng, pickup.lat]);
        const badge = pickupMarkerRef.current.getElement()?.querySelector(".pickup-name-badge");
        if (badge) badge.textContent = `📍 ${displayName}`;
        const popup = new maplibregl.Popup({ offset: 35 }).setHTML(`
          <div style="font-weight:700;font-size:12px;color:#1e40af;">Pickup Location</div>
          <div style="font-size:11px;color:#0f172a;margin-top:2px;font-weight:600;">${pickup.name}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">${pickup.address}</div>
        `);
        pickupMarkerRef.current.setPopup(popup);
      }
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }

    // Handle Dropoff Marker (Indigo matching login page route card)
    if (dropoff) {
      const displayName = dropoff.name.length > 24 ? dropoff.name.slice(0, 22) + "…" : dropoff.name;
      if (!dropoffMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "dropoff-marker-wrapper cursor-pointer select-none";
        el.innerHTML = `
          <div class="relative flex flex-col items-center">
            <div class="relative flex items-center justify-center w-8 h-8">
              <div class="relative w-6 h-6 rounded-lg bg-indigo-600 border-2 border-white shadow-lg flex items-center justify-center">
                <div class="w-2 h-2 bg-white rounded-xs"></div>
              </div>
            </div>
            <div class="mt-1 bg-indigo-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap shadow-md border border-indigo-400 dropoff-name-badge">
              🏁 ${displayName}
            </div>
          </div>
        `;
        const popup = new maplibregl.Popup({ offset: 35 }).setHTML(`
          <div style="font-weight:700;font-size:12px;color:#4338ca;">Destination</div>
          <div style="font-size:11px;color:#0f172a;margin-top:2px;font-weight:600;">${dropoff.name}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">${dropoff.address}</div>
        `);
        dropoffMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([dropoff.lng, dropoff.lat])
          .setPopup(popup)
          .addTo(map);
      } else {
        dropoffMarkerRef.current.setLngLat([dropoff.lng, dropoff.lat]);
        const badge = dropoffMarkerRef.current.getElement()?.querySelector(".dropoff-name-badge");
        if (badge) badge.textContent = `🏁 ${displayName}`;
        const popup = new maplibregl.Popup({ offset: 35 }).setHTML(`
          <div style="font-weight:700;font-size:12px;color:#4338ca;">Destination</div>
          <div style="font-size:11px;color:#0f172a;margin-top:2px;font-weight:600;">${dropoff.name}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">${dropoff.address}</div>
        `);
        dropoffMarkerRef.current.setPopup(popup);
      }
    } else if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.remove();
      dropoffMarkerRef.current = null;
    }

    // Update Route Line & Bounds
    const routeSource = map.getSource("route") as (maplibregl.GeoJSONSource & { setData: (data: GeoJSON.Feature | GeoJSON.FeatureCollection | string) => void }) | undefined;
    if (routeSource) {
      if (pickup && dropoff) {
        const midLat = (pickup.lat + dropoff.lat) / 2 + 0.003;
        const midLng = (pickup.lng + dropoff.lng) / 2 - 0.002;
        const coordinates: [number, number][] = [
          [pickup.lng, pickup.lat],
          [midLng, midLat],
          [dropoff.lng, dropoff.lat],
        ];

        routeSource.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates,
          },
        });

        // Fit Bounds
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend([pickup.lng, pickup.lat]);
        bounds.extend([dropoff.lng, dropoff.lat]);
        map.fitBounds(bounds, { padding: 90, maxZoom: 15, duration: 900 });
      } else {
        routeSource.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [],
          },
        });

        if (pickup) {
          map.flyTo({ center: [pickup.lng, pickup.lat], zoom: 14.5, duration: 800 });
        } else if (dropoff) {
          map.flyTo({ center: [dropoff.lng, dropoff.lat], zoom: 14.5, duration: 800 });
        }
      }
    }
  }, [pickup, dropoff, mapLoaded]);

  // Zoom handlers matching the +/- buttons in the screenshot
  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    }
  };

  const handleRecenter = () => {
    if (onLocateCurrentLocation) {
      onLocateCurrentLocation();
    } else if (mapRef.current) {
      if (pickup) {
        mapRef.current.flyTo({ center: [pickup.lng, pickup.lat], zoom: 14.5, duration: 800 });
      } else {
        mapRef.current.flyTo({ center: [77.5915, 12.9778], zoom: 14, duration: 800 });
      }
    }
  };

  return (
    <div className="relative w-full h-full min-h-[500px] overflow-hidden bg-slate-100 select-none">
      {/* MapLibre Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Zoom Controls in bottom-right corner */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col items-center bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden">
        <button
          type="button"
          onClick={handleZoomIn}
          aria-label="Zoom in"
          className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 border-b border-slate-200 transition-colors"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          aria-label="Zoom out"
          className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 transition-colors"
        >
          <Minus className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>

      {/* Re-center / Locate Button */}
      <button
        type="button"
        onClick={handleRecenter}
        title="Recenter to location"
        className="absolute bottom-28 right-6 z-20 w-10 h-10 rounded-xl bg-white shadow-lg border border-slate-200/80 flex items-center justify-center text-slate-700 hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 transition-colors"
      >
        <Crosshair className="w-5 h-5" />
      </button>

      {/* OpenFreeMap Attribution & Live Drivers Badge */}
      <div className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-sm border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
        <span>OpenFreeMap · Live Campus Drivers</span>
      </div>
    </div>
  );
}
