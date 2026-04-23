"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { friendlyAuthError } from "@/lib/friendly-errors";

export default function SignupPage() {
  const t = useTranslations("auth");
  const locale = useLocale() as "fr" | "ar";
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const schema = z
    .object({
      full_name: z.string().min(2, t("errors.required")),
      email: z.string().email(t("errors.invalidEmail")),
      password: z.string().min(8, t("errors.passwordTooShort")),
      confirm: z.string(),
    })
    .refine((d) => d.password === d.confirm, {
      path: ["confirm"],
      message: t("errors.passwordMismatch"),
    });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", password: "", confirm: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          full_name: values.full_name,
          emailRedirectTo: `${window.location.origin}/${locale}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(friendlyAuthError(data.error, locale, t("errors.signupFailed")));
        return;
      }
      toast.success(t("signupSuccess"));
      setSent(true);
    } catch {
      toast.error(friendlyAuthError("network", locale, t("errors.signupFailed")));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="animate-fade-in space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest/15 text-forest">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="font-display text-3xl">{t("verifyEmail")}</h1>
        <p className="text-muted-foreground">
          {t("hasAccount")}{" "}
          <Link href={`/${locale}/login`} className="text-primary hover:underline">
            {t("login")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep">
          {t("signupCta")}
        </div>
        <h1 className="font-display text-display-2">{t("signup")}</h1>
      </header>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Label htmlFor="full_name">{t("fullName")}</Label>
          <Input id="full_name" {...form.register("full_name")} />
          {form.formState.errors.full_name && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.full_name.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="password">{t("password")}</Label>
          <PasswordInput id="password" autoComplete="new-password" {...form.register("password")} />
          {form.formState.errors.password && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.password.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="confirm">{t("confirmPassword")}</Label>
          <PasswordInput id="confirm" autoComplete="new-password" {...form.register("confirm")} />
          {form.formState.errors.confirm && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.confirm.message}</p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {t("submit")}
        </Button>
      </form>

      <div className="divider-wave opacity-40" />

      <p className="text-center text-sm text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link href={`/${locale}/login`} className="font-medium text-primary hover:underline">
          {t("login")}
        </Link>
      </p>
    </div>
  );
}
