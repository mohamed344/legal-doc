"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/friendly-errors";

export default function LoginPage() {
  const t = useTranslations("auth");
  const locale = useLocale() as "fr" | "ar";
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const schema = z.object({
    email: z.string().email(t("errors.invalidEmail")),
    password: z.string().min(1, t("errors.required")),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setLoading(false);
      toast.error(friendlyAuthError(error, locale, t("errors.loginFailed")));
      return;
    }

    const check = await fetch("/api/auth/login-success", { method: "POST" });
    if (check.status === 409) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error(t("errors.accountNotProvisioned"));
      return;
    }
    if (!check.ok) {
      setLoading(false);
      toast.error(friendlyAuthError("network", locale, t("errors.loginFailed")));
      return;
    }

    setLoading(false);
    toast.success(t("loginSuccess"));
    router.push(`/${locale}`);
    router.refresh();
  };

  return (
    <div className="animate-fade-in space-y-8">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep">
          {t("loginCta")}
        </div>
        <h1 className="font-display text-display-2 text-foreground">{t("login")}</h1>
      </header>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("password")}</Label>
            <Link
              href={`/${locale}/reset-password`}
              className="text-xs text-primary hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          </div>
          <PasswordInput id="password" autoComplete="current-password" {...form.register("password")} />
          {form.formState.errors.password && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.password.message}</p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {t("submit")}
        </Button>
      </form>

      <div className="divider-wave opacity-40" />

      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href={`/${locale}/signup`} className="font-medium text-primary hover:underline">
          {t("signup")}
        </Link>
      </p>
    </div>
  );
}
