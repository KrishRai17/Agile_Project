"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  User as UserIcon,
  Plus,
  X,
  ChevronDown,
  Check,
  Search,
  ArrowLeft,
  Users,
  CreditCard,
  ShieldCheck,
  Navigation,
  Car,
  LocateFixed,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  BENGALURU_LOCATIONS,
  LocationItem,
  RideOption,
  calculateRideOptions,
  PAST_ACTIVITIES,
} from "@/lib/mapData";
import { useToast } from "@/components/ToastContext";
import { useGeolocation } from "@/lib/useGeolocation";
import { useNominatimSearch } from "@/lib/useNominatimSearch";

interface GetRidePanelProps {
  activeTab: "find" | "offer" | "my-rides";
  pickup: LocationItem | null;
  dropoff: LocationItem | null;
  onSetPickup: (loc: LocationItem) => void;
  onSetDropoff: (loc: LocationItem) => void;
  onClearDropoff: () => void;
  onClearPickup: () => void;
}

export default function GetRidePanel({
  activeTab,
  pickup,
  dropoff,
  onSetPickup,
  onSetDropoff,
  onClearDropoff,
  onClearPickup,
}: GetRidePanelProps) {
  const { showToast } = useToast();
  const { status: geoStatus, location: geoLocation, error: geoError, requestLocation } = useGeolocation();
  const pickupSearch = useNominatimSearch();
  const dropoffSearch = useNominatimSearch();

  // Permission banner — show until user responds
  const [locationBannerDismissed, setLocationBannerDismissed] = useState(false);

  // Search input state
  const [pickupText, setPickupText] = useState(pickup ? pickup.name : "Kristu Jayanti University");
  const [dropoffText, setDropoffText] = useState(dropoff ? dropoff.name : "");
  const [activeInputFocus, setActiveInputFocus] = useState<"pickup" | "dropoff" | null>(null);

  // Sync pickup/dropoff input text with parent prop (e.g. map pin click or geolocation)
  useEffect(() => {
    if (pickup) setPickupText(pickup.name);
  }, [pickup]);

  useEffect(() => {
    if (dropoff) setDropoffText(dropoff.name);
    else setDropoffText("");
  }, [dropoff]);

  // Stop addition
  const [hasExtraStop, setHasExtraStop] = useState(false);
  const [stopText, setStopText] = useState("");

  // Schedule modal / toggle
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [scheduledTime, setScheduledTime] = useState("5:30 PM");
  const [scheduledDate, setScheduledDate] = useState("Today");

  // Rider toggle ("For me" vs "For someone else")
  const [isRiderOpen, setIsRiderOpen] = useState(false);
  const [riderMode, setRiderMode] = useState<"me" | "someone">("me");
  const [guestName, setGuestName] = useState("");

  // Post search state: whether available rides are showing
  const [isSearchingRides, setIsSearchingRides] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState<string>("hopon-bike");
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "upi" | "cash">("wallet");
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  // Offer Ride state
  const [offerOrigin, setOfferOrigin] = useState("Kristu Jayanti University");
  const [offerDest, setOfferDest] = useState("Manyata Tech Park");
  const [offerSeats, setOfferSeats] = useState(3);
  const [offerPrice, setOfferPrice] = useState("₹50");

  // Handle "Use my location" button click
  const handleUseMyLocation = async () => {
    showToast("Detecting Location", "Requesting GPS coordinates...", "info");
    const loc = await requestLocation();
    if (loc) {
      const locationItem: LocationItem = {
        id: `geo_${Date.now()}`,
        name: loc.shortName,
        address: loc.displayName,
        lat: loc.lat,
        lng: loc.lng,
        category: "landmark",
      };
      setPickupText(loc.shortName);
      onSetPickup(locationItem);
      setActiveInputFocus(null);
      setLocationBannerDismissed(true);
      showToast("Location detected", `Pickup set to: ${loc.shortName}`, "success");
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

  // Real-time sync: when user types pickup, update map with local match or search
  useEffect(() => {
    if (!pickupText || pickupText.trim().length < 2) return;

    pickupSearch.search(pickupText);

    const localMatch = BENGALURU_LOCATIONS.find(
      (l) =>
        l.name.toLowerCase().includes(pickupText.toLowerCase()) ||
        l.address.toLowerCase().includes(pickupText.toLowerCase())
    );

    if (localMatch && (!pickup || pickup.name !== localMatch.name)) {
      onSetPickup(localMatch);
    }
  }, [pickupText]);

  // When Nominatim returns results for typed pickup and no local match was found
  useEffect(() => {
    if (!pickupText || pickupText.trim().length < 3) return;
    const localMatch = BENGALURU_LOCATIONS.find(
      (l) =>
        l.name.toLowerCase().includes(pickupText.toLowerCase()) ||
        l.address.toLowerCase().includes(pickupText.toLowerCase())
    );
    if (!localMatch && pickupSearch.results.length > 0) {
      const top = pickupSearch.results[0];
      if (!pickup || pickup.name !== top.name) {
        onSetPickup(top);
      }
    }
  }, [pickupSearch.results]);

  // Real-time sync for dropoff
  useEffect(() => {
    if (!dropoffText || dropoffText.trim().length < 2) return;

    dropoffSearch.search(dropoffText);

    const localMatch = BENGALURU_LOCATIONS.find(
      (l) =>
        l.name.toLowerCase().includes(dropoffText.toLowerCase()) ||
        l.address.toLowerCase().includes(dropoffText.toLowerCase())
    );

    if (localMatch && (!dropoff || dropoff.name !== localMatch.name)) {
      onSetDropoff(localMatch);
    }
  }, [dropoffText]);

  useEffect(() => {
    if (!dropoffText || dropoffText.trim().length < 3) return;
    const localMatch = BENGALURU_LOCATIONS.find(
      (l) =>
        l.name.toLowerCase().includes(dropoffText.toLowerCase()) ||
        l.address.toLowerCase().includes(dropoffText.toLowerCase())
    );
    if (!localMatch && dropoffSearch.results.length > 0) {
      const top = dropoffSearch.results[0];
      if (!dropoff || dropoff.name !== top.name) {
        onSetDropoff(top);
      }
    }
  }, [dropoffSearch.results]);

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

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!pickup) {
      const defaultPickup = BENGALURU_LOCATIONS.find((l) => l.name === "Kristu Jayanti University") || BENGALURU_LOCATIONS[1];
      onSetPickup(defaultPickup);
    }

    if (!dropoff && !dropoffText) {
      const defaultDropoff = BENGALURU_LOCATIONS.find((l) => l.name === "Manyata Tech Park") || BENGALURU_LOCATIONS[4];
      setDropoffText(defaultDropoff.name);
      onSetDropoff(defaultDropoff);
    }

    setIsSearchingRides(true);
    showToast("Finding Rides", "Locating available campus drivers...", "info");
  };

  const handleBookRide = (ride: RideOption) => {
    setBookingConfirmed(true);
    showToast(
      "Ride Confirmed!",
      `Your ${ride.name} driver is en route. Verified student driver.`,
      "success"
    );
  };

  const handleOfferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    showToast(
      "Ride Offered!",
      `Route from ${offerOrigin} to ${offerDest} published for students.`,
      "success"
    );
  };

  const rideOptions = calculateRideOptions(8.5);
  const selectedRide = rideOptions.find((r) => r.id === selectedRideId) || rideOptions[0];

  // OFFER RIDE VIEW
  if (activeTab === "offer") {
    return (
      <div className="w-full bg-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-[11px] font-semibold mb-2">
            <ShieldCheck className="w-3 h-3 text-blue-600" />
            <span>Offer Seats & Earn</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">
            Offer a Ride
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Share empty seats with students heading in your direction.
          </p>
        </div>

        <form onSubmit={handleOfferSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Starting From
            </label>
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus-within:bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-400/20 shrink-0" />
              <input
                type="text"
                value={offerOrigin}
                onChange={(e) => setOfferOrigin(e.target.value)}
                className="w-full bg-transparent text-sm font-medium text-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Going To
            </label>
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus-within:bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20">
              <div className="w-2.5 h-2.5 rounded-md bg-indigo-600 ring-4 ring-indigo-400/20 shrink-0" />
              <input
                type="text"
                value={offerDest}
                onChange={(e) => setOfferDest(e.target.value)}
                className="w-full bg-transparent text-sm font-medium text-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Seats
              </label>
              <select
                value={offerSeats}
                onChange={(e) => setOfferSeats(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
              >
                <option value={1}>1 Seat</option>
                <option value={2}>2 Seats</option>
                <option value={3}>3 Seats</option>
                <option value={4}>4 Seats</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Fare / Seat
              </label>
              <input
                type="text"
                value={offerPrice}
                onChange={(e) => setOfferPrice(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/35 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Car className="w-4 h-4" />
            <span>Publish Student Ride</span>
          </button>
        </form>
      </div>
    );
  }

  // MY RIDES VIEW
  if (activeTab === "my-rides") {
    return (
      <div className="w-full bg-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">
            My Campus Rides
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track active rides and view past ride receipts.
          </p>
        </div>

        <div className="space-y-3 max-h-[380px] overflow-y-auto">
          {PAST_ACTIVITIES.map((trip) => (
            <div
              key={trip.id}
              className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-blue-200 transition-all flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">{trip.vehicle}</span>
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
      return (
        <div className="w-full bg-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-5 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/25">
              ✓
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 font-heading">Ride Confirmed!</h2>
              <p className="text-xs text-slate-500">Student driver is heading to your pickup</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-base font-bold text-slate-900">{selectedRide.name}</span>
                <p className="text-xs text-slate-500">
                  {selectedRide.iconType === "bike"
                    ? "Hero Splendor Plus · Arjun Sharma"
                    : selectedRide.iconType === "scooty"
                    ? "Honda Activa 6G · Priya Nair"
                    : "White Swift Dzire · Rohan Verma"}
                </p>
              </div>
              <div className="px-2.5 py-1 bg-white rounded-lg border border-slate-200 text-xs font-extrabold text-blue-700 tracking-wider shadow-xs">
                {selectedRide.iconType === "bike"
                  ? "KA 04 MP 8812"
                  : selectedRide.iconType === "scooty"
                  ? "KA 05 EM 1092"
                  : "KA 01 MJ 4210"}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
              <span className="text-slate-600">ETA:</span>
              <span className="font-bold text-blue-600">3 minutes away</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Standard Fare:</span>
              <span className="font-bold text-slate-900 text-sm">₹{selectedRide.price}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setBookingConfirmed(false);
                setIsSearchingRides(false);
              }}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-center text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => showToast("Driver Contact", "Calling driver at +91 98450 XXXXX...", "info")}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs shadow-md shadow-blue-500/25 transition-all cursor-pointer"
            >
              Contact Driver
            </button>
          </div>
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
          <span className="text-xs text-slate-500 font-medium">8.5 km · ~22 mins</span>
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

        {/* Available Ride Options list */}
        <div className="space-y-2 mt-1">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Available Campus Rides
          </div>
          {rideOptions.map((ride) => {
            const isSelected = selectedRideId === ride.id;
            return (
              <div
                key={ride.id}
                onClick={() => setSelectedRideId(ride.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/20 shadow-xs"
                    : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-lg font-bold shadow-xs">
                    {ride.iconType === "bike" ? "🏍️" : ride.iconType === "scooty" ? "🛵" : "🚗"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{ride.name}</span>
                      <span className="text-xs text-slate-500 flex items-center gap-0.5">
                        <Users className="w-3 h-3" /> {ride.capacity}
                      </span>
                      {ride.badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded">
                          {ride.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{ride.etaMinutes} mins away · {ride.description}</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-base font-extrabold text-slate-900">
                    ₹{ride.price}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Payment Method Selector */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <CreditCard className="w-4 h-4 text-blue-600" />
            <span className="font-semibold">Payment:</span>
            <select
              value={paymentMethod}
              onChange={(e: any) => setPaymentMethod(e.target.value)}
              className="bg-slate-100 rounded-lg px-2 py-1 font-semibold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="wallet">HopOn Wallet (₹150)</option>
              <option value="upi">UPI (GPay / PhonePe)</option>
              <option value="cash">Cash to Student</option>
            </select>
          </div>
        </div>

        {/* Confirm Book Button with Login Theme Gradient */}
        <button
          type="button"
          onClick={() => handleBookRide(selectedRide)}
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/35 active:scale-[0.99] transition-all cursor-pointer mt-1"
        >
          Request {selectedRide.name} · ₹{selectedRide.price}
        </button>
      </div>
    );
  }

  // DEFAULT VIEW: MATCHES LOGIN THEME, NO DISCOUNT BANNER, NO RENTALS
  return (
    <div className="w-full bg-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-slate-200/50 border border-slate-200/80 flex flex-col gap-4">
      {/* 1. Header with Login Page Badge */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-semibold mb-2">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
          <span>Verified Student Community</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">
          Get a ride
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Campus pickup and trusted university carpools
        </p>
      </div>

      {/* Location Permission Banner — shown until user responds or dismisses */}
      {!locationBannerDismissed && geoStatus === "idle" && (
        <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-blue-50 border border-blue-200/80 animate-in fade-in duration-200">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/25">
            <LocateFixed className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-blue-900">Use your current location?</p>
            <p className="text-[11px] text-blue-700 mt-0.5 leading-snug">
              HopOn can auto-fill your pickup using your device GPS for faster booking.
            </p>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={handleUseMyLocation}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-sm transition-colors cursor-pointer"
              >
                Allow Location
              </button>
              <button
                type="button"
                onClick={() => setLocationBannerDismissed(true)}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200 transition-colors cursor-pointer"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLocationBannerDismissed(true)}
            className="text-blue-400 hover:text-blue-600 p-0.5 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Geolocation requesting spinner */}
      {geoStatus === "requesting" && (
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-blue-50 border border-blue-200/80 animate-in fade-in duration-200">
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
          <p className="text-xs font-semibold text-blue-800">
            Detecting your location... <span className="font-normal text-blue-600">Please allow access in the browser prompt.</span>
          </p>
        </div>
      )}

      {/* Geolocation denied/error message */}
      {(geoStatus === "denied" || geoStatus === "error" || geoStatus === "unavailable") && (
        <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-rose-800">{geoError}</p>
            {geoStatus === "denied" && (
              <p className="text-[11px] text-rose-600 mt-0.5">
                Enable location in your browser → Site Settings → Location → Allow.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setLocationBannerDismissed(true)}
            className="text-rose-400 hover:text-rose-600 p-0.5 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Granted success pill */}
      {geoStatus === "granted" && geoLocation && (
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs font-semibold animate-in fade-in duration-200">
          <LocateFixed className="w-3.5 h-3.5 text-emerald-600" />
          <span>Location detected · Pickup set automatically</span>
        </div>
      )}

      {/* 2. Inputs Container with Login Form Styling */}
      <div className="space-y-2.5 relative">
        {/* Pickup Input */}
        <div className="relative">
          <div
            className={`rounded-xl px-3.5 py-3 flex items-center gap-3 transition-all border ${
              activeInputFocus === "pickup"
                ? "border-blue-600 ring-2 ring-blue-600/20 bg-white"
                : "border-slate-200 bg-slate-50/80 hover:bg-slate-50"
            }`}
          >
            {/* Blue circle bullet icon matching login page route card */}
            <div className="w-3 h-3 rounded-full bg-blue-600 ring-4 ring-blue-400/20 shrink-0" />

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
              className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />

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
                className="text-slate-400 hover:text-slate-700"
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

        {/* Dropoff Input */}
        <div className="relative">
          <div
            className={`rounded-xl px-3.5 py-3 flex items-center gap-3 transition-all border ${
              activeInputFocus === "dropoff"
                ? "border-blue-600 ring-2 ring-blue-600/20 bg-white"
                : "border-slate-200 bg-slate-50/80 hover:bg-slate-50"
            }`}
          >
            {/* Indigo square bullet icon matching login page route card */}
            <div className="w-3 h-3 rounded-md bg-indigo-600 ring-4 ring-indigo-400/20 shrink-0" />

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
              className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />

            {dropoffText && (
              <button
                type="button"
                onClick={() => {
                  setDropoffText("");
                  onClearDropoff();
                }}
                className="text-slate-400 hover:text-slate-700 mr-1"
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
              className="w-6 h-6 rounded-full bg-slate-200 hover:bg-blue-100 hover:text-blue-700 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
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

      {/* 3. Options: "Pickup now" & "For me" */}
      <div className="space-y-2">
        {/* Pickup now pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsScheduleOpen(!isScheduleOpen);
              setIsRiderOpen(false);
            }}
            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>
                {scheduleType === "now" ? "Pickup now" : `${scheduledDate}, ${scheduledTime}`}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </button>

          {/* Schedule Popover */}
          {isScheduleOpen && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-4 space-y-3 animate-in fade-in duration-150">
              <div className="text-xs font-bold text-slate-900">Schedule pickup time</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setScheduleType("now");
                    setIsScheduleOpen(false);
                  }}
                  className={`p-2.5 rounded-xl text-xs font-semibold border ${
                    scheduleType === "now" ? "border-blue-600 bg-blue-50 text-blue-700 font-bold" : "border-slate-200"
                  }`}
                >
                  Pickup now
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleType("later")}
                  className={`p-2.5 rounded-xl text-xs font-semibold border ${
                    scheduleType === "later" ? "border-blue-600 bg-blue-50 text-blue-700 font-bold" : "border-slate-200"
                  }`}
                >
                  Schedule later
                </button>
              </div>

              {scheduleType === "later" && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex gap-2">
                    <select
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-1/2 p-2 bg-slate-100 rounded-lg text-xs font-medium focus:outline-none"
                    >
                      <option value="Today">Today</option>
                      <option value="Tomorrow">Tomorrow</option>
                      <option value="Friday">This Friday</option>
                    </select>
                    <select
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-1/2 p-2 bg-slate-100 rounded-lg text-xs font-medium focus:outline-none"
                    >
                      <option value="5:30 PM">5:30 PM (Evening)</option>
                      <option value="6:00 PM">6:00 PM</option>
                      <option value="7:15 PM">7:15 PM</option>
                      <option value="8:30 PM">8:30 PM</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsScheduleOpen(false)}
                    className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm"
                  >
                    Set Schedule
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* For me pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsRiderOpen(!isRiderOpen);
              setIsScheduleOpen(false);
            }}
            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <UserIcon className="w-4 h-4 text-blue-600" />
              <span>{riderMode === "me" ? "For me" : `For: ${guestName || "Friend"}`}</span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </button>

          {/* Rider Selector Popover */}
          {isRiderOpen && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-4 space-y-3 animate-in fade-in duration-150">
              <div className="text-xs font-bold text-slate-900">Who is riding?</div>
              <button
                type="button"
                onClick={() => {
                  setRiderMode("me");
                  setIsRiderOpen(false);
                }}
                className={`w-full p-2.5 rounded-xl text-xs font-semibold text-left border flex items-center justify-between ${
                  riderMode === "me" ? "border-blue-600 bg-blue-50 text-blue-700 font-bold" : "border-slate-200"
                }`}
              >
                <span>For me (Krish Rai)</span>
                {riderMode === "me" && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </button>

              <button
                type="button"
                onClick={() => setRiderMode("someone")}
                className={`w-full p-2.5 rounded-xl text-xs font-semibold text-left border flex items-center justify-between ${
                  riderMode === "someone" ? "border-blue-600 bg-blue-50 text-blue-700 font-bold" : "border-slate-200"
                }`}
              >
                <span>Order for classmate / peer</span>
                {riderMode === "someone" && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </button>

              {riderMode === "someone" && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Enter student name"
                    className="w-full p-2 bg-slate-100 rounded-lg text-xs font-medium focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setIsRiderOpen(false)}
                    className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm"
                  >
                    Confirm Rider
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Search Button with Login Page Gradient Theme */}
      <button
        type="button"
        onClick={() => handleSearchSubmit()}
        className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/35 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
      >
        <Search className="w-4 h-4" />
        <span>Search Rides</span>
      </button>
    </div>
  );
}
