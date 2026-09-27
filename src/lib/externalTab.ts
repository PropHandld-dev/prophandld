// Every hosted Stripe page this app links out to (Checkout, the Billing
// Portal, Connect onboarding) already has a real return_url/success_url
// bringing the person back into the app when they're done — so the
// straightforward, standard redirect is the whole story: leave, do the
// Stripe thing, land back. A new tab used to be opened instead, on the
// idea that it kept the dashboard exactly where it was — but window.open
// is exactly the kind of call browsers (mobile Safari especially) block or
// treat inconsistently, and a second tab is one more thing to find your
// way back from for no real benefit over the redirect Stripe already
// builds in.
export function goToStripe(url: string) {
  window.location.href = url
}
