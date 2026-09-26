'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type Lang = 'en' | 'es'

// Reads the real, already-saved preference (Profile → Preferred language)
// instead of showing both languages at once — a genuine switch, not the
// dual-display fallback used before there was a real preference to read.
// Starts 'en' and updates once the account loads, same tradeoff every
// other per-viewer personalization in this app already makes.
export function useLanguage(): Lang {
  const [lang, setLang] = useState<Lang>('en')
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      if (user?.user_metadata?.preferred_language === 'es') setLang('es')
    })
    return () => {
      cancelled = true
    }
  }, [])
  return lang
}

// One dictionary, one key per translated string, grouped loosely by where
// it's used. Add a key here and call t(key, lang) rather than hand-rolling
// another bilingual line — keeps every translation reviewable in one file
// instead of scattered through JSX.
const STRINGS = {
  // Common
  loading: { en: 'Loading...', es: 'Cargando...' },
  save: { en: 'Save', es: 'Guardar' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  remove: { en: 'Remove', es: 'Quitar' },
  viewAll: { en: 'View all', es: 'Ver todo' },
  dashboard: { en: '← Dashboard', es: '← Panel principal' },

  // Report an issue (renter)
  reportTitle: { en: 'Report an issue', es: 'Reportar un problema' },
  reportSubtitle: {
    en: "Let your landlord know what's going on. Add photos or a short video if you can, it helps get the right contractor.",
    es: 'Avísale a tu propietario lo que está pasando. Agrega fotos o un video corto si puedes, ayuda a conseguir al contratista correcto.',
  },
  category: { en: 'Category', es: 'Categoría' },
  description: { en: 'Description', es: 'Descripción' },
  descriptionPlaceholder: { en: "What's going on? Be as specific as you can.", es: '¿Qué está pasando? Sea lo más específico posible.' },
  thisIsEmergency: { en: 'This is an emergency', es: 'Esto es una emergencia' },
  emergencyExplain: {
    en: 'Only use this for issues that need attention right away: active leaks, gas smells, no heat, broken locks.',
    es: 'Use esto solo para problemas urgentes: fugas de agua, olor a gas, sin calefacción, cerraduras rotas.',
  },
  markAsEmergency: { en: 'Mark as emergency', es: 'Marcar como emergencia' },
  marked: { en: 'Marked ✓', es: 'Marcado ✓' },
  submitReport: { en: 'Submit report', es: 'Enviar reporte' },
  submitting: { en: 'Submitting...', es: 'Enviando...' },

  // Landlord dashboard
  landlordDashboardLabel: { en: 'Landlord Dashboard', es: 'Panel del propietario' },
  welcomeBack: { en: 'Welcome back,', es: 'Bienvenido de nuevo,' },
  portfolioStateNow: { en: "Here's the state of your portfolio right now.", es: 'Este es el estado actual de tu portafolio.' },
  rentActivity: { en: 'Rent activity', es: 'Actividad de renta' },
  clear: { en: 'Clear', es: 'Borrar' },
  processing: { en: 'Processing', es: 'Procesando' },
  received: { en: 'Received', es: 'Recibido' },
  properties: { en: 'Properties', es: 'Propiedades' },
  totalUnits: { en: 'Total units', es: 'Unidades totales' },
  occupiedVacant: { en: 'Occupied ·', es: 'Ocupadas ·' },
  vacant: { en: 'vacant', es: 'vacantes' },
  monthlyRentRoll: { en: 'Monthly rent roll', es: 'Renta mensual total' },
  needsAction: { en: 'Needs action', es: 'Requiere acción' },
  inProgress: { en: 'In progress', es: 'En progreso' },
  bidsToReview: { en: 'Bids to review', es: 'Ofertas por revisar' },
  yourProperties: { en: 'Your properties', es: 'Tus propiedades' },
  noPropertiesYet: { en: 'No properties yet', es: 'Aún no hay propiedades' },
  addFirstPropertyDesc: { en: 'Add your first property to start building your portfolio.', es: 'Agrega tu primera propiedad para empezar a construir tu portafolio.' },
  addProperty: { en: 'Add property', es: 'Agregar propiedad' },
  occupied: { en: 'occupied', es: 'ocupadas' },
  quickActions: { en: 'Quick actions', es: 'Acciones rápidas' },
  propertiesCardDesc: { en: 'Manage your properties and units', es: 'Administra tus propiedades y unidades' },
  addPropertyCardTitle: { en: 'Add a property', es: 'Agregar una propiedad' },
  addPropertyCardDesc: { en: 'Start tracking a new address', es: 'Empieza a registrar una nueva dirección' },
  viewJobsCardTitle: { en: 'View jobs', es: 'Ver trabajos' },
  viewJobsCardDesc: { en: 'See all maintenance requests', es: 'Ver todas las solicitudes de mantenimiento' },
  rentRollCardTitle: { en: 'Rent roll', es: 'Registro de renta' },
  rentRollCardDesc: { en: 'Every unit, every month, at a glance', es: 'Cada unidad, cada mes, de un vistazo' },
  documentsCardTitle: { en: 'Documents', es: 'Documentos' },
  documentsCardDesc: { en: 'Open a property to upload and manage its documents', es: 'Abre una propiedad para subir y administrar sus documentos' },
  complianceCardTitle: { en: 'Compliance tracking', es: 'Seguimiento de cumplimiento' },
  complianceCardDesc: { en: 'Open a property to manage compliance items', es: 'Abre una propiedad para administrar los elementos de cumplimiento' },

  // Alert badges (shared across dashboards)
  badgeNew: { en: 'New', es: 'Nuevo' },
  badgeStartBidding: { en: 'Start bidding', es: 'Iniciar ofertas' },
  badgePriceChange: { en: 'Price change', es: 'Cambio de precio' },
  badgeReviewTime: { en: 'Review time', es: 'Revisar horario' },
  badgeConfirmed: { en: 'Confirmed', es: 'Confirmado' },
  badgeReview: { en: 'Review', es: 'Revisar' },
  badgeExpired: { en: 'Expired', es: 'Vencido' },
  badgeExpiringSoon: { en: 'Expiring soon', es: 'Vence pronto' },
  badgeBehind: { en: 'Behind', es: 'Atrasado' },
  badgeRateContractor: { en: 'Rate contractor', es: 'Calificar contratista' },
  badgeInvitePending: { en: 'Invite pending', es: 'Invitación pendiente' },
  badgePickATime: { en: 'Pick a time', es: 'Elegir un horario' },
  badgeRespond: { en: 'Respond', es: 'Responder' },
  badgeStartJob: { en: 'Start job', es: 'Iniciar trabajo' },
  badgeSelected: { en: 'Selected', es: 'Seleccionado' },
  badgeNotSelected: { en: 'Not selected', es: 'No seleccionado' },
  badgePending: { en: 'Pending', es: 'Pendiente' },
  badgeProposeATime: { en: 'Propose a time', es: 'Proponer un horario' },
  landlordAskedVerification: { en: 'Landlord asked for verification', es: 'El propietario pidió verificación' },

  // Renter dashboard
  renterDashboardLabel: { en: 'Renter Dashboard', es: 'Panel del inquilino' },
  hi: { en: 'Hi,', es: 'Hola,' },
  renterDashboardSubtitle: {
    en: 'Report issues, pay rent, and reach your landlord directly, all in one place.',
    es: 'Reporta problemas, paga la renta y comunícate con tu propietario, todo en un solo lugar.',
  },
  yourHome: { en: 'Your home', es: 'Tu vivienda' },
  documentsTitle: { en: 'Documents', es: 'Documentos' },
  documentsDescRenter: { en: 'Your lease and related paperwork', es: 'Tu contrato de arrendamiento y otros documentos' },
  payRent: { en: 'Pay rent', es: 'Pagar renta' },
  payRentDesc: { en: 'Secure online rent payments, right from your dashboard. No more checks or cash.', es: 'Pagos de renta en línea y seguros, directamente desde tu panel. Sin cheques ni efectivo.' },
  reportAnIssueDesc: { en: 'Something broken? Let your landlord know.', es: '¿Algo dañado? Avísale a tu propietario.' },
  reportNow: { en: 'Report now', es: 'Reportar ahora' },
  yourIssues: { en: 'Your issues', es: 'Tus reportes' },
  noOpenIssues: { en: "No open issues. You're all good!", es: 'No hay reportes abiertos. ¡Todo está bien!' },
  emergency: { en: 'Emergency', es: 'Emergencia' },
  emergencyContacts: { en: 'Emergency contacts', es: 'Contactos de emergencia' },
  noUnitLinked: { en: 'No unit linked to your account yet.', es: 'Aún no hay una unidad vinculada a tu cuenta.' },
  noContactsAdded: { en: 'No emergency contacts added for your unit yet.', es: 'Aún no hay contactos de emergencia para tu unidad.' },
  ifLandlordDoesntAnswer: { en: "If your landlord doesn't answer", es: 'Si tu propietario no responde' },
  theirBackupContact: { en: 'Their backup contact', es: 'Su contacto de respaldo' },
  statusLandlordFinding: { en: 'Landlord is finding a contractor', es: 'El propietario está buscando un contratista' },
  statusScheduled: { en: 'Scheduled', es: 'Programado' },
  statusWorkInProgress: { en: 'Work in progress', es: 'Trabajo en progreso' },
  statusWorkCompleteWaiting: { en: 'Work complete, waiting on landlord', es: 'Trabajo terminado, esperando al propietario' },
  newTimeProposedByYou: { en: 'New time proposed by you', es: 'Nuevo horario propuesto por ti' },
  newTimeProposedByOther: { en: 'New time proposed by the other side', es: 'Nuevo horario propuesto por la otra parte' },
  pickATimeAlert: { en: 'Your landlord wants you to pick a time', es: 'Tu propietario quiere que elijas un horario' },
  newTimeProposedAlert: { en: 'New time proposed', es: 'Nuevo horario propuesto' },

  // Contractor dashboard
  contractorDashboardLabel: { en: 'Contractor Dashboard', es: 'Panel del contratista' },
  welcomeComma: { en: 'Welcome,', es: 'Bienvenido,' },
  contractorDashboardSubtitle: { en: 'Find jobs and manage your bids.', es: 'Encuentra trabajos y administra tus ofertas.' },
  setUpServiceProfile: { en: 'Set up your service profile', es: 'Configura tu perfil de servicio' },
  setUpServiceProfileDesc: {
    en: 'Tell us what you do and where, so we can start matching you to jobs.',
    es: 'Dinos qué haces y dónde, para empezar a conectarte con trabajos.',
  },
  setUpNow: { en: 'Set up now', es: 'Configurar ahora' },
  newJobs: { en: 'New Jobs', es: 'Nuevos trabajos' },
  active: { en: 'Active', es: 'Activos' },
  earnings: { en: 'Earnings', es: 'Ganancias' },
  awaitingPayment: { en: 'awaiting payment', es: 'pendiente de pago' },
  payouts: { en: 'Payouts', es: 'Pagos' },
  verification: { en: 'Verification', es: 'Verificación' },
  payoutsActiveStatus: { en: 'Active', es: 'Activo' },
  finishSetup: { en: 'Finish setup', es: 'Terminar configuración' },
  setUpPayouts: { en: 'Set up payouts', es: 'Configurar pagos' },
  verifiedStatus: { en: 'Verified ✓', es: 'Verificado ✓' },
  underReview: { en: 'Under review', es: 'En revisión' },
  unlicensedStatus: { en: 'Unlicensed', es: 'Sin licencia' },
  getVerified: { en: 'Get verified', es: 'Verificarse' },
  upcoming: { en: 'Upcoming', es: 'Próximos' },
  availableJobsNearYou: { en: 'Available jobs near you', es: 'Trabajos disponibles cerca de ti' },
  noJobsAvailable: { en: 'No jobs available right now. Check back soon.', es: 'No hay trabajos disponibles por ahora. Vuelve pronto.' },
  yourBids: { en: 'Your bids', es: 'Tus ofertas' },
  noBidsYet: { en: "You haven't submitted any bids yet.", es: 'Aún no has enviado ninguna oferta.' },
  yourBidAmount: { en: 'Your bid:', es: 'Tu oferta:' },
  selectedAt: { en: 'Selected', es: 'Seleccionado' },
  scheduleConfirmedShort: { en: '✓ Schedule confirmed', es: '✓ Horario confirmado' },
  newTimeProposedShort: { en: 'New time proposed', es: 'Nuevo horario propuesto' },
  awaitingYourResponse: { en: ', awaiting your response', es: ', esperando tu respuesta' },
  pastJobs: { en: 'Past jobs', es: 'Trabajos anteriores' },
  filterAll: { en: 'All', es: 'Todos' },
  filterCompleted: { en: 'Completed', es: 'Completados' },
  filterArchived: { en: 'Archived', es: 'Archivados' },
  noPastJobsView: { en: 'No past jobs in this view.', es: 'No hay trabajos anteriores en esta vista.' },
  viewEarningsLink: { en: 'View earnings, receipts & tax history →', es: 'Ver ganancias, recibos e historial fiscal →' },

  // Profile
  profileSettings: { en: 'Profile settings', es: 'Configuración del perfil' },
  backToDashboard: { en: '← Back to dashboard', es: '← Volver al panel' },
  personalInformation: { en: 'Personal information', es: 'Información personal' },
  fullName: { en: 'Full name', es: 'Nombre completo' },
  email: { en: 'Email', es: 'Correo electrónico' },
  emailCannotChange: { en: 'Email cannot be changed', es: 'El correo electrónico no se puede cambiar' },
  phone: { en: 'Phone', es: 'Teléfono' },
  language: { en: 'Language / Idioma', es: 'Idioma / Language' },
  languageHelp: { en: "Switches the app's language after you save. Save cambia el idioma de la app.", es: "Switches the app's language after you save. Save cambia el idioma de la app." },
  saveChanges: { en: 'Save changes', es: 'Guardar cambios' },
  saving: { en: 'Saving...', es: 'Guardando...' },
  changePassword: { en: 'Change password', es: 'Cambiar contraseña' },
  forgotYourPassword: { en: 'Forgot your password?', es: '¿Olvidaste tu contraseña?' },
  currentPassword: { en: 'Current password', es: 'Contraseña actual' },
  currentPasswordPlaceholder: { en: 'Your current password', es: 'Tu contraseña actual' },
  newPassword: { en: 'New password', es: 'Nueva contraseña' },
  newPasswordPlaceholder: { en: 'Min. 8 characters', es: 'Mín. 8 caracteres' },
  confirmNewPassword: { en: 'Confirm new password', es: 'Confirmar nueva contraseña' },
  confirmNewPasswordPlaceholder: { en: 'Re-enter new password', es: 'Vuelve a escribir la nueva contraseña' },
  updatePassword: { en: 'Update password', es: 'Actualizar contraseña' },
  updating: { en: 'Updating...', es: 'Actualizando...' },
  notificationPreferences: { en: 'Notification preferences', es: 'Preferencias de notificación' },
  notifPrefDesc: { en: 'Choose how you want to be notified', es: 'Elige cómo quieres recibir notificaciones' },
  emailNotifications: { en: 'Email notifications', es: 'Notificaciones por correo' },
  emailNotifDesc: { en: 'Job updates and status changes', es: 'Actualizaciones de trabajos y cambios de estado' },
  alwaysOn: { en: 'Always on', es: 'Siempre activo' },
  pushNotifications: { en: 'Push notifications', es: 'Notificaciones push' },
  pushNotifDesc: { en: 'Enable from the banner on your dashboard', es: 'Actívalas desde el aviso en tu panel' },
  textAlerts: { en: 'Text alerts', es: 'Alertas por mensaje de texto' },
  textAlertsDesc: { en: 'Urgent updates only: emergencies, scheduling, review needed', es: 'Solo actualizaciones urgentes: emergencias, horarios, revisiones pendientes' },
  backupContact: { en: 'Backup contact', es: 'Contacto de respaldo' },
  backupContactDescLandlord: { en: "A family member or friend your tenant can reach if you don't answer.", es: 'Un familiar o amigo al que tu inquilino pueda contactar si no respondes.' },
  backupContactDescRenter: { en: "A family member or friend your landlord can reach if you don't answer.", es: 'Un familiar o amigo al que tu propietario pueda contactar si no respondes.' },
  name: { en: 'Name', es: 'Nombre' },
  relationshipPlaceholder: { en: 'Relationship (e.g. spouse)', es: 'Parentesco (ej. cónyuge)' },
  phoneNumberPlaceholder: { en: 'Phone number', es: 'Número de teléfono' },
  addBackupContact: { en: 'Add backup contact', es: 'Agregar contacto de respaldo' },
  adding: { en: 'Adding…', es: 'Agregando…' },
  takeTheTour: { en: 'Take the tour', es: 'Hacer el recorrido' },
  takeTheTourDesc: { en: 'Replay the quick walkthrough of your dashboard.', es: 'Vuelve a ver el recorrido rápido de tu panel.' },
  deleteAccount: { en: 'Delete account', es: 'Eliminar cuenta' },
  deleteAccountDesc: { en: 'Permanently delete your account and all associated data. This cannot be undone.', es: 'Elimina tu cuenta y todos los datos asociados de forma permanente. Esto no se puede deshacer.' },
  typeToConfirmPrefix: { en: 'Type', es: 'Escribe' },
  typeToConfirmSuffix: { en: 'to confirm.', es: 'para confirmar.' },
  permanentlyDeleteMyAccount: { en: 'Permanently delete my account', es: 'Eliminar mi cuenta permanentemente' },
  deleting: { en: 'Deleting…', es: 'Eliminando…' },
  signOut: { en: 'Sign out', es: 'Cerrar sesión' },
  passwordUpdatedToast: { en: 'Password updated', es: 'Contraseña actualizada' },

  // Calendar (shared)
  calendarTitle: { en: 'Calendar', es: 'Calendario' },
  landlordCalendarSubtitle: {
    en: 'Confirmed times, times waiting for a reply, finished jobs, and reminders — rent due, compliance items expiring, leases ending — across your portfolio.',
    es: 'Horarios confirmados, horarios esperando respuesta, trabajos terminados y recordatorios — renta pendiente, elementos de cumplimiento por vencer, contratos por terminar — en todo tu portafolio.',
  },
  renterCalendarSubtitle: { en: 'Confirmed appointments for your home.', es: 'Citas confirmadas para tu vivienda.' },
  contractorCalendarSubtitle: { en: "Confirmed times, times waiting for a reply, and the jobs you've finished.", es: 'Horarios confirmados, horarios esperando respuesta y los trabajos que has terminado.' },
  today: { en: 'Today', es: 'Hoy' },
  confirmedState: { en: 'Confirmed', es: 'Confirmado' },
  waitingForConfirmation: { en: 'Waiting for confirmation', es: 'Esperando confirmación' },
  reminderState: { en: 'Reminder', es: 'Recordatorio' },
  doneState: { en: 'Done', es: 'Terminado' },
  hideCompleted: { en: 'Hide completed', es: 'Ocultar terminados' },
  showCompleted: { en: 'Show completed', es: 'Mostrar terminados' },
  nothingScheduledMonth: { en: 'Nothing scheduled this month.', es: 'Nada programado este mes.' },
  nothingScheduledYet: { en: 'Nothing scheduled yet.', es: 'Aún no hay nada programado.' },
  monthAtAGlance: { en: 'at a glance', es: 'de un vistazo' },
  waitingBadge: { en: 'Waiting', es: 'Esperando' },
  more: { en: 'more', es: 'más' },
  needsYourAttention: { en: 'Needs your attention', es: 'Requiere tu atención' },
  showLess: { en: 'Show less', es: 'Mostrar menos' },
  showAll: { en: 'Show all', es: 'Mostrar todo' },
  turnOnNotifications: { en: 'Turn on notifications', es: 'Activar notificaciones' },
  turnOnNotificationsDesc: { en: 'Get alerted the moment something needs your attention.', es: 'Recibe una alerta en el momento en que algo requiera tu atención.' },
  iosNotificationsDesc: {
    en: 'iPhone/iPad only support notifications for apps added to your Home Screen. Tap Share → "Add to Home Screen", then open Prophandld from there to turn them on.',
    es: 'iPhone/iPad solo admiten notificaciones para apps agregadas a tu pantalla de inicio. Toca Compartir → "Agregar a pantalla de inicio" y abre Prophandld desde ahí para activarlas.',
  },
  notNow: { en: 'Not now', es: 'Ahora no' },
  enabling: { en: 'Enabling...', es: 'Activando...' },
  enable: { en: 'Enable', es: 'Activar' },
  windowMorning: { en: 'Morning (8am–12pm)', es: 'Mañana (8am–12pm)' },
  windowAfternoon: { en: 'Afternoon (12pm–5pm)', es: 'Tarde (12pm–5pm)' },
  windowEvening: { en: 'Evening (5pm–8pm)', es: 'Noche (5pm–8pm)' },
} satisfies Record<string, Record<Lang, string>>

// The three schedule windows (`morning`/`afternoon`/`evening`) show up
// wherever a proposed or confirmed time does — dashboards, calendars, the
// schedule modals. One lookup here instead of a hardcoded label map per
// call site, so the same window always reads the same way in both languages.
export function windowLabel(value: string | undefined, lang: Lang): string {
  if (value === 'morning') return t('windowMorning', lang)
  if (value === 'afternoon') return t('windowAfternoon', lang)
  if (value === 'evening') return t('windowEvening', lang)
  return value || ''
}

export function t(key: keyof typeof STRINGS, lang: Lang): string {
  return STRINGS[key][lang]
}

export const WEEKDAY_LABELS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const MONTH_LABELS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
