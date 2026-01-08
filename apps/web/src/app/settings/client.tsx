"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { setClickerIcon, type ClickerIcon } from "@/actions/set-icon";

const ICONS: { id: ClickerIcon; label: string }[] = [
  { id: "cookie", label: "classique" },
  { id: "cookie-bw", label: "noir & blanc" },
  { id: "cookie-cute", label: "mignon" },
];

interface SettingsClientProps {
  user: {
    id: string;
    name: string;
    image: string | null;
    clickerIcon: ClickerIcon;
  };
}

export function SettingsClient({ user }: SettingsClientProps) {
  const [selectedIcon, setSelectedIcon] = useState<ClickerIcon>(user.clickerIcon);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleIconSelect = async (icon: ClickerIcon) => {
    if (icon === selectedIcon || saving) return;

    setSaving(true);
    setSaved(false);

    const result = await setClickerIcon(icon);

    if (result.success) {
      setSelectedIcon(icon);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }

    setSaving(false);
  };

  return (
    <main className="min-h-screen flex flex-col items-center pt-[10vh] px-6 pb-20">
      <div className="max-w-[500px] w-full flex flex-col gap-8 animate-fade-in">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <Link
            href="/dashboard"
            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
          >
            &larr; retour
          </Link>
          <h1 className="text-[0.85rem] uppercase tracking-widest">settings</h1>
        </header>

        {/* Profile Section */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">
            profil
          </h2>
          <div className="flex items-center gap-4 p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
            {user.image ? (
              <Image
                src={user.image}
                alt="avatar"
                width={48}
                height={48}
                className="rounded-full"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[var(--line)] flex items-center justify-center">
                <span className="text-[var(--text-muted)]">?</span>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-sm">{user.name.toLowerCase()}</span>
              <span className="text-[0.65rem] text-[var(--text-muted)]">
                connecte via discord
              </span>
            </div>
          </div>
        </section>

        {/* Clicker Icon Section */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">
              icone du clicker
            </h2>
            {saved && (
              <span className="text-[0.65rem] text-green-400 animate-fade-in">
                sauvegarde
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {ICONS.map((icon) => (
              <button
                key={icon.id}
                onClick={() => handleIconSelect(icon.id)}
                disabled={saving}
                className={`
                  flex flex-col items-center gap-2 p-4 border transition-all
                  ${selectedIcon === icon.id
                    ? "border-[var(--text)] bg-[rgba(255,255,255,0.05)]"
                    : "border-[var(--line)] hover:border-[var(--text-muted)] bg-[rgba(255,255,255,0.01)]"
                  }
                  ${saving ? "opacity-50 cursor-wait" : ""}
                `}
              >
                <Image
                  src={`/icons/${icon.id}.png`}
                  alt={icon.label}
                  width={48}
                  height={48}
                  className={selectedIcon === icon.id ? "opacity-100" : "opacity-60"}
                />
                <span className="text-[0.6rem] text-[var(--text-muted)]">
                  {icon.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Display Preferences Section */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">
            affichage
          </h2>
          <div className="flex flex-col gap-2">
            <ToggleRow
              label="animations"
              sublabel="effets visuels du clicker"
              defaultChecked={true}
              disabled
            />
            <ToggleRow
              label="sons"
              sublabel="effets sonores"
              defaultChecked={false}
              disabled
            />
          </div>
          <p className="text-[0.55rem] text-[var(--text-muted)] opacity-50">
            options disponibles prochainement
          </p>
        </section>

        {/* Danger Zone */}
        <section className="flex flex-col gap-4 pt-4 border-t border-[var(--line)]">
          <h2 className="text-[0.6rem] uppercase tracking-widest text-red-400/70">
            zone danger
          </h2>
          <button
            disabled
            className="w-full p-3 border border-red-500/20 text-red-400/50 text-sm 
              cursor-not-allowed opacity-50"
          >
            reinitialiser les stats
          </button>
          <p className="text-[0.55rem] text-[var(--text-muted)] opacity-50">
            bientot disponible
          </p>
        </section>

      </div>
    </main>
  );
}

function ToggleRow({
  label,
  sublabel,
  defaultChecked,
  disabled,
}: {
  label: string;
  sublabel: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <div
      className={`
        flex items-center justify-between p-3 border border-[var(--line)] 
        bg-[rgba(255,255,255,0.01)]
        ${disabled ? "opacity-40" : ""}
      `}
    >
      <div className="flex flex-col">
        <span className="text-sm">{label}</span>
        <span className="text-[0.6rem] text-[var(--text-muted)]">{sublabel}</span>
      </div>
      <button
        onClick={() => !disabled && setChecked(!checked)}
        disabled={disabled}
        className={`
          w-10 h-5 rounded-full transition-colors relative
          ${checked ? "bg-green-500/30" : "bg-[var(--line)]"}
          ${disabled ? "cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        <span
          className={`
            absolute top-0.5 w-4 h-4 rounded-full transition-all
            ${checked ? "left-5 bg-green-400" : "left-0.5 bg-[var(--text-muted)]"}
          `}
        />
      </button>
    </div>
  );
}
