# Marketing website rollout

- Homepage inspired by the dark product-led composition of hesabpay.af (redirects to hesab.com), with original Nobatak copy and CSS product demo. No third-party assets or tracking were copied.
- Routes: /about /services /pricing /guide /faq /contact /privacy /terms /cookies.
- Plans in lib/marketing.ts are DISPLAY-ONLY samples. No billing, admin privileges or account limits are changed. Future Fahim admin integration is not enabled.
- Contact recipient: fahimullahrasty@gmail.com. WhatsApp: +93780340446.
- To enable real contact-form sending, configure server-only RESEND_API_KEY and CONTACT_FROM_EMAIL (a sender on a domain verified with Resend) on the hosting provider, then redeploy. Do not use NEXT_PUBLIC variables for credentials. Until configured, the form truthfully reports unavailable and shows direct email/WhatsApp alternatives.
- Contact API has same-origin checks, validation, bounded body, honeypot, per-instance throttling, upstream timeout and idempotency on retries. Configure host/WAF shared rate limits before exposing email sending at scale; in-memory throttling is not global across serverless instances. Delivery to the inbox is subject to the email provider, spam filters and recipient availability. Tests mock the provider and do not send mail.
- Cookie notice is informational: existing auth cookies/local storage remain necessary for their features. Acknowledgement persists locally; no fake tracking consent or analytics added.
- Privacy and terms describe the current product; sample commercial plans are clearly labeled. Review copy when introducing billing or changing data practices.
- Docs: https://resend.com/docs/api-reference/emails/send-email ; https://supabase.com/docs/guides/auth/server-side/advanced-guide

Validation: production build and TypeScript passed; targeted ESLint passed without warnings. Mocked contact API tests passed without sending real messages. Browser checks passed for desktop/mobile layout (390px), mobile navigation, cookie dismissal, demo closed/open date switching and demo receipt, pricing layout, correct contact links and honest unavailable-email feedback. Contact service credentials are not configured locally; real delivery was not tested.
