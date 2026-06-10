import Link from "next/link";

export function OrbitBrand() {
  return (
    <Link href="/" className="flex items-center gap-2 shrink-0">
      <img
        src="/orbitlogo.png"
        alt="Orbit"
        className="size-8 rounded-full"
      />
      <span className="text-base font-bold tracking-tight">Orbit</span>
    </Link>
  );
}
