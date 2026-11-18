"use client";

import { useId, useState } from "react";
import type { PublishingOptions, InstagramUserTag } from "@/lib/publishing-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><p className="text-sm font-medium">{title}</p>{children}{hint && <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>}</div>;
}
function Toggle({ title, hint, checked, onChange }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return <div className="flex items-center justify-between gap-4"><div><label htmlFor={id} className="text-sm font-medium">{title}</label>{hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}</div><Switch id={id} checked={checked} onCheckedChange={onChange} /></div>;
}
const selectClass = "bg-background border-input h-9 w-full rounded-lg border px-3 text-sm";

/** Progressive disclosure keeps ordinary publishing short; settings persist with the draft. */
export function PublishingControls({ hasLinkedInPage, platforms, options, onChange, hasVideo, hasLink }: {
  hasLinkedInPage: boolean; platforms: Set<string>; options: PublishingOptions; onChange: (v: PublishingOptions) => void; hasVideo: boolean; hasLink: boolean;
}) {
  const ig = options.instagram ?? {};
  const yt = options.youtube ?? {};
  const li = options.linkedin ?? {};
  const setIg = (v: Partial<NonNullable<PublishingOptions["instagram"]>>) => onChange({ ...options, instagram: { ...ig, ...v } });
  const setYt = (v: Partial<NonNullable<PublishingOptions["youtube"]>>) => onChange({ ...options, youtube: { ...yt, ...v } });
  const setLi = (v: Partial<NonNullable<PublishingOptions["linkedin"]>>) => onChange({ ...options, linkedin: { ...li, ...v } });
  return <div className="space-y-3">
    {platforms.has("INSTAGRAM") && <details className="rounded-xl border p-4" open={ig.placement === "STORY" || undefined}>
      <summary className="cursor-pointer text-sm font-semibold">Instagram settings <span className="text-muted-foreground font-normal">· {ig.placement === "STORY" ? "Story" : hasVideo ? "Reel / carousel" : "Feed"}</span></summary>
      <div className="mt-4 space-y-4">
        <Field title="Publish as" hint="Stories require an Instagram Business account. Add stickers, music and interactive Story links in Instagram itself.">
          <select className={selectClass} aria-label="Instagram placement" value={ig.placement ?? "FEED"} onChange={(e) => setIg({ placement: e.target.value as "FEED" | "STORY" })}><option value="FEED">Feed post or Reel</option><option value="STORY">Story</option></select>
        </Field>
        <Toggle title="Disclose AI-generated content" checked={ig.aiGenerated ?? false} onChange={(aiGenerated) => setIg({ aiGenerated })} />
        {ig.placement !== "STORY" && <>
          {hasVideo && <>
            <Field title="Trial Reel" hint="Eligible accounts can test a single Reel with non-followers. Share manual trials to followers from Instagram."><select aria-label="Trial Reel" className={selectClass} value={ig.trialReel ?? "off"} onChange={(e) => setIg({ trialReel: e.target.value === "off" ? undefined : e.target.value as "MANUAL" | "SS_PERFORMANCE" })}><option value="off">Standard Reel</option><option value="MANUAL">Trial: share manually later</option><option value="SS_PERFORMANCE">Trial: auto-share if it performs well</option></select></Field>
            <Toggle title="Share Reel to feed" checked={ig.shareToFeed ?? true} onChange={(shareToFeed) => setIg({ shareToFeed })} />
            <Field title="Cover frame (seconds)" hint="For a single Reel. An uploaded cover takes precedence."><Input aria-label="Instagram cover frame in seconds" type="number" min="0" max="900" step="0.1" value={ig.thumbOffset === undefined ? "" : ig.thumbOffset / 1000} onChange={(e) => setIg({ thumbOffset: e.target.value ? Math.round(Number(e.target.value) * 1000) : undefined })} /></Field>
            <Field title="Original audio name" hint="Names the audio already in your video. This does not add a song."><Input aria-label="Instagram original audio name" maxLength={100} value={ig.audioName ?? ""} onChange={(e) => setIg({ audioName: e.target.value || undefined })} /></Field>
          </>}
          <Field title="Collaborators" hint="Up to 3 usernames, separated by commas. They must accept Instagram’s invitation."><Input aria-label="Instagram collaborators" placeholder="creator_one, creator_two" defaultValue={ig.collaborators?.join(", ") ?? ""} onBlur={(e) => setIg({ collaborators: e.target.value.split(",").map((v) => v.trim().replace(/^@/, "")).filter(Boolean) })} /></Field>
          <Field title="Location ID" hint="Optional Instagram location Page ID. Cue does not request additional access to search locations."><Input aria-label="Instagram location ID" inputMode="numeric" value={ig.locationId ?? ""} onChange={(e) => setIg({ locationId: e.target.value || undefined })} /></Field>
        </>}
      </div>
    </details>}
    {platforms.has("YOUTUBE") && <details className="rounded-xl border p-4">
      <summary className="cursor-pointer text-sm font-semibold">YouTube audience & distribution</summary>
      <div className="mt-4 space-y-4">
        <Field title="Audience" hint="Choose based on this video’s intended audience. Videos made for kids have comments disabled."><select aria-label="YouTube audience" className={selectClass} value={yt.madeForKids ? "kids" : "general"} onChange={(e) => setYt({ madeForKids: e.target.value === "kids" })}><option value="general">Not made for kids</option><option value="kids">Made for kids</option></select></Field>
        <Toggle title="Realistic altered or synthetic content" hint="Disclose realistic content that was meaningfully altered or generated." checked={yt.containsSyntheticMedia ?? false} onChange={(containsSyntheticMedia) => setYt({ containsSyntheticMedia })} />
        <Toggle title="Notify subscribers" checked={yt.notifySubscribers ?? true} onChange={(notifySubscribers) => setYt({ notifySubscribers })} />
        <Toggle title="Show extended video statistics publicly" checked={yt.publicStatsViewable ?? true} onChange={(publicStatsViewable) => setYt({ publicStatsViewable })} />
        <Toggle title="Allow embedding" checked={yt.embeddable ?? true} onChange={(embeddable) => setYt({ embeddable })} />
        <Field title="License"><select aria-label="YouTube license" className={selectClass} value={yt.license ?? "youtube"} onChange={(e) => setYt({ license: e.target.value as "youtube" | "creativeCommon" })}><option value="youtube">Standard YouTube license</option><option value="creativeCommon">Creative Commons attribution</option></select></Field>
        <Field title="Original language" hint="Language code, for example en, hi or en-US."><Input aria-label="YouTube original language" value={yt.defaultLanguage ?? ""} onChange={(e) => setYt({ defaultLanguage: e.target.value || undefined })} /></Field>
        <Field title="Recording date"><Input aria-label="YouTube recording date" type="date" value={yt.recordingDate?.slice(0, 10) ?? ""} onChange={(e) => setYt({ recordingDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined })} /></Field>
        <Translations value={yt.localizations ?? {}} onChange={(localizations) => setYt({ localizations: Object.keys(localizations).length ? localizations : undefined })} />
      </div>
    </details>}
    {platforms.has("LINKEDIN") && <details className="rounded-xl border p-4">
      <summary className="cursor-pointer text-sm font-semibold">LinkedIn settings</summary>
      <div className="mt-4 space-y-4">
        <Field title="Who can see this post?" hint="Connections only applies to personal profiles. Company Pages publish publicly."><select aria-label="LinkedIn visibility" className={selectClass} value={li.visibility ?? "PUBLIC"} onChange={(e) => setLi({ visibility: e.target.value as "PUBLIC" | "CONNECTIONS" })}><option value="PUBLIC">Anyone</option><option value="CONNECTIONS" disabled={hasLinkedInPage}>Connections only</option></select></Field>
        <Toggle title="Disable reshares" checked={li.disableReshares ?? false} onChange={(disableReshares) => setLi({ disableReshares })} />
        {hasVideo && <>
          <Field title="Video title"><Input aria-label="LinkedIn video title" maxLength={200} value={li.videoTitle ?? ""} onChange={(e) => setLi({ videoTitle: e.target.value || undefined })} /></Field>
          <Field title="Closed captions" hint="Optional English .srt file, up to 100 KB. LinkedIn’s upload API currently accepts English captions."><Input aria-label="LinkedIn SRT captions" type="file" accept=".srt" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 100_000) { toast.error("Keep captions under 100 KB."); return; } setLi({ captionsSrt: await f.text() }); }} />{li.captionsSrt && <Button variant="ghost" size="sm" type="button" onClick={() => setLi({ captionsSrt: undefined })}>Remove captions ({li.captionsSrt.length.toLocaleString()} characters)</Button>}</Field>
        </>}
        {hasLink && <p className="text-muted-foreground text-xs">The cover image below becomes the link preview image.</p>}
      </div>
    </details>}
  </div>;
}

