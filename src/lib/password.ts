import bcrypt from "bcryptjs";
import crypto from "crypto";

export const hashPassword = async (plain: string) => {
  return await bcrypt.hash(plain, 12);
};

export const verifyPassword = async (plain: string, hash: string) => {
  return await bcrypt.compare(plain, hash);
};

export const validateNewPassword = (plain: string) => {
  const value = (plain || "").trim();
  if (value.length < 8) return { ok: false as const, message: "Le nouveau mot de passe doit faire au moins 8 caractères." };
  if (!/\d/.test(value)) return { ok: false as const, message: "Le nouveau mot de passe doit contenir au moins 1 chiffre." };
  return { ok: true as const };
};

export const generateTempPassword = () => {
  const raw = crypto.randomBytes(12).toString("base64url");
  const suffix = String(crypto.randomInt(100, 1000));
  return `${raw}${suffix}`.slice(0, 16);
};
