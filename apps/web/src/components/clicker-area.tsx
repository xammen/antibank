"use client";

import { useState, type ReactNode } from "react";
import { Clicker, type ClickerIcon } from "@/components/clicker";
import { IconPicker } from "@/components/icon-picker";
import { SignOutButton } from "@/components/sign-out-button";
import { Balance } from "@/components/balance";

interface ClickerAreaProps {
  userId: string;
  userName: string;
  clickValue: number;
  initialIcon: ClickerIcon;
  initialBalance: string;
  voiceStatus: ReactNode;
  stats: ReactNode;
  navigation: ReactNode;
}

export function ClickerArea({ 
  userId, 
  userName,
  clickValue, 
  initialIcon,
  initialBalance,
  voiceStatus,
  stats,
  navigation,
}: ClickerAreaProps) {
  const [icon, setIcon] = useState<ClickerIcon>(initialIcon);

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-green-500/50"></span>
          <h1 className="text-[0.85rem] text-[var(--text-muted)]">
            {userName.toLowerCase()}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <IconPicker currentIcon={icon} onIconChange={setIcon} />
          <SignOutButton />
        </div>
      </header>

      {/* Voice Status */}
      {voiceStatus}

      {/* Main Action Area */}
      <div className="flex flex-col gap-8">
        <Balance initialBalance={initialBalance} />
        <Clicker userId={userId} clickValue={clickValue} icon={icon} />
      </div>

      {/* Stats */}
      {stats}

      {/* Navigation */}
      {navigation}
    </>
  );
}