function Translations({ value, onChange }: { value: NonNullable<NonNullable<PublishingOptions["youtube"]>["localizations"]>; onChange: (v: NonNullable<NonNullable<PublishingOptions["youtube"]>["localizations"]>) => void }) {
  const [code, setCode] = useState("");
  return <details><summary className="cursor-pointer text-sm font-medium">Translated titles & descriptions ({Object.keys(value).length})</summary><div className="mt-3 space-y-3">{Object.entries(value).map(([lang, text]) => <div key={lang} className="space-y-2 rounded-lg border p-3"><div className="flex items-center justify-between"><span className="font-mono text-xs">{lang}</span><Button type="button" variant="ghost" size="sm" onClick={() => { const next = { ...value }; delete next[lang]; onChange(next); }}>Remove {lang}</Button></div><Input aria-label={`Title in ${lang}`} maxLength={100} placeholder="Translated title" value={text.title} onChange={(e) => onChange({ ...value, [lang]: { ...text, title: e.target.value } })} /><Textarea aria-label={`Description in ${lang}`} maxLength={5000} placeholder="Translated description" value={text.description} onChange={(e) => onChange({ ...value, [lang]: { ...text, description: e.target.value } })} /></div>)}<div className="flex gap-2"><Input aria-label="Translation language code" placeholder="Language code, e.g. hi" value={code} onChange={(e) => setCode(e.target.value)} /><Button type="button" variant="outline" disabled={Object.keys(value).length >= 20} onClick={() => { if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(code.trim())) return toast.error("Enter a language code such as hi."); if (!value[code.trim()]) onChange({ ...value, [code.trim()]: { title: "", description: "" } }); setCode(""); }}>Add language</Button></div></div></details>;
}

