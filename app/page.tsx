import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { getUserById } from "@/lib/accounts";

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);
  const user = payload ? getUserById(payload.uid) : null;

  redirect(user ? "/home" : "/login");
}
