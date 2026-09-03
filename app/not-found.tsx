import Link from "next/link";
import Logo from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-16">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">
        There is nothing at this address
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        The page you were looking for doesn&apos;t exist. It may have been a
        typo, or a link that outlived the thing it pointed at.
      </p>
      <div className="mt-7">
        <Link href="/" className="btn-primary inline-block">
          Find your biggest lever
        </Link>
      </div>
    </main>
  );
}
