import { cn } from "@/lib/utils";

/*
 * The network screens drawn onto the devices in the landing's photo bands,
 * from the Figma "Device screen/…" frames. They live inside a plate (see
 * photo-band.tsx), so every size is in em: 1em is one design pixel.
 * The type is the networks' own look (Inter, or the system face if absent),
 * not Cue's.
 */

const SCREEN_FONT = "font-[Inter,system-ui,sans-serif]";

/** A small decorative icon from public/landing/icons. */
function Ico({ name, className }: { name: string; className?: string }) {
  return (
    // Decorative and sized in em, which next/image can't express.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/landing/icons/${name}.svg`} alt="" className={cn("block shrink-0", className)} />
  );
}

function Photo({ src, className }: { src: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={cn("block shrink-0 object-cover", className)} />
  );
}

/** Text at a design size: the size lives on the text element only. */
function T({ size, className, children }: { size: number; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("block leading-normal", className)} style={{ fontSize: `${size}em` }}>
      {children}
    </span>
  );
}

function StatusBar() {
  return (
    <div className="flex h-[14.54em] w-full shrink-0 items-center justify-between bg-white px-[7.27em]">
      <T size={4.957} className="font-bold text-black">
        9:41
      </T>
      <div className="flex items-center gap-[1.322em]">
        <span className="h-[2.644em] w-[5.287em] rounded-[1.322em] bg-black" />
        <span className="h-[2.644em] w-[4.626em] rounded-[1.322em] bg-black" />
        <span className="h-[2.644em] w-[7.27em] rounded-[1.322em] bg-black" />
      </div>
    </div>
  );
}

function Notch() {
  return <div className="absolute top-0 left-[34.5em] h-[9em] w-[50em] rounded-b-[6em] bg-[#0b0b0b]" />;
}

function Avatar({ initials, color, size, text }: { initials: string; color: string; size: number; text: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-white"
      style={{ backgroundColor: color, width: `${size}em`, height: `${size}em` }}
    >
      <T size={text} className="font-bold">
        {initials}
      </T>
    </span>
  );
}

/** Props shared by the phone screens. `height` (design px) stretches a screen
 *  to a taller phone; the feed or thread simply carries on. */
interface ScreenProps {
  className?: string;
  height?: number;
}

/** Bloom Bakery's LinkedIn update on the left phone. */
export function LinkedInScreen({ className, height = 255 }: ScreenProps) {
  return (
    <div
      className={cn("absolute w-[115em] overflow-hidden rounded-[11em]", SCREEN_FONT, className)}
      style={{ height: `${height}em` }}
    >
      <div className="flex w-[115em] flex-col gap-[2.644em] overflow-hidden bg-[#f4f2ee]" style={{ height: `${height - 1.2}em` }}>
        <StatusBar />
        <div className="flex w-full items-center gap-[3.305em] bg-white px-[4.626em] py-[3.305em]">
          <Ico name="li-logo" className="size-[9.253em]" />
          <div className="flex h-[9.914em] flex-1 items-center rounded-[1.983em] bg-[#edf3f8] px-[3.305em]">
            <T size={4.626} className="text-[#666]">
              Search
            </T>
          </div>
        </div>
        <div className="flex w-full flex-col gap-[3.305em] bg-white px-[4.626em] pt-[4.626em] pb-[2.644em]">
          <div className="flex items-center gap-[3.305em]">
            <Avatar initials="BB" color="#f59e0b" size={14.54} text={5.618} />
            <div className="flex flex-col gap-[0.661em] whitespace-nowrap">
              <T size={5.287} className="font-bold text-black">
                Bloom Bakery
              </T>
              <T size={3.966} className="text-[#666]">
                1,204 followers · 2h
              </T>
            </div>
          </div>
          <T size={4.626} className="leading-[1.35] text-[#1d1d1d]">
            We bake 40 sourdough loaves before 7 every morning. Here&apos;s how a team of four pulls it off, and why we
            never skip the autolyse.
          </T>
          <Photo src="/landing/sourdough.webp" className="h-[76.006em] w-full" />
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-[1.322em]">
              <span className="grid size-[5.287em] place-items-center rounded-full bg-[#378fe9]">
                <Ico name="li-like-badge" className="size-[3.305em]" />
              </span>
              <T size={3.966} className="text-[#666]">
                128
              </T>
            </div>
            <T size={3.966} className="text-[#666]">
              14 comments · 6 reposts
            </T>
          </div>
          <div className="flex w-full justify-between border-t-[0.33em] border-[#e8e8e8] px-[1.983em] pt-[2.644em]">
            {(
              [
                ["li-like", "Like"],
                ["li-comment", "Comment"],
                ["li-send", "Send"],
              ] as const
            ).map(([icon, label]) => (
              <div key={label} className="flex items-center gap-[1.322em]">
                <Ico name={icon} className="size-[5.287em]" />
                <T size={3.966} className="font-medium text-[#666]">
                  {label}
                </T>
              </div>
            ))}
          </div>
        </div>
        <div className="flex w-full flex-col gap-[3.305em] bg-white p-[4.626em]">
          <div className="flex items-center gap-[3.305em]">
            <Avatar initials="NG" color="#10b981" size={14.54} text={5.618} />
            <div className="flex flex-col gap-[1.322em]">
              <T size={5.287} className="font-bold whitespace-nowrap text-black">
                Northwind Gym
              </T>
              <span className="h-[2.644em] w-[39.655em] rounded-[1.322em] bg-[#e4e6eb]" />
            </div>
          </div>
          <span className="h-[3.305em] w-[99.138em] rounded-[1.652em] bg-[#e4e6eb]" />
          <span className="h-[3.305em] w-[79.31em] rounded-[1.652em] bg-[#e4e6eb]" />
        </div>
      </div>
      <Notch />
    </div>
  );
}

