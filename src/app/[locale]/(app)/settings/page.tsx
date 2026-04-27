"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const [firmName, setFirmName] = useState("Cabinet Samir Chaib");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const save = () => {
    toast.success("Paramètres enregistrés localement. Persistance côté base de données à venir.");
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl mx-auto">
      <header>
        <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep mb-2">Configuration</div>
        <h1 className="font-display text-display-2">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Identité du cabinet</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>{t("firmName")}</Label>
            <Input value={firmName} onChange={(e) => setFirmName(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>{t("firmAddress")}</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label>{t("firmPhone")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>{t("firmEmail")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save}>
          <Save className="h-4 w-4" />
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
