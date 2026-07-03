import React from "react";
import { 
  Sliders, 
  Wallet, 
  Bot, 
  Receipt,
  Settings
} from "lucide-react";

interface BottomNavBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function BottomNavBar({ activeTab, setActiveTab }: BottomNavBarProps) {
  const tabs = [
    { id: "dashboard", label: "MARKETS", icon: Sliders },
    { id: "strategy", label: "FUNDS", icon: Wallet },
    { id: "autotrade", label: "TRADE", icon: Bot, isAccent: true },
    { id: "history", label: "HISTORY", icon: Receipt },
    { id: "settings", label: "SETTINGS", icon: Settings }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E0D5] px-2 py-2 flex justify-center w-full max-w-full shadow-[0_-4px_16px_rgba(0,0,0,0.03)]">
      <nav className="w-full max-w-xl flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center flex-1 py-1 cursor-pointer group transition"
            >
              <div
                className={`w-12 h-8 rounded-xl flex items-center justify-center transition-all duration-200 mb-1 ${
                  isActive
                    ? tab.isAccent
                      ? "bg-[#F8E7C0] text-[#937238] shadow-2xs"
                      : "bg-[#F4F1EA] text-[#937238] shadow-2xs"
                    : "bg-transparent text-[#8C8377] group-hover:text-[#5C5346]"
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? "scale-110 stroke-[2.5]" : "stroke-[2]"}`} />
              </div>
              <span
                className={`font-display text-[10px] tracking-widest uppercase transition-colors ${
                  isActive ? "font-black text-[#2B2721]" : "font-bold text-[#8C8377] group-hover:text-[#5C5346]"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

