type Locale = "fr" | "ar";

const MAP: Record<string, { fr: string; ar: string }> = {
  invalid_credentials: {
    fr: "Email ou mot de passe incorrect.",
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  },
  email_not_confirmed: {
    fr: "Votre email n'a pas encore été confirmé. Vérifiez votre boîte mail.",
    ar: "لم يتم تأكيد بريدك الإلكتروني بعد. يرجى التحقق من صندوق الوارد.",
  },
  user_already_exists: {
    fr: "Un compte existe déjà avec cette adresse email.",
    ar: "يوجد حساب بالفعل بهذا البريد الإلكتروني.",
  },
  weak_password: {
    fr: "Mot de passe trop faible. Utilisez au moins 8 caractères.",
    ar: "كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل.",
  },
  over_email_send_rate_limit: {
    fr: "Trop de tentatives. Réessayez dans quelques minutes.",
    ar: "محاولات كثيرة جدًا. يرجى المحاولة مرة أخرى بعد بضع دقائق.",
  },
  forbidden: {
    fr: "Accès refusé. Cette action est réservée aux administrateurs.",
    ar: "الوصول مرفوض. هذا الإجراء مخصص للمسؤولين فقط.",
  },
  unauthenticated: {
    fr: "Vous devez être connecté pour effectuer cette action.",
    ar: "يجب تسجيل الدخول للقيام بهذا الإجراء.",
  },
  invalid_role: {
    fr: "Rôle invalide.",
    ar: "دور غير صالح.",
  },
  missing_fields: {
    fr: "Veuillez remplir tous les champs obligatoires.",
    ar: "يرجى ملء جميع الحقول المطلوبة.",
  },
  network: {
    fr: "Erreur réseau. Vérifiez votre connexion et réessayez.",
    ar: "خطأ في الشبكة. تحقق من اتصالك وحاول مرة أخرى.",
  },
};

const MESSAGE_MATCHERS: Array<{ match: RegExp; key: keyof typeof MAP }> = [
  { match: /invalid login credentials/i, key: "invalid_credentials" },
  { match: /email not confirmed/i, key: "email_not_confirmed" },
  { match: /user already registered|already been registered/i, key: "user_already_exists" },
  { match: /password should be at least|weak[_ ]password/i, key: "weak_password" },
  { match: /rate limit|too many requests/i, key: "over_email_send_rate_limit" },
];

export function friendlyAuthError(input: unknown, locale: Locale, fallback: string): string {
  const raw =
    typeof input === "string"
      ? input
      : input && typeof input === "object" && "message" in input
        ? String((input as { message: unknown }).message ?? "")
        : "";

  if (raw && MAP[raw]) return MAP[raw][locale];

  for (const { match, key } of MESSAGE_MATCHERS) {
    if (match.test(raw)) return MAP[key][locale];
  }

  return raw || fallback;
}
