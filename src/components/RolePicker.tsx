import { BuildingIcon, HomeIcon, WrenchIcon } from '@/components/icons'

export type Role = 'landlord' | 'renter' | 'contractor'
// Not a new account type at the data layer — a Property Manager is
// still a 'landlord'-role account (see
// scripts/2026-11-12-property-manager.sql's own reasoning for why), but
// it deserves its own card here rather than being buried in the
// Landlord option's description, which nobody reliably reads before
// clicking. 'intent' is purely a UI/onboarding-copy signal the signup
// page uses to show PM-specific copy and redirect somewhere more useful
// than "add your first property" — it's never sent to the server as a
// role.
export type RoleIntent = 'property_manager'

const ROLES: { value: Role; label: string; icon: typeof BuildingIcon; desc: string; intent?: RoleIntent }[] = [
  { value: 'landlord', label: 'Landlord', icon: BuildingIcon, desc: 'I manage my own properties' },
  { value: 'landlord', label: 'Property Manager', icon: BuildingIcon, desc: 'I manage properties for other landlord clients', intent: 'property_manager' },
  { value: 'renter', label: 'Renter', icon: HomeIcon, desc: 'I rent my home' },
  { value: 'contractor', label: 'Contractor', icon: WrenchIcon, desc: 'I do maintenance work' },
]

export function RolePicker({ onSelect }: { onSelect: (role: Role, intent?: RoleIntent) => void }) {
  return (
    <div className="space-y-3">
      {ROLES.map(({ value, label, icon: Icon, desc, intent }) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect(value, intent)}
          className="w-full flex items-center gap-4 bg-white/[0.06] border border-white/10 rounded-xl p-4 text-left hover:border-[#12A5A9]/40 hover:bg-white/[0.09] hover:-translate-y-0.5 transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-[#12A5A9]" />
          </div>
          <div>
            <p className="text-white font-semibold">{label}</p>
            <p className="text-white/60 text-sm">{desc}</p>
          </div>
        </button>
      ))}
    </div>
  )
}
