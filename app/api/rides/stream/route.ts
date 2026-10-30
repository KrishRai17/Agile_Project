import { NextRequest } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import {
  getDriverLocation,
  getOffer,
  listActiveOffers,
  listRequestsForDriver,
  listRequestsForPassenger,
  subscribeRideEvents,
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

  const buildSnapshot = () => {
    if (user.role === "driver") {
      const requests = listRequestsForDriver(user.id).map((r) => ({
        ...r,
        offer: r.offerId ? getOffer(r.offerId) : undefined,
      }));
      const offers = listActiveOffers().filter((o) => o.driverId === user.id);
      const activeAccepted = requests.find((r) => r.status === "accepted");
      const counterpartyLocation = activeAccepted
        ? getDriverLocation(activeAccepted.passengerId) ?? null
        : null;
      return {
        role: "driver",
        requests,
        offers,
        counterpartyLocation,
        timestamp: Date.now(),
      };
    } else {
      const requests = listRequestsForPassenger(user.id).map((r) => ({
        ...r,
        offer: r.offerId ? getOffer(r.offerId) : undefined,
      }));
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

  const stream = new ReadableStream({
    start(controller) {
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
        sendEvent("update", {
          event: evt,
          ...buildSnapshot(),
        });
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

