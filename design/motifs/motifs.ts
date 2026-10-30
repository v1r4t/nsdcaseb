/**
 * One motif per route. The landing page keeps the room dolly; every other page
 * gets a static drawing that says what the page is for.
 *
 * Pure and testable: the router is the only thing that decides a path, and this
 * module is the only thing that decides a drawing.
 */
export type MotifId =
  | "room"
  | "seats"
  | "form"
  | "dossier"
  | "plot-field"
  | "case-sheet"
  | "contact-sheet"
  | "door"
  | "door-ajar";

const AUTH_ROUTES = ["/login", "/register", "/reset-password", "/verify-pending"] as const;

export function motifFor(pathname: string): MotifId {
  if (pathname === "/") return "room";
  if (pathname === "/registrations") return "seats";
  if (pathname.startsWith("/registrations/")) return "form";
  if (pathname === "/recruit") return "dossier";
  if (pathname === "/projects") return "plot-field";
  if (pathname.startsWith("/projects/")) return "case-sheet";
  if (pathname === "/archive") return "contact-sheet";
  if ((AUTH_ROUTES as readonly string[]).includes(pathname)) return "door";
  return "door-ajar";
}
