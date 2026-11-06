"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Clock,
  User as UserIcon,
  Plus,
  X,
  ChevronDown,
  Check,
  Search,
  ArrowLeft,
  CreditCard,
  ShieldCheck,
  Car,
  LocateFixed,
  Loader2,
  AlertCircle,
  MapPin,
  Bell,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Navigation,
  Sparkles,
  Phone,
  Share2,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import {
  BENGALURU_LOCATIONS,
  CAMPUS_PICKUP_POINTS,
  LocationItem,
  calculateRideOptions,
  haversineKm,
  PAST_ACTIVITIES,
  AcceptedRideRoute,
  MatchingCampusRide,
  DEFAULT_MATCHING_RIDES,
} from "@/lib/mapData";
import type { DriverRideRequestView, RideOffer, RideRequest, TripHistoryRecord } from "@/lib/rideStore";
import { useToast } from "@/components/ToastContext";
import {
  useGeolocation,
  getLatestKnownGpsFix,
  resolvePinpointCurbsideLocation,
} from "@/lib/useGeolocation";
import { useNominatimSearch } from "@/lib/useNominatimSearch";
import { User } from "@/lib/auth";
import { KJU_COORDS, MANYATA_COORDS } from "@/lib/campus";
import RideCompanionBar from "@/components/RideCompanionBar";
import { playNotificationChime, triggerBrowserNotification } from "@/lib/notifications";

// Campus defaults (KJU / Manyata Tech Park, from @/lib/campus) are used when a typed place can't be resolved
const KNOWN_PLACES: LocationItem[] = [...BENGALURU_LOCATIONS, ...CAMPUS_PICKUP_POINTS];

