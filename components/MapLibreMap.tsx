"use client";

import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Plus, Minus, Crosshair, Clock } from "lucide-react";
import { DriverCar, LocationItem, AcceptedRideRoute } from "@/lib/mapData";
import { metersBetween } from "@/lib/campus";

interface MapLibreMapProps {
  pickup: LocationItem | null;
  dropoff: LocationItem | null;
  driverCars: DriverCar[];
  userLocation?: { lat: number; lng: number; accuracy?: number } | null;
  onSelectMapLocation?: (type: "pickup" | "dropoff", location: LocationItem) => void;
  targetMode?: "pickup" | "dropoff" | null;
  onLocateCurrentLocation?: () => void;
  onRouteInfo?: (distanceKm: number, durationMin: number) => void;
  onGpsUpdate?: (loc: { lat: number; lng: number; accuracy?: number }) => void;
  acceptedRideRoute?: AcceptedRideRoute | null;
  onClearAcceptedRoute?: () => void;
  isDriver?: boolean;
  onDriverLocationUpdate?: (loc: { lat: number; lng: number }) => void;
  onRidePhaseChange?: (phase: "pickup" | "dropoff") => void;
  onDriverArrived?: () => Promise<void> | void;
  onVerifyRideOtp?: (otp: string) => Promise<boolean>;
}

function shortName(name: string): string {
  return name.length > 24 ? name.slice(0, 22) + "…" : name;
}

// Safely creates DOM elements for popups without using innerHTML on user-provided strings
function createLocationPopupDOM(type: "pickup" | "dropoff", loc: LocationItem): HTMLElement {
  const container = document.createElement("div");
  container.className = "p-1 min-w-[140px]";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.fontSize = "12px";
  title.style.color = type === "pickup" ? "#1e40af" : "#4338ca";
  title.textContent = type === "pickup" ? "Pickup Location" : "Destination";

  const name = document.createElement("div");
  name.style.fontSize = "11px";
  name.style.color = "#0f172a";
  name.style.marginTop = "2px";
  name.style.fontWeight = "600";
  name.textContent = loc.name;

  const address = document.createElement("div");
  address.style.fontSize = "10px";
  address.style.color = "#64748b";
  address.style.marginTop = "2px";
  address.textContent = loc.address;

  container.appendChild(title);
  container.appendChild(name);
  container.appendChild(address);
  return container;
}

function createVehiclePopupDOM(car: DriverCar): HTMLElement {
  const container = document.createElement("div");
  container.className = "p-1";

  const model = document.createElement("div");
  model.style.fontWeight = "700";
  model.style.fontSize = "12px";
  model.style.color = "#0f172a";
  model.textContent = car.model;

  const type = document.createElement("div");
  type.style.fontSize = "10px";
  type.style.fontWeight = "600";
  type.style.textTransform = "uppercase";
  type.style.letterSpacing = "0.04em";
  type.style.color = car.type === "car" ? "#2563eb" : car.type === "scooty" ? "#4f46e5" : "#059669";
  type.textContent = `${car.type} · HopOn`;

  const plate = document.createElement("div");
  plate.style.fontSize = "10px";
  plate.style.color = "#64748b";
  plate.textContent = car.plate;

  container.appendChild(model);
  container.appendChild(type);
  container.appendChild(plate);
  return container;
}

function createClickPinPopupDOM(
  loc: LocationItem,
  onChoose: (mode: "pickup" | "dropoff") => void
): HTMLElement {
  const container = document.createElement("div");
  container.className = "p-1.5 flex flex-col gap-2 min-w-[200px]";

  const header = document.createElement("div");
  const title = document.createElement("div");
  title.className = "click-pin-title font-bold text-xs text-slate-900";
  title.textContent = loc.name;

  const coords = document.createElement("div");
  coords.className = "click-pin-coords text-[10px] text-slate-500 truncate max-w-[210px]";
  coords.textContent = loc.address;

  header.appendChild(title);
  header.appendChild(coords);

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "6px";
  btnRow.style.marginTop = "4px";

  const pickupBtn = document.createElement("button");
  pickupBtn.type = "button";
  pickupBtn.textContent = "📍 Set Pickup";
  pickupBtn.style.padding = "5px 10px";
  pickupBtn.style.fontSize = "11px";
  pickupBtn.style.fontWeight = "600";
  pickupBtn.style.backgroundColor = "#2563eb";
  pickupBtn.style.color = "#ffffff";
  pickupBtn.style.borderRadius = "8px";
  pickupBtn.style.border = "none";
  pickupBtn.style.cursor = "pointer";
  pickupBtn.onclick = () => onChoose("pickup");

  const dropoffBtn = document.createElement("button");
  dropoffBtn.type = "button";
  dropoffBtn.textContent = "🏁 Set Dropoff";
  dropoffBtn.style.padding = "5px 10px";
  dropoffBtn.style.fontSize = "11px";
  dropoffBtn.style.fontWeight = "600";
  dropoffBtn.style.backgroundColor = "#4f46e5";
  dropoffBtn.style.color = "#ffffff";
  dropoffBtn.style.borderRadius = "8px";
  dropoffBtn.style.border = "none";
  dropoffBtn.style.cursor = "pointer";
  dropoffBtn.onclick = () => onChoose("dropoff");

  btnRow.appendChild(pickupBtn);
  btnRow.appendChild(dropoffBtn);

  container.appendChild(header);
  container.appendChild(btnRow);
  return container;
}

// Precision Marker Element Constructors
function createCirclePolygon(lng: number, lat: number, radiusMeters: number, points = 64): [number, number][] {
  const coords: [number, number][] = [];
  const distanceX = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusMeters / 110540;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([lng + x, lat + y]);
  }
  coords.push(coords[0]);
  return coords;
}

function createPickupMarkerElement(name: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "pickup-marker-root select-none cursor-grab active:cursor-grabbing hover:scale-105 transition-transform flex flex-col items-center";
  root.style.position = "relative";
  root.title = "Drag to adjust exact pickup spot";

  // Stylized UI Card Badge on Top
  const card = document.createElement("div");
  card.className = "bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-xl border border-slate-200/90 text-left flex items-center gap-2.5 mb-2";
  card.style.minWidth = "170px";

  const textWrap = document.createElement("div");
  textWrap.className = "min-w-0";
  const label = document.createElement("div");
  label.className = "text-[9px] font-black uppercase tracking-wider text-slate-400";
  label.textContent = "YOUR PICKUP";
  const locName = document.createElement("div");
  locName.className = "text-xs font-bold text-slate-900 truncate max-w-[150px] pickup-name-text";
  locName.textContent = shortName(name);
  textWrap.appendChild(label);
  textWrap.appendChild(locName);

  const checkBadge = document.createElement("div");
  checkBadge.className = "w-4 h-4 rounded-full bg-sky-50 text-sky-500 border border-sky-200 flex items-center justify-center shrink-0 ml-auto";
  checkBadge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  card.appendChild(textWrap);
  card.appendChild(checkBadge);

  // Center Circle Pin (matching screenshot: black circle with dark teal inner ring)
  const pin = document.createElement("div");
  pin.className = "w-6 h-6 rounded-full bg-slate-900 border-2 border-white shadow-md flex items-center justify-center";
  const innerDot = document.createElement("div");
  innerDot.className = "w-2.5 h-2.5 rounded-full bg-[#1b8ecb]";
  pin.appendChild(innerDot);

  root.appendChild(card);
  root.appendChild(pin);
  return root;
}

