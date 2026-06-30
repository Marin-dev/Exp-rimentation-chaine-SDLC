import React, { useState } from "react";
import { Avatar } from "./ui.jsx";

export default function ProfileSwitcher({ profiles, current, onChange }) {
  const [open, setOpen] = useState(false);
  const profile = profiles.find((p) => p.id === current) || profiles[0];

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2.5 bg-base-200 border border-ey-border rounded-full pl-1.5 pr-3 py-1 hover:border-ey-gray02 transition"
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar profile={profile} />
        <span className="text-left leading-tight">
          <b className="block text-[13px]">{profile?.label}</b>
          <span className="text-[10.5px] text-ey-gray01">Changer de profil</span>
        </span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-30 w-72 bg-base-100 border border-ey-border rounded-lg shadow-xl p-1.5">
            <div className="text-[11px] text-ey-gray01 uppercase tracking-wide font-bold px-2.5 pt-2 pb-1">
              Se connecter en tant que
            </div>
            {profiles.map((p) => (
              <button
                key={p.id}
                className={`flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md hover:bg-base-200 ${
                  p.id === current ? "bg-[#fffdf0]" : ""
                }`}
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
              >
                <Avatar profile={p} size={30} />
                <span className="leading-tight">
                  <b className="block text-[13px]">{p.label}</b>
                  <span className="text-[11px] text-ey-gray01">{p.description}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