// Turn a typed place name into real coordinates: known landmarks first, then geocoding, then a fallback
async function resolvePlace(
  text: string,
  fallback: { lat: number; lng: number }
): Promise<{ lat: number; lng: number }> {
  const t = text.trim().toLowerCase();
  if (t) {
    const known =
      KNOWN_PLACES.find((p) => p.name.toLowerCase() === t) ||
      (t.length >= 4
        ? KNOWN_PLACES.find(
            (p) => p.name.toLowerCase().includes(t) || t.includes(p.name.toLowerCase())
          )
        : undefined);
    if (known) return { lat: known.lat, lng: known.lng };

    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(text.trim())}`);
      if (res.ok) {
        const data = await res.json();
        const first = data.results?.[0];
        if (first && typeof first.lat === "number" && typeof first.lng === "number") {
          return { lat: first.lat, lng: first.lng };
        }
      }
    } catch {
      // fall through to fallback
    }
  }
  return fallback;
}

interface GetRidePanelProps {
  activeTab: "find" | "offer" | "my-rides";
  pickup: LocationItem | null;
  dropoff: LocationItem | null;
  onSetPickup: (loc: LocationItem) => void;
  onSetDropoff: (loc: LocationItem) => void;
  onClearDropoff: () => void;
  onClearPickup: () => void;
  route?: { distanceKm: number; durationMin: number } | null;
  onLocateUser?: (loc: { lat: number; lng: number; accuracy?: number }) => void;
  user?: User | null;
  onPendingCount?: (count: number) => void;
  onAcceptedRideRoute?: (route: AcceptedRideRoute | null) => void;
  activeAcceptedRide?: AcceptedRideRoute | null;
  onDriverArrived?: () => Promise<void> | void;
  onVerifyRideOtp?: (otp: string) => Promise<boolean>;
  onCompleteAcceptedRide?: () => void;
  selectedMatchingRide?: MatchingCampusRide | null;
  onSelectMatchingRide?: (ride: MatchingCampusRide | null) => void;
  onRequestSeatRef?: React.MutableRefObject<((ride?: MatchingCampusRide) => Promise<void>) | null>;
  onSearchingRidesChange?: (isSearching: boolean) => void;
}

export default function GetRidePanel({
  activeTab,
  pickup,
  dropoff,
  onSetPickup,
  onSetDropoff,
  onClearDropoff,
  onClearPickup,
  route,
  onLocateUser,
  user,
  onPendingCount,
  onAcceptedRideRoute,
  activeAcceptedRide,
  onDriverArrived,
  onVerifyRideOtp,
  onCompleteAcceptedRide,
  selectedMatchingRide,
  onSelectMatchingRide,
  onRequestSeatRef,
  onSearchingRidesChange,
}: GetRidePanelProps) {
  const { showToast } = useToast();
  const {
    status: geoStatus,
    location: geoLocation,
    error: geoError,
    requestLocation,
    reset: resetGeo,
  } = useGeolocation();
  const pickupSearch = useNominatimSearch();
  const dropoffSearch = useNominatimSearch();
  const { search: searchPickup } = pickupSearch;
  const { search: searchDropoff } = dropoffSearch;

  // Search input state (synced when pickup/dropoff props change from map or GPS)
  const [pickupText, setPickupText] = useState(pickup ? pickup.name : "Kristu Jayanti University");
  const [dropoffText, setDropoffText] = useState(dropoff ? dropoff.name : "");
  const [activeInputFocus, setActiveInputFocus] = useState<"pickup" | "dropoff" | null>(null);

  const [prevPickupKey, setPrevPickupKey] = useState<string | undefined>(
    pickup ? `${pickup.id}:${pickup.name}` : undefined
  );
  const currentPickupKey = pickup ? `${pickup.id}:${pickup.name}` : undefined;
  if (currentPickupKey !== prevPickupKey) {
    setPrevPickupKey(currentPickupKey);
    if (pickup) {
      setPickupText(pickup.name);
    }
  }

  const [prevDropoffKey, setPrevDropoffKey] = useState<string | undefined>(
    dropoff ? `${dropoff.id}:${dropoff.name}` : undefined
  );
  const currentDropoffKey = dropoff ? `${dropoff.id}:${dropoff.name}` : undefined;
  if (currentDropoffKey !== prevDropoffKey) {
    setPrevDropoffKey(currentDropoffKey);
    setDropoffText(dropoff ? dropoff.name : "");
  }

  // Offer Ride state
  const [offerOrigin, setOfferOrigin] = useState("Kristu Jayanti University");
  const [offerDest, setOfferDest] = useState("Manyata Tech Park");
  const [offerInputFocus, setOfferInputFocus] = useState<"origin" | "dest" | null>(null);
  const [offerSeats, setOfferSeats] = useState(3);
  const [offerPrice, setOfferPrice] = useState("50");
  const [offerVehicleModel, setOfferVehicleModel] = useState("");
  const [offerVehicleNumber, setOfferVehicleNumber] = useState("");
  const [offerVehicleType, setOfferVehicleType] = useState<"Car" | "Bike" | "Scooty">("Car");
  const [offerDepartureTime, setOfferDepartureTime] = useState("Immediate");
  const [publishedOffer, setPublishedOffer] = useState<RideOffer | null>(null);
  const [driverOffers, setDriverOffers] = useState<RideOffer[]>([]);
  const [showOfferForm, setShowOfferForm] = useState(false);

  // Sync pickup/dropoff input text with parent prop during render without cascading effect renders
  const [prevPickup, setPrevPickup] = useState(pickup);
  if (pickup !== prevPickup) {
    setPrevPickup(pickup);
    if (pickup) {
      setPickupText(pickup.name);
      setOfferOrigin(pickup.name);
    }
  }

  const [prevDropoff, setPrevDropoff] = useState(dropoff);
  if (dropoff !== prevDropoff) {
    setPrevDropoff(dropoff);
    setDropoffText(dropoff ? dropoff.name : "");
    if (dropoff) setOfferDest(dropoff.name);
  }

  // Stop addition
  const [hasExtraStop, setHasExtraStop] = useState(false);
  const [stopText, setStopText] = useState("");

  // Rider offered ride state (true only if this user actually posted an offer)
  const [hasRiderOfferedRide, setHasRiderOfferedRide] = useState<boolean>(() => {
    if (typeof window === "undefined" || !user?.id) return false;
    try {
      return localStorage.getItem(`hopon_offered_${user.id}`) === "true";
    } catch {
      return false;
    }
  });

  // Matching rides for the campus route (only populated when real drivers post offers)
  const [matchingRides, setMatchingRides] = useState<MatchingCampusRide[]>(DEFAULT_MATCHING_RIDES);
  const [internalSelectedRide, setInternalSelectedRide] = useState<MatchingCampusRide | null>(
    DEFAULT_MATCHING_RIDES[0] || null
  );
  const activeMatchingRide = selectedMatchingRide ?? internalSelectedRide;

  // Seats selector state
  const [seatsCount, setSeatsCount] = useState(1);
  const [isSeatsOpen, setIsSeatsOpen] = useState(false);

  // Sync active offers from server with live polling
  const selectedMatchingRideRef = useRef(selectedMatchingRide);
  useEffect(() => {
    selectedMatchingRideRef.current = selectedMatchingRide;
  }, [selectedMatchingRide]);

  const fetchPassengerOffersRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;
    const fetchOffers = async () => {
      try {
        const res = await fetch("/api/rides/offers");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.offers && Array.isArray(data.offers)) {
          // Show only real student driver offers (ignore seed demo offers and demo accounts)
          const DEMO_DRIVER_IDS = new Set([
            "usr_krish_rai_01",
            "usr_driver_demo_01",
            "usr_driver_demo_02",
            "usr_driver_demo_03",
          ]);

          const realOffers = data.offers.filter(
            (o: { id: string; driverId?: string }) => {
              if (!o) return false;
              if (String(o.id).startsWith("offer_seed_")) return false;
              const dId = String(o.driverId || "");
              if (DEMO_DRIVER_IDS.has(dId) || dId.startsWith("usr_driver_demo_") || dId === "usr_krish_rai_01") {
                return false;
              }
              return true;
            }
          );

          // Sort: newest created offers first
          const sortedOffers = [...realOffers].sort(
            (a: { createdAt?: number }, b: { createdAt?: number }) => (b.createdAt || 0) - (a.createdAt || 0)
          );

          const mapped: MatchingCampusRide[] = sortedOffers.map((o: {
            id: string;
            driverId: string;
            driverName: string;
            driverRating?: number;
            vehicleModel?: string;
            vehicleNumber?: string;
            departureTime?: string;
            seatsLeft: number;
            farePerSeat?: string | number;
          }, idx: number) => ({
            id: o.id,
            driverId: o.driverId,
            driverName: o.driverName,
            driverRating: Number(o.driverRating) || 4.9,
            vehicleModel: o.vehicleModel || "Campus Vehicle",
            vehicleNumber: o.vehicleNumber || "KA 04 MP 1180",
            departureTime: o.departureTime || "Immediate",
            leavesIn: o.departureTime === "Immediate" ? "Immediate" : "5 min",
            seatsLeft: Number(o.seatsLeft) ?? 1,
            price: Number(o.farePerSeat) || 35,
            isBestMatch: idx === 0,
          }));

          if (!cancelled) {
            setMatchingRides(mapped);
            if (mapped.length > 0) {
              setInternalSelectedRide((prev) => {
                const match = mapped.find((m) => m.id === prev?.id);
                return match || mapped[0];
              });
              if (onSelectMatchingRide) {
                const currentSelected = selectedMatchingRideRef.current;
                const stillValid = currentSelected && mapped.find((m) => m.id === currentSelected.id);
                if (!stillValid) {
                  onSelectMatchingRide(mapped[0]);
                }
              }
            } else {
              setInternalSelectedRide(null);
              if (onSelectMatchingRide) {
                onSelectMatchingRide(null as unknown as MatchingCampusRide);
              }
            }
          }
        }
      } catch {
        /* silent */
      }
    };

    fetchPassengerOffersRef.current = fetchOffers;
    void fetchOffers();
    const interval = setInterval(fetchOffers, 2000);
    const onWindowFocus = () => void fetchOffers();
    window.addEventListener("focus", onWindowFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [onSelectMatchingRide, activeTab]);

  // Schedule modal / toggle
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("5:30 PM");
  const [scheduledDate, setScheduledDate] = useState("Today");

  // Post search state: whether available rides are showing
  const [isSearchingRides, setIsSearchingRidesState] = useState(false);
  const setIsSearchingRides = useCallback(
    (val: boolean) => {
      setIsSearchingRidesState(val);
      onSearchingRidesChange?.(val);
    },
    [onSearchingRidesChange]
  );
  const [selectedRideId] = useState<string>("hopon-bike");
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "upi" | "cash">("wallet");
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  // The driver who accepted this passenger's request (set once a driver accepts)
  const [assignedOffer, setAssignedOffer] = useState<RideOffer | null>(null);
  const [agreedFare, setAgreedFare] = useState<string | null>(null);

  // Passenger ride request state
  type ReqStatus = "idle" | "sending" | "pending" | "accepted" | "rejected" | "error";
  const [reqStatus, setReqStatus] = useState<ReqStatus>("idle");
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [passengerOtp, setPassengerOtp] = useState<string | null>(null);
  const [passengerTripStage, setPassengerTripStage] = useState<
    "en_route_pickup" | "arrived_pickup" | "in_progress"
  >("en_route_pickup");
  const lastSeenStageRef = useRef<{ status?: string; tripStage?: string }>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Driver OTP input state
  const [driverOtpInput, setDriverOtpInput] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Sync passenger booking state when the accepted route is cleared/completed from the map HUD
  const [prevAcceptedRide, setPrevAcceptedRide] = useState(activeAcceptedRide);
  if (activeAcceptedRide !== prevAcceptedRide) {
    setPrevAcceptedRide(activeAcceptedRide);
    if (!activeAcceptedRide && reqStatus === "accepted") {
      setBookingConfirmed(false);
      setIsSearchingRides(false);
      setReqStatus("idle");
      setActiveRequestId(null);
      setAssignedOffer(null);
      setPassengerOtp(null);
      setPassengerTripStage("en_route_pickup");
    }
  }
  useEffect(() => {
    if (!activeAcceptedRide) {
      lastSeenStageRef.current = {};
    }
  }, [activeAcceptedRide]);

  // Driver inbox state
  const [driverRequests, setDriverRequests] = useState<(DriverRideRequestView & { passengerId?: string })[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const driverPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dbTripHistory, setDbTripHistory] = useState<TripHistoryRecord[]>([]);

  useEffect(() => {
    if (activeTab !== "my-rides") return;
    let cancelled = false;
    async function loadTripHistory() {
      try {
        const res = await fetch("/api/rides/history", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.history)) {
          setDbTripHistory(data.history);
        }
      } catch {
        // Ignore network errors and fall back to static activity list
      }
    }
    void loadTripHistory();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Handle "Use my location" button click
  const handleUseMyLocation = async () => {
    showToast("Detecting Location", "Settling GPS & Wi-Fi coordinates...", "info");
    const loc = await requestLocation();
    if (loc) {
      if (onLocateUser) {
        onLocateUser({ lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy });
      }
      const locationItem: LocationItem = {
        id: `geo_${Date.now()}`,
        name: loc.shortName,
        address: loc.displayName,
        lat: loc.lat,
        lng: loc.lng,
        category: "landmark",
      };
      setPickupText(loc.shortName);
      setOfferOrigin(loc.shortName);
      onSetPickup(locationItem);
      setActiveInputFocus(null);
      const accMsg = loc.accuracy ? ` (±${Math.round(loc.accuracy)}m)` : "";
      showToast("Pinpoint GPS Locked", `Pickup: ${loc.shortName}${accMsg}`, "success");
    } else {
      showToast("Location unavailable", "Please allow location access in browser settings.", "error");
    }
  };

  // Filter location suggestions
  const filterLocations = (query: string) => {
    if (!query) return BENGALURU_LOCATIONS.slice(0, 5);
    return BENGALURU_LOCATIONS.filter(
      (loc) =>
        loc.name.toLowerCase().includes(query.toLowerCase()) ||
        loc.address.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);
  };

  // Only query suggestions when user types; never automatically relocate map pins on typing
  useEffect(() => {
    if (pickupText && pickupText.trim().length >= 2) {
      searchPickup(pickupText);
    }
  }, [pickupText, searchPickup]);

  useEffect(() => {
    if (dropoffText && dropoffText.trim().length >= 2) {
      searchDropoff(dropoffText);
    }
  }, [dropoffText, searchDropoff]);

  useEffect(() => {
    if (activeTab === "offer" && offerOrigin && offerOrigin.trim().length >= 2) {
      searchPickup(offerOrigin);
    }
  }, [activeTab, offerOrigin, searchPickup]);

  useEffect(() => {
    if (activeTab === "offer" && offerDest && offerDest.trim().length >= 2) {
      searchDropoff(offerDest);
    }
  }, [activeTab, offerDest, searchDropoff]);

  // Combined suggestions: local landmarks + live Nominatim results
  const combinedPickupSuggestions = React.useMemo(() => {
    const local = filterLocations(pickupText);
    const nominatim = pickupSearch.results.filter(
      (nr) => !local.some((lr) => lr.name.toLowerCase() === nr.name.toLowerCase())
    );
    return [...local, ...nominatim].slice(0, 6);
  }, [pickupText, pickupSearch.results]);

  const combinedDropoffSuggestions = React.useMemo(() => {
    const local = filterLocations(dropoffText);
    const nominatim = dropoffSearch.results.filter(
      (nr) => !local.some((lr) => lr.name.toLowerCase() === nr.name.toLowerCase())
    );
    return [...local, ...nominatim].slice(0, 6);
  }, [dropoffText, dropoffSearch.results]);

  const combinedOfferOriginSuggestions = React.useMemo(() => {
    const local = filterLocations(offerOrigin);
    const nominatim = pickupSearch.results.filter(
      (nr) => !local.some((lr) => lr.name.toLowerCase() === nr.name.toLowerCase())
    );
    return [...local, ...nominatim].slice(0, 6);
  }, [offerOrigin, pickupSearch.results]);

  const combinedOfferDestSuggestions = React.useMemo(() => {
    const local = filterLocations(offerDest);
    const nominatim = dropoffSearch.results.filter(
      (nr) => !local.some((lr) => lr.name.toLowerCase() === nr.name.toLowerCase())
    );
    return [...local, ...nominatim].slice(0, 6);
  }, [offerDest, dropoffSearch.results]);

  const handleSelectPickup = (loc: LocationItem) => {
    setPickupText(loc.name);
    onSetPickup(loc);
    setActiveInputFocus(null);
  };

  const handleSelectDropoff = (loc: LocationItem) => {
    setDropoffText(loc.name);
    onSetDropoff(loc);
    setActiveInputFocus(null);
  };

  const handleSelectOfferOrigin = (loc: LocationItem) => {
    setOfferOrigin(loc.name);
    onSetPickup(loc);
    setOfferInputFocus(null);
  };

  const handleSelectOfferDest = (loc: LocationItem) => {
    setOfferDest(loc.name);
    onSetDropoff(loc);
    setOfferInputFocus(null);
  };

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmedPickup = pickupText.trim();
    if (!pickup) {
      if (trimmedPickup) {
        const coords = await resolvePlace(trimmedPickup, KJU_COORDS);
        onSetPickup({
          id: `resolved_pickup_${Date.now()}`,
          name: trimmedPickup,
          address: trimmedPickup,
          lat: coords.lat,
          lng: coords.lng,
          category: "landmark",
        });
      } else {
        const defaultPickup =
          BENGALURU_LOCATIONS.find((l) => l.name === "Kristu Jayanti University") ||
          BENGALURU_LOCATIONS[1];
        onSetPickup(defaultPickup);
      }
    } else if (trimmedPickup && trimmedPickup.toLowerCase() !== pickup.name.toLowerCase()) {
      const coords = await resolvePlace(trimmedPickup, { lat: pickup.lat, lng: pickup.lng });
      onSetPickup({
        id: `resolved_pickup_${Date.now()}`,
        name: trimmedPickup,
        address: trimmedPickup,
        lat: coords.lat,
        lng: coords.lng,
        category: "landmark",
      });
    }

    const trimmedDropoff = dropoffText.trim();
    if (!dropoff) {
      if (trimmedDropoff) {
        const coords = await resolvePlace(trimmedDropoff, MANYATA_COORDS);
        onSetDropoff({
          id: `resolved_dropoff_${Date.now()}`,
          name: trimmedDropoff,
          address: trimmedDropoff,
          lat: coords.lat,
          lng: coords.lng,
          category: "landmark",
        });
      } else {
        const defaultDropoff =
          BENGALURU_LOCATIONS.find((l) => l.name === "Manyata Tech Park") ||
          BENGALURU_LOCATIONS[4];
        setDropoffText(defaultDropoff.name);
        onSetDropoff(defaultDropoff);
      }
    } else if (trimmedDropoff && trimmedDropoff.toLowerCase() !== dropoff.name.toLowerCase()) {
      const coords = await resolvePlace(trimmedDropoff, { lat: dropoff.lat, lng: dropoff.lng });
      onSetDropoff({
        id: `resolved_dropoff_${Date.now()}`,
        name: trimmedDropoff,
        address: trimmedDropoff,
        lat: coords.lat,
        lng: coords.lng,
        category: "landmark",
      });
    }

    setIsSearchingRides(true);
    setReqStatus("idle");
    setAssignedOffer(null);
    showToast("Review your trip", "Send a request and a nearby student driver can accept it.", "info");
  };

  // Poll for request status and live tripStage updates (arrival + OTP verification)
  const startPassengerPoll = (requestId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        if (!user) return;
        const res = await fetch(`/api/rides/requests?passengerId=${user.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const req = (data.requests || []).find((r: { id: string }) => r.id === requestId) as
          | (RideRequest & {
              offer?: RideOffer;
              driverLocation?: { lat: number; lng: number };
            })
          | undefined;
        if (!req) return;

        if (req.status === "accepted") {
          const offer = req.offer;
          const stage = req.tripStage ?? "en_route_pickup";
          const phase = stage === "in_progress" ? "dropoff" : "pickup";

          setReqStatus("accepted");
          setAssignedOffer(offer ?? null);
          setAgreedFare(req.agreedFare ?? offer?.farePerSeat ?? null);
          if (req.otp) setPassengerOtp(req.otp);
          setPassengerTripStage(stage);

          const prev = lastSeenStageRef.current;
          if (prev.status !== "accepted") {
            playNotificationChime("success");
            triggerBrowserNotification(
              "HopOn · Ride Accepted! 🎉",
              req.otp ? `Your 4-digit ride OTP is ${req.otp}.` : "Your driver is on the way!"
            );
            showToast(
              "Ride Accepted! 🎉",
              req.otp
                ? `Your 4-digit ride OTP is ${req.otp}. Share it with your driver at pickup.`
                : "Your driver accepted! Route to your pickup is live on the map.",
              "success"
            );
          } else if (stage === "arrived_pickup" && prev.tripStage !== "arrived_pickup") {
            playNotificationChime("alert");
            triggerBrowserNotification(
              "HopOn · Driver Has Arrived! 📍",
              `Your driver is at ${req.pickup}. Share OTP ${req.otp ?? ""}.`
            );
            showToast(
              "Driver Has Arrived! 📍",
              `Your driver has arrived at ${req.pickup}. Share your 4-digit OTP (${req.otp ?? ""}) to start the ride.`,
              "info"
            );
          } else if (stage === "in_progress" && prev.tripStage !== "in_progress") {
            playNotificationChime("success");
            triggerBrowserNotification(
              "HopOn · OTP Verified! 🏁",
              `Heading to ${req.dropoff} — dropoff route is live on the map.`
            );
            showToast(
              "OTP Verified! 🏁",
              `Heading to ${req.dropoff} — dropoff route is now live on the map.`,
              "success"
            );
          }

          if (prev.status !== "accepted" || prev.tripStage !== stage) {
            lastSeenStageRef.current = { status: "accepted", tripStage: stage };
            onAcceptedRideRoute?.({
              requestId: req.id,
              driverId: offer?.driverId,
              driverName: offer?.driverName || "Student Driver",
              driverVehicle: offer?.vehicleModel,
              driverPlate: offer?.vehicleNumber,
              passengerId: user.id,
              passengerName: user.name,
              fare: offer?.farePerSeat,
              phase,
              tripStage: stage,
              otp: req.otp,
              driverLocation:
                stage === "arrived_pickup" || stage === "in_progress"
                  ? {
                      lat: req.pickupLat,
                      lng: req.pickupLng,
                      name: req.pickup,
                    }
                  : {
                      lat: req.driverLocation?.lat ?? offer?.fromLat ?? 13.0583,
                      lng: req.driverLocation?.lng ?? offer?.fromLng ?? 77.6426,
                      name: offer?.from || "Rider (Live GPS)",
                    },
              pickupLocation: {
                lat: req.pickupLat,
                lng: req.pickupLng,
                name: req.pickup,
              },
              dropoffLocation: {
                lat: req.dropoffLat,
                lng: req.dropoffLng,
                name: req.dropoff,
              },
            });
          }
        } else if (req.status === "rejected") {
          setReqStatus("rejected");
          lastSeenStageRef.current = { status: "rejected" };
          if (pollRef.current) clearInterval(pollRef.current);
          showToast("Request Declined", "The driver couldn't take your ride. Please try another.", "error");
        } else if (
          (req.status === "completed" || req.status === "cancelled") &&
          lastSeenStageRef.current.status === "accepted"
        ) {
          if (pollRef.current) clearInterval(pollRef.current);
          lastSeenStageRef.current = {};
          onAcceptedRideRoute?.(null);
          setBookingConfirmed(false);
          setIsSearchingRides(false);
          setReqStatus("idle");
          setActiveRequestId(null);
          setAssignedOffer(null);
          setAgreedFare(null);
          setPassengerOtp(null);
          setPassengerTripStage("en_route_pickup");
          if (req.status === "completed") {
            showToast("Ride Completed! 🎉", `You have reached ${req.dropoff}.`, "success");
          } else {
            showToast("Ride Cancelled", "This ride was cancelled.", "info");
          }
        }
      } catch { /* silent */ }
    }, 2500);
  };

  const distanceKm = route?.distanceKm ?? 8.5;
  const rideOptions = calculateRideOptions(distanceKm);
  const selectedRide = rideOptions.find((r) => r.id === selectedRideId) || rideOptions[0];

  // Broadcast an open or targeted request for a campus ride
  const handleBookRide = async (targetRide?: MatchingCampusRide) => {
    if (!user) return;
    const rideToBook = targetRide || activeMatchingRide;
    setAssignedOffer(null);
    setPassengerOtp(null);
    setPassengerTripStage("en_route_pickup");
    lastSeenStageRef.current = {};
    setReqStatus("sending");
    try {
      const noteParts = [
        `Preferred ride: ${rideToBook?.driverName ?? selectedRide.name} (${rideToBook?.vehicleModel ?? selectedRide.description}, est. ₹${rideToBook?.price ?? selectedRide.price})`,
      ];
      if (scheduledTime) {
        noteParts.push(`Scheduled: ${scheduledDate}, ${scheduledTime}`);
      }
      if (seatsCount > 1) {
        noteParts.push(`Seats: ${seatsCount}`);
      }
      if (hasExtraStop && stopText.trim()) {
        noteParts.push(`Stop: ${stopText.trim()}`);
      }

      const basePickupName = pickup?.name || pickupText.trim() || "Kristu Jayanti University";
      const finalPickupName = basePickupName;
      const finalDropoffName = dropoff?.name || dropoffText.trim() || "Manyata Tech Park";

      const resolvedPickupCoords =
        pickup && pickup.name.toLowerCase() === basePickupName.toLowerCase()
          ? { lat: Number(pickup.lat.toFixed(6)), lng: Number(pickup.lng.toFixed(6)) }
          : await resolvePlace(basePickupName, pickup ? { lat: pickup.lat, lng: pickup.lng } : KJU_COORDS);

      const resolvedDropoffCoords =
        dropoff && dropoff.name.toLowerCase() === finalDropoffName.toLowerCase()
          ? { lat: dropoff.lat, lng: dropoff.lng }
          : await resolvePlace(finalDropoffName, dropoff ? { lat: dropoff.lat, lng: dropoff.lng } : MANYATA_COORDS);

      const res = await fetch("/api/rides/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: rideToBook?.id,
          passengerId: user.id,
          passengerName: user.name,
          passengerRating: user.rating,
          pickup: finalPickupName,
          pickupLat: resolvedPickupCoords.lat,
          pickupLng: resolvedPickupCoords.lng,
          dropoff: finalDropoffName,
          dropoffLat: resolvedDropoffCoords.lat,
          dropoffLng: resolvedDropoffCoords.lng,
          note: noteParts.join(" · "),
        }),
      });
      const data = await res.json();
      if (res.ok && data.request) {
        setActiveRequestId(data.request.id);
        setReqStatus("pending");
        setBookingConfirmed(true);
        startPassengerPoll(data.request.id);
        showToast("Request Sent!", "Nearby student drivers have been notified. First to accept picks you up.", "info");
      } else {
        setReqStatus("error");
        showToast("Request Failed", data.error || "Could not send ride request.", "error");
      }
    } catch {
      setReqStatus("error");
      showToast("Network Error", "Please check your connection and try again.", "error");
    }
  };

  useEffect(() => {
    if (onRequestSeatRef) {
      onRequestSeatRef.current = handleBookRide;
    }
  });

  // Cancel (or finish) the active request on the server so the seat is freed and the
  // passenger can book again (otherwise the server keeps it pending/accepted and returns 409).
  const cancelActiveRequest = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    const requestId = activeRequestId;
    setActiveRequestId(null);
    if (!user || !requestId) return;
    try {
      await fetch("/api/rides/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, passengerId: user.id, action: "cancel" }),
      });
    } catch {
      // silent
    }
  };

  // Restore any active passenger request (pending or accepted) on mount / login
  useEffect(() => {
    if (!user || (user.role !== "passenger" && user.role !== "both")) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rides/requests?passengerId=${user.id}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const active = (
          (data.requests || []) as (RideRequest & {
            offer?: RideOffer;
            driverLocation?: { lat: number; lng: number };
          })[]
        ).find((r) => r.status === "pending" || r.status === "accepted");
        if (!active || cancelled) return;
        setActiveRequestId(active.id);
        setIsSearchingRides(true);
        setBookingConfirmed(true);
        if (active.status === "accepted") {
          const offer = active.offer;
          const stage = active.tripStage ?? "en_route_pickup";
          const phase = stage === "in_progress" ? "dropoff" : "pickup";
          setReqStatus("accepted");
          setAssignedOffer(offer ?? null);
          setAgreedFare(active.agreedFare ?? offer?.farePerSeat ?? null);
          setPassengerOtp(active.otp ?? null);
          setPassengerTripStage(stage);
          lastSeenStageRef.current = { status: "accepted", tripStage: stage };
          onAcceptedRideRoute?.({
            requestId: active.id,
            driverId: offer?.driverId,
            driverName: offer?.driverName || "Student Driver",
            driverVehicle: offer?.vehicleModel,
            driverPlate: offer?.vehicleNumber,
            passengerId: user.id,
            passengerName: user.name,
            fare: offer?.farePerSeat,
            phase,
            tripStage: stage,
            otp: active.otp,
            driverLocation:
              stage === "arrived_pickup" || stage === "in_progress"
                ? { lat: active.pickupLat, lng: active.pickupLng, name: active.pickup }
                : {
                    lat: active.driverLocation?.lat ?? offer?.fromLat ?? 13.0583,
                    lng: active.driverLocation?.lng ?? offer?.fromLng ?? 77.6426,
                    name: offer?.from || "Rider (Live GPS)",
                  },
            pickupLocation: {
              lat: active.pickupLat,
              lng: active.pickupLng,
              name: active.pickup,
            },
            dropoffLocation: {
              lat: active.dropoffLat,
              lng: active.dropoffLng,
              name: active.dropoff,
            },
          });
        } else {
          setReqStatus("pending");
        }
        startPassengerPoll(active.id);
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  // Cleanup polls on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (driverPollRef.current) clearInterval(driverPollRef.current);
    };
  }, []);

  // Auto-load driver inbox whenever the Offer tab is open
  useEffect(() => {
    // Drivers poll their inbox on every tab so the bell badge shows new open requests
    const isDriverOrBoth =
      user?.role === "driver" ||
      user?.role === "both" ||
      Boolean(user?.vehicleModel || user?.vehicleNumber);
    if (!isDriverOrBoth || !user) {
      if (driverPollRef.current) {
        clearInterval(driverPollRef.current);
        driverPollRef.current = null;
      }
      return;
    }

    // Fetch immediately then poll every 4 s
    const run = async () => {
      setInboxLoading(true);
      try {
        const [reqRes, offersRes] = await Promise.all([
          fetch(`/api/rides/requests?driverId=${user.id}`),
          fetch("/api/rides/offers"),
        ]);
        if (reqRes.ok) {
          const data = await reqRes.json();
          const reqs: typeof driverRequests = data.requests || [];
          setDriverRequests(reqs);
          onPendingCount?.(reqs.filter((r) => r.status === "pending").length);
        }
        if (offersRes.ok) {
          const oData = await offersRes.json();
          const myOffers = ((oData.offers || []) as RideOffer[]).filter((o) => o.driverId === user.id);
          setDriverOffers(myOffers);
          const customOffers = myOffers.filter((o) => !o.id.startsWith("offer_seed_"));
          if (customOffers.length > 0 || hasRiderOfferedRide) {
            setPublishedOffer((prev) => prev || customOffers[0] || myOffers[0]);
          }
        }
      } catch { /* silent */ } finally {
        setInboxLoading(false);
      }
    };

    run();
    if (!driverPollRef.current) {
      driverPollRef.current = setInterval(run, 4000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.id, activeTab]);

  // Report pending count to parent whenever requests change (even on other tabs)
  useEffect(() => {
    const isDriverOrBoth =
      user?.role === "driver" ||
      user?.role === "both" ||
      Boolean(user?.vehicleModel || user?.vehicleNumber);
    if (isDriverOrBoth) {
      onPendingCount?.(driverRequests.filter((r) => r.status === "pending").length);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverRequests]);

  // Driver inbox poller
  const fetchDriverInbox = async () => {
    if (!user) return;
    setInboxLoading(true);
    try {
      const [res, offersRes] = await Promise.all([
        fetch(`/api/rides/requests?driverId=${user.id}`),
        fetch("/api/rides/offers"),
      ]);
      if (res.ok) {
        const data = await res.json();
        setDriverRequests(data.requests || []);
      }
      if (offersRes.ok) {
        const oData = await offersRes.json();
        const myOffers = ((oData.offers || []) as RideOffer[]).filter((o) => o.driverId === user.id);
        setDriverOffers(myOffers);
        const customOffers = myOffers.filter((o) => !o.id.startsWith("offer_seed_"));
        if (customOffers.length > 0 || hasRiderOfferedRide) {
          setPublishedOffer((prev) => prev || customOffers[0] || myOffers[0]);
        }
      }
    } catch { /* silent */ } finally {
      setInboxLoading(false);
    }
  };

  const handleDriverRespond = async (requestId: string, action: "accept" | "reject") => {
    if (!user) return;
    try {
      let exactRiderLat: number | undefined;
      let exactRiderLng: number | undefined;
      let exactRiderName: string | undefined;

      if (action === "accept") {
        // Acquire the rider's pinpoint real-time GPS & snap to nearest street curb before accepting
        const cachedFix = getLatestKnownGpsFix();
        if (geoLocation) {
          exactRiderLat = Number(geoLocation.lat.toFixed(6));
          exactRiderLng = Number(geoLocation.lng.toFixed(6));
          exactRiderName = geoLocation.shortName;
        } else if (cachedFix) {
          const resolved = await resolvePinpointCurbsideLocation(
            cachedFix.lat,
            cachedFix.lng,
            cachedFix.accuracy
          );
          exactRiderLat = resolved.lat;
          exactRiderLng = resolved.lng;
          exactRiderName = resolved.shortName;
        } else {
          const liveLoc = await requestLocation();
          if (liveLoc) {
            exactRiderLat = Number(liveLoc.lat.toFixed(6));
            exactRiderLng = Number(liveLoc.lng.toFixed(6));
            exactRiderName = liveLoc.shortName;
          }
        }

        if (exactRiderLat !== undefined && exactRiderLng !== undefined) {
          fetch("/api/rides/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: exactRiderLat, lng: exactRiderLng }),
          }).catch(() => {});
        }
      }

      const res = await fetch("/api/rides/requests/respond", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          driverId: user.id,
          action,
          driverLat: exactRiderLat,
          driverLng: exactRiderLng,
          driverLocationName: exactRiderName,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (action === "accept") {
          setDriverOtpInput("");
          const reqItem = driverRequests.find((r) => r.id === requestId);
          const targetReq = data.request || reqItem;
          const offer = data.request?.offer || publishedOffer || driverOffers[0];
          const finalDriverLat = Number(
            (
              exactRiderLat ??
              data.request?.driverLocation?.lat ??
              offer?.fromLat ??
              13.0583
            ).toFixed(6)
          );
          const finalDriverLng = Number(
            (
              exactRiderLng ??
              data.request?.driverLocation?.lng ??
              offer?.fromLng ??
              77.6426
            ).toFixed(6)
          );
          const finalDriverName =
            exactRiderName ||
            offer?.from ||
            `Rider (${finalDriverLat.toFixed(5)}, ${finalDriverLng.toFixed(5)})`;

          showToast(
            "Accepted · Rider Pin Locked ✅",
            `Rider GPS locked at ${finalDriverName} (${finalDriverLat.toFixed(5)}°N, ${finalDriverLng.toFixed(5)}°E).`,
            "success"
          );

          if (targetReq) {
            onAcceptedRideRoute?.({
              requestId: targetReq.id,
              driverId: user.id,
              driverName: user.name,
              driverVehicle: offer?.vehicleModel,
              driverPlate: offer?.vehicleNumber,
              passengerId: reqItem?.passengerId,
              passengerName: targetReq.passengerName,
              fare: offer?.farePerSeat || targetReq.agreedFare,
              phase: "pickup",
              tripStage: "en_route_pickup",
              driverLocation: {
                lat: finalDriverLat,
                lng: finalDriverLng,
                name: finalDriverName,
              },
              pickupLocation: {
                lat: targetReq.pickupLat,
                lng: targetReq.pickupLng,
                name: targetReq.pickup,
              },
              dropoffLocation: {
                lat: targetReq.dropoffLat,
                lng: targetReq.dropoffLng,
                name: targetReq.dropoff,
              },
            });
          }
        } else {
          showToast("Declined", "Request declined.", "info");
        }
        await fetchDriverInbox();
      } else {
        showToast("Error", data.error || "Could not respond.", "error");
      }
    } catch {
      showToast("Network Error", "Please try again.", "error");
    }
  };

  const handleOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      // Resolve real coordinates for the typed origin/destination (was hardcoded to a point ~10 km away)
      const [fromCoords, toCoords] = await Promise.all([
        resolvePlace(offerOrigin, KJU_COORDS),
        resolvePlace(offerDest, MANYATA_COORDS),
      ]);
      const res = await fetch("/api/rides/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: user.id,
          driverName: user.name,
          driverUniversity: user.university,
          driverRating: user.rating,
          vehicleModel: offerVehicleModel,
          vehicleNumber: offerVehicleNumber,
          vehicleType: offerVehicleType,
          from: offerOrigin,
          fromLat: fromCoords.lat,
          fromLng: fromCoords.lng,
          to: offerDest,
          toLat: toCoords.lat,
          toLng: toCoords.lng,
          departureTime: offerDepartureTime,
          departureDate: "Today",
          seats: offerSeats,
          farePerSeat: offerPrice,
        }),
      });
      const data = await res.json();
      if (res.ok && data.offer) {
        setPublishedOffer(data.offer);
        setHasRiderOfferedRide(true);
        try {
          if (user?.id) {
            localStorage.setItem(`hopon_offered_${user.id}`, "true");
          }
        } catch {}
        setShowOfferForm(false);
        showToast("Ride Published!", `Your route from ${offerOrigin} to ${offerDest} is live.`, "success");
        // Immediately sync passenger offers list so it is visible on the passenger side
        await fetchPassengerOffersRef.current();
        // Start polling inbox for this driver
        if (driverPollRef.current) clearInterval(driverPollRef.current);
        await fetchDriverInbox();
        driverPollRef.current = setInterval(fetchDriverInbox, 4000);
      } else {
        showToast("Error", data.error || "Could not publish ride.", "error");
      }
    } catch {
      showToast("Network Error", "Please check your connection.", "error");
    }
  };

  // OFFER RIDE VIEW (Only accessible to users registered as both rider & passenger with a vehicle)
  const canOfferRide =
    Boolean(user?.vehicleModel || user?.vehicleNumber) ||
    user?.role === "driver" ||
    user?.role === "both";

  if (activeTab === "offer" && canOfferRide) {
    const pendingReqs = driverRequests.filter((r) => r.status === "pending");
    const handledReqs = driverRequests.filter((r) => r.status !== "pending");
    const acceptedReqs = driverRequests.filter((r) => r.status === "accepted");

    // Calculate driver stats from active offers + accepted requests
    const activeOffer = publishedOffer || (hasRiderOfferedRide ? driverOffers[0] : null);
    const totalSeats = activeOffer?.seats ?? offerSeats;
    const seatsLeft = activeOffer?.seatsLeft ?? totalSeats;
    const estimatedEarnings = acceptedReqs.reduce((sum, r) => {
      const f = Number(r.offer?.farePerSeat || activeOffer?.farePerSeat || offerPrice || 50);
      return sum + (Number.isFinite(f) ? f : 50);
    }, 0);

    // Recommended student fare based on current route distance & vehicle type
    const recommendedFare =
      offerVehicleType === "Bike"
        ? Math.max(20, Math.round(distanceKm * 4.5))
        : offerVehicleType === "Scooty"
        ? Math.max(20, Math.round(distanceKm * 4))
        : Math.max(30, Math.round(distanceKm * 6));

    const currentPhase = activeAcceptedRide?.phase ?? "pickup";
    const currentTripStage =
      activeAcceptedRide?.tripStage ??
      (currentPhase === "dropoff" ? "in_progress" : "en_route_pickup");

    return (
      <div className="w-full bg-white rounded-3xl p-5 sm:p-6 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-4 max-h-[calc(100vh-120px)] overflow-y-auto">
        {/* Header + Live Driver Status Bar */}
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-[11px] font-semibold mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Driver Console · Live GPS</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight font-heading">
                Offer Seats &amp; Earn
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Accept student requests along your route or post a new ride.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowOfferForm((prev) => !prev)}
              className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                showOfferForm
                  ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20"
              }`}
            >
              {showOfferForm ? (
                <>
                  <Bell className="w-3.5 h-3.5" />
                  <span>Inbox ({pendingReqs.length})</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Post Ride</span>
                </>
              )}
            </button>
          </div>

          {/* Driver Earnings & Campus Sustainability Analytics Strip */}
          <div className="grid grid-cols-4 gap-2">
            <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Open Reqs</div>
              <div className="text-sm font-extrabold text-slate-900 mt-0.5 flex items-center gap-1">
                <span>{pendingReqs.length}</span>
                {pendingReqs.length > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 bg-orange-100 text-orange-700 rounded-full">
                    New
                  </span>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Seats</div>
              <div className="text-sm font-extrabold text-blue-600 mt-0.5 truncate">
                {activeOffer ? `${seatsLeft}/${totalSeats} left` : "0 left"}
              </div>
            </div>
            <div className="p-2.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/70">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Earned</div>
              <div className="text-sm font-extrabold text-emerald-700 mt-0.5">
                ₹{estimatedEarnings}
              </div>
            </div>
            <div className="p-2.5 rounded-2xl bg-teal-50/70 border border-teal-200/70">
              <div className="text-[10px] font-bold uppercase tracking-wider text-teal-700">CO₂ Saved</div>
              <div className="text-sm font-extrabold text-teal-800 mt-0.5">
                {((acceptedReqs.length + (user?.ridesCompleted ?? 0)) * 1.4).toFixed(1)}kg
              </div>
            </div>
          </div>
        </div>

        {/* Pinned Active Trip Cockpit when a ride is currently in progress */}
        {activeAcceptedRide && (
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white border border-slate-800 shadow-lg space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full animate-ping shrink-0 ${
                    currentTripStage === "en_route_pickup"
                      ? "bg-emerald-400"
                      : currentTripStage === "arrived_pickup"
                      ? "bg-amber-400"
                      : "bg-blue-400"
                  }`}
                />
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 truncate">
                  {currentTripStage === "en_route_pickup"
                    ? "Step 1/3 · En Route to Passenger Pickup"
                    : currentTripStage === "arrived_pickup"
                    ? "Step 2/3 · Arrived · Enter Passenger OTP"
                    : "Step 3/3 · OTP Verified · Route to Dropoff"}
                </span>
              </div>
              {activeAcceptedRide.fare && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-extrabold shrink-0">
                  ₹{activeAcceptedRide.fare}
                </span>
              )}
            </div>

            {/* Location Card: shows Passenger Pickup first, then Dropoff after OTP */}
            <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white truncate">
                  👤 {activeAcceptedRide.passengerName || "Student Rider"}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    currentTripStage === "in_progress"
                      ? "bg-indigo-500/30 text-indigo-200 border border-indigo-400/30"
                      : currentTripStage === "arrived_pickup"
                      ? "bg-amber-500/30 text-amber-200 border border-amber-400/30"
                      : "bg-emerald-500/30 text-emerald-200 border border-emerald-400/30"
                  }`}
                >
                  {currentTripStage === "in_progress"
                    ? "Dropoff Unlocked"
                    : currentTripStage === "arrived_pickup"
                    ? "Waiting for OTP"
                    : "Pickup Route Active"}
                </span>
              </div>

              {currentTripStage !== "in_progress" ? (
                <div className="space-y-1">
                  <div className="text-xs text-emerald-200 font-semibold flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">
                      Passenger Pickup: {activeAcceptedRide.pickupLocation.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-cyan-300 truncate">
                        🏍️ Your Rider Location: {activeAcceptedRide.driverLocation.name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {activeAcceptedRide.driverLocation.lat.toFixed(6)}°N,{" "}
                        {activeAcceptedRide.driverLocation.lng.toFixed(6)}°E
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const loc = await requestLocation();
                        if (loc) {
                          const exactLat = Number(loc.lat.toFixed(6));
                          const exactLng = Number(loc.lng.toFixed(6));
                          fetch("/api/rides/location", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ lat: exactLat, lng: exactLng }),
                          }).catch(() => {});
                          onAcceptedRideRoute?.({
                            ...activeAcceptedRide,
                            driverLocation: {
                              lat: exactLat,
                              lng: exactLng,
                              name: loc.shortName,
                            },
                          });
                          showToast(
                            "Rider GPS Refined 🎯",
                            `${loc.shortName} (${exactLat.toFixed(5)}°N, ${exactLng.toFixed(5)}°E)`,
                            "success"
                          );
                        }
                      }}
                      className="shrink-0 px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <LocateFixed className="w-3 h-3" />
                      <span>Pinpoint GPS</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-indigo-200 font-semibold flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">
                    Dropoff Location: {activeAcceptedRide.dropoffLocation.name}
                  </span>
                </div>
              )}
            </div>

            {/* Step 1: Button to notify passenger that driver has arrived */}
            {currentTripStage === "en_route_pickup" && (
              <button
                type="button"
                onClick={() => void onDriverArrived?.()}
                className="w-full py-3 px-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>I Have Arrived at Pickup (Notify Passenger)</span>
              </button>
            )}

            {/* Step 2: Input 4-Digit OTP from Passenger to unlock Dropoff Route */}
            {currentTripStage === "arrived_pickup" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (driverOtpInput.trim().length !== 4 || !onVerifyRideOtp) return;
                  setVerifyingOtp(true);
                  try {
                    const ok = await onVerifyRideOtp(driverOtpInput);
                    if (ok) {
                      setDriverOtpInput("");
                    }
                  } finally {
                    setVerifyingOtp(false);
                  }
                }}
                className="p-3 rounded-xl bg-amber-500/15 border border-amber-400/30 space-y-2.5"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-amber-200">
                    🔑 Enter 4-Digit OTP from Passenger
                  </span>
                  <span className="text-[10px] text-emerald-300 font-semibold">
                    ✓ Passenger Notified
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={driverOtpInput}
                    onChange={(e) =>
                      setDriverOtpInput(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="••••"
                    className="w-28 px-3 py-2.5 bg-slate-950/90 border border-amber-400/50 rounded-xl text-center text-base font-black tracking-[0.35em] text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-300"
                  />
                  <button
                    type="submit"
                    disabled={driverOtpInput.length !== 4 || verifyingOtp}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-slate-950 font-extrabold text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {verifyingOtp ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying…</span>
                      </>
                    ) : (
                      <span>Verify OTP ➔ Show Dropoff Route</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: After OTP verified, show Dropoff Route & Complete Ride button */}
            {currentTripStage === "in_progress" && (
              <button
                type="button"
                onClick={() => onCompleteAcceptedRide?.()}
                className="w-full py-3 px-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Complete Ride at Dropoff</span>
              </button>
            )}

            {/* In-Ride Chat, UPI QR, Live Trip Share & SOS Bar for Driver */}
            {user && (
              <div className="pt-1">
                <RideCompanionBar
                  requestId={activeAcceptedRide.requestId}
                  userRole="driver"
                  userId={user.id}
                  counterpartyName={activeAcceptedRide.passengerName || "Passenger"}
                  fare={activeAcceptedRide.fare}
                />
              </div>
            )}
          </div>
        )}

        {/* Segmented Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/70">
          <button
            type="button"
            onClick={() => setShowOfferForm(false)}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              !showOfferForm
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-blue-600" />
            <span>Requests Inbox</span>
            {pendingReqs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-extrabold">
                {pendingReqs.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowOfferForm(true)}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              showOfferForm
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Car className="w-3.5 h-3.5 text-indigo-600" />
            <span>Post / Edit Ride</span>
          </button>
        </div>

        {/* Toggle between Offer Form and Incoming Requests Inbox */}
        {showOfferForm ? (
          <form onSubmit={handleOfferSubmit} className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3">
              {/* Starting From with live Autocomplete + GPS locate */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Starting From
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleUseMyLocation();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    <LocateFixed className="w-3 h-3" />
                    <span>Use current GPS</span>
                  </button>
                </div>
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus-within:bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-400/20 shrink-0" />
                  <input
                    type="text"
                    value={offerOrigin}
                    onFocus={() => setOfferInputFocus("origin")}
                    onBlur={() => setTimeout(() => setOfferInputFocus((f) => (f === "origin" ? null : f)), 180)}
                    onChange={(e) => setOfferOrigin(e.target.value)}
                    placeholder="Campus gate or starting landmark"
                    className="w-full bg-transparent text-sm font-medium text-slate-900 focus:outline-none"
                  />
                  {offerOrigin && (
                    <button
                      type="button"
                      onClick={() => setOfferOrigin("")}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Campus Gate Quick Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1.5">
                  {CAMPUS_PICKUP_POINTS.map((gate) => (
                    <button
                      key={gate.id}
                      type="button"
                      onClick={() => handleSelectOfferOrigin(gate)}
                      className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
                        offerOrigin === gate.name
                          ? "bg-blue-50 border-blue-300 text-blue-700"
                          : "bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      📍 {gate.name.replace("KJU ", "")}
                    </button>
                  ))}
                </div>

                {/* Origin Autocomplete Dropdown */}
                {offerInputFocus === "origin" && combinedOfferOriginSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-[68px] z-30 bg-white rounded-2xl shadow-xl border border-slate-200/90 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {combinedOfferOriginSuggestions.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectOfferOrigin(loc);
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-blue-50/60 flex items-start gap-2.5 transition-colors cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">{loc.name}</div>
                          <div className="text-[10px] text-slate-400 truncate">{loc.address}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Going To with live Autocomplete */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Going To
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400">
                    Est. {distanceKm.toFixed(1)} km route
                  </span>
                </div>
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus-within:bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20">
                  <div className="w-2.5 h-2.5 rounded-md bg-indigo-600 ring-4 ring-indigo-400/20 shrink-0" />
                  <input
                    type="text"
                    value={offerDest}
                    onFocus={() => setOfferInputFocus("dest")}
                    onBlur={() => setTimeout(() => setOfferInputFocus((f) => (f === "dest" ? null : f)), 180)}
                    onChange={(e) => setOfferDest(e.target.value)}
                    placeholder="Destination hub or tech park"
                    className="w-full bg-transparent text-sm font-medium text-slate-900 focus:outline-none"
                  />
                  {offerDest && (
                    <button
                      type="button"
                      onClick={() => setOfferDest("")}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Destination Autocomplete Dropdown */}
                {offerInputFocus === "dest" && combinedOfferDestSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-[68px] z-30 bg-white rounded-2xl shadow-xl border border-slate-200/90 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {combinedOfferDestSuggestions.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectOfferDest(loc);
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-indigo-50/60 flex items-start gap-2.5 transition-colors cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">{loc.name}</div>
                          <div className="text-[10px] text-slate-400 truncate">{loc.address}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Visual Vehicle Type Selector Cards */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Select Vehicle Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { type: "Car", emoji: "🚗", label: "Car", seatsHint: "Up to 4 seats", defaultModel: "White Swift Dzire", defaultSeats: 3 },
                      { type: "Bike", emoji: "🏍️", label: "Bike", seatsHint: "1 Pillion", defaultModel: "Royal Enfield Hunter", defaultSeats: 1 },
                      { type: "Scooty", emoji: "🛵", label: "Scooty", seatsHint: "1 Pillion", defaultModel: "Honda Activa 6G", defaultSeats: 1 },
                    ] as const
                  ).map((v) => {
                    const selected = offerVehicleType === v.type;
                    return (
                      <button
                        key={v.type}
                        type="button"
                        onClick={() => {
                          setOfferVehicleType(v.type);
                          setOfferSeats(v.defaultSeats);
                        }}
                        className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          selected
                            ? "bg-blue-50/90 border-blue-600 ring-2 ring-blue-600/15"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        <div className="text-lg leading-none">{v.emoji}</div>
                        <div className="text-xs font-bold text-slate-900 mt-1">{v.label}</div>
                        <div className="text-[10px] text-slate-500">{v.seatsHint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vehicle Model & Plate */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Vehicle Details
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={offerVehicleModel}
                    onChange={(e) => setOfferVehicleModel(e.target.value)}
                    placeholder="e.g. Honda Activa"
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-600/20"
                  />
                  <input
                    type="text"
                    value={offerVehicleNumber}
                    onChange={(e) => setOfferVehicleNumber(e.target.value)}
                    placeholder="e.g. KA 04 EK 7142"
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
              </div>

              {/* Seats & Fare with Smart Fare Recommendation */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Available Seats
                  </label>
                  <select
                    value={offerSeats}
                    onChange={(e) => setOfferSeats(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
                  >
                    {(offerVehicleType === "Car" ? [1, 2, 3, 4] : [1]).map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "seat" : "seats"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      ₹ / Seat
                    </label>
                    <button
                      type="button"
                      onClick={() => setOfferPrice(String(recommendedFare))}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-md cursor-pointer transition-colors"
                      title="Apply recommended student-friendly fare for this distance"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>Suggested ₹{recommendedFare}</span>
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={offerPrice}
                    onChange={(e) => setOfferPrice(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* Departure Time Quick Pills */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Departure Time
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {["Immediate", "In 15 mins", "5:00 PM", "5:30 PM", "6:00 PM", "8:30 AM"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOfferDepartureTime(t)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        offerDepartureTime === t
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {t === "Immediate" ? "⚡ Leaving Now" : t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/35 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Car className="w-4 h-4" />
              <span>Publish Student Ride · ₹{offerPrice}/seat</span>
            </button>
          </form>
        ) : (
          /* ---- Driver Inbox: shown whenever requests exist or after publishing ---- */
          <div className="space-y-4">
            {/* Active Offer Banner */}
            {activeOffer ? (
              <div className="flex items-center gap-3 p-3.5 bg-emerald-50/90 rounded-2xl border border-emerald-200/80">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-emerald-950 truncate">
                      {activeOffer.from} → {activeOffer.to}
                    </p>
                    <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      {activeOffer.seatsLeft}/{activeOffer.seats} seats
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-0.5 truncate">
                    {activeOffer.vehicleModel} ({activeOffer.vehicleNumber}) · {activeOffer.departureTime} · ₹{activeOffer.farePerSeat}/seat
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOfferForm(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-white/80 hover:bg-white text-emerald-800 border border-emerald-200 text-[11px] font-bold shrink-0 cursor-pointer transition-colors"
                >
                  New
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowOfferForm(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-blue-300 bg-blue-50/50 text-blue-600 text-xs font-bold hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <Car className="w-4 h-4" />
                <span>Post Your Route &amp; Available Seats</span>
              </button>
            )}

            {/* Incoming Requests Inbox */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800">Incoming Student Requests</span>
                  {pendingReqs.length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {pendingReqs.length}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={fetchDriverInbox}
                  disabled={inboxLoading}
                  className="flex items-center gap-1 text-[11px] text-blue-600 font-semibold cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${inboxLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {inboxLoading && driverRequests.length === 0 && (
                <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Checking for ride requests…</span>
                </div>
              )}

              {!inboxLoading && driverRequests.length === 0 && (
                <div className="py-7 px-4 text-center text-xs text-slate-400 bg-slate-50/70 rounded-2xl border border-slate-200/60">
                  <Bell className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                  <p className="font-bold text-slate-600">No passenger requests right now</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    When a student broadcasts a ride request, it will pop up here with live route preview.
                  </p>
                </div>
              )}

              {/* Pending requests */}
              {pendingReqs.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Awaiting Your Response ({pendingReqs.length})
                  </div>
                  {pendingReqs.map((req) => {
                    const tripDistKm = Math.max(
                      1.2,
                      +(haversineKm(req.pickupLat, req.pickupLng, req.dropoffLat, req.dropoffLng) * 1.3).toFixed(1)
                    );
                    const estTripMins = Math.max(4, Math.round((tripDistKm / 26) * 60));

                    return (
                      <div
                        key={req.id}
                        className="p-3.5 rounded-2xl border border-orange-200/90 bg-gradient-to-br from-orange-50/70 via-white to-amber-50/40 shadow-xs space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-bold text-slate-900">{req.passengerName}</p>
                              <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200/80 px-1.5 py-0.2 rounded-md">
                                ★ {req.passengerRating}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Requested at{" "}
                              {new Date(req.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              · ~{tripDistKm} km ({estTripMins} min trip)
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onSetPickup({
                                id: `req_pick_${req.id}`,
                                name: req.pickup,
                                address: req.pickup,
                                lat: req.pickupLat,
                                lng: req.pickupLng,
                                category: "landmark",
                              });
                              onSetDropoff({
                                id: `req_drop_${req.id}`,
                                name: req.dropoff,
                                address: req.dropoff,
                                lat: req.dropoffLat,
                                lng: req.dropoffLng,
                                category: "landmark",
                              });
                              showToast(
                                "Previewing Request Route",
                                `${req.pickup} → ${req.dropoff} (~${tripDistKm} km)`,
                                "info"
                              );
                            }}
                            className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            title="Preview pickup and dropoff pins on map"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Preview Map</span>
                          </button>
                        </div>

                        {/* Pickup & Dropoff Box */}
                        <div className="text-xs text-slate-700 space-y-1.5 bg-white rounded-xl p-2.5 border border-orange-100">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                            <span className="text-[10px] font-bold uppercase text-slate-400 w-11 shrink-0">
                              Pickup
                            </span>
                            <span className="font-semibold text-slate-800 truncate">{req.pickup}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-md bg-indigo-600 shrink-0" />
                            <span className="text-[10px] font-bold uppercase text-slate-400 w-11 shrink-0">
                              Dropoff
                            </span>
                            <span className="font-semibold text-slate-800 truncate">{req.dropoff}</span>
                          </div>
                        </div>

                        {/* Passenger Preferences / Note Pills */}
                        {req.note && (
                          <div className="flex flex-wrap gap-1.5">
                            {req.note.split(" · ").map((chip, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200/80 text-[10px] font-semibold"
                              >
                                {chip}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleDriverRespond(req.id, "reject")}
                            className="flex-1 py-2.5 rounded-xl bg-white border border-rose-200 text-rose-600 text-xs font-bold hover:bg-rose-50 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDriverRespond(req.id, "accept")}
                            className="flex-[1.4] py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold hover:from-emerald-600 hover:to-teal-600 shadow-sm shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Accept &amp; Navigate
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Handled requests history */}
              {handledReqs.length > 0 && (
                <div className="space-y-2 mt-3">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Recent Trip Activity
                  </div>
                  {handledReqs.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{req.passengerName}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {req.pickup} → {req.dropoff}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {req.status === "accepted" && (
                          <button
                            type="button"
                            onClick={() => {
                              const offer = req.offer || activeOffer;
                              const stage = req.tripStage ?? "en_route_pickup";
                              const phase = stage === "in_progress" ? "dropoff" : "pickup";
                              onAcceptedRideRoute?.({
                                requestId: req.id,
                                driverId: user?.id || offer?.driverId,
                                driverName: user?.name || "Driver",
                                driverVehicle: offer?.vehicleModel,
                                driverPlate: offer?.vehicleNumber,
                                passengerId: req.passengerId,
                                passengerName: req.passengerName,
                                fare: offer?.farePerSeat,
                                phase,
                                tripStage: stage,
                                driverLocation:
                                  geoLocation
                                    ? {
                                        lat: geoLocation.lat,
                                        lng: geoLocation.lng,
                                        name: geoLocation.shortName || "Driver (Live GPS)",
                                      }
                                    : stage === "arrived_pickup" || stage === "in_progress"
                                    ? {
                                        lat: req.pickupLat,
                                        lng: req.pickupLng,
                                        name: req.pickup,
                                      }
                                    : {
                                        lat: offer?.fromLat ?? 13.0583,
                                        lng: offer?.fromLng ?? 77.6426,
                                        name: offer?.from || "Driver Start Point",
                                      },
                                pickupLocation: {
                                  lat: req.pickupLat,
                                  lng: req.pickupLng,
                                  name: req.pickup,
                                },
                                dropoffLocation: {
                                  lat: req.dropoffLat,
                                  lng: req.dropoffLng,
                                  name: req.dropoff,
                                },
                              });
                              showToast(
                                "Route Active",
                                phase === "dropoff"
                                  ? "Showing route to dropoff location."
                                  : "Showing route to passenger pickup location.",
                                "info"
                              );
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1 transition-colors"
                          >
                            <Navigation className="w-3 h-3" />
                            Map HUD
                          </button>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            req.status === "accepted"
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                              : req.status === "completed" || req.status === "cancelled"
                              ? "bg-slate-100 text-slate-600 border-slate-200"
                              : "bg-rose-100 text-rose-600 border-rose-200"
                          }`}
                        >
                          {req.status === "accepted"
                            ? "✓ Active"
                            : req.status === "completed"
                            ? "Completed"
                            : req.status === "cancelled"
                            ? "Cancelled"
                            : "✕ Declined"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // MY RIDES VIEW
  if (activeTab === "my-rides") {
    const formattedDbTrips = dbTripHistory.map((entry) => {
      const dt = new Date(entry.createdAt);
      const date = dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      const time = dt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
      return {
        id: entry.id,
        date,
        time,
        from: entry.from,
        to: entry.to,
        vehicle: entry.vehicle,
        amount: entry.amount.startsWith("₹") ? entry.amount : `₹${entry.amount}`,
        status: entry.status,
        isLiveDb: true,
      };
    });
    const combinedRides = [
      ...formattedDbTrips,
      ...PAST_ACTIVITIES.map((t) => ({ ...t, isLiveDb: false })),
    ];

    return (
      <div className="w-full bg-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">
            My Campus Rides
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track active rides and view past ride receipts from your database history.
          </p>
        </div>

        <div className="space-y-3 max-h-[380px] overflow-y-auto">
          {combinedRides.map((trip) => (
            <div
              key={trip.id}
              className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-blue-200 transition-all flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800">{trip.vehicle}</span>
                  {trip.isLiveDb && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold">
                      DB
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold text-blue-600">{trip.amount}</span>
              </div>
              <div className="text-[11px] text-slate-600 space-y-1">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                  <span className="truncate">{trip.from}</span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-xs bg-indigo-600 shrink-0" />
                  <span className="truncate">{trip.to}</span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[10px] text-slate-500">
                <span>{trip.date} · {trip.time}</span>
                <span className="text-emerald-600 font-semibold">{trip.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // POST-SEARCH / VEHICLE SELECTION VIEW (NO DISCOUNT, LOGIN THEME)
  if (isSearchingRides) {
    if (bookingConfirmed) {
      // ---- Ride Accepted by Driver ----
      if (reqStatus === "accepted") {
        const driverName = assignedOffer?.driverName || activeMatchingRide?.driverName || "Rohan Mehta";
        const vehicleModel = assignedOffer?.vehicleModel || activeMatchingRide?.vehicleModel || "White Swift Dzire";
        const vehicleNumber = assignedOffer?.vehicleNumber || activeMatchingRide?.vehicleNumber || "KA 04 EK 7142";
        const fareAmount = agreedFare ?? assignedOffer?.farePerSeat ?? activeMatchingRide?.price ?? 75;

        // Stage 4: During the Trip (Prioritize arrival time, trip sharing, and safety)
        if (passengerTripStage === "in_progress") {
          return (
            <div className="w-full bg-white rounded-3xl p-5 sm:p-6 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-4 animate-in fade-in duration-200">
              {/* Header with Priority Arrival Time */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-bold uppercase tracking-wider border border-sky-200 mb-1.5">
                    <Navigation className="w-3 h-3 text-[#27a8f5]" />
                    <span>TRIP IN PROGRESS</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight font-heading">
                    On trip to {dropoffText || "Manyata Tech Park"}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Estimated arrival at 5:57 PM · Safe commute underway
                  </p>
                </div>

                <div className="w-12 h-12 rounded-xl bg-slate-950 text-white flex flex-col items-center justify-center shrink-0 shadow-md">
                  <span className="text-sm font-black leading-none">22</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">MIN</span>
                </div>
              </div>

              {/* 4-Step Progress Tracker (Step 3: On trip active) */}
              <div className="pt-2 pb-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                  <span className="text-slate-900 font-bold">Confirmed</span>
                  <span className="text-slate-900 font-bold">Arrived</span>
                  <span className="text-sky-600 font-bold">On trip</span>
                  <span>Done</span>
                </div>
                <div className="relative flex items-center">
                  <div className="absolute left-0 right-0 h-1 bg-slate-200 rounded-full" />
                  <div className="absolute left-0 w-3/4 h-1 bg-[#27a8f5] rounded-full transition-all" />
                  <div className="relative flex justify-between w-full">
                    <div className="w-4 h-4 rounded-full bg-[#27a8f5] text-white flex items-center justify-center text-[9px] font-bold ring-4 ring-white">✓</div>
                    <div className="w-4 h-4 rounded-full bg-[#27a8f5] text-white flex items-center justify-center text-[9px] font-bold ring-4 ring-white">✓</div>
                    <div className="w-4 h-4 rounded-full bg-white border-2 border-[#27a8f5] flex items-center justify-center ring-4 ring-white">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#27a8f5] animate-ping" />
                    </div>
                    <div className="w-4 h-4 rounded-full bg-slate-200 ring-4 ring-white" />
                  </div>
                </div>
              </div>

              {/* Destination Dropoff Guidance Card */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">DROP-OFF POINT</span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Live GPS Tracking
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-900">
                  {dropoffText || "Manyata Tech Park · Gate 5"}
                </p>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/70 text-xs text-slate-600">
                  <span>Agreed upfront fare:</span>
                  <span className="font-bold text-slate-900">₹{fareAmount} (HopOn Wallet)</span>
                </div>
              </div>

              {/* Priority Safety & Trip Sharing Actions */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/track/${activeRequestId || "live"}`;
                    navigator.clipboard.writeText(shareUrl).catch(() => {});
                    showToast("Trip Link Copied! 🔗", "Shareable live tracking link copied to clipboard.", "success");
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#27a8f5]" />
                  <span>Share Live Trip with Family/Friends</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    showToast("Campus Safety Center", "Campus Emergency helpline: +91 80 6873 7777 (24/7 Security)", "info");
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <span>Emergency SOS & Campus Security</span>
                </button>
              </div>

              {/* Driver & vehicle footer */}
              <div className="p-3 rounded-xl bg-slate-50 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                    <Car className="w-3.5 h-3.5 text-slate-700" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">{driverName}</span>
                    <p className="text-[10px] text-slate-400">{vehicleModel} · {vehicleNumber}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (onCompleteAcceptedRide) {
                      onCompleteAcceptedRide();
                    } else {
                      onAcceptedRideRoute?.(null);
                      setBookingConfirmed(false);
                      setIsSearchingRides(false);
                      setReqStatus("idle");
                      void cancelActiveRequest();
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] transition-colors cursor-pointer"
                >
                  Complete Ride
                </button>
              </div>
            </div>
          );
        }

        // Stage 3: After Acceptance (Driver Arriving - Latest Rider Dashboard Layout)
        return (
          <div className="w-full bg-white rounded-3xl p-5 sm:p-6 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-4 animate-in fade-in duration-200">
            {/* Header matching latest rider dashboard UI */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-bold uppercase tracking-wider border border-sky-200 mb-1.5">
                  <Clock className="w-3 h-3 text-[#27a8f5]" />
                  <span>DRIVER ON THE WAY</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight font-heading">
                  Your ride is arriving
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Meet {driverName.split(" ")[0]} at the Main Gate.
                </p>
              </div>

              {/* 6 MIN ETA Box */}
              <div className="w-12 h-12 rounded-xl bg-slate-950 text-white flex flex-col items-center justify-center shrink-0 shadow-md">
                <span className="text-sm font-black leading-none">6</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">MIN</span>
              </div>
            </div>

            {/* 4-Step Progress Tracker (Step 2: Arriving active) */}
            <div className="pt-2 pb-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                <span className="text-slate-900 font-bold">Confirmed</span>
                <span className="text-sky-600 font-bold">Arriving</span>
                <span>On trip</span>
                <span>Done</span>
              </div>
              <div className="relative flex items-center">
                <div className="absolute left-0 right-0 h-1 bg-slate-200 rounded-full" />
                <div className="absolute left-0 w-1/3 h-1 bg-[#27a8f5] rounded-full transition-all" />
                <div className="relative flex justify-between w-full">
                  <div className="w-4 h-4 rounded-full bg-[#27a8f5] text-white flex items-center justify-center text-[9px] font-bold ring-4 ring-white">✓</div>
                  <div className="w-4 h-4 rounded-full bg-white border-2 border-[#27a8f5] flex items-center justify-center ring-4 ring-white">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#27a8f5] animate-ping" />
                  </div>
                  <div className="w-4 h-4 rounded-full bg-slate-200 ring-4 ring-white" />
                  <div className="w-4 h-4 rounded-full bg-slate-200 ring-4 ring-white" />
                </div>
              </div>
            </div>

            {/* Pickup & Destination Guidance Box */}
            <div className="space-y-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-start gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-900 flex items-center justify-center mt-0.5 shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PICKUP</p>
                  <p className="text-xs font-bold text-slate-900">{pickupText || "Kristu Jayanti University"}</p>
                  <p className="text-[11px] text-slate-500">Main Gate · Near the security booth</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-2 border-t border-slate-200/70">
                <div className="w-3 h-3 rounded-xs bg-slate-900 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">DROP-OFF</p>
                  <p className="text-xs font-bold text-slate-900">{dropoffText || "Manyata Tech Park · Gate 5"}</p>
                  <p className="text-[11px] text-slate-500">22 min estimated trip</p>
                </div>
              </div>
            </div>

            {/* Driver & Vehicle Card */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900">{driverName}</span>
                    <span className="w-3.5 h-3.5 rounded-full bg-sky-500 text-white flex items-center justify-center text-[9px] font-bold">✓</span>
                  </div>
                  <p className="text-xs text-slate-500">⭐ 4.9 · {vehicleModel}</p>
                  <p className="text-[10px] font-bold text-slate-400">{vehicleNumber}</p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-base font-extrabold text-slate-900">₹{fareAmount}</p>
                <p className="text-[10px] text-slate-500">1 seat</p>
              </div>
            </div>

            {/* 4-Digit Pickup OTP Card */}
            {passengerOtp && (
              <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200 text-center space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800">
                  YOUR RIDE PICKUP OTP
                </p>
                <div className="flex items-center justify-center gap-2 pt-0.5">
                  {passengerOtp.split("").map((digit, idx) => (
                    <div
                      key={idx}
                      className="w-10 h-12 rounded-xl bg-white border-2 border-sky-300 shadow-2xs flex items-center justify-center text-xl font-black text-slate-900"
                    >
                      {digit}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500">
                  Share this 4-digit code with {driverName.split(" ")[0]} upon pickup.
                </p>
              </div>
            )}

            {/* Contact Actions (Message & Call) */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => showToast("Chat with Driver", `Opening message thread with ${driverName}...`, "info")}
                className="flex-1 py-3 px-4 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] active:scale-[0.98] text-white font-bold text-xs sm:text-sm shadow-md shadow-sky-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Message driver</span>
              </button>

              <button
                type="button"
                onClick={() => showToast("Driver Phone", `Calling ${driverName} via secure campus proxy...`, "info")}
                title="Call driver"
                className="p-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                <Phone className="w-4 h-4" />
              </button>
            </div>

            {/* Footer Links: Trip Details & Clear Cancellation Option */}
            <div className="flex items-center justify-between pt-1 px-1 text-xs">
              <button
                type="button"
                onClick={() => showToast("Trip Details", `Ride ID: ${activeRequestId || "KJU-8921"} · Verified Driver: ${driverName}`, "info")}
                className="text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
              >
                Trip details
              </button>

              <button
                type="button"
                onClick={() => {
                  onAcceptedRideRoute?.(null);
                  setBookingConfirmed(false);
                  setIsSearchingRides(false);
                  setReqStatus("idle");
                  setAgreedFare(null);
                  void cancelActiveRequest();
                  showToast("Ride Cancelled", "Your ride request was cancelled with ₹0 penalty.", "info");
                }}
                className="text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
              >
                Cancel ride (₹0 fee)
              </button>
            </div>
          </div>
        );
      }

      // ---- Rejected ----
      if (reqStatus === "rejected") {
        return (
          <div className="w-full bg-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-5 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-md">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-heading">Request Declined</h2>
                <p className="text-xs text-rose-500">The driver couldn&apos;t take your ride</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">This can happen when the driver is full or has a conflict. Please try requesting from another available driver below.</p>
            <button
              type="button"
              onClick={() => { setBookingConfirmed(false); setReqStatus("idle"); setActiveRequestId(null); setAssignedOffer(null); }}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm shadow-md transition-all cursor-pointer"
            >
              Try Another Ride
            </button>
          </div>
        );
      }

      // ---- Pending — waiting for driver ----
      return (
        <div className="w-full bg-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-5 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 font-heading">Request Sent</h2>
              <p className="text-xs text-slate-500">Waiting for driver to accept…</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-200/80">
            <Bell className="w-5 h-5 text-blue-600 shrink-0 animate-pulse" />
            <div>
              <p className="text-xs font-semibold text-blue-900">Notifying your driver</p>
              <p className="text-[11px] text-blue-700 mt-0.5">You&apos;ll be notified as soon as the driver responds. Stay on this screen.</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Ride type</span>
              <span className="font-bold text-slate-900">{selectedRide.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Trip</span>
              <span className="text-slate-600 truncate max-w-[60%] text-right">
                {pickupText || "Kristu Jayanti University"} → {dropoffText || "Manyata Tech Park"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Estimated fare</span>
              <span className="font-bold text-blue-700">₹{selectedRide.price}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setBookingConfirmed(false);
              setIsSearchingRides(false);
              setReqStatus("idle");
              void cancelActiveRequest();
              showToast("Request Cancelled", "Your ride request was cancelled with ₹0 fee.", "info");
            }}
            className="w-full py-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-2xl text-center text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <X className="w-4 h-4 text-rose-600" />
            <span>Cancel Request (₹0 Penalty)</span>
          </button>
        </div>
      );
    }

    return (
      <div className="w-full bg-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-4 max-h-[calc(100vh-120px)] overflow-y-auto">
        {/* Back and Route summary */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setIsSearchingRides(false)}
            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Change route</span>
          </button>
          <span className="text-xs text-slate-500 font-medium">
            {route ? `${route.distanceKm.toFixed(1)} km · ~${route.durationMin} mins` : "8.5 km · ~22 mins"}
          </span>
        </div>

        {/* Selected route pills matching login page design */}
        <div className="space-y-2 p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs">
          <div className="flex items-center gap-2 text-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-400/20 shrink-0" />
            <span className="font-semibold truncate">{pickupText || "Kristu Jayanti University"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-800">
            <span className="w-2.5 h-2.5 rounded-xs bg-indigo-600 ring-4 ring-indigo-400/20 shrink-0" />
            <span className="font-semibold truncate">{dropoffText || "Manyata Tech Park"}</span>
          </div>
        </div>

        {/* Matching Rides on Your Route List */}
        {matchingRides.length > 0 ? (
          <div className="space-y-2 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">
                {matchingRides.length} ride{matchingRides.length !== 1 ? "s" : ""} on your route
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                Verified campus members
              </span>
            </div>

            <div className="space-y-2">
              {matchingRides.map((ride) => {
                const isSelected = activeMatchingRide?.id === ride.id;
                return (
                  <div
                    key={ride.id}
                    onClick={() => {
                      setInternalSelectedRide(ride);
                      if (onSelectMatchingRide) onSelectMatchingRide(ride);
                    }}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-2 border-[#27a8f5] bg-sky-50/25 shadow-sm ring-2 ring-sky-400/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm">
                          {ride.driverName}
                        </span>
                        <span className="w-3.5 h-3.5 rounded-full bg-sky-500 text-white flex items-center justify-center text-[9px] font-bold">
                          ✓
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm font-extrabold text-slate-900">
                        ₹{ride.price} <span className="text-[10px] font-normal text-slate-500">per seat</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 mt-0.5">
                      ⭐ {ride.driverRating} · {ride.vehicleModel}
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100/80 text-[11px]">
                      <div className="flex items-center gap-2 text-slate-600 font-medium">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#27a8f5]" />
                          {ride.departureTime}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span>{ride.seatsLeft} seat{ride.seatsLeft !== 1 ? "s" : ""} left</span>
                      </div>

                      {ride.isBestMatch ? (
                        <span className="px-2 py-0.5 rounded-full bg-sky-100 text-[#0284c7] font-extrabold text-[10px] border border-sky-200">
                          Best match
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-500">
                          View ride
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-2 my-1">
            <div className="w-10 h-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">No driver offers on this route right now</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Put up a ride request below to notify campus drivers, or check back when a driver offers a ride.
              </p>
            </div>
          </div>
        )}

        {/* Payment Method Selector */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <CreditCard className="w-4 h-4 text-blue-600" />
            <span className="font-semibold">Payment:</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "wallet" | "upi" | "cash")}
              className="bg-slate-100 rounded-lg px-2 py-1 font-semibold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="wallet">HopOn Wallet (₹250)</option>
              <option value="upi">UPI (GPay / PhonePe)</option>
              <option value="cash">Cash to Student</option>
            </select>
          </div>
        </div>

        {/* Request Ride CTA */}
        <button
          type="button"
          disabled={reqStatus === "sending"}
          onClick={() => void handleBookRide()}
          className="w-full py-3.5 px-4 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-sky-500/25 transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          {reqStatus === "sending" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Car className="w-4 h-4" />}
          <span>
            {reqStatus === "sending"
              ? "Sending Request…"
              : activeMatchingRide
              ? `Request Seat · ₹${activeMatchingRide.price}`
              : "Put Up Ride Request"}
          </span>
        </button>
      </div>
    );
  }

  // DEFAULT VIEW: RIDER DASHBOARD MATCHING UI MOCKUP
  return (
    <div className="w-full bg-white rounded-3xl p-5 sm:p-6 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-3.5">
      {/* 1. Header with Badge matching UI mockup */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-bold tracking-wider mb-2">
          <ShieldCheck className="w-3.5 h-3.5 text-[#27a8f5]" />
          <span>RIDER DASHBOARD</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">
          Find your next ride.
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Same campus. Shared journeys.
        </p>
      </div>

      {/* Geolocation requesting spinner */}
      {geoStatus === "requesting" && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 animate-in fade-in">
          <Loader2 className="w-4 h-4 text-slate-600 animate-spin shrink-0" />
          <span>Detecting your campus location…</span>
        </div>
      )}

      {/* Geolocation denied/error message */}
      {(geoStatus === "denied" || geoStatus === "error") && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p>{geoError}</p>
          </div>
          <button
            type="button"
            onClick={() => resetGeo()}
            className="text-rose-400 hover:text-rose-600 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Inputs Container with UI mockup Styling */}
      <div className="space-y-2.5 relative">
        {/* Pickup Input */}
        <div className="relative">
          <div
            className={`rounded-2xl px-3.5 py-2.5 flex items-center gap-3 transition-all border ${
              activeInputFocus === "pickup"
                ? "border-[#27a8f5] ring-2 ring-sky-400/20 bg-white"
                : "border-slate-200 bg-slate-50/80 hover:bg-slate-50"
            }`}
          >
            {/* Target circle bullet */}
            <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-900 flex items-center justify-center shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PICKUP</p>
              <input
                type="text"
                value={pickupText}
                onFocus={() => setActiveInputFocus("pickup")}
                onChange={(e) => {
                  setPickupText(e.target.value);
                  setActiveInputFocus("pickup");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (combinedPickupSuggestions.length > 0) {
                      handleSelectPickup(combinedPickupSuggestions[0]);
                    }
                  }
                }}
                placeholder="Pickup location"
                className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            {/* Current Location GPS button inside pickup field - ALWAYS clickable */}
            <button
              type="button"
              title="Use current location"
              onClick={handleUseMyLocation}
              disabled={geoStatus === "requesting"}
              className="shrink-0 p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors cursor-pointer flex items-center justify-center"
            >
              {geoStatus === "requesting" ? (
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              ) : (
                <LocateFixed className="w-4 h-4 text-blue-600 hover:text-blue-700" />
              )}
            </button>

            {pickupText && (
              <button
                type="button"
                onClick={() => {
                  setPickupText("");
                  onClearPickup();
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Pickup suggestions dropdown */}
          {activeInputFocus === "pickup" && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 py-2 max-h-64 overflow-y-auto animate-in fade-in duration-150">
              <div className="flex items-center justify-between px-3.5 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Campus & Search Results</span>
                {pickupSearch.isSearching && (
                  <span className="flex items-center gap-1 text-blue-600 normal-case font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" /> Searching...
                  </span>
                )}
              </div>
              {combinedPickupSuggestions.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleSelectPickup(loc)}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-blue-50/60 flex items-center gap-3 text-xs text-slate-800 transition-colors cursor-pointer"
                >
                  <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{loc.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{loc.address}</div>
                  </div>
                </button>
              ))}
              {combinedPickupSuggestions.length === 0 && (
                <div className="px-3.5 py-3 text-xs text-slate-400 text-center">
                  {pickupSearch.isSearching ? "Searching locations..." : "No matching places found"}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Campus Precision Chips for instant gate / landmark selection */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 px-0.5 scrollbar-none text-[11px]">
          <span className="text-slate-400 font-semibold shrink-0 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-blue-600" /> Campus:
          </span>
          {CAMPUS_PICKUP_POINTS.map((spot) => (
            <button
              key={spot.id}
              type="button"
              onClick={() => handleSelectPickup(spot)}
              title={spot.address}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors shrink-0 cursor-pointer border ${
                pickup?.id === spot.id
                  ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                  : "bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border-slate-200/80 text-slate-700"
              }`}
            >
              {spot.name}
            </button>
          ))}
        </div>

        {/* Dropoff Input */}
        <div className="relative">
          <div
            className={`rounded-2xl px-3.5 py-2.5 flex items-center gap-3 transition-all border ${
              activeInputFocus === "dropoff"
                ? "border-[#27a8f5] ring-2 ring-sky-400/20 bg-white"
                : "border-slate-200 bg-slate-50/80 hover:bg-slate-50"
            }`}
          >
            {/* Square bullet */}
            <div className="w-3 h-3 rounded-xs bg-slate-900 shrink-0" />

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">DESTINATION</p>
              <input
                type="text"
                value={dropoffText}
                onFocus={() => setActiveInputFocus("dropoff")}
                onChange={(e) => {
                  setDropoffText(e.target.value);
                  setActiveInputFocus("dropoff");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (combinedDropoffSuggestions.length > 0) {
                      handleSelectDropoff(combinedDropoffSuggestions[0]);
                    }
                  }
                }}
                placeholder="Dropoff location"
                className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            {dropoffText && (
              <button
                type="button"
                onClick={() => {
                  setDropoffText("");
                  onClearDropoff();
                }}
                className="text-slate-400 hover:text-slate-700 mr-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Plus button to add stop */}
            <button
              type="button"
              onClick={() => {
                setHasExtraStop(!hasExtraStop);
                showToast("Multi-stop Route", "Added intermediate campus stop.", "info");
              }}
              title="Add a stop"
              className="w-5 h-5 rounded-md bg-slate-200/70 hover:bg-slate-300 flex items-center justify-center text-slate-700 text-xs shrink-0 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Dropoff suggestions dropdown */}
          {activeInputFocus === "dropoff" && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 py-2 max-h-64 overflow-y-auto animate-in fade-in duration-150">
              <div className="flex items-center justify-between px-3.5 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Destinations</span>
                {dropoffSearch.isSearching && (
                  <span className="flex items-center gap-1 text-blue-600 normal-case font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" /> Searching...
                  </span>
                )}
              </div>
              {combinedDropoffSuggestions.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleSelectDropoff(loc)}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-blue-50/60 flex items-center gap-3 text-xs text-slate-800 transition-colors cursor-pointer"
                >
                  <div className="w-2 h-2 rounded-xs bg-indigo-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{loc.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{loc.address}</div>
                  </div>
                </button>
              ))}
              {combinedDropoffSuggestions.length === 0 && (
                <div className="px-3.5 py-3 text-xs text-slate-400 text-center">
                  {dropoffSearch.isSearching ? "Searching locations..." : "No matching places found"}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Optional Extra Stop */}
        {hasExtraStop && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 flex items-center gap-3 animate-in fade-in">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-blue-600 shrink-0" />
            <input
              type="text"
              value={stopText}
              onChange={(e) => setStopText(e.target.value)}
              placeholder="Add campus stop (e.g. Metro Station)"
              className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setHasExtraStop(false)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Scheduling & Seats row matching mockup */}
      <div className="grid grid-cols-2 gap-2 relative mt-1">
        {/* Time dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsScheduleOpen(!isScheduleOpen);
              setIsSeatsOpen(false);
            }}
            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 truncate">
              <Clock className="w-3.5 h-3.5 text-[#27a8f5] shrink-0" />
              <span className="truncate">{scheduledDate}, {scheduledTime}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isScheduleOpen && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-3 space-y-2.5 animate-in fade-in duration-150">
              <div className="text-xs font-bold text-slate-900">Pickup time</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setScheduledDate("Today");
                    setScheduledTime("5:30 PM");
                    setIsScheduleOpen(false);
                  }}
                  className="p-2 rounded-xl text-xs font-semibold border border-sky-300 bg-sky-50 text-sky-700 font-bold"
                >
                  Today, 5:30 PM
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScheduledDate("Today");
                    setScheduledTime("6:00 PM");
                    setIsScheduleOpen(false);
                  }}
                  className="p-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700"
                >
                  Today, 6:00 PM
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Seats dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsSeatsOpen(!isSeatsOpen);
              setIsScheduleOpen(false);
            }}
            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 truncate">
              <UserIcon className="w-3.5 h-3.5 text-[#27a8f5] shrink-0" />
              <span className="truncate">{seatsCount} seat{seatsCount > 1 ? "s" : ""}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isSeatsOpen && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-2 space-y-1 animate-in fade-in duration-150">
              {[1, 2, 3].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    setSeatsCount(num);
                    setIsSeatsOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between ${
                    seatsCount === num ? "bg-sky-50 text-[#0284c7] font-bold" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span>{num} seat{num > 1 ? "s" : ""}</span>
                  {seatsCount === num && <Check className="w-3.5 h-3.5 text-[#27a8f5]" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. Primary Button: Find rides */}
      <button
        type="button"
        onClick={() => handleSearchSubmit()}
        className="w-full py-3 px-4 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-sky-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
      >
        <Search className="w-4 h-4 stroke-[2.5]" />
        <span>Find rides</span>
      </button>

      {/* Security reassurance banner */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 justify-center pt-2 border-t border-slate-100">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>Verified campus members. Safer journeys.</span>
      </div>
    </div>
  );
}
