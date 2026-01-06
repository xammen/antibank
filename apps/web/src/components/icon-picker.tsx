"use client";

import { useState } from "react";
import Image from "next/image";
import { setClickerIcon, type ClickerIcon } from "@/actions/set-icon";

const ICONS: { id: ClickerIcon; label: string }[] = [
  { id: "cookie", label: "classique" },
  { id: "cookie-bw", label: "noir & blanc" },
  { id: "cookie-cute", label: "mignon" },
];

interface IconPickerProps {
  currentIcon: ClickerIcon;
}

export function IconPicker({ currentIcon }: IconPickerProps) {
  const [selected, setSelected] = useState<ClickerIcon>(currentIcon);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (icon: ClickerIcon) => {
    if (icon === selected) {
      setIsOpen(false);
      return;
    }

    setSaving(true);
    const result = await setClickerIcon(icon);
    
    if (result.success) {
      setSelected(icon);
      // Refresh la page pour voir le changement
      window.location.reload();
    }
    
    setSaving(false);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Bouton pour ouvrir le picker */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 border border-[var(--line)] hover:border-[var(--text-muted)] transition-colors rounded-full"
        title="changer l'icône"
      >
        <Image
          src={`/icons/${selected}.png`}
          alt="icon"
          width={24}
          height={24}
          className="opacity-60 hover:opacity-100 transition-opacity"
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full mt-2 right-0 bg-[var(--bg)] border border-[var(--line)] p-2 z-50 animate-fade-in">
          <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-2 px-2">
            icône
          </p>
          <div className="flex gap-2">
            {ICONS.map((icon) => (
              <button
                key={icon.id}
                onClick={() => handleSelect(icon.id)}
                disabled={saving}
                className={`
                  p-2 border transition-all
                  ${selected === icon.id 
                    ? "border-[var(--text)] bg-[rgba(255,255,255,0.05)]" 
                    : "border-[var(--line)] hover:border-[var(--text-muted)]"
                  }
                  ${saving ? "opacity-50" : ""}
                `}
                title={icon.label}
              >
                <Image
                  src={`/icons/${icon.id}.png`}
                  alt={icon.label}
                  width={32}
                  height={32}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
