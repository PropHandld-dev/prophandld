import { BuildingIcon, HomeIcon, WrenchIcon } from '@/components/icons'

export type Role = 'landlord' | 'renter' | 'contractor'

const ROLES: { value: Role; label: string; icon: typeof BuildingIcon; desc: string }[] = [
  { value: 'landlord', label: 'Landlord', icon: BuildingIcon, desc: 'I manage properties' },
  { value: 'renter', label: 'Renter', icon: HomeIcon, desc: 'I rent my home' },
  { value: 'contractor', label: 'Contractor', icon: WrenchIcon, desc: 'I do maintenance work' },
]

export function RolePicker({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="space-y-3">
      {ROLES.map(({ value, label, icon: Icon, desc }) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
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
