# Nivel21

Extensión de navegador (Chrome y Firefox, Manifest V3) que suma herramientas a
las mesas de [Nivel20](https://nivel20.com). Es parte de **Open20**, la suite de
herramientas para juegos de rol. JavaScript sin build: lo que está en `src/`,
`popup/`, `icons/` y `manifest.json` es lo que se empaqueta (`prepare_zip.sh`).

## Ramas: nunca trabajes en `main`

**Cada push a `main` publica una versión** (ver más abajo): sube la extensión
a la Chrome Web Store y a Firefox Add-ons y la anuncia en Discord. Por eso:

- Todo cambio se hace en una rama propia con nombre según lo que hace
  (`feat/barra-de-mana`, `fix/orden-de-turnos`, …), nunca en `main`.
- No mergees ni pushees a `main` sin que te lo pidan explícitamente. Quien
  mantiene el proyecto decide cuándo entra cada rama.
- Commits a nombre de quien los hace (el `user.name` y `user.email`
  configurados en git), sin trailers ni líneas de atribución
  (`Co-Authored-By` u otros).

## Commits

Todo commit sigue [Conventional Commits](https://www.conventionalcommits.org):
`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `build:`, `ci:`,
`chore:`, `style:`, `revert:`; `!` o un footer `BREAKING CHANGE:` para cambios
que rompen. El tipo decide si hay versión y el asunto **es** la línea de las
notas de la versión, así que:

- `feat:` → **Nuevo**, `perf:` → **Mejora**, `fix:` → **Corrección**. Son los
  únicos tipos que aparecen en las notas y generan versión (patch; un
  breaking change, minor).
- El asunto se escribe en español, para quien usa la extensión, describiendo
  el resultado y no la implementación:
  `fix: los rasgos vuelven a abrir su página en el panel`, no
  `fix: corregir selector en trait-panel.js`.
- Cambios que no ve quien usa la extensión (workflows, scripts, docs, código
  interno) van con `ci:`, `chore:`, `docs:`, `refactor:`… aunque arreglen
  algo: un `fix:` en un workflow aparecería como corrección en la extensión.
- Un commit por cambio visible: cada `feat`/`fix`/`perf` es una línea de las
  notas.

## Release

Lo hacen las acciones compartidas de
[open20-release](https://github.com/open20-rpg/open20-release) (las mismas
reglas y notas que el resto de Open20), en cada push a `main`, con
`.github/workflows/release.yml`:

1. Lee los commits desde el último tag y, si alguno lo ve quien usa la
   extensión, publica una versión: la escribe en `manifest.json` y en el pie
   del popup (`scripts/bump_version.mjs`), commitea
   `chore(release): vX.Y.Z [skip ci]`, crea el tag `vX.Y.Z` y la GitHub
   Release con las notas.
2. El bot de Open20 la anuncia en Discord, avisando que está en camino a las
   tiendas.
3. Arma el zip, lo adjunta a la release (el anuncio suma `github_ready`) y lo
   sube a las dos tiendas.
4. Cuando cada tienda la publica (puede tardar días), un vigilante externo
   lanza `store-status.yml` con el tag (también se puede lanzar a mano), que
   reacciona con el emoji de la tienda (`scripts/store_status.mjs`) y, cuando
   están las dos, quita del anuncio la línea de "en camino".

**No cambies la versión a mano, no crees tags ni releases a mano.** Para
repetir el paso 3 de una versión existente (por ejemplo, si falló una
tienda), se ejecuta el workflow `Release` a mano con su tag.
