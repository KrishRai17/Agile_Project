"use client";

import React, { useEffect, useRef, useState } from "react";
import { DriverCar, LocationItem } from "@/lib/mapData";
import { Plus, Minus, Navigation, Crosshair, MapPin } from "lucide-react";

interface InteractiveMapProps {
  pickup: LocationItem | null;
  dropoff: LocationItem | null;
  driverCars: DriverCar[];
  onSelectMapLocation?: (type: "pickup" | "dropoff", location: LocationItem) => void;
  targetMode?: "pickup" | "dropoff" | null;
}

export default function InteractiveMap({
  pickup,
  dropoff,
  driverCars,
  onSelectMapLocation,
  targetMode = null,
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersGroupRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const carMarkersRef = useRef<Map<string, any>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(14);

  // Initialize Map
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      const L = (await import("leaflet")).default;
      if (!isMounted || !mapContainerRef.current) return;

      // Center on Central Bengaluru (Vidhana Soudha area matching the user's screenshot)
      const initialLat = 12.9778;
      const initialLng = 77.5915;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
      });

      // CartoDB Voyager tiles - beautiful light modern ride-hailing map style
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
          subdomains: "abcd",
          maxZoom: 19,
        }
      ).addTo(map);

      // Attribution in bottom left
      L.control
        .attribution({ position: "bottomleft" })
        .addTo(map);

      // Markers Layer Group
      const markersGroup = L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;
      mapInstanceRef.current = map;

      map.on("zoomend", () => {
        setCurrentZoom(map.getZoom());
      });

      // Map click handler to set pickup/dropoff
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        const newLoc: LocationItem = {
          id: `pin_${Date.now()}`,
          name: `Dropped Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          address: "Selected location on map",
          lat,
          lng,
        };

        if (onSelectMapLocation) {
          // If pickup isn't set, set pickup, otherwise dropoff
          const mode = targetMode || (!pickup ? "pickup" : "dropoff");
          onSelectMapLocation(mode, newLoc);
        }
      });

      setMapLoaded(true);
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Driver Cars Markers
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current) return;

    async function updateCars() {
      const L = (await import("leaflet")).default;
      const map = mapInstanceRef.current;
      if (!map) return;

      driverCars.forEach((car) => {
        const carSvg = `
          <div style="transform: rotate(${car.rotation}deg); transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1); width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
            <svg width="28" height="34" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));">
              <!-- Car body -->
              <rect x="5" y="3" width="18" height="28" rx="6" fill="#F8FAFC" stroke="#0F172A" stroke-width="1.8" />
              <!-- Windshield Front -->
              <path d="M7.5 9.5C7.5 7.5 9 6.5 14 6.5C19 6.5 20.5 7.5 20.5 9.5L19.5 12H8.5L7.5 9.5Z" fill="#1E293B" />
              <!-- Roof -->
              <rect x="8" y="13" width="12" height="9" rx="2" fill="#E2E8F0" />
              <!-- Rear windshield -->
              <path d="M8.5 23H19.5L20 26C20 27 18.5 27.5 14 27.5C9.5 27.5 8 27 8 26L8.5 23Z" fill="#1E293B" />
              <!-- Headlights -->
              <rect x="6.5" y="3.5" width="3" height="1.5" rx="0.75" fill="#FACC15" />
              <rect x="18.5" y="3.5" width="3" height="1.5" rx="0.75" fill="#FACC15" />
              <!-- Taillights -->
              <rect x="6.5" y="29.5" width="3" height="1.5" rx="0.75" fill="#EF4444" />
              <rect x="18.5" y="29.5" width="3" height="1.5" rx="0.75" fill="#EF4444" />
            </svg>
          </div>
        `;

        const carIcon = L.divIcon({
          className: "uber-driver-car-icon",
          html: carSvg,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        if (carMarkersRef.current.has(car.id)) {
          const marker = carMarkersRef.current.get(car.id);
          marker.setLatLng([car.lat, car.lng]);
          marker.setIcon(carIcon);
        } else {
          const marker = L.marker([car.lat, car.lng], { icon: carIcon });
          marker.addTo(map);
          marker.bindTooltip(
            `<div class="font-bold text-xs">${car.model}</div><div class="text-[10px] text-gray-500">${car.plate}</div>`,
            { direction: "top", offset: [0, -18] }
          );
          carMarkersRef.current.set(car.id, marker);
        }
      });
    }

    updateCars();
  }, [driverCars, mapLoaded]);

  // Update Pickup / Dropoff Markers & Route
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !markersGroupRef.current) return;

    async function updateRouteAndPins() {
      const L = (await import("leaflet")).default;
      const markersGroup = markersGroupRef.current;
      const map = mapInstanceRef.current;

      markersGroup.clearLayers();

      if (routePolylineRef.current) {
        routePolylineRef.current.remove();
        routePolylineRef.current = null;
      }

      // Pickup Marker: Solid black circle with white center and pulse ring
      if (pickup) {
        const pickupHtml = `
          <div class="relative flex items-center justify-center w-8 h-8">
            <div class="absolute w-8 h-8 rounded-full bg-black/20 animate-ping"></div>
            <div class="relative w-6 h-6 rounded-full bg-black border-2 border-white shadow-lg flex items-center justify-center">
              <div class="w-2 h-2 rounded-full bg-white"></div>
            </div>
            <div class="absolute -bottom-6 bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md">
              Pickup
            </div>
          </div>
        `;

        const pickupIcon = L.divIcon({
          className: "pickup-custom-marker",
          html: pickupHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const pMarker = L.marker([pickup.lat, pickup.lng], { icon: pickupIcon });
        pMarker.bindPopup(`<b>Pickup:</b> ${pickup.name}<br/><span class="text-xs text-gray-500">${pickup.address}</span>`);
        markersGroup.addLayer(pMarker);
      }

      // Dropoff Marker: Solid black square with white center
      if (dropoff) {
        const dropoffHtml = `
          <div class="relative flex items-center justify-center w-8 h-8">
            <div class="relative w-6 h-6 bg-black border-2 border-white shadow-lg flex items-center justify-center rounded-sm">
              <div class="w-2 h-2 bg-white rounded-xs"></div>
            </div>
            <div class="absolute -bottom-6 bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md">
              Dropoff
            </div>
          </div>
        `;

        const dropoffIcon = L.divIcon({
          className: "dropoff-custom-marker",
          html: dropoffHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const dMarker = L.marker([dropoff.lat, dropoff.lng], { icon: dropoffIcon });
        dMarker.bindPopup(`<b>Destination:</b> ${dropoff.name}<br/><span class="text-xs text-gray-500">${dropoff.address}</span>`);
        markersGroup.addLayer(dMarker);
      }

      // Draw Route Polyline
      if (pickup && dropoff) {
        // Build a simulated curved realistic street path between points
        const midLat = (pickup.lat + dropoff.lat) / 2 + 0.003;
        const midLng = (pickup.lng + dropoff.lng) / 2 - 0.002;
        const routePoints: [number, number][] = [
          [pickup.lat, pickup.lng],
          [midLat, midLng],
          [dropoff.lat, dropoff.lng],
        ];

        // Background casing line for high contrast
        const routeCasing = L.polyline(routePoints, {
          color: "#ffffff",
          weight: 8,
          opacity: 0.9,
          lineCap: "round",
          lineJoin: "round",
        });
        markersGroup.addLayer(routeCasing);

        // Main route line
        const routeLine = L.polyline(routePoints, {
          color: "#000000",
          weight: 5,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
        });
        markersGroup.addLayer(routeLine);
        routePolylineRef.current = routeLine;

        // Auto zoom and pan to fit both markers
        const bounds = L.latLngBounds([
          [pickup.lat, pickup.lng] as [number, number],
          [dropoff.lat, dropoff.lng] as [number, number],
        ]);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
      } else if (pickup) {
        map.panTo([pickup.lat, pickup.lng], { animate: true });
      } else if (dropoff) {
        map.panTo([dropoff.lat, dropoff.lng], { animate: true });
      }
    }

    updateRouteAndPins();
  }, [pickup, dropoff, mapLoaded]);

  // Zoom handlers matching the +/- buttons in the screenshot
  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut();
    }
  };

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      if (pickup) {
        mapInstanceRef.current.flyTo([pickup.lat, pickup.lng], 14, { duration: 1 });
      } else {
        mapInstanceRef.current.flyTo([12.9778, 77.5915], 14, { duration: 1 });
      }
    }
  };

  return (
    <div className="relative w-full h-full min-h-[500px] overflow-hidden bg-slate-100 select-none">
      {/* The Leaflet Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Screenshot-identical Zoom Controls in bottom-right corner */}
      <div className="absolute bottom-6 right-6 z-[400] flex flex-col items-center bg-white rounded-lg shadow-md border border-slate-200/80 overflow-hidden">
        <button
          type="button"
          onClick={handleZoomIn}
          aria-label="Zoom in"
          className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-slate-100 active:bg-slate-200 border-b border-slate-200 transition-colors"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          aria-label="Zoom out"
          className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-slate-100 active:bg-slate-200 transition-colors"
        >
          <Minus className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>

      {/* Re-center / Locate Button */}
      <button
        type="button"
        onClick={handleRecenter}
        title="Recenter to location"
        className="absolute bottom-28 right-6 z-[400] w-10 h-10 rounded-lg bg-white shadow-md border border-slate-200/80 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors"
      >
        <Crosshair className="w-5 h-5" />
      </button>

      {/* Mini Helper Pill at top of map */}
      <div className="absolute top-4 right-4 z-[400] bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-slate-200 text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>Live Drivers in Bengaluru</span>
      </div>
    </div>
  );
}
