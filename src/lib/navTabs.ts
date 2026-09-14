import type { TabItem } from '@/components/BottomTabBar'
import { HomeIcon, BuildingIcon, WrenchIcon, CalendarIcon, UserIcon, ClipboardListIcon, SettingsIcon } from '@/components/icons'

export const LANDLORD_TABS: TabItem[] = [
  { href: '/landlord', label: 'Home', icon: HomeIcon },
  { href: '/landlord/properties', label: 'Properties', icon: BuildingIcon },
  { href: '/landlord/jobs', label: 'Jobs', icon: WrenchIcon },
  { href: '/landlord/calendar', label: 'Calendar', icon: CalendarIcon },
  { href: '/profile', label: 'Profile', icon: UserIcon },
]

export const RENTER_TABS: TabItem[] = [
  { href: '/renter', label: 'Home', icon: HomeIcon },
  { href: '/renter/report', label: 'Report', icon: ClipboardListIcon },
  { href: '/renter/calendar', label: 'Calendar', icon: CalendarIcon },
  { href: '/profile', label: 'Profile', icon: UserIcon },
]

export const CONTRACTOR_TABS: TabItem[] = [
  { href: '/contractor', label: 'Home', icon: HomeIcon },
  { href: '/contractor/calendar', label: 'Calendar', icon: CalendarIcon },
  { href: '/contractor/settings', label: 'Settings', icon: SettingsIcon },
  { href: '/profile', label: 'Profile', icon: UserIcon },
]

export const TABS_BY_ROLE: Record<string, TabItem[]> = {
  landlord: LANDLORD_TABS,
  renter: RENTER_TABS,
  contractor: CONTRACTOR_TABS,
}