export function MediaDetails({ index, altText, userTags, instagram, allowAlt, coordinates, onChange }: {
  index: number; altText?: string; userTags?: InstagramUserTag[]; instagram: boolean; allowAlt: boolean; coordinates: boolean;
  onChange: (v: { altText?: string; userTags?: InstagramUserTag[] }) => void;
}) {
  const tags = userTags ?? [];
  return <details className="rounded-lg border p-3">
    <summary className="cursor-pointer text-xs font-medium">Media {index + 1}: {allowAlt ? "accessibility" : "people"}{allowAlt && instagram ? " & people" : ""}</summary>
    <div className="mt-3 space-y-3">
      {allowAlt && <Textarea aria-label={`Alt text for image ${index + 1}`} maxLength={1000} placeholder="Describe what is in the image for people using a screen reader." value={altText ?? ""} onChange={(e) => onChange({ altText: e.target.value })} />}
      {instagram && <>
        <p className="text-muted-foreground text-xs">Tag public Instagram usernames.{coordinates ? " Position is a fraction from 0 (left/top) to 1 (right/bottom)." : ""}</p>
        {tags.map((tag, i) => <div className="flex flex-wrap gap-2" key={i}>
          <Input className="min-w-32 flex-1" aria-label={`Media ${index + 1} tag ${i + 1} username`} placeholder="username" value={tag.username} onChange={(e) => onChange({ userTags: tags.map((v, n) => n === i ? { ...v, username: e.target.value.replace(/^@/, "") } : v) })} />
          {coordinates && (["x", "y"] as const).map((axis) => <Input key={axis} className="w-20" aria-label={`Media ${index + 1} tag ${i + 1} ${axis}`} type="number" min="0" max="1" step="0.05" value={tag[axis]} onChange={(e) => onChange({ userTags: tags.map((v, n) => n === i ? { ...v, [axis]: Number(e.target.value) } : v) })} />)}
          <Button type="button" variant="ghost" onClick={() => onChange({ userTags: tags.filter((_, n) => n !== i) })} aria-label={`Remove tag ${i + 1}`}>Remove</Button>
        </div>)}
        <Button type="button" variant="outline" size="sm" disabled={tags.length >= 20} onClick={() => onChange({ userTags: [...tags, { username: "", x: 0.5, y: 0.5 }] })}>Tag a person</Button>
      </>}
    </div>
  </details>;
}
