import type { TabItem } from '@/components/BottomTabBar'
import { HomeIcon, BuildingIcon, WrenchIcon, CalendarIcon, UserIcon, ClipboardListIcon, SettingsIcon } from '@/components/icons'

export const LANDLORD_TABS: TabItem[] = [
  { href: '/landlord', label: 'Home', labelEs: 'Inicio', icon: HomeIcon },
  { href: '/landlord/properties', label: 'Properties', labelEs: 'Propiedades', icon: BuildingIcon },
  { href: '/landlord/jobs', label: 'Jobs', labelEs: 'Trabajos', icon: WrenchIcon },
  { href: '/landlord/calendar', label: 'Calendar', labelEs: 'Calendario', icon: CalendarIcon },
  { href: '/profile', label: 'Profile', labelEs: 'Perfil', icon: UserIcon },
]

export const RENTER_TABS: TabItem[] = [
  { href: '/renter', label: 'Home', labelEs: 'Inicio', icon: HomeIcon },
  { href: '/renter/report', label: 'Report', labelEs: 'Reportar', icon: ClipboardListIcon },
  { href: '/renter/calendar', label: 'Calendar', labelEs: 'Calendario', icon: CalendarIcon },
  { href: '/profile', label: 'Profile', labelEs: 'Perfil', icon: UserIcon },
]

export const CONTRACTOR_TABS: TabItem[] = [
  { href: '/contractor', label: 'Home', labelEs: 'Inicio', icon: HomeIcon },
  { href: '/contractor/calendar', label: 'Calendar', labelEs: 'Calendario', icon: CalendarIcon },
  { href: '/contractor/settings', label: 'Settings', labelEs: 'Ajustes', icon: SettingsIcon },
  { href: '/profile', label: 'Profile', labelEs: 'Perfil', icon: UserIcon },
]

export const TABS_BY_ROLE: Record<string, TabItem[]> = {
  landlord: LANDLORD_TABS,
  renter: RENTER_TABS,
  contractor: CONTRACTOR_TABS,
}
