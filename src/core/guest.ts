// Guest accounts let people start without signing up. They get a placeholder email
// (.invalid can never receive mail) and no password until they save the account.
const DOMAIN = '@guest.curio.invalid';

export const guestEmail = () => `${crypto.randomUUID()}${DOMAIN}`;
export const isGuest = (email: string) => email.endsWith(DOMAIN);
