import { NextRequest, NextResponse } from "next/server";
import { ADMIN_EMAIL, ADMIN_USER_ID, getUserById, revokeUserSessions } from "@/lib/accounts";
import { isAdminUser } from "@/lib/auth";
import { readJsonObject, requireUser } from "@/lib/apiAuth";
import { getDb } from "@/lib/db";
import { cancelRequest, emitRideEvent, getOffer, getRequest } from "@/lib/rideStore";

function requireAdmin(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth;
  if (!isAdminUser(auth.user)) {
    return {
      response: NextResponse.json(
        { error: "Admin privileges required." },
        { status: 403 }
      ),
    };
  }
  return auth;
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if ("response" in auth) return auth.response;

  const db = getDb();

  const userRows = db
    .prepare(
      `SELECT
        id, name, email, university, student_id_verified, student_roll_number,
        wallet_balance, rating, rides_completed, role,
        vehicle_model, vehicle_number, vehicle_type, upi_id, upi_qr_image, created_at
       FROM users
       ORDER BY created_at DESC`
    )
    .all() as Array<{
    id: string;
    name: string;
    email: string;
    university: string;
    student_id_verified: number;
    student_roll_number: string | null;
    wallet_balance: number;
    rating: number;
    rides_completed: number;
    role: "passenger" | "driver" | "both";
    vehicle_model: string | null;
    vehicle_number: string | null;
    vehicle_type: string | null;
    upi_id: string | null;
    upi_qr_image: string | null;
    created_at: number;
  }>;

  const users = userRows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    university: u.university,
    studentIdVerified: Boolean(u.student_id_verified),
    studentRollNumber: u.student_roll_number,
    walletBalance: u.wallet_balance,
    rating: Math.round((u.rating || 5) * 100) / 100,
    ridesCompleted: u.rides_completed || 0,
    role: u.role,
    vehicleModel: u.vehicle_model,
    vehicleNumber: u.vehicle_number,
    vehicleType: u.vehicle_type,
    upiId: u.upi_id,
    hasQrImage: Boolean(u.upi_qr_image),
    isAdmin: u.email.trim().toLowerCase() === ADMIN_EMAIL,
    createdAt: u.created_at,
  }));

  const offers = db
    .prepare(
      `SELECT
        id, driver_id as driverId, driver_name as driverName,
        driver_university as driverUniversity, driver_rating as driverRating,
        vehicle_model as vehicleModel, vehicle_number as vehicleNumber,
        vehicle_type as vehicleType, origin, destination,
        departure_time as departureTime, departure_date as departureDate,
        seats, seats_left as seatsLeft, fare_per_seat as farePerSeat,
        status, created_at as createdAt
       FROM ride_offers
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .all() as Array<{
    id: string;
    driverId: string;
    driverName: string;
    driverUniversity: string;
    driverRating: number;
    vehicleModel: string;
    vehicleNumber: string;
    vehicleType: string;
    origin: string;
    destination: string;
    departureTime: string;
    departureDate: string;
    seats: number;
    seatsLeft: number;
    farePerSeat: string;
    status: string;
    createdAt: number;
  }>;

  const requests = db
    .prepare(
      `SELECT
        id, offer_id as offerId, passenger_id as passengerId,
        passenger_name as passengerName, passenger_rating as passengerRating,
        pickup, dropoff, status, agreed_fare as agreedFare,
        trip_stage as tripStage, payment_method as paymentMethod,
        payment_status as paymentStatus, created_at as createdAt,
        completed_at as completedAt
       FROM ride_requests
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .all() as Array<{
    id: string;
    offerId: string | null;
    passengerId: string;
    passengerName: string;
    passengerRating: number;
    pickup: string;
    dropoff: string;
    status: string;
    agreedFare: string | null;
    tripStage: string | null;
    paymentMethod: string;
    paymentStatus: string;
    createdAt: number;
    completedAt: number | null;
  }>;

  const trips = db
    .prepare(
      `SELECT
        id, request_id as requestId, offer_id as offerId,
        passenger_id as passengerId, passenger_name as passengerName,
        driver_id as driverId, driver_name as driverName,
        vehicle, origin, destination, amount, status, created_at as createdAt
       FROM trip_history
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .all();

  const ratingsRaw = db
    .prepare(
      `SELECT
        r.id, r.request_id as requestId, r.rater_id as raterId,
        u1.name as raterName, r.target_user_id as targetUserId,
        u2.name as targetName, r.stars, r.tags, r.comment, r.created_at as createdAt
       FROM ride_ratings r
       LEFT JOIN users u1 ON u1.id = r.rater_id
       LEFT JOIN users u2 ON u2.id = r.target_user_id
       ORDER BY r.created_at DESC
       LIMIT 100`
    )
    .all() as Array<{
    id: string;
    requestId: string;
    raterId: string;
    raterName: string | null;
    targetUserId: string;
    targetName: string | null;
    stars: number;
    tags: string;
    comment: string | null;
    createdAt: number;
  }>;

  const ratings = ratingsRaw.map((r) => {
    let parsedTags: string[] = [];
    try {
      const arr = JSON.parse(r.tags);
      if (Array.isArray(arr)) parsedTags = arr;
    } catch {
      parsedTags = [];
    }
    return {
      ...r,
      raterName: r.raterName || r.raterId,
      targetName: r.targetName || r.targetUserId,
      tags: parsedTags,
    };
  });

  const nonAdminUsers = users.filter((u) => !u.isAdmin);
  const verifiedUsers = nonAdminUsers.filter((u) => u.studentIdVerified).length;
  const pendingVerificationUsers = nonAdminUsers.length - verifiedUsers;
  const driversCount = nonAdminUsers.filter((u) => u.role === "driver" || u.role === "both").length;
  const passengersCount = nonAdminUsers.filter((u) => u.role === "passenger").length;
  const activeOffersCount = offers.filter((o) => o.status === "active").length;
  const pendingRequestsCount = requests.filter((r) => r.status === "pending").length;
  const acceptedRequestsCount = requests.filter((r) => r.status === "accepted").length;
  const completedRidesCount = requests.filter((r) => r.status === "completed").length;
  const cancelledRidesCount = requests.filter((r) => r.status === "cancelled").length;

  const avgRating =
    nonAdminUsers.length > 0
      ? Math.round(
          (nonAdminUsers.reduce((acc, u) => acc + (u.rating || 5), 0) / nonAdminUsers.length) * 100
        ) / 100
      : 5.0;

  return NextResponse.json({
    stats: {
      totalUsers: nonAdminUsers.length,
      verifiedUsers,
      pendingVerificationUsers,
      driversCount,
      passengersCount,
      activeOffersCount,
      totalOffersCount: offers.length,
      pendingRequestsCount,
      acceptedRequestsCount,
      completedRidesCount,
      cancelledRidesCount,
      totalRatingsCount: ratings.length,
      averagePlatformRating: avgRating,
    },
    users,
    offers,
    requests,
    trips,
    ratings,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(req);
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Provide a valid admin action." }, { status: 400 });
  }

  const db = getDb();
  const action = body.action;

  if (action === "verify_user" || action === "unverify_user") {
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }
    const target = getUserById(userId);
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (target.email.toLowerCase() === ADMIN_EMAIL || userId === ADMIN_USER_ID) {
      return NextResponse.json({ error: "Cannot modify admin verification." }, { status: 400 });
    }
    const verifiedVal = action === "verify_user" ? 1 : 0;
    db.prepare("UPDATE users SET student_id_verified = ? WHERE id = ?").run(verifiedVal, userId);
    return NextResponse.json({ success: true, user: getUserById(userId) });
  }

  if (action === "delete_user") {
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }
    if (userId === ADMIN_USER_ID || userId === auth.user.id) {
      return NextResponse.json({ error: "Cannot delete the admin account." }, { status: 400 });
    }
    revokeUserSessions(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    return NextResponse.json({ success: true });
  }

  if (action === "cancel_offer") {
    const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
    if (!offerId) {
      return NextResponse.json({ error: "offerId is required." }, { status: 400 });
    }
    const memOffer = getOffer(offerId);
    if (memOffer) {
      memOffer.status = "cancelled";
    }
    db.prepare("UPDATE ride_offers SET status = 'cancelled' WHERE id = ?").run(offerId);
    emitRideEvent("offer");
    return NextResponse.json({ success: true });
  }

  if (action === "cancel_request") {
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) {
      return NextResponse.json({ error: "requestId is required." }, { status: 400 });
    }
    const memReq = getRequest(requestId);
    if (memReq && (memReq.status === "pending" || memReq.status === "accepted")) {
      cancelRequest(requestId, memReq.passengerId);
    } else {
      db.prepare("UPDATE ride_requests SET status = 'cancelled' WHERE id = ?").run(requestId);
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown admin action." }, { status: 400 });
}
