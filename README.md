# Commitforce — Gestion documentaire juridique

Plateforme de gestion documentaire juridique pour les cabinets d'avocats. Next.js 14, Supabase, TypeScript, Shadcn/UI, next-intl (FR + AR).

## Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + Shadcn/UI primitives (Warm Artisan palette)
- Supabase (Auth + PostgreSQL + Storage) via `@supabase/ssr`
- next-intl pour FR + AR (RTL)
- TipTap pour l'éditeur de modèles
- @react-pdf/renderer pour l'export PDF des factures

## Démarrage rapide

```bash
npm install
cp .env.example .env.local
# Remplir NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Puis ouvrir http://localhost:3000 (redirige automatiquement vers `/fr`).

## Base de données

Appliquer la migration via le SQL editor Supabase :

```
supabase/migrations/0001_init.sql
```

Ce fichier crée :
- Tables `profiles`, `templates`, `template_variables`, `documents`, `document_activity`, `clients`, `invoices`, `invoice_lines`, `employee_permissions`, `activity_log`
- Enums `user_role`, `document_status`, `invoice_status`, `variable_type`
- RLS policies par rôle (`administrateur` / `avocat` / `employe`)
- Trigger `on_auth_user_created` qui crée automatiquement un profil après inscription

### Créer un premier administrateur

Après votre première inscription, promouvez votre compte via le SQL editor Supabase :

```sql
update public.profiles
set role = 'administrateur'
where user_id = (select id from auth.users where email = 'votre@email.com');
```

### Storage buckets

Créer manuellement dans le dashboard Supabase :
- `template-imports` (privé)
- `invoice-exports` (privé)
- `document-outputs` (privé)

## Modules implémentés (PRD §3)

| # | Module | Statut |
|---|---|---|
| 1 | Authentification & Gestion des utilisateurs | Fonctionnel |
| 2 | Gestion des modèles (TipTap + variables) | Fonctionnel |
| 3 | Génération par IA | UI complète, API stubée (fixture) |
| 4 | Gestion des employés | Fonctionnel (admin-only) |
| 5 | Historique & recherche | Fonctionnel (⌘K + page documents) |
| 6 | Facturation & clients | Fonctionnel + export PDF |
| 7 | Infrastructure & déploiement | Configuration Vercel-ready |

## Design

**Warm Artisan** — palette humaine, non-corporate :
- Charcoal `#2A2A2A`, Sand `#EDE4D3`, Forest `#2E5A3F`, Terracotta `#C86F4E`, Paper `#FBF7EF`
- Fraunces (display, serif) + Geist Sans (body) + Noto Kufi Arabic (RTL)
- Rounded corners à deux échelles (cartes 16px, contrôles 8px)
- Dividers ondulés, fond papier subtil

## i18n

- FR (par défaut) et AR (RTL automatique).
- Fichiers de traduction : `src/messages/{fr,ar}.json`.
- Sélecteur de langue dans la barre du haut.

## Activer l'IA réelle

Quand vous aurez une `ANTHROPIC_API_KEY` :
1. Ajouter la clé dans `.env.local`
2. Installer `@anthropic-ai/sdk` : `npm i @anthropic-ai/sdk`
3. Remplacer le contenu de `src/app/api/ai/generate-template/route.ts` pour appeler l'API Claude et extraire structure + variables du PDF/DOCX reçu.

## Déploiement Vercel

```bash
vercel
```

Variables d'environnement à configurer dans le dashboard Vercel :
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `ANTHROPIC_API_KEY` (optionnel)
