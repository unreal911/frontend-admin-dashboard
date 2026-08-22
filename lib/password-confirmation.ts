export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (!confirmation) {
    return 'Repite la contrasena.';
  }
  if (password !== confirmation) {
    return 'Las contrasenas no coinciden.';
  }
  return null;
}