/** The same post on Instagram, on the middle phone. */
export function InstagramScreen({ className, height = 255 }: ScreenProps) {
  return (
    <div
      className={cn("absolute w-[115em] overflow-hidden rounded-[11em]", SCREEN_FONT, className)}
      style={{ height: `${height}em` }}
    >
      <div className="flex w-[115em] flex-col overflow-hidden bg-white" style={{ height: `${height - 1.2}em` }}>
        <StatusBar />
        <div className="flex w-full items-center justify-between px-[4.626em] py-[2.644em]">
          <T size={6.609} className="font-bold text-black">
            Instagram
          </T>
          <div className="flex gap-[4.626em]">
            <Ico name="ig-heart-top" className="size-[7.27em]" />
            <Ico name="ig-dm-top" className="size-[7.27em]" />
          </div>
        </div>
        <div className="flex w-full items-center gap-[3.305em] px-[3.966em] py-[2.644em]">
          <span className="grid size-[12.557em] shrink-0 place-items-center rounded-full bg-[#e4405f]">
            <Avatar initials="BB" color="#f59e0b" size={10.575} text={3.966} />
          </span>
          <div className="flex flex-col gap-[0.33em] whitespace-nowrap">
            <T size={4.626} className="font-bold text-black">
              bloombakery
            </T>
            <T size={3.635} className="text-[#555]">
              Indiranagar, Bengaluru
            </T>
          </div>
        </div>
        <Photo src="/landing/sourdough.webp" className="size-[115em]" />
        <div className="flex w-full items-start justify-between px-[3.966em] pt-[3.305em] pb-[1.322em]">
          <div className="flex gap-[4.626em]">
            <Ico name="ig-heart" className="size-[7.931em]" />
            <Ico name="ig-comment" className="size-[7.931em]" />
            <Ico name="ig-send" className="size-[7.931em]" />
          </div>
          <Ico name="ig-save" className="size-[7.931em]" />
        </div>
        <div className="flex w-full flex-col gap-[1.652em] px-[3.966em] py-[0.661em]">
          <T size={4.296} className="font-bold text-black">
            48 likes
          </T>
          <T size={4.296} className="leading-[1.35] text-black">
            <b>bloombakery</b>&nbsp; Fresh sourdough, out of the oven at 7. Swipe for the crumb shot.
          </T>
          <T size={4.296} className="leading-[1.35] text-[#00376b]">
            <b className="text-black">bloombakery</b>&nbsp; #sourdough #bakerylife · order link in bio
          </T>
          <T size={3.635} className="text-[#8e8e8e]">
            2 minutes ago
          </T>
        </div>
      </div>
      <Notch />
    </div>
  );
}

