"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/friendly-errors";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const locale = useLocale() as "fr" | "ar";
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const schema = z.object({ email: z.string().email(t("errors.invalidEmail")) });
  type FormValues = z.infer<typeof schema>;
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = async ({ email }: FormValues) => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/${locale}/login`,
    });
    setLoading(false);
    if (error) {
      toast.error(friendlyAuthError(error, locale, t("errors.resetFailed")));
      return;
    }
    toast.success(t("resetEmailSent"));
    setSent(true);
  };

  if (sent) {
    return (
      <div className="animate-fade-in space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest/15 text-forest">
          <MailCheck className="h-7 w-7" />
        </div>
        <h1 className="font-display text-3xl">{t("resetEmailSent")}</h1>
        <Link href={`/${locale}/login`} className="text-primary hover:underline">
          {t("login")}
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep">
          {t("forgotPassword")}
        </div>
        <h1 className="font-display text-display-2">{t("resetPassword")}</h1>
      </header>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {t("submit")}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href={`/${locale}/login`} className="text-primary hover:underline">
          ← {t("login")}
        </Link>
      </p>
    </div>
  );
}
