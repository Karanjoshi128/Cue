"use client";

import { createContext, useContext } from "react";
import type { CalendarPost, Density } from "@/lib/calendar-shared";
import type { TzCtx } from "./time";

export interface CalendarApi {
  timeZone: string;
  ctx: TzCtx;
  /** Server time at render, so every view agrees on "now" and "past". */
  now: Date;
  density: Density;
  /** The single filtered client, prefilled into the composer; else none. */
  composerClient?: string;
  draggingId: string | null;
  /** The post being dragged (dataTransfer can't be read during dragover). */
  dragPost: () => CalendarPost | null;
  startDrag: (post: CalendarPost) => void;
  endDrag: () => void;
  /** Drop a post at an instant; `copy` duplicates it (Alt/Option-drag). */
  drop: (post: CalendarPost, when: Date, copy: boolean) => void;
  /** Can this post land at this instant? Scheduled posts need the future. */
  canLand: (post: CalendarPost, when: Date) => boolean;
  open: (postId: string) => void;
}

export const CalendarContext = createContext<CalendarApi | null>(null);

export function useCalendar(): CalendarApi {
  const api = useContext(CalendarContext);
  if (!api) throw new Error("useCalendar outside <CalendarBoard>");
  return api;
}
