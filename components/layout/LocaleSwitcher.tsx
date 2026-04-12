"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { locales as LOCALES } from "@/i18n/locales";

export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (LOCALES.length < 2) {
    return null;
  }

  const onChange = (next: string) => {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <Select value={locale} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger
        className="h-9 min-w-[110px] w-[min(100%,140px)]"
        aria-label={t("label")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LOCALES.map((code) => (
          <SelectItem key={code} value={code}>
            {t(code)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
