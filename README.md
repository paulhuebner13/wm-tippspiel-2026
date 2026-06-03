# WM Tippspiel 2026

Mobile-first Next.js + Supabase Tippspiel für Freunde.

## Setup

1. `npm install`
2. `.env.example` zu `.env.local` kopieren und Supabase-Werte eintragen.
3. In Supabase SQL Editor nacheinander ausführen:
   - `supabase/schema.sql`
   - `supabase/seed_teams.sql`
   - `supabase/seed_matches.sql`
4. Passwort-Hash erzeugen:
   - `npm run hash-password -- geheim123`
5. User in Supabase anlegen, zum Beispiel:

```sql
insert into profiles (username, password_hash, is_admin)
values ('Paul', '<HASH_HIER_EINFÜGEN>', true);
```

6. Lokal starten: `npm run dev`

## Wichtig

Die Dateien in `public/flags` sind Platzhalter. Ersetze sie später durch echte SVG-Flaggen mit denselben Dateinamen.
