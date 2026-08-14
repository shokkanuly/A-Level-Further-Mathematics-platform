import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "student" ? "/learn" : "/teach");

  const { next } = await searchParams;
  return (
    <main className="auth-page">
      <AuthForm mode="login" next={next} />
    </main>
  );
}
