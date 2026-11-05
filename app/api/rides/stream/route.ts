import { NextRequest } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import {
  getDriverLocation,
  getOffer,
  listActiveOffers,
  listRequestsForDriver,
  listRequestsForPassenger,
  subscribeRideEvents,
  toDriverView,
} from "@/lib/rideStore";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/stream — Server-Sent Events (SSE) stream pushing instant real-time updates
 * for ride offers, ride requests, OTP/stage changes, counterparty live GPS coordinates, and chat messages.
 */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const isDriver =
    user.role === "driver" ||
    user.role === "both" ||
    Boolean(user.vehicleModel || user.vehicleNumber);

  const buildSnapshot = () => {
    if (isDriver) {
      const rawRequests = listRequestsForDriver(user.id);
      const activeAccepted = rawRequests.find((r) => r.status === "accepted");
      const counterpartyLocation = activeAccepted
        ? getDriverLocation(activeAccepted.passengerId) ?? null
        : null;
      const requests = rawRequests.map((r) => toDriverView(r));
      const offers = listActiveOffers().filter((o) => o.driverId === user.id);
      return {
        role: "driver",
        requests,
        offers,
        counterpartyLocation,
        timestamp: Date.now(),
      };
    } else {
      const requests = listRequestsForPassenger(user.id).map((r) => {
        // Strip internal declinedBy driver IDs from passenger view
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { declinedBy, ...cleanReq } = r;
        return {
          ...cleanReq,
          offer: r.offerId ? getOffer(r.offerId) : undefined,
        };
      });
      const activeAccepted = requests.find((r) => r.status === "accepted");
      const driverId = activeAccepted?.offer?.driverId;
      const counterpartyLocation = driverId ? getDriverLocation(driverId) ?? null : null;
      return {
        role: "passenger",
        requests,
        counterpartyLocation,
        timestamp: Date.now(),
      };
    }
  };

  const isSubscriberAffected = (evt: {
    type: "offer" | "request" | "location" | "message";
    requestId?: string;
    userId?: string;
    timestamp: number;
  }): boolean => {
    if (evt.userId === user.id) return true;
    const myRequests =
      isDriver ? listRequestsForDriver(user.id) : listRequestsForPassenger(user.id);
    if (evt.requestId) {
      return myRequests.some((r) => r.id === evt.requestId);
    }
    if (evt.type === "location" && evt.userId) {
      return myRequests.some((r) => {
        if (r.status !== "accepted") return false;
        const offerDriverId = r.offerId ? getOffer(r.offerId)?.driverId : undefined;
        return r.passengerId === evt.userId || offerDriverId === evt.userId;
      });
    }
    if (evt.type === "offer") {
      // Broadcast to both drivers and passengers so real-time available rides update immediately
      return true;
    }
    return false;
  };

  const stream = new ReadableStream({
    start(controller) {
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let latestEvt: {
        type: "offer" | "request" | "location" | "message";
        requestId?: string;
        userId?: string;
        timestamp: number;
      } | null = null;

      const sendEvent = (eventName: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream closed
        }
      };

      // Send initial snapshot immediately upon connection
      sendEvent("snapshot", buildSnapshot());

      const unsubscribe = subscribeRideEvents((evt) => {
        if (!isSubscriberAffected(evt)) return;
        latestEvt = evt;
        if (debounceTimer) return;
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          if (!latestEvt) return;
          sendEvent("update", {
            event: latestEvt,
            ...buildSnapshot(),
          });
        }, 100);
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          // Stream closed
        }
      }, 15000);

      cleanup = () => {
        unsubscribe();
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        clearInterval(heartbeat);
      };

      req.signal.addEventListener("abort", () => {
        if (cleanup) cleanup();
      });
    },
    cancel() {
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

