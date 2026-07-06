"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { localeMeta, type Locale } from "@/i18n/locales";
import { useDeployment } from "@/lib/deployment/client";
import { cn } from "@/lib/utils";

interface LocaleSwitcherProps {
  size?: "default" | "sm";
}

export function LocaleSwitcher({ size = "default" }: LocaleSwitcherProps) {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Only offer the locales this deployment allows.
  const LOCALES = useDeployment().i18n.allowedLocales;

  if (LOCALES.length < 2) {
    return null;
  }

  const onChange = (next: string) => {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  };

  const isSmall = size === "sm";
  const currentMeta = localeMeta[locale as Locale];

  return (
    <Select value={locale} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger
        className={cn(
          isSmall
            ? "h-7 min-w-0 w-auto px-2 gap-1 text-xs"
            : "h-9 min-w-[110px] w-[min(100%,140px)]",
        )}
        aria-label={t("label")}
      >
        {isSmall && (
          <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <SelectValue>
          {currentMeta?.nativeName ?? locale}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LOCALES.map((code) => {
          const meta = localeMeta[code];
          const isSame = meta.nativeName === meta.englishName;
          return (
            <SelectItem key={code} value={code}>
              {isSame ? meta.nativeName : `${meta.nativeName} · ${meta.englishName}`}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
