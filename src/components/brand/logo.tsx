import Image from "next/image";

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/cue-logo-horizontal.png"
      alt="Cue"
      width={120}
      height={40}
      priority
      // Let both axes scale from the aspect ratio so a height class (e.g. h-10)
      // doesn't trip Next's "modified one dimension" warning.
      style={{ width: "auto", height: "auto" }}
      className={className}
    />
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/brand/cue_icon.png"
      alt="Cue"
      width={size}
      height={size}
      priority
    />
  );
}
