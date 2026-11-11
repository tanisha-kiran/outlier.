export function signupErrorMessage(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (['user_already_exists', 'email_exists'].includes(code) || /already (registered|exists)/.test(message)) return 'This email is already registered. Please sign in or use Forgot password.';
  if (code === 'weak_password' || message.includes('password should')) return 'This password does not meet the security requirements. Please choose a stronger password.';
  if (code === 'email_address_invalid' || message.includes('invalid email')) return 'Please enter a valid email address.';
  if (error?.status === 429 || code.includes('rate_limit')) return 'Too many requests. Please wait a little while and try again.';
  if (code === 'signup_disabled') return 'Registration is disabled. Please contact an organizer.';
  if (message.includes('database error saving new user')) return 'The database could not create your student profile. If you have already registered this USN, try signing in; otherwise contact an organizer.';
  const reference = /^[a-z0-9_]{1,60}$/.test(code) ? ' (reference: ' + code + ')' : '';
  return 'Could not create the account. Please contact an organizer' + reference + '.';
}
