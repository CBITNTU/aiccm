"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOrg } from "@/hooks/useOrg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, ChevronsUpDown, Clock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrgSwitcherProps {
  isCollapsed: boolean;
  isMobile?: boolean;
}

export function OrgSwitcher({
  isCollapsed,
  isMobile = false,
}: OrgSwitcherProps) {
  const {
    selectedOrg,
    companies,
    pendingCompanies,
    setSelectedOrg,
    isLoading,
    hasNoOrgs,
  } = useOrg();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const showExpanded = !isCollapsed || isMobile;

  if (isLoading) {
    return (
      <div className={cn("px-3 py-2", !showExpanded && "px-2")}>
        <div
          className={cn(
            "h-10 bg-muted rounded-md animate-pulse",
            !showExpanded && "h-8 w-8 mx-auto",
          )}
        />
      </div>
    );
  }

  const triggerContent = showExpanded ? (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className="w-full justify-between h-auto py-2 px-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-semibold text-primary">
            {selectedOrg?.companyName?.charAt(0)?.toUpperCase() || "?"}
          </span>
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-medium truncate leading-tight">
            {selectedOrg?.companyName || "No organization"}
          </p>
          {selectedOrg?.status && (
            <p className="text-[10px] text-muted-foreground leading-tight">
              {selectedOrg.status === "active" ? "Active" : selectedOrg.status}
            </p>
          )}
        </div>
      </div>
      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
    </Button>
  ) : (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-8 h-8 p-0 mx-auto flex items-center justify-center"
          >
            <span className="text-xs font-semibold">
              {selectedOrg?.companyName?.charAt(0)?.toUpperCase() || "?"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {selectedOrg?.companyName || "No organization"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div
      className={cn(
        "px-3 py-2 border-b border-border",
        !showExpanded && "px-2",
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{triggerContent}</PopoverTrigger>
        <PopoverContent
          className="w-[240px] p-0"
          side={isMobile ? "bottom" : "right"}
          align="start"
          sideOffset={8}
        >
          <Command>
            <CommandInput placeholder="Search organizations..." />
            <CommandList>
              <CommandEmpty>No organization found.</CommandEmpty>

              {companies.length > 0 && (
                <CommandGroup heading="Organizations">
                  {companies.map((company) => (
                    <CommandItem
                      key={company.id}
                      value={company.companyName ?? company.id}
                      onSelect={() => {
                        setSelectedOrg(company.id);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-semibold text-primary">
                            {company.companyName?.charAt(0)?.toUpperCase()}
                          </span>
                        </div>
                        <span className="truncate text-sm">
                          {company.companyName}
                        </span>
                      </div>
                      <Check
                        className={cn(
                          "ml-auto h-4 w-4 flex-shrink-0",
                          selectedOrg?.id === company.id
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {pendingCompanies.length > 0 && (
                <CommandGroup heading="Pending">
                  {pendingCompanies.map((company) => (
                    <CommandItem
                      key={company.id}
                      value={company.companyName ?? company.id}
                      disabled
                      className="opacity-50"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-semibold text-muted-foreground">
                            {company.companyName?.charAt(0)?.toUpperCase()}
                          </span>
                        </div>
                        <span className="truncate text-sm">
                          {company.companyName}
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        className="ml-auto text-[10px] h-5 px-1.5"
                      >
                        <Clock className="w-3 h-3 mr-0.5" />
                        Pending
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              <CommandSeparator />

              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    router.push("/my-company/new");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Organization
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {hasNoOrgs && showExpanded && (
        <Button
          variant="default"
          size="sm"
          className="w-full mt-2"
          onClick={() => router.push("/my-company/new")}
        >
          <Plus className="w-4 h-4 mr-1" />
          Create Organization
        </Button>
      )}
    </div>
  );
}
