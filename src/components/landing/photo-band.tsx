import Image from "next/image";
import { cn } from "@/lib/utils";

/*
 * The landing's photo bands (multi-platform, automations) are drawn as one
 * fixed 1440px-wide design: a photo with phone screens, labels and cards set
 * on it at exact spots. That design is the "plate", and it is scaled as a
 * whole, so the screens always sit on the devices in the photo.
 *
 * Inside a plate, 1em is one design pixel: every size in plate content is
 * written in em (`left-[820em]`, `text-[12em]`). Set a font size only on the
 * element that holds the text, never on a box that also has em sizes.
 *
 * - From xl (1280px) the plate fills the band behind the copy, pinned to the
 *   right edge, and grows with the screen past 1440px.
 * - Below xl the copy comes first, then a photo of the same scene composed
 *   for that screen shape (a portrait one on phones, a landscape one on
 *   tablets), full width. Its plain wood top tucks under the copy and fades
 *   into the band colour, and its screens are drawn on the same way, in the
 *   photo's own pixels (see SmallPlate).
 */

/** The band colour below xl: the photos' terracotta under the same shade. */
export const BAND_BASE = "#582c1b";

/** A photo of the band's scene for one screen shape, with its screens. */
export interface SmallPlate {
  src: string;
  /** Pixel size of the photo. */
  w: number;
  h: number;
  /** Share of the height at the top that is plain wood (sits under the copy). */
  plainTop: number;
  /** Share of the height at the bottom that is plain wood (`after` sits on it). */
  plainBottom?: number;
  /** Screens, positioned and sized in the photo's pixels (em). */
  screens: React.ReactNode;
  /** Chips and cards in screen px, positioned in % of the photo. */
  labels?: React.ReactNode;
}

/** One design pixel at xl and up: 1px up to a 1440px-wide screen, then more. */
const UNIT = "calc(max(1440px, 100vw) / 1440)";

function Plate({
  photo,
  height,
  children,
}: {
  photo: string;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative" style={{ width: "1440em", height: `${height}em` }}>
      <Image
        src={photo}
        alt=""
        fill
        unoptimized
        loading="lazy"
        className="pointer-events-none object-cover select-none"
      />
      {/* The photo's shade: dark under the copy, light over the devices. */}
      <div className="absolute inset-0 bg-linear-to-r from-[rgb(18_13_26/0.9)] via-[rgb(18_13_26/0.55)] to-[rgb(18_13_26/0.25)]" />
      {children}
    </div>
  );
}

export function PhotoBand({
  id,
  photo,
  height,
  copyTop,
  plate,
  mobile,
  tablet,
  after,
  children,
  className,
}: {
  id?: string;
  /** The band's photo, 1440 wide. */
  photo: string;
  /** Design height of the band, in px at 1440. */
  height: number;
  /** Where the copy starts on wide screens, in design px. */
  copyTop: number;
  /** The scene recomposed for phones (below md) and tablets (md to xl). */
  mobile: SmallPlate;
  tablet: SmallPlate;
  /** Phones: what follows the photo (it sits on the photo's plain foot). */
  after?: React.ReactNode;
  /** Screens, labels and cards on the photo, in design px (em). */
  plate: React.ReactNode;
  /** The copy. */
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative isolate scroll-mt-4 overflow-hidden text-white xl:h-[calc(var(--u)*var(--band-h))]",
        className,
      )}
      style={
        {
          "--u": UNIT,
          "--band-h": height,
          "--copy-top": copyTop,
          backgroundColor: BAND_BASE,
        } as React.CSSProperties
      }
    >
      {/* Wide screens: the whole plate, pinned right. */}
      <div aria-hidden className="absolute top-0 right-0 -z-10 hidden xl:block" style={{ fontSize: "var(--u)" }}>
        <Plate photo={photo} height={height}>
          {plate}
        </Plate>
      </div>

      <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-20 pb-8 sm:px-8 sm:pt-24 xl:px-0 xl:pt-[calc(var(--u)*var(--copy-top))] xl:pb-0">
        {children}

      </div>

      {/* Phones and tablets: the scene composed for the screen's shape. */}
      <SmallPhoto plate={mobile} className="md:hidden" />
      <SmallPhoto plate={tablet} className="hidden md:block" />
      {/* Phones only: what follows the photo, set on its plain foot. */}
      {after && (
        <div
          className="relative z-10 mx-auto max-w-[1200px] px-5 pb-20 sm:px-8 md:hidden"
          style={{ marginTop: `-${(((mobile.plainBottom ?? 0) * mobile.h) / mobile.w) * 100}%` }}
        >
          {after}
        </div>
      )}
    </section>
  );
}

/**
 * One recomposed photo, full width, at its own aspect. It is pulled up by its
 * plain top so the copy sits on the wood, under the same shade as the hero.
 * 1em inside it is one pixel of the photo, so screens line up at any width.
 */
function SmallPhoto({ plate, className }: { plate: SmallPlate; className?: string }) {
  const tuck = ((plate.plainTop * plate.h) / plate.w) * 100;
  return (
    <div
      aria-hidden
      className={cn("@container relative xl:hidden", className)}
      style={{ aspectRatio: `${plate.w} / ${plate.h}`, marginTop: `-${tuck.toFixed(2)}%` }}
    >
      <Image src={plate.src} alt="" fill unoptimized loading="lazy" className="pointer-events-none object-cover select-none" />
      <div className="absolute inset-0 bg-[rgb(18_13_26/0.55)]" />
      <div className="absolute inset-0" style={{ fontSize: `calc(100cqw / ${plate.w})` }}>
        {plate.screens}
      </div>
      {plate.labels}
    </div>
  );
}

/** A white chip that names what's on the photo ("LinkedIn", "Live on all three"). */
export function PlateLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "absolute flex items-center gap-[7em] rounded-full bg-white px-[11em] py-[6em] shadow-[0_8em_20em_rgb(0_0_0/0.25)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PlateLabelText({ children }: { children: React.ReactNode }) {
  return <span className="text-[12em] leading-normal font-bold whitespace-nowrap text-[#1f1b2d]">{children}</span>;
}