function createDropoffMarkerElement(name: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "dropoff-marker-root select-none cursor-grab active:cursor-grabbing hover:scale-105 transition-transform flex flex-col items-center";
  root.style.position = "relative";
  root.title = "Drag to adjust exact destination";

  // Stylized Dark UI Card Badge on Top
  const card = document.createElement("div");
  card.className = "bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-xl border border-slate-700/80 text-left flex items-center gap-2.5 mb-2";
  card.style.minWidth = "170px";

  const textWrap = document.createElement("div");
  textWrap.className = "min-w-0";
  const label = document.createElement("div");
  label.className = "text-[9px] font-black uppercase tracking-wider text-slate-400";
  label.textContent = "YOUR DESTINATION";
  const locName = document.createElement("div");
  locName.className = "text-xs font-bold text-white truncate max-w-[150px] dropoff-name-text";
  locName.textContent = shortName(name);
  textWrap.appendChild(label);
  textWrap.appendChild(locName);

  card.appendChild(textWrap);

  // Center Square Pin (matching screenshot: dark square with cyan dot)
  const pin = document.createElement("div");
  pin.className = "w-6 h-6 rounded-lg bg-slate-900 border-2 border-white shadow-md flex items-center justify-center";
  const innerDot = document.createElement("div");
  innerDot.className = "w-2.5 h-2.5 rounded-sm bg-[#1b8ecb]";
  pin.appendChild(innerDot);

  root.appendChild(card);
  root.appendChild(pin);
  return root;
}

function createAcceptedDriverMarkerElement(driverName: string, vehicleModel?: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "accepted-driver-marker select-none relative flex flex-col items-center cursor-pointer";
  root.style.width = "40px";
  if (vehicleModel) root.title = `${driverName} · ${vehicleModel}`;

  const ping = document.createElement("div");
  ping.className = "absolute -top-1 w-10 h-10 rounded-full bg-emerald-500/30 animate-ping pointer-events-none";

  const carBadge = document.createElement("div");
  carBadge.className = "relative z-10 w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg border-2 border-white text-base";
  carBadge.textContent = "🚗";

  const label = document.createElement("div");
  label.className = "mt-1 px-2.5 py-0.5 rounded-full bg-emerald-900/90 text-white text-[10px] font-bold shadow-md whitespace-nowrap border border-emerald-400/40";
  label.textContent = vehicleModel
    ? `🚗 ${shortName(driverName)} · ${shortName(vehicleModel)}`
    : `🚗 Driver: ${shortName(driverName)}`;

  root.appendChild(ping);
  root.appendChild(carBadge);
  root.appendChild(label);
  return root;
}

function createAcceptedPickupMarkerElement(passengerName: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "accepted-pickup-marker select-none relative flex flex-col items-center cursor-pointer";
  root.style.width = "40px";

  const pin = document.createElement("div");
  pin.className = "w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg border-2 border-white text-xs font-black";
  pin.textContent = "1";

  const label = document.createElement("div");
  label.className = "mt-1 px-2 py-0.5 rounded-full bg-blue-900/90 text-white text-[10px] font-bold shadow-md whitespace-nowrap border border-blue-400/40";
  label.textContent = `📍 Pickup: ${shortName(passengerName)}`;

  root.appendChild(pin);
  root.appendChild(label);
  return root;
}

function createAcceptedDropoffMarkerElement(destName: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "accepted-dropoff-marker select-none relative flex flex-col items-center cursor-pointer";
  root.style.width = "40px";

  const pin = document.createElement("div");
  pin.className = "w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg border-2 border-white text-xs font-black";
  pin.textContent = "2";

  const label = document.createElement("div");
  label.className = "mt-1 px-2 py-0.5 rounded-full bg-purple-900/90 text-white text-[10px] font-bold shadow-md whitespace-nowrap border border-purple-400/40";
  label.textContent = `🏁 Dropoff: ${shortName(destName)}`;

  root.appendChild(pin);
  root.appendChild(label);
  return root;
}


function createUserLocationElement(): HTMLElement {
  const root = document.createElement("div");
  root.className = "user-location-marker pointer-events-none select-none relative";
  root.style.width = "24px";
  root.style.height = "24px";
  root.style.display = "flex";
  root.style.alignItems = "center";
  root.style.justifyContent = "center";

  const ring = document.createElement("div");
  ring.className = "absolute w-9 h-9 rounded-full bg-blue-500/25 animate-ping";

  const halo = document.createElement("div");
  halo.className = "absolute w-6 h-6 rounded-full bg-blue-400/30";

  const dot = document.createElement("div");
  dot.className = "relative w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow-md";

  root.appendChild(ring);
  root.appendChild(halo);
  root.appendChild(dot);
  return root;
}

// Distinct top-down SVG per vehicle type
function createVehicleElement(car: DriverCar): HTMLElement {
  const el = document.createElement("div");
  el.className = "hopon-vehicle-marker cursor-pointer";

  const wrap = document.createElement("div");
  wrap.className = "vehicle-wrap";
  wrap.style.transform = `rotate(${car.rotation}deg)`;
  wrap.style.transition = "transform 0.6s ease";
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.justifyContent = "center";

  const shadow = "filter: drop-shadow(0 2px 5px rgba(0,0,0,0.32));";

  if (car.type === "car") {
    wrap.style.width = "38px";
    wrap.style.height = "38px";
    wrap.innerHTML = `
      <svg width="26" height="34" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="${shadow}">
        <rect x="4" y="2" width="20" height="32" rx="7" fill="#FFFFFF" stroke="#1e293b" stroke-width="1.6"/>
        <path d="M7 9C7 7 9 6 14 6C19 6 21 7 21 9L20 13H8L7 9Z" fill="#2563EB"/>
        <rect x="8" y="14" width="12" height="8" rx="2" fill="#bfdbfe"/>
        <path d="M8 23H20L20.5 27C20.5 28 19 29 14 29C9 29 7.5 28 7.5 27L8 23Z" fill="#1e293b"/>
        <rect x="6" y="2.5" width="3.5" height="2" rx="1" fill="#fde68a"/>
        <rect x="18.5" y="2.5" width="3.5" height="2" rx="1" fill="#fde68a"/>
        <rect x="6" y="30" width="3.5" height="2" rx="1" fill="#fca5a5"/>
        <rect x="18.5" y="30" width="3.5" height="2" rx="1" fill="#fca5a5"/>
        <rect x="2" y="8" width="3" height="6" rx="1.5" fill="#475569"/>
        <rect x="23" y="8" width="3" height="6" rx="1.5" fill="#475569"/>
        <rect x="2" y="22" width="3" height="6" rx="1.5" fill="#475569"/>
        <rect x="23" y="22" width="3" height="6" rx="1.5" fill="#475569"/>
      </svg>
    `;
  } else if (car.type === "scooty") {
    wrap.style.width = "32px";
    wrap.style.height = "32px";
    wrap.innerHTML = `
      <svg width="22" height="32" viewBox="0 0 22 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="${shadow}">
        <rect x="8" y="2" width="6" height="32" rx="3" fill="#4f46e5"/>
        <rect x="2" y="5" width="18" height="3" rx="1.5" fill="#312e81"/>
        <ellipse cx="11" cy="31" rx="5" ry="3.5" fill="#1e293b"/>
        <ellipse cx="11" cy="31" rx="3" ry="2" fill="#4f46e5"/>
        <rect x="7" y="12" width="8" height="5" rx="2.5" fill="#6366f1"/>
        <ellipse cx="11" cy="3" rx="3" ry="2" fill="#fde68a"/>
      </svg>
    `;
  } else {
    wrap.style.width = "30px";
    wrap.style.height = "30px";
    wrap.innerHTML = `
      <svg width="20" height="30" viewBox="0 0 20 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="${shadow}">
        <rect x="7.5" y="2" width="5" height="30" rx="2.5" fill="#059669"/>
        <rect x="2" y="5" width="16" height="2.5" rx="1.25" fill="#047857"/>
        <ellipse cx="10" cy="30" rx="4.5" ry="3" fill="#1e293b"/>
        <ellipse cx="10" cy="30" rx="2.5" ry="1.5" fill="#059669"/>
        <rect x="7" y="14" width="6" height="5" rx="2" fill="#10b981"/>
        <ellipse cx="10" cy="3" rx="2.5" ry="1.5" fill="#fde68a"/>
      </svg>
    `;
  }

  el.appendChild(wrap);
  return el;
}

