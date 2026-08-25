# Cumuloscope — Le cumul des mandats sous la Ve République (1958–2026)

Site statique hébergé sur GitHub Pages. Données officielles, agrégats anonymisés, pédagogie sobre.

**Live:** https://wald52.github.io/cumuloscope/

## Données officielles (Licence Ouverte 2.0)

- **RNE** — Répertoire National des Élus (Ministère de l'Intérieur, 11/08/2026, 12 CSV) — `data.gouv.fr/datasets/5c34c4d1634f4173183a64f1`
- **data.assemblee-nationale.fr** (AMO historique XIe–XVIIe) + **data.senat.fr** (ODSEN_* 1959–2026)
- **HATVP** — `hatvp.fr/open-data/` (liste.csv + declarations.xml via id_origine)

Traitement build-time : `scripts/preprocess.mjs` télécharge, normalise `UPPER(nom+prenom+date_naissance)` , calcule `cumul large (≥2 types)` vs `interdit loi 2014 (parlementaire + exécutif)` , agrège par département avec **k-anonymat ≥5** .

- **National 2026:** 511 297 élus uniques, 13.6% cumul large (69 483), 0.1% interdit 2014 (406)
- **Couverture:** 1997–2026 exhaustif, 1958–1996 partiel (parlementaire seul)

## Fonctionnalités

- Carte choroplèthe départements (Leaflet) 100% anonyme, timeline 1958–2026 (Chart.js), recherche code postal/département, classement anonyme, simulateur compatibilité, fiches département anonyme + détail nominatif **100% client-side après consentement** (option B, noindex).
- **Gamification sobre:** quiz quotidien 3 QCM (localStorage streak + 6 badges), générateur carte à partager (Canvas, anonyme), défi code postal.

## Stack

Astro 5 + Tailwind 4 + Leaflet + Chart.js — 100% statique, `npm run build` → `dist/` — GitHub Actions cron trimestriel (01/01,01/04,01/07,01/10).

## Développement

```sh
npm i
npm run data:build   # génère public/data/*.json + by-dept/*.json
npm run dev          # http://localhost:4321/cumuloscope/
npm run build        # production
npm run preview
```

## Méthodologie & mentions

Voir `/methodologie` : sources, définitions large vs loi 2014, k-anonymat, limites Ve complète, RGPD, rectification via préfecture.

## Licence

Code MIT, données Licence Ouverte 2.0 Etalab.
