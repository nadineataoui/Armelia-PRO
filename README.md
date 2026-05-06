# Armelia PRO

Plateforme comptable Next.js : espace administrateur + espace client, import PDF/image, extraction OCR, validation, enregistrement en base, export Excel par client.

## Installation

Prérequis : Node.js (LTS recommandé) + npm.

1) Installer les dépendances :

```bash
npm install
```

2) Configurer l’environnement :

- Copier `.env.example` vers `.env`
- Renseigner au minimum :
  - `DATABASE_URL` (SQLite en dev)
  - `NEXTAUTH_SECRET` (secret de session)
  - `ADMIN_EMAIL` / `ADMIN_PASSWORD` (création du premier admin)

3) Initialiser la base :

```bash
npm run db:migrate
npm run db:seed
```

## Lancement

Développement :

```bash
npm run dev
```

Connexion :

- Page : `/login`
- Admin : redirigé vers `/admin`
- Client : redirigé vers `/client`

Production (build puis serveur) :

```bash
npm run build
npm run start
```

## Stack technique

- Next.js (App Router) + React
- Auth : NextAuth (Credentials) + sessions sécurisées
- Base de données : Prisma + SQLite (développement)
- Hashing : bcryptjs (jamais de mot de passe en clair)
- OCR : tesseract.js
- Lecture PDF côté client : pdfjs-dist (worker fourni dans public/)
- Export Excel : xlsx
- TypeScript + Tailwind CSS