export default function MapLibreMap({
  pickup,
  dropoff,
  driverCars,
  userLocation,
  onSelectMapLocation,
  targetMode = null,
  onLocateCurrentLocation,
  onRouteInfo,
  onGpsUpdate,
  acceptedRideRoute = null,
  onClearAcceptedRoute,
  isDriver = false,
  onDriverLocationUpdate,
  onRidePhaseChange,
  onDriverArrived,
  onVerifyRideOtp,
}: MapLibreMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const carMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const pickupMarkerRef = useRef<maplibregl.Marker | null>(null);
  const dropoffMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const acceptedDriverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const acceptedPickupMarkerRef = useRef<maplibregl.Marker | null>(null);
  const acceptedDropoffMarkerRef = useRef<maplibregl.Marker | null>(null);
  const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const geolocateControlRef = useRef<maplibregl.GeolocateControl | null>(null);
  // Only auto-fly to the user's GPS fix the first time (or on explicit recenter),
  // otherwise continuous GPS ticks fight the user's panning.
  const hasFlownToUserRef = useRef(false);
  const forceFlyToUserRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [acceptedRouteDetails, setAcceptedRouteDetails] = useState<{
    distanceKm: number;
    durationMin: number;
    legs?: { distanceKm: number; durationMin: number }[];
  } | null>(null);

  // Active stage: "pickup" (first show route to passenger) then "dropoff" (destination)
  const [localPhase, setLocalPhase] = useState<"pickup" | "dropoff">("pickup");
  const [activeTargetMode, setActiveTargetMode] = useState<"pickup" | "dropoff" | null>(
    targetMode ?? null
  );
  const [hudOtpInput, setHudOtpInput] = useState("");
  const [hudVerifyingOtp, setHudVerifyingOtp] = useState(false);
  const [isHudHidden, setIsHudHidden] = useState(false);
  const [prevRouteReqId, setPrevRouteReqId] = useState<string | undefined>(acceptedRideRoute?.requestId);
  if (acceptedRideRoute?.requestId !== prevRouteReqId) {
    setPrevRouteReqId(acceptedRideRoute?.requestId);
    setLocalPhase(acceptedRideRoute?.phase ?? "pickup");
    setHudOtpInput("");
    setIsHudHidden(false);
    if (!acceptedRideRoute) {
      setAcceptedRouteDetails(null);
    }
  }
  const activePhase = acceptedRideRoute?.phase || localPhase;
  const tripStage = acceptedRideRoute?.tripStage ?? (activePhase === "dropoff" ? "in_progress" : "en_route_pickup");

  const handleSetPhase = (phase: "pickup" | "dropoff") => {
    if (isDriver && phase === "dropoff" && tripStage !== "in_progress") {
      return;
    }
    setLocalPhase(phase);
    onRidePhaseChange?.(phase);
  };

  // Keep latest props in refs so map event handlers never read stale closure values
  const pickupRef = useRef(pickup);
  const targetModeRef = useRef(targetMode);
  const onSelectRef = useRef(onSelectMapLocation);
  const onRouteInfoRef = useRef(onRouteInfo);
  const onGpsUpdateRef = useRef(onGpsUpdate);

  useEffect(() => {
    pickupRef.current = pickup;
    targetModeRef.current = activeTargetMode ?? targetMode;
    onSelectRef.current = onSelectMapLocation;
    onRouteInfoRef.current = onRouteInfo;
    onGpsUpdateRef.current = onGpsUpdate;
  });

  // Initialize MapLibre GL JS with OpenFreeMap tiles centered at Kristu Jayanti University
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Center on Kristu Jayanti University campus area (13.0583, 77.6426)
    const initialCenter: [number, number] = [77.6426, 13.0583];

    // Ensure worker resolves properly to the static public bundle
    if (typeof window !== "undefined") {
      try {
        maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      } catch {
        // Ignore if already set
      }
    }

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: initialCenter,
        zoom: 14.8,
        attributionControl: false,
      });
    } catch (err) {
      console.warn("MapLibre GL failed to initialize:", err);
      return;
    }

    map.on("error", (e) => {
      // Suppress harmless sprite/icon/worker warnings so Next.js dev overlay is not triggered
      const msg = e.error?.message || "";
      if (msg.includes("Image") || msg.includes("sprite") || msg.includes("Worker") || msg.includes("worker")) {
        console.warn("MapLibre notice (suppressed):", msg);
        return;
      }
      console.warn("MapLibre error:", e);
    });

    // The OpenFreeMap "liberty" style references POI icons its sprite doesn't ship
    // (office, gate, sports_centre, swimming_pool…). Register a transparent 1x1 placeholder.
    map.on("styleimagemissing", (e) => {
      if (!map.hasImage(e.id)) {
        map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      }
    });

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "OpenFreeMap · OpenStreetMap · HopOn",
      }),
      "bottom-left"
    );

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      });

      // White casing layer for road outline
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.95 },
      });

      // Primary road route line
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#27a8f5", "line-width": 6, "line-opacity": 0.95 },
      });

      // User location accuracy circle source & layers
      map.addSource("user-accuracy", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [] },
        },
      });

      map.addLayer({
        id: "user-accuracy-fill",
        type: "fill",
        source: "user-accuracy",
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": 0.12,
        },
      });

      map.addLayer({
        id: "user-accuracy-stroke",
        type: "line",
        source: "user-accuracy",
        paint: {
          "line-color": "#2563eb",
          "line-width": 1.5,
          "line-opacity": 0.45,
        },
      });

      // Native MapLibre hardware GeolocateControl for continuous device GPS tracking
      const geolocate = new maplibregl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
        trackUserLocation: true,
        showAccuracyCircle: true,
        showUserLocation: true,
      });

      geolocate.on("geolocate", (e: maplibregl.GeolocatePositionEvent) => {
        if (e?.coords) {
          onGpsUpdateRef.current?.({
            lat: e.coords.latitude,
            lng: e.coords.longitude,
            accuracy: e.coords.accuracy,
          });
        }
      });

      map.addControl(geolocate, "bottom-right");
      geolocateControlRef.current = geolocate;

      setMapLoaded(true);

      // Trigger hardware GPS acquisition automatically once map is ready
      setTimeout(() => {
        try {
          geolocate.trigger();
        } catch {
          // ignore if unsupported
        }
      }, 500);
    });

    // Map click handler to set pickup/dropoff with pinpoint precision and reverse geocoding
    map.on("click", async (e: maplibregl.MapMouseEvent) => {
      // Ignore clicks that landed on a marker or popup (markers also bubble to the map click event)
      const clickTarget = e.originalEvent?.target as HTMLElement | null;
      if (clickTarget?.closest?.(".maplibregl-marker, .maplibregl-popup")) return;

      const { lng, lat } = e.lngLat;
      const initialName = `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      const initialLoc: LocationItem = {
        id: `pin_${Date.now()}`,
        name: initialName,
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        lat,
        lng,
        category: "landmark",
      };

      const select = onSelectRef.current;
      if (select) {
        // Only auto-assign when a target mode is explicitly active; otherwise the popup decides.
        // (Previously both pins ended up on the same spot when the user picked the other mode.)
        let chosenMode: "pickup" | "dropoff" | null = targetModeRef.current;
        let currentLoc = initialLoc;
        if (chosenMode) select(chosenMode, initialLoc);

        // Open interactive popup
        const popupDom = createClickPinPopupDOM(initialLoc, (picked) => {
          chosenMode = picked;
          select(picked, currentLoc);
          popup.remove();
        });

        const popup = new maplibregl.Popup({ offset: 15, closeButton: true })
          .setLngLat([lng, lat])
          .setDOMContent(popupDom)
          .addTo(map);

        // Enrich with real reverse geocoded name + optional road curb snap
        try {
          const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
          if (res.ok) {
            const data = await res.json();
            if (data.shortName) {
              const snapOk =
                typeof data.snappedLat === "number" &&
                typeof data.snappedLng === "number" &&
                typeof data.snapDistanceMeters === "number" &&
                data.snapDistanceMeters <= 25;
              currentLoc = {
                ...initialLoc,
                name: data.shortName,
                address: data.displayName,
                lat: snapOk ? Number(data.snappedLat.toFixed(6)) : Number(lat.toFixed(6)),
                lng: snapOk ? Number(data.snappedLng.toFixed(6)) : Number(lng.toFixed(6)),
              };
              if (chosenMode) select(chosenMode, currentLoc);

              const titleEl = popupDom.querySelector(".click-pin-title");
              if (titleEl) titleEl.textContent = data.shortName;
              const addrEl = popupDom.querySelector(".click-pin-coords");
              if (addrEl) addrEl.textContent = data.displayName;
            }
          }
        } catch {
          // Keep coordinates fallback
        }
      }
    });

    mapRef.current = map;
    const carMarkers = carMarkersRef.current;

    return () => {
      carMarkers.forEach((m) => m.remove());
      carMarkers.clear();
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current = null;
      userMarkerRef.current = null;
      if (acceptedDriverMarkerRef.current) acceptedDriverMarkerRef.current.remove();
      if (acceptedPickupMarkerRef.current) acceptedPickupMarkerRef.current.remove();
      if (acceptedDropoffMarkerRef.current) acceptedDropoffMarkerRef.current.remove();
      acceptedDriverMarkerRef.current = null;
      acceptedPickupMarkerRef.current = null;
      acceptedDropoffMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Update user location beacon and accuracy circle
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const accuracySrc = map.getSource("user-accuracy") as maplibregl.GeoJSONSource | undefined;

    if (userLocation) {
      // Draw or update the visual accuracy circle polygon
      if (accuracySrc) {
        const radiusMeters = Math.max(10, userLocation.accuracy || 25);
        const polygonCoords = createCirclePolygon(userLocation.lng, userLocation.lat, radiusMeters);
        accuracySrc.setData({
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [polygonCoords] },
        });
      }

      const accLabel = userLocation.accuracy ? ` (±${Math.round(userLocation.accuracy)}m)` : "";
      const popupContent = `
        <div style="font-size:11px;font-weight:700;color:#2563eb;">📍 Your Location${accLabel}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px;">Drag the pickup pin or click map to fine-tune</div>
      `;

      if (!userMarkerRef.current) {
        const el = createUserLocationElement();
        userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([userLocation.lng, userLocation.lat])
          .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(popupContent))
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
        userMarkerRef.current.setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(popupContent));
      }

      // Fly to user location only on first fix or explicit recenter (zoom adapted to accuracy)
      if (!hasFlownToUserRef.current || forceFlyToUserRef.current) {
        const zoomLevel = userLocation.accuracy && userLocation.accuracy > 400 ? 14.5 : 16.5;
        map.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: zoomLevel, duration: 900 });
        hasFlownToUserRef.current = true;
        forceFlyToUserRef.current = false;
      }
    } else {
      if (accuracySrc) {
        accuracySrc.setData({
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [] },
        });
      }
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
    }
  }, [userLocation, mapLoaded]);

  // Update driver vehicles on the map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    driverCars.forEach((car) => {
      const existing = carMarkersRef.current.get(car.id);
      if (existing) {
        existing.setLngLat([car.lng, car.lat]);
        const wrap = existing.getElement()?.querySelector(".vehicle-wrap") as HTMLElement | null;
        if (wrap) wrap.style.transform = `rotate(${car.rotation}deg)`;
      } else {
        const el = createVehicleElement(car);
        const popup = new maplibregl.Popup({ offset: 22, closeButton: false }).setDOMContent(
          createVehiclePopupDOM(car)
        );

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([car.lng, car.lat])
          .setPopup(popup)
          .addTo(map);

        carMarkersRef.current.set(car.id, marker);
      }
    });
  }, [driverCars, mapLoaded]);

  // Update pickup / dropoff markers with sub-pixel pinpoint accuracy and dragging support
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // Pickup marker
    if (pickup) {
      if (!pickupMarkerRef.current) {
        const el = createPickupMarkerElement(pickup.name);
        const marker = new maplibregl.Marker({ element: el, anchor: "center", draggable: true })
          .setLngLat([pickup.lng, pickup.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 24 }).setDOMContent(
              createLocationPopupDOM("pickup", pickup)
            )
          )
          .addTo(map);

        // Listen for drag end to update coordinates and reverse-geocode to exact spot
        marker.on("dragend", async () => {
          const lngLat = marker.getLngLat();
          const select = onSelectRef.current;
          if (!select) return;

          const dragLoc: LocationItem = {
            id: `pin_${Date.now()}`,
            name: `Pickup (${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)})`,
            address: `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`,
            lat: lngLat.lat,
            lng: lngLat.lng,
            category: "landmark",
          };
          select("pickup", dragLoc);

          try {
            const res = await fetch(`/api/geocode/reverse?lat=${lngLat.lat}&lng=${lngLat.lng}`);
            if (res.ok) {
              const data = await res.json();
              if (data.shortName) {
                const snapOk =
                  typeof data.snappedLat === "number" &&
                  typeof data.snappedLng === "number" &&
                  typeof data.snapDistanceMeters === "number" &&
                  data.snapDistanceMeters <= 22;
                select("pickup", {
                  ...dragLoc,
                  name: data.shortName,
                  address: data.displayName,
                  lat: snapOk ? Number(data.snappedLat.toFixed(6)) : Number(lngLat.lat.toFixed(6)),
                  lng: snapOk ? Number(data.snappedLng.toFixed(6)) : Number(lngLat.lng.toFixed(6)),
                });
              }
            }
          } catch {
            // Keep coordinates
          }
        });

        pickupMarkerRef.current = marker;
      } else {
        pickupMarkerRef.current.setLngLat([pickup.lng, pickup.lat]);
        const badge = pickupMarkerRef.current.getElement()?.querySelector(".pickup-name-badge");
        if (badge) badge.textContent = `📍 ${shortName(pickup.name)}`;
        pickupMarkerRef.current.setPopup(
          new maplibregl.Popup({ offset: 24 }).setDOMContent(
            createLocationPopupDOM("pickup", pickup)
          )
        );
      }
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }

    // Dropoff marker
    if (dropoff) {
      if (!dropoffMarkerRef.current) {
        const el = createDropoffMarkerElement(dropoff.name);
        const marker = new maplibregl.Marker({ element: el, anchor: "center", draggable: true })
          .setLngLat([dropoff.lng, dropoff.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 24 }).setDOMContent(
              createLocationPopupDOM("dropoff", dropoff)
            )
          )
          .addTo(map);

        marker.on("dragend", async () => {
          const lngLat = marker.getLngLat();
          const select = onSelectRef.current;
          if (!select) return;

          const dragLoc: LocationItem = {
            id: `pin_${Date.now()}`,
            name: `Destination (${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)})`,
            address: `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`,
            lat: lngLat.lat,
            lng: lngLat.lng,
            category: "landmark",
          };
          select("dropoff", dragLoc);

          try {
            const res = await fetch(`/api/geocode/reverse?lat=${lngLat.lat}&lng=${lngLat.lng}`);
            if (res.ok) {
              const data = await res.json();
              if (data.shortName) {
                select("dropoff", {
                  ...dragLoc,
                  name: data.shortName,
                  address: data.displayName,
                });
              }
            }
          } catch {
            // Keep coordinates
          }
        });

        dropoffMarkerRef.current = marker;
      } else {
        dropoffMarkerRef.current.setLngLat([dropoff.lng, dropoff.lat]);
        const badge = dropoffMarkerRef.current.getElement()?.querySelector(".dropoff-name-badge");
        if (badge) badge.textContent = `🏁 ${shortName(dropoff.name)}`;
        dropoffMarkerRef.current.setPopup(
          new maplibregl.Popup({ offset: 24 }).setDOMContent(
            createLocationPopupDOM("dropoff", dropoff)
          )
        );
      }
    } else if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.remove();
      dropoffMarkerRef.current = null;
    }
  }, [pickup, dropoff, mapLoaded]);

  // Sync accepted ride markers with smooth linear interpolation (lerp) on GPS updates:
  // Phase 1 (Pickup): Driver Marker + Passenger Pickup Marker
  // Phase 2 (Dropoff): Driver Marker + Final Destination Marker
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    let rafDriver: number | null = null;
    let rafPickup: number | null = null;

    const animateMarker = (
      marker: maplibregl.Marker,
      targetLng: number,
      targetLat: number,
      setRaf: (id: number) => void
    ) => {
      const start = marker.getLngLat();
      const dLng = targetLng - start.lng;
      const dLat = targetLat - start.lat;
      if (Math.abs(dLng) < 0.00001 && Math.abs(dLat) < 0.00001) {
        marker.setLngLat([targetLng, targetLat]);
        return;
      }
      const durationMs = 550;
      const t0 = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - t0) / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        marker.setLngLat([start.lng + dLng * eased, start.lat + dLat * eased]);
        if (progress < 1) {
          setRaf(requestAnimationFrame(step));
        }
      };
      setRaf(requestAnimationFrame(step));
    };

    if (acceptedRideRoute) {
      // 1. Driver Start / Live Marker (Always active during the ride; draggable by rider for pinpoint adjustment)
      if (!acceptedDriverMarkerRef.current) {
        const el = createAcceptedDriverMarkerElement(
          acceptedRideRoute.driverName,
          acceptedRideRoute.driverVehicle
        );
        const dMarker = new maplibregl.Marker({
          element: el,
          anchor: "bottom",
          draggable: Boolean(isDriver),
        })
          .setLngLat([acceptedRideRoute.driverLocation.lng, acceptedRideRoute.driverLocation.lat])
          .addTo(map);

        dMarker.on("dragend", async () => {
          const lngLat = dMarker.getLngLat();
          let exactLat = Number(lngLat.lat.toFixed(6));
          let exactLng = Number(lngLat.lng.toFixed(6));
          try {
            const res = await fetch(`/api/geocode/reverse?lat=${exactLat}&lng=${exactLng}`);
            if (res.ok) {
              const data = await res.json();
              if (
                typeof data.snappedLat === "number" &&
                typeof data.snappedLng === "number" &&
                typeof data.snapDistanceMeters === "number" &&
                data.snapDistanceMeters <= 25
              ) {
                exactLat = Number(data.snappedLat.toFixed(6));
                exactLng = Number(data.snappedLng.toFixed(6));
                dMarker.setLngLat([exactLng, exactLat]);
              }
            }
          } catch {
            // keep dragged coordinates
          }
          onDriverLocationUpdate?.({ lat: exactLat, lng: exactLng });
        });

        acceptedDriverMarkerRef.current = dMarker;
      } else {
        animateMarker(
          acceptedDriverMarkerRef.current,
          acceptedRideRoute.driverLocation.lng,
          acceptedRideRoute.driverLocation.lat,
          (id) => {
            rafDriver = id;
          }
        );
      }

      // 2. Pickup Marker: Visible during "pickup" phase
      if (activePhase === "pickup") {
        if (!acceptedPickupMarkerRef.current) {
          const el = createAcceptedPickupMarkerElement(acceptedRideRoute.passengerName);
          acceptedPickupMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
            .setLngLat([acceptedRideRoute.pickupLocation.lng, acceptedRideRoute.pickupLocation.lat])
            .addTo(map);
        } else {
          animateMarker(
            acceptedPickupMarkerRef.current,
            acceptedRideRoute.pickupLocation.lng,
            acceptedRideRoute.pickupLocation.lat,
            (id) => {
              rafPickup = id;
            }
          );
        }
      } else {
        if (acceptedPickupMarkerRef.current) {
          acceptedPickupMarkerRef.current.remove();
          acceptedPickupMarkerRef.current = null;
        }
      }

      // 3. Dropoff Marker: Visible during "dropoff" phase
      if (activePhase === "dropoff") {
        if (!acceptedDropoffMarkerRef.current) {
          const el = createAcceptedDropoffMarkerElement(acceptedRideRoute.dropoffLocation.name);
          acceptedDropoffMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
            .setLngLat([acceptedRideRoute.dropoffLocation.lng, acceptedRideRoute.dropoffLocation.lat])
            .addTo(map);
        } else {
          acceptedDropoffMarkerRef.current.setLngLat([
            acceptedRideRoute.dropoffLocation.lng,
            acceptedRideRoute.dropoffLocation.lat,
          ]);
        }
      } else {
        if (acceptedDropoffMarkerRef.current) {
          acceptedDropoffMarkerRef.current.remove();
          acceptedDropoffMarkerRef.current = null;
        }
      }
    } else {
      if (acceptedDriverMarkerRef.current) {
        acceptedDriverMarkerRef.current.remove();
        acceptedDriverMarkerRef.current = null;
      }
      if (acceptedPickupMarkerRef.current) {
        acceptedPickupMarkerRef.current.remove();
        acceptedPickupMarkerRef.current = null;
      }
      if (acceptedDropoffMarkerRef.current) {
        acceptedDropoffMarkerRef.current.remove();
        acceptedDropoffMarkerRef.current = null;
      }
    }

    return () => {
      if (rafDriver !== null) cancelAnimationFrame(rafDriver);
      if (rafPickup !== null) cancelAnimationFrame(rafPickup);
    };
  }, [acceptedRideRoute, activePhase, mapLoaded, isDriver, onDriverLocationUpdate]);

  const lastFittedPhaseKeyRef = useRef<string | null>(null);
  const lastRoutedCoordsRef = useRef<{
    phaseKey: string;
    startLng: number;
    startLat: number;
    endLng: number;
    endLat: number;
  } | null>(null);

  // Route calculation and road geometry
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const routeSource = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
    if (!routeSource) return;

    const setLine = (coordinates: [number, number][]) => {
      setRouteCoords(coordinates);
      routeSource.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      });
    };

    // 1. If an accepted ride is active:
    // Phase 1 ("pickup"): Route Driver -> Passenger Pickup
    // Phase 2 ("dropoff"): Route Driver -> Final Destination
    if (acceptedRideRoute) {
      const isPickupPhase = activePhase === "pickup";
      const lineColor = isPickupPhase ? "#059669" : "#4f46e5";

      if (map.getLayer("route-line")) {
        map.setPaintProperty("route-line", "line-color", lineColor);
        map.setPaintProperty("route-line", "line-width", 6);
      }
      if (map.getLayer("route-casing")) {
        map.setPaintProperty("route-casing", "line-color", "#ffffff");
        map.setPaintProperty("route-casing", "line-width", 10);
      }

      let startLng: number;
      let startLat: number;
      let endLng: number;
      let endLat: number;

      if (isPickupPhase) {
        // Step 1: Only show route to passenger pickup location
        startLng = acceptedRideRoute.driverLocation.lng;
        startLat = acceptedRideRoute.driverLocation.lat;
        endLng = acceptedRideRoute.pickupLocation.lng;
        endLat = acceptedRideRoute.pickupLocation.lat;
      } else {
        // Step 2: Show route to destination
        startLng = acceptedRideRoute.driverLocation.lng;
        startLat = acceptedRideRoute.driverLocation.lat;
        endLng = acceptedRideRoute.dropoffLocation.lng;
        endLat = acceptedRideRoute.dropoffLocation.lat;
      }

      const phaseKey = `${acceptedRideRoute.requestId ?? "active"}:${activePhase}`;
      if (lastFittedPhaseKeyRef.current !== phaseKey) {
        lastFittedPhaseKeyRef.current = phaseKey;
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend([startLng, startLat]);
        bounds.extend([endLng, endLat]);
        map.fitBounds(bounds, { padding: 90, maxZoom: 16, duration: 800 });
      }

      const prevRouted = lastRoutedCoordsRef.current;
      if (
        prevRouted &&
        prevRouted.phaseKey === phaseKey &&
        Math.abs(prevRouted.startLng - startLng) < 0.00015 &&
        Math.abs(prevRouted.startLat - startLat) < 0.00015 &&
        Math.abs(prevRouted.endLng - endLng) < 0.00015 &&
        Math.abs(prevRouted.endLat - endLat) < 0.00015
      ) {
        return;
      }
      lastRoutedCoordsRef.current = { phaseKey, startLng, startLat, endLng, endLat };

      const controller = new AbortController();
      const points = `${startLng},${startLat};${endLng},${endLat}`;
      const url = `/api/route?points=${points}`;

      (async () => {
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.coordinates) && data.coordinates.length > 0) {
              setLine(data.coordinates);
              setAcceptedRouteDetails({
                distanceKm: data.distanceKm,
                durationMin: data.durationMin,
                legs: data.legs,
              });
              return;
            }
          }
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      })();

      return () => controller.abort();
    }

    lastFittedPhaseKeyRef.current = null;
    lastRoutedCoordsRef.current = null;

    // 2. Otherwise restore default route style & regular pickup -> dropoff behavior
    if (map.getLayer("route-line")) {
      map.setPaintProperty("route-line", "line-color", "#27a8f5");
      map.setPaintProperty("route-line", "line-width", 6);
    }
    if (map.getLayer("route-casing")) {
      map.setPaintProperty("route-casing", "line-color", "#ffffff");
      map.setPaintProperty("route-casing", "line-width", 10);
    }

    if (!(pickup && dropoff)) {
      setLine([]);
      if (pickup) {
        map.flyTo({ center: [pickup.lng, pickup.lat], zoom: 15, duration: 800 });
      } else if (dropoff) {
        map.flyTo({ center: [dropoff.lng, dropoff.lat], zoom: 15, duration: 800 });
      }
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([pickup.lng, pickup.lat]);
    bounds.extend([dropoff.lng, dropoff.lat]);
    map.fitBounds(bounds, { padding: 90, maxZoom: 15, duration: 900 });

    const controller = new AbortController();
    const url = `/api/route?start=${pickup.lng},${pickup.lat}&end=${dropoff.lng},${dropoff.lat}`;

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.coordinates) && data.coordinates.length > 0) {
            setLine(data.coordinates);
            onRouteInfoRef.current?.(data.distanceKm, data.durationMin);
            return;
          }
        }
        setLine([
          [pickup.lng, pickup.lat],
          [dropoff.lng, dropoff.lat],
        ]);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    })();

    return () => controller.abort();
  }, [pickup, dropoff, acceptedRideRoute, activePhase, mapLoaded]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  const handleFitAcceptedBounds = () => {
    if (!mapRef.current || !acceptedRideRoute) return;
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([acceptedRideRoute.driverLocation.lng, acceptedRideRoute.driverLocation.lat]);
    if (activePhase === "pickup") {
      bounds.extend([acceptedRideRoute.pickupLocation.lng, acceptedRideRoute.pickupLocation.lat]);
    } else {
      bounds.extend([acceptedRideRoute.dropoffLocation.lng, acceptedRideRoute.dropoffLocation.lat]);
    }
    mapRef.current.fitBounds(bounds, { padding: 90, maxZoom: 16, duration: 800 });
  };

  const handleSyncLiveGps = () => {
    if (geolocateControlRef.current) {
      try {
        geolocateControlRef.current.trigger();
      } catch {
        // fallback below
      }
    }
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
          const lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
          onDriverLocationUpdate?.({ lat, lng });
          onGpsUpdateRef.current?.({
            lat,
            lng,
            accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined,
          });
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
      );
    }
  };

  // Render waypoint price & duration chips on the route line matching mockup
  useEffect(() => {
    for (const m of waypointMarkersRef.current) m.remove();
    waypointMarkersRef.current = [];

    if (!mapLoaded || !mapRef.current || acceptedRideRoute || routeCoords.length < 8) return;

    const map = mapRef.current;
    const chips = [
      { ratio: 0.22, text: "₹85", isSelected: false },
      { ratio: 0.46, text: "🕒 22 min", isSelected: false },
      { ratio: 0.68, text: "₹70", isSelected: false },
      { ratio: 0.84, text: "₹75 ✓", isSelected: true },
    ];

    const newMarkers: maplibregl.Marker[] = [];
    for (const chip of chips) {
      const idx = Math.min(Math.floor(routeCoords.length * chip.ratio), routeCoords.length - 1);
      const [lng, lat] = routeCoords[idx];

      const el = document.createElement("div");
      el.className = `select-none px-2.5 py-1 rounded-full text-xs font-bold transition-transform hover:scale-105 flex items-center gap-1 shadow-md ${
        chip.isSelected
          ? "bg-slate-900 text-white border-2 border-white ring-2 ring-sky-400/40"
          : "bg-white text-slate-800 border border-slate-200/90"
      }`;
      el.textContent = chip.text;

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(map);

      newMarkers.push(marker);
    }
    waypointMarkersRef.current = newMarkers;

    return () => {
      for (const m of newMarkers) m.remove();
      waypointMarkersRef.current = [];
    };
  }, [routeCoords, mapLoaded, acceptedRideRoute]);

  const handleRecenter = () => {
    forceFlyToUserRef.current = true;
    if (acceptedRideRoute) {
      handleFitAcceptedBounds();
      return;
    }
    if (geolocateControlRef.current) {
      try {
        geolocateControlRef.current.trigger();
      } catch {
        // fallback
      }
    }
    if (onLocateCurrentLocation) {
      onLocateCurrentLocation();
    } else if (mapRef.current) {
      if (userLocation) {
        mapRef.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 16.5, duration: 800 });
      } else if (pickup) {
        mapRef.current.flyTo({ center: [pickup.lng, pickup.lat], zoom: 15.5, duration: 800 });
      } else {
        mapRef.current.flyTo({ center: [77.6426, 13.0583], zoom: 15, duration: 800 });
      }
    }
  };

  return (
    <div className="relative w-full h-full min-h-[500px] overflow-hidden bg-slate-100 select-none">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Route Badge & Map Click Mode Selector */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-md border border-slate-200/90 flex items-center gap-2 text-xs font-semibold text-slate-800">
          {acceptedRideRoute ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-slate-900">Live journey</span>
            </>
          ) : (
            <>
              <span>Your route</span>
              <span className="text-slate-300">|</span>
              <span className="text-[#0284c7] font-bold">3 matching rides</span>
            </>
          )}
        </div>

        {!acceptedRideRoute && (
          <div className="hidden xl:flex bg-white/95 backdrop-blur-md rounded-full p-1 shadow-sm border border-slate-200/90 items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={() =>
                setActiveTargetMode((prev) => (prev === "pickup" ? null : "pickup"))
              }
              className={`px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTargetMode === "pickup"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-900" />
              <span>Pickup</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveTargetMode((prev) => (prev === "dropoff" ? null : "dropoff"))
              }
              className={`px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTargetMode === "dropoff"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="w-2 h-2 rounded-xs bg-sky-600" />
              <span>Dropoff</span>
            </button>
          </div>
        )}
      </div>

      {/* Accepted Ride Floating HUD Overlay */}
      {acceptedRideRoute && isHudHidden && (
        <button
          type="button"
          onClick={() => setIsHudHidden(false)}
          className="absolute top-4 left-4 z-30 bg-white/95 hover:bg-white text-slate-800 text-xs font-bold px-3 py-2 rounded-xl shadow-lg border border-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <span>🚗 Show Ride HUD</span>
        </button>
      )}
      {acceptedRideRoute && !isHudHidden && (
        <div className="absolute top-4 left-4 right-4 sm:right-auto sm:max-w-md z-30 bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-xl border border-slate-200 animate-in slide-in-from-top-3 duration-200">
          {/* Header with Phase Badge & Close Button */}
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  activePhase === "pickup"
                    ? tripStage === "arrived_pickup"
                      ? "bg-amber-500 animate-pulse"
                      : "bg-emerald-500 animate-pulse"
                    : "bg-indigo-600 animate-pulse"
                }`}
              />
              <span
                className={`text-xs font-black uppercase tracking-wider ${
                  activePhase === "pickup"
                    ? tripStage === "arrived_pickup"
                      ? "text-amber-800"
                      : "text-emerald-800"
                    : "text-indigo-800"
                }`}
              >
                {activePhase === "pickup"
                  ? tripStage === "arrived_pickup"
                    ? "📍 Arrived at Pickup · Verify OTP"
                    : "📍 Stage 1/2: En Route to Passenger"
                  : "🏁 Stage 2/2: En Route to Destination"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsHudHidden(true)}
                className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-[11px] font-bold px-2 py-0.5 rounded-md cursor-pointer transition-colors"
                title="Hide HUD from view"
              >
                Hide ✕
              </button>
              {onClearAcceptedRoute && (
                <button
                  type="button"
                  onClick={() => onClearAcceptedRoute()}
                  className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 text-[11px] font-bold px-2 py-0.5 rounded-md cursor-pointer transition-colors"
                  title="Cancel this ride"
                >
                  Cancel Ride
                </button>
              )}
            </div>
          </div>

          {/* Phase Switcher Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl mb-3">
            <button
              type="button"
              onClick={() => handleSetPhase("pickup")}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                activePhase === "pickup"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              <span>📍 1. Passenger Pickup</span>
            </button>
            <button
              type="button"
              disabled={isDriver && tripStage !== "in_progress"}
              onClick={() => handleSetPhase("dropoff")}
              title={
                isDriver && tripStage !== "in_progress"
                  ? "Arrive at pickup and verify passenger's 4-digit OTP first"
                  : "Show dropoff route"
              }
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                activePhase === "dropoff"
                  ? "bg-indigo-600 text-white shadow-sm cursor-pointer"
                  : isDriver && tripStage !== "in_progress"
                  ? "text-slate-400 cursor-not-allowed opacity-70"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60 cursor-pointer"
              }`}
            >
              <span>{isDriver && tripStage !== "in_progress" ? "🔒 2. Dropoff (OTP)" : "🏁 2. Dropoff Route"}</span>
            </button>
          </div>

          {/* Active Phase Route Summary */}
          <div
            className={`p-3 rounded-xl border mb-3 ${
              activePhase === "pickup"
                ? "bg-emerald-50/80 border-emerald-100"
                : "bg-indigo-50/80 border-indigo-100"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[10px] font-bold uppercase ${
                    activePhase === "pickup" ? "text-emerald-700" : "text-indigo-700"
                  }`}
                >
                  {activePhase === "pickup"
                    ? `Passenger Location (${acceptedRideRoute.passengerName})`
                    : "Dropoff Destination"}
                </p>
                <p className="text-xs font-extrabold text-slate-900 truncate">
                  {activePhase === "pickup"
                    ? acceptedRideRoute.pickupLocation.name
                    : acceptedRideRoute.dropoffLocation.name}
                </p>
                <p className="text-[10px] font-mono font-bold text-emerald-700/90 truncate mt-0.5">
                  {activePhase === "pickup"
                    ? `🎯 Pickup Pin: ${acceptedRideRoute.pickupLocation.lat.toFixed(6)}°N, ${acceptedRideRoute.pickupLocation.lng.toFixed(6)}°E`
                    : `🎯 Dropoff Pin: ${acceptedRideRoute.dropoffLocation.lat.toFixed(6)}°N, ${acceptedRideRoute.dropoffLocation.lng.toFixed(6)}°E`}
                </p>
                <p className="text-[10px] font-mono font-bold text-blue-700 truncate mt-0.5">
                  🏍️ Rider ({acceptedRideRoute.driverName}): {acceptedRideRoute.driverLocation.name} ·{" "}
                  {acceptedRideRoute.driverLocation.lat.toFixed(6)}°N,{" "}
                  {acceptedRideRoute.driverLocation.lng.toFixed(6)}°E
                </p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  {activePhase === "pickup"
                    ? `Dropoff after OTP: ${acceptedRideRoute.dropoffLocation.name}`
                    : `Passenger: ${acceptedRideRoute.passengerName}`}
                </p>
              </div>

              {acceptedRouteDetails && (
                <div className="text-right shrink-0">
                  <p
                    className={`text-base font-extrabold ${
                      activePhase === "pickup" ? "text-emerald-950" : "text-indigo-950"
                    }`}
                  >
                    ~{acceptedRouteDetails.durationMin} min
                  </p>
                  <p
                    className={`text-[11px] font-semibold ${
                      activePhase === "pickup" ? "text-emerald-600" : "text-indigo-600"
                    }`}
                  >
                    {acceptedRouteDetails.distanceKm} km
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Actions & Synchronization Controls */}
          <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold text-slate-700">
                {isDriver ? "Driver Live Controls" : "Ride Tracking"}
              </span>
              <button
                type="button"
                onClick={handleFitAcceptedBounds}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Re-frame Route
              </button>
            </div>

            {isDriver ? (
              <div className="flex flex-col gap-2">
                <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50/90 border border-emerald-200/80 flex items-center justify-between text-[11px] text-emerald-900">
                  <div className="flex items-center gap-1.5 font-semibold min-w-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                    <span className="truncate">
                      Live GPS Active · Tracking Rider &amp; Passenger
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSyncLiveGps}
                    className="ml-2 shrink-0 px-2 py-0.5 rounded-md bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold transition-colors cursor-pointer"
                  >
                    Sync GPS
                  </button>
                </div>

                {tripStage === "en_route_pickup" && (
                  <>
                    {Math.round(
                      metersBetween(
                        acceptedRideRoute.driverLocation.lat,
                        acceptedRideRoute.driverLocation.lng,
                        acceptedRideRoute.pickupLocation.lat,
                        acceptedRideRoute.pickupLocation.lng
                      )
                    ) <= 80 && (
                      <div className="px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-[11px] font-bold text-amber-900 flex items-center justify-between animate-pulse">
                        <span>
                          🎯 Within{" "}
                          {Math.max(
                            5,
                            Math.round(
                              metersBetween(
                                acceptedRideRoute.driverLocation.lat,
                                acceptedRideRoute.driverLocation.lng,
                                acceptedRideRoute.pickupLocation.lat,
                                acceptedRideRoute.pickupLocation.lng
                              )
                            )
                          )}
                          m of pickup geofence!
                        </span>
                        <span className="text-[10px] uppercase font-black text-amber-700">
                          Ready
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void onDriverArrived?.()}
                      className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <span>📍 I Have Arrived at Pickup (Notify Passenger)</span>
                    </button>
                  </>
                )}

                {tripStage === "arrived_pickup" && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (hudOtpInput.trim().length !== 4 || !onVerifyRideOtp) return;
                      setHudVerifyingOtp(true);
                      try {
                        const ok = await onVerifyRideOtp(hudOtpInput);
                        if (ok) {
                          setHudOtpInput("");
                          setLocalPhase("dropoff");
                        }
                      } finally {
                        setHudVerifyingOtp(false);
                      }
                    }}
                    className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-amber-900">
                        🔑 Enter 4-Digit OTP from {acceptedRideRoute.passengerName}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                        Arrived
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={hudOtpInput}
                        onChange={(e) => setHudOtpInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="4-digit OTP"
                        className="w-28 px-3 py-2 bg-white border border-amber-300 rounded-xl text-center text-sm font-black tracking-[0.3em] text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                      <button
                        type="submit"
                        disabled={hudOtpInput.length !== 4 || hudVerifyingOtp}
                        className="flex-1 py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-sm cursor-pointer transition-all"
                      >
                        {hudVerifyingOtp ? "Verifying…" : "Verify OTP ➔ Show Dropoff"}
                      </button>
                    </div>
                  </form>
                )}

                {tripStage === "in_progress" && (
                  <button
                    type="button"
                    onClick={onClearAcceptedRoute}
                    className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>🎉 Drop Off Passenger (Complete Ride)</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {acceptedRideRoute.otp && tripStage !== "in_progress" && (
                  <div className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-200 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                        Your Ride Pickup OTP
                      </p>
                      <p className="text-[11px] text-indigo-600">
                        Share with driver upon arrival
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {acceptedRideRoute.otp.split("").map((digit, i) => (
                        <span
                          key={i}
                          className="w-7 h-8 rounded-lg bg-white border border-indigo-300 text-indigo-950 font-black text-sm flex items-center justify-center shadow-2xs"
                        >
                          {digit}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between text-[11px] ${
                    tripStage === "arrived_pickup"
                      ? "bg-amber-50 border-amber-200 text-amber-900"
                      : "bg-emerald-50 border-emerald-200/80 text-emerald-800"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span
                      className={`w-2 h-2 rounded-full animate-ping ${
                        tripStage === "arrived_pickup" ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                    />
                    <span>
                      {tripStage === "arrived_pickup"
                        ? "Driver has arrived! Give your 4-digit OTP"
                        : activePhase === "pickup"
                        ? "Driver is on the way to pick you up"
                        : "OTP verified · En route to destination"}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase">Live</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating zoom controls */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col items-center bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden">
        <button
          type="button"
          onClick={handleZoomIn}
          aria-label="Zoom in"
          className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 border-b border-slate-200 transition-colors cursor-pointer"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          aria-label="Zoom out"
          className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 transition-colors cursor-pointer"
        >
          <Minus className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>

      {/* Re-center / locate button */}
      <button
        type="button"
        onClick={handleRecenter}
        title="Recenter to location"
        aria-label="Recenter to location"
        className="absolute bottom-28 right-6 z-20 w-10 h-10 rounded-xl bg-white shadow-lg border border-slate-200/80 flex items-center justify-center text-slate-700 hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 transition-colors cursor-pointer"
      >
        <Crosshair className="w-5 h-5" />
      </button>

      {/* Walking Prompt Card overlay on map (matching Rider dashboard UI) */}
      {acceptedRideRoute && (
        <div className="absolute bottom-6 left-6 z-20 bg-white/95 backdrop-blur-md rounded-2xl p-3.5 shadow-xl border border-slate-200/90 max-w-xs animate-in slide-in-from-bottom-3 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-sky-50 text-[#27a8f5] flex items-center justify-center shrink-0">
            <span className="text-base">🚶</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900">Your pickup is a 2-min walk</p>
            <p className="text-[11px] font-semibold text-slate-700">Campus Main Gate</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Wait beside the Main Gate security booth.</p>
          </div>
        </div>
      )}

      <div className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-md border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2">
        {acceptedRideRoute ? (
          <>
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-bold text-slate-800">Pickup at 5:35 PM</span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live campus rides</span>
          </>
        )}
      </div>
    </div>
  );
}
