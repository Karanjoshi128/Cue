"use client";

import type { AutomationsPageData } from "@/lib/automations/data";
import { Button } from "@/components/ui/button";

export function AutomationOverview({ report, onPeriod }: { report: AutomationsPageData["report"]; onPeriod: (days: number) => void }) {
  const items = [["Matched", report.matched], ["DMs sent", report.dmSent], ["Delivered", report.delivered], ["Contacts captured", report.collected], ["Links visited", report.visited]] as const;
  return <section className="space-y-3" aria-label="Automation results"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">Results from the last {report.days} days</h2><div className="flex gap-1" role="group" aria-label="Report period">{[7, 30].map((days) => <Button key={days} type="button" variant={days === report.days ? "secondary" : "ghost"} size="sm" aria-pressed={days === report.days} onClick={() => onPeriod(days)}>{days} days</Button>)}</div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{items.map(([label, count]) => <div key={label} className="bg-card rounded-xl border p-4"><p className="text-muted-foreground text-xs">{label}</p><p className="mt-2 font-mono text-2xl tabular-nums">{count.toLocaleString()}</p></div>)}</div><p className="text-muted-foreground text-xs">Counts follow conversations started in this period. Links visited counts conversations with at least one tracked visit ({report.visits} total visits), not read receipts or purchases. Capture and visit tracking begin with this update.</p></section>;
}
