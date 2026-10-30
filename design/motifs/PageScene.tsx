import { motifFor, type MotifId } from "./motifs";
import { SeatChart, ContactSheet } from "./DataMotifs";
import { FormSheet, Dossier } from "./PaperMotifs";
import { PlotField, CaseSheet } from "./PlotMotifs";
import { Door } from "./DoorMotif";

/**
 * The static sheet behind every route except the landing page.
 *
 * One <svg> frame owns the viewBox and cropping so every motif sits in the same
 * space; each motif draws children only. The frame paints the paper ground
 * because the room canvas is not mounted on these routes.
 */
export function PageScene({ motif }: { motif: MotifId }) {
  return (
    <div
      aria-hidden="true"
      data-testid="page-scene"
      data-motif={motif}
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-paper"
    >
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        focusable="false"
      >
        {contentFor(motif)}
      </svg>
    </div>
  );
}

function contentFor(motif: MotifId) {
  switch (motif) {
    case "seats":
      return <SeatChart />;
    case "form":
      return <FormSheet />;
    case "dossier":
      return <Dossier />;
    case "plot-field":
      return <PlotField />;
    case "case-sheet":
      return <CaseSheet />;
    case "contact-sheet":
      return <ContactSheet />;
    case "door":
      return <Door />;
    case "door-ajar":
      return <Door open />;
    case "room":
      // The room is a canvas, mounted separately on the landing route.
      return null;
  }
}

export { motifFor };
