export type PublicAuthPolicy = {
  signupEmailEnabled: boolean;
  signupWhatsappEnabled: boolean;
  loginEmailEnabled: boolean;
  loginWhatsappEnabled: boolean;
  passwordResetEmailEnabled: boolean;
  passwordResetWhatsappEnabled: boolean;
  invitationEmailEnabled: boolean;
  invitationWhatsappEnabled: boolean;
};

export const DEFAULT_PUBLIC_AUTH_POLICY: PublicAuthPolicy = {
  signupEmailEnabled: false,
  signupWhatsappEnabled: true,
  loginEmailEnabled: false,
  loginWhatsappEnabled: true,
  passwordResetEmailEnabled: false,
  passwordResetWhatsappEnabled: true,
  invitationEmailEnabled: false,
  invitationWhatsappEnabled: true,
};