/** And as a YouTube Short, on the tablet. */
export function YouTubeScreen({ className, height = 271 }: ScreenProps) {
  return (
    <div
      className={cn("absolute w-[227em] overflow-hidden rounded-[7em]", SCREEN_FONT, className)}
      style={{ height: `${height}em` }}
    >
      <div className="flex w-[227em] flex-col overflow-hidden bg-white" style={{ height: `${height - 0.2}em` }}>
        <div className="flex w-full items-center gap-[2.655em] px-[6.637em] py-[4.646em]">
          <Ico name="yt-logo" className="size-[11.284em]" />
          <T size={7.965} className="font-bold text-[#0f0f0f]">
            YouTube
          </T>
        </div>
        <div className="relative h-[127.77em] w-full shrink-0 overflow-hidden">
          <Photo src="/landing/sourdough.webp" className="absolute inset-0 size-full" />
          <Ico name="yt-play-circle" className="absolute top-[49.78em] left-[99.56em] size-[27.877em]" />
          <Ico name="yt-play" className="absolute top-[58.08em] left-[109.52em] h-[11.284em] w-[9.956em]" />
          <span className="absolute top-[126.11em] left-0 h-[1.659em] w-full bg-white/35" />
          <span className="absolute top-[126.11em] left-0 h-[1.659em] w-[82.968em] bg-[red]" />
        </div>
        <div className="flex w-full flex-col gap-[3.319em] px-[6.637em] py-[5.31em]">
          <T size={8.629} className="font-bold whitespace-nowrap text-[#0f0f0f]">
            40 sourdough loaves before 7 am
          </T>
          <T size={5.31} className="whitespace-pre text-[#606060]">
            {"2.4K views · 1 hour ago  #shorts #sourdough"}
          </T>
          <div className="flex w-full items-center gap-[3.982em] pt-[1.991em]">
            <Avatar initials="BB" color="#f59e0b" size={14.602} text={5.642} />
            <div className="flex flex-1 flex-col gap-[0.664em] whitespace-nowrap">
              <T size={5.642} className="font-bold text-[#0f0f0f]">
                Bloom Bakery
              </T>
              <T size={4.646} className="text-[#606060]">
                2.1K subscribers
              </T>
            </div>
            <span className="rounded-full bg-[#0f0f0f] px-[5.974em] py-[3.319em]">
              <T size={4.978} className="font-bold text-white">
                Subscribe
              </T>
            </span>
          </div>
        </div>
        <div className="flex w-full flex-col gap-[3.982em] px-[6.637em] py-[1.327em]">
          <T size={5.31} className="font-bold text-[#0f0f0f]">
            Up next
          </T>
          {(
            [
              ["/landing/upnext-1.webp", "The 30-second latte art pour"],
              ["/landing/upnext-2.webp", "Our new window seats tour"],
            ] as const
          ).map(([src, title]) => (
            <div key={title} className="flex w-full items-center gap-[3.982em]">
              <Photo src={src} className="h-[27.877em] w-[49.781em] rounded-[2.655em]" />
              <div className="flex flex-1 flex-col gap-[1.991em]">
                <T size={4.978} className="font-medium text-[#0f0f0f]">
                  {title}
                </T>
                <T size={4.314} className="text-[#606060]">
                  Bloom Bakery · 1.2K views
                </T>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Northwind Gym's auto-DM to Priya, on the hand-held phone. */
export function InstagramDmScreen({ className, height = 390 }: ScreenProps) {
  const gym = "/landing/gym.webp";
  return (
    <div
      className={cn("absolute w-[186em] overflow-hidden rounded-[17em]", SCREEN_FONT, className)}
      style={{ height: `${height}em` }}
    >
      <div className="relative flex w-[186em] flex-col overflow-hidden bg-white" style={{ height: `${height - 0.8}em` }}>
        <div className="flex h-[23.846em] w-full shrink-0 items-center justify-between pt-[2.862em] pr-[14.308em] pl-[16.215em]">
          <T size={7.631} className="font-bold text-black">
            9:41
          </T>
          <div className="flex items-center gap-[2.385em]">
            <span className="h-[4.769em] w-[8.108em] rounded-[1.431em] bg-black" />
            <span className="h-[4.769em] w-[7.154em] rounded-[1.431em] bg-black" />
            <span className="h-[4.769em] w-[11.923em] rounded-[1.431em] bg-black" />
          </div>
        </div>
        <div className="flex w-full items-center gap-[4.769em] border-b-[0.477em] border-[#efefef] pt-[2.862em] pr-[7.631em] pb-[4.769em] pl-[4.769em]">
          <Ico name="dm-back" className="size-[13.354em]" />
          <Photo src={gym} className="size-[17.169em] rounded-full" />
          <div className="flex flex-1 flex-col gap-[0.477em] whitespace-nowrap">
            <T size={7.631} className="font-bold text-black">
              Northwind Gym
            </T>
            <T size={5.723} className="text-[#737373]">
              northwind.gym
            </T>
          </div>
          <div className="flex gap-[8.585em]">
            <Ico name="dm-call" className="size-[11.446em]" />
            <Ico name="dm-video" className="size-[12.4em]" />
          </div>
        </div>
        <div className="flex min-h-0 w-full flex-1 flex-col justify-end gap-[2.862em] overflow-hidden px-[6.677em] pt-[5.723em] pb-[4.769em]">
          <div className="flex w-full flex-col items-center gap-[1.431em] pb-[6.677em]">
            <Photo src={gym} className="size-[30.523em] rounded-full" />
            <T size={7.631} className="font-bold text-black">
              Northwind Gym
            </T>
            <T size={5.723} className="text-[#737373]">
              northwind.gym · Instagram
            </T>
            <span className="rounded-[3.815em] bg-[#efefef] px-[6.677em] py-[2.862em]">
              <T size={6.2} className="font-bold text-black">
                View profile
              </T>
            </span>
          </div>
          <T size={5.246} className="w-full text-center text-[#737373]">
            Today 9:02 AM
          </T>
          <div className="pt-[2.862em] pl-[17.169em]">
            <T size={5.246} className="text-[#737373]">
              Replied to your comment
            </T>
          </div>
          <div className="pl-[17.169em]">
            <div className="flex items-center gap-[3.815em] rounded-[6.677em] border-[0.477em] border-[#dbdbdb] p-[3.338em]">
              <Photo src={gym} className="size-[18.123em] rounded-[2.862em]" />
              <div className="flex flex-col gap-[0.477em] text-black">
                <T size={5.723} className="font-bold">
                  priya.s
                </T>
                <T size={6.677}>GUIDE</T>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-[3.815em]">
            <Photo src={gym} className="size-[13.354em] rounded-full" />
            <div className="w-[119.231em] rounded-[9.538em] bg-[#efefef] px-[6.677em] py-[4.769em]">
              <T size={7.154} className="leading-[1.3] text-black">
                Hi Priya! Here&apos;s the free 7-day plan for beginners. Start any day you like.
              </T>
            </div>
          </div>
          <div className="pl-[17.169em]">
            <div className="flex w-[119.231em] flex-col overflow-hidden rounded-[8.585em] border-[0.477em] border-[#dbdbdb]">
              <Photo src={gym} className="h-[56.277em] w-full" />
              <div className="flex flex-col gap-[0.954em] px-[5.723em] py-[4.769em]">
                <T size={6.677} className="font-bold text-black">
                  Free 7-day plan for beginners
                </T>
                <T size={5.723} className="text-[#737373]">
                  northwindgym.in/guide
                </T>
              </div>
              <div className="flex justify-center border-t-[0.477em] border-[#dbdbdb] py-[4.769em]">
                <T size={6.677} className="font-bold text-[#0095f6]">
                  Open the guide
                </T>
              </div>
            </div>
          </div>
          <div className="flex w-full justify-end pt-[2.862em]">
            <span className="rounded-[9.538em] bg-linear-to-b from-[#a033ff] to-[#3b7cf6] px-[6.677em] py-[4.769em]">
              <T size={7.154} className="whitespace-nowrap text-white">
                Thank you!! Starting Monday
              </T>
            </span>
          </div>
          <div className="flex w-full justify-end">
            <T size={5.246} className="text-[#737373]">
              Seen just now
            </T>
          </div>
        </div>
        <div className="flex w-full px-[5.723em] pt-[2.862em] pb-[1.908em]">
          <div className="flex h-[21.938em] flex-1 items-center gap-[4.769em] rounded-full bg-[#efefef] pr-[6.677em] pl-[2.862em]">
            <span className="grid size-[16.215em] shrink-0 place-items-center rounded-full bg-[#0095f6]">
              <Ico name="dm-camera" className="size-[9.538em]" />
            </span>
            <T size={7.154} className="flex-1 text-[#737373]">
              Message...
            </T>
            <Ico name="dm-mic" className="size-[10.492em]" />
            <Ico name="dm-image" className="size-[10.492em]" />
            <Ico name="dm-sticker" className="size-[10.492em]" />
          </div>
        </div>
        <div className="flex w-full justify-center pt-[4.769em] pb-[3.815em]">
          <span className="h-[2.385em] w-[63.908em] rounded-[1.431em] bg-black" />
        </div>
        <span className="absolute top-[4.77em] left-[66.29em] h-[15.262em] w-[53.415em] rounded-[7.631em] bg-black" />
      </div>
    </div>
  );
}

/** The YouTube watch page on a tablet lying landscape (the phone and tablet
 *  photos): the video and its details on the left, Up next on the right. */
export function YouTubeLandscapeScreen({ className, height = 201 }: ScreenProps) {
  return (
    <div
      className={cn("absolute flex w-[300em] flex-col overflow-hidden rounded-[6em] bg-white", SCREEN_FONT, className)}
      style={{ height: `${height}em` }}
    >
      <div className="flex w-full shrink-0 items-center gap-[3em] px-[8em] py-[5em]">
        <Ico name="yt-logo" className="size-[11em]" />
        <T size={8} className="font-bold text-[#0f0f0f]">
          YouTube
        </T>
      </div>
      <div className="flex min-h-0 flex-1 gap-[8em] px-[8em]">
        <div className="flex w-[186em] shrink-0 flex-col gap-[3.5em]">
          <div className="relative h-[104.6em] w-full shrink-0 overflow-hidden rounded-[4em]">
            <Photo src="/landing/sourdough.webp" className="absolute inset-0 size-full" />
            <Ico name="yt-play-circle" className="absolute top-[38.4em] left-[79.1em] size-[27.877em]" />
            <Ico name="yt-play" className="absolute top-[46.7em] left-[89em] h-[11.284em] w-[9.956em]" />
            <span className="absolute bottom-0 left-0 h-[1.7em] w-full bg-white/35" />
            <span className="absolute bottom-0 left-0 h-[1.7em] w-[68em] bg-[red]" />
          </div>
          <T size={8.6} className="font-bold whitespace-nowrap text-[#0f0f0f]">
            40 sourdough loaves before 7 am
          </T>
          <T size={5.3} className="whitespace-pre text-[#606060]">
            {"2.4K views · 1 hour ago  #shorts #sourdough"}
          </T>
          <div className="flex w-full items-center gap-[4em] pt-[1em]">
            <Avatar initials="BB" color="#f59e0b" size={14.6} text={5.6} />
            <div className="flex flex-1 flex-col gap-[0.6em] whitespace-nowrap">
              <T size={5.6} className="font-bold text-[#0f0f0f]">
                Bloom Bakery
              </T>
              <T size={4.6} className="text-[#606060]">
                2.1K subscribers
              </T>
            </div>
            <span className="rounded-full bg-[#0f0f0f] px-[6em] py-[3.3em]">
              <T size={5} className="font-bold text-white">
                Subscribe
              </T>
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[5em]">
          <T size={5.6} className="font-bold text-[#0f0f0f]">
            Up next
          </T>
          {(
            [
              ["/landing/upnext-1.webp", "The 30-second latte art pour"],
              ["/landing/upnext-2.webp", "Our new window seats tour"],
              ["/landing/sourdough.webp", "Shaping a batard, slowly"],
            ] as const
          ).map(([src, title]) => (
            <div key={title} className="flex flex-col gap-[2em]">
              <Photo src={src} className="h-[44em] w-full rounded-[3em]" />
              <T size={5} className="font-medium text-[#0f0f0f]">
                {title}
              </T>
              <T size={4.3} className="text-[#606060]">
                Bloom Bakery · 1.2K views
              </T>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
