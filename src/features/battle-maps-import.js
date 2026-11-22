(async () => {
  try {
    /* =======================
       Feature: Battle Maps Import
    ======================= */

    /**
     * Loads a map exported by Open20 Battle Maps (`.n21map`) as the scene:
     * its background as the board map with its grid, its objects as locked
     * tokens with their name hidden and no border, and its walls as fog of
     * war walls (doors and windows as their own walls, to open them by
     * removing just that one). Then it saves the scene in Nivel20.
     *
     * Everything goes through Nivel20's own tabletop (window.addAssetToTabletop,
     * window.tokens, window.fogOfWar) and its own asset forms, as the DM
     * would do by hand.
     */

    const { loadManagers } = window._n21_;
    const format = window._n21_.battleMaps;

    const [MainMenuUIManager, PlayerManager, TokenManager, MapManager, SettingsManager] =
      await loadManagers(
        "MainMenuUIManager",
        "PlayerManager",
        "TokenManager",
        "MapManager",
        "SettingsManager",
      );

    if (!SettingsManager.get("feature.battle-maps-import.enabled")) return;

    const MENU_ITEM_ID = "n21-battle-maps-import";
    const TITLE = "Importar mapa de Battle Maps";
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // ---- dialogs ------------------------------------------------------------

    const swal = () => (typeof window.Swal?.fire === "function" ? window.Swal : null);

    async function confirmClear(data) {
      const text =
        `Se va a vaciar la escena actual: se borran todos los tokens, el mapa y los muros, ` +
        `y se carga «${data.name}» (${data.tokens.length} tokens, ${data.walls.length} muros).`;
      const s = swal();
      if (!s) return window.confirm(`${text}\n\n¿Continuar?`);
      const r = await s.fire({
        title: TITLE,
        text,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Vaciar e importar",
        cancelButtonText: "Cancelar",
        reverseButtons: true,
      });
      return !!r.isConfirmed;
    }

    function progress(message) {
      const s = swal();
      if (!s) return console.info(`N21 Battle Maps: ${message}`);
      if (!s.isVisible() || !document.querySelector(".n21-bm-progress")) {
        s.fire({
          title: TITLE,
          html: `<div class="n21-bm-progress"></div>`,
          allowOutsideClick: false,
          showConfirmButton: false,
          didOpen: () => s.showLoading(),
        });
      }
      const el = document.querySelector(".n21-bm-progress");
      if (el) el.textContent = message;
    }

    function finish(message, warnings = []) {
      const s = swal();
      const text = [message, ...warnings].join("\n\n");
      if (!s) return window.alert(text);
      s.fire({ title: TITLE, text, icon: warnings.length ? "warning" : "success" });
    }

    function fail(error) {
      console.error("N21 Battle Maps:", error);
      const s = swal();
      const text = `No se pudo importar el mapa: ${error?.message || error}`;
      if (!s) return window.alert(text);
      s.fire({ title: TITLE, text, icon: "error" });
    }

    function pickFile() {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".n21map,application/json";
        input.addEventListener("change", () => resolve(input.files?.[0] || null), { once: true });
        input.click();
      });
    }

    // ---- Nivel20's asset forms ---------------------------------------------

    function csrfToken() {
      return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
    }

    /**
     * Create a tabletop asset (map or token) with Nivel20's own form: its
     * action and hidden fields (token, type…), with ours on top. Fields of a
     * previous edit (id, images, tags, folders) are dropped: this always
     * creates a new asset.
     */
    async function createAsset(type, fields, image) {
      const form = document.querySelector(`#${type}-form-modal form`);
      if (!form) throw new Error(`no está el formulario de ${type} (¿sos el DM de esta mesa?)`);
      const fd = new FormData(form);
      for (const key of [...fd.keys()]) {
        if (
          key === "_method" ||
          /^tabletop_asset\[(id|main_image_id|main_image\]\[image|selected_tag_ids|selected_folder_ids|scene_data|referenced_image_ids)/.test(
            key,
          )
        )
          fd.delete(key);
      }
      for (const [k, v] of Object.entries(fields)) fd.set(`tabletop_asset[${k}]`, String(v));
      fd.set("tabletop_asset[main_image][image]", image.blob, image.name);
      if (!fd.get("authenticity_token")) fd.set("authenticity_token", csrfToken());
      const action = form.getAttribute("action") || "/tabletop_assets";
      const url = /\.json(\?|$)/.test(action) ? action : `${action}.json`;
      const res = await fetch(url, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
        headers: { Accept: "application/json", "X-CSRF-Token": csrfToken() },
      });
      let json = null;
      try {
        json = await res.json();
      } catch (_) {}
      if (!res.ok || !json?.images?.main?.id) {
        const reason = json?.errors || json?.error || `HTTP ${res.status}`;
        throw new Error(`Nivel20 no aceptó el recurso «${fields.name}»: ${JSON.stringify(reason)}`);
      }
      return json;
    }

    const absolute = (url) => (url?.startsWith("/") ? `${window.location.origin}${url}` : url);

    /**
     * A token schema like the one Nivel20 builds from a token asset, with no
     * border and no round cut-out (alpha mask), the name hidden, unlocked
     * until it's in place, and a marker to find it once it exists.
     */
    function tokenSchema(asset, scale, marker) {
      return {
        name: asset.name,
        nameHidden: true,
        invisible: false,
        imageId: asset.images.main.id,
        imageUrl: absolute(asset.images.main.url.medium || asset.images.main.url.original),
        locked: false,
        scale,
        fogTeams: [asset.team || "characters"],
        fogLightRadius: 0,
        fogLightAngle: 360,
        hidesInFog: false,
        metadata: JSON.stringify({ ...asset, scale, n21Import: marker }),
        imageScale: 1,
        borderColor: null,
        borderImageUrl: "none",
        backgroundColor: null,
        imageMaskType: "alpha",
      };
    }

    function markerOf(networkId) {
      try {
        return JSON.parse(TokenManager.getTokenSchema(networkId)?.metadata || "{}").n21Import || null;
      } catch (_) {
        return null;
      }
    }

    /** Wait until `test()` is truthy (polling), or give up after `ms`. */
    async function waitFor(test, ms = 15000, every = 150) {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const v = test();
        if (v) return v;
        await sleep(every);
      }
      return null;
    }

    // ---- the import ---------------------------------------------------------

    async function clearScene() {
      for (const networkId of TokenManager.getAllTokenIds()) window.tokens.delete({ networkId });
      window.fogOfWar.restoreWalls([]);
      await waitFor(() => TokenManager.getAllTokenIds().length === 0, 10000);
    }

    /** Put the background on the board as its map, with the file's grid. */
    async function loadMap(data) {
      const asset = await createAsset(
        "TabletopMap",
        {
          type: "TabletopMap",
          name: data.name,
          description: "Importado de Open20 Battle Maps",
          adjust_method: "by_grid_size",
          grid_width: data.grid.width,
          grid_height: data.grid.height,
          grid_offset_x: 0,
          grid_offset_y: 0,
          grid_size: data.grid.cellDistance || 5,
          grid_units: data.grid.unit || "ft",
          fow_walls: "[]",
          fow_walls_count: 0,
        },
        { blob: format.base64ToBlob(data.background.data, data.background.mime), name: "fondo.png" },
      );
      const before = JSON.stringify(MapManager.getMapCorners());
      window.addAssetToTabletop(asset);
      // The board's corners follow the new map once Nivel20 applied it (they
      // change, or already match its size when the old map was the same).
      const sameSize = (c) =>
        Math.abs(Math.hypot(c[1].x - c[0].x, c[1].z - c[0].z) - data.grid.width) < 0.5;
      await waitFor(() => {
        const c = MapManager.getMapCorners();
        return c && (JSON.stringify(c) !== before || sameSize(c)) ? c : null;
      });
      // And then stay put (the texture loads after the plane is resized).
      await sleep(400);
      return MapManager.getMapCorners();
    }

    async function createTokens(data, corners, importId) {
      // One token asset per image (not per copy).
      const assets = {};
      const keys = Object.keys(data.images);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const img = data.images[key];
        progress(`Subiendo imágenes de tokens (${i + 1}/${keys.length})`);
        assets[key] = await createAsset(
          "TabletopToken",
          {
            type: "TabletopToken",
            name: img.name,
            name_hidden: 1,
            locked: 1,
            invisible: 0,
            border_type: "none",
            scale: 1,
            clears_fog: 0,
          },
          { blob: format.base64ToBlob(img.data, img.mime), name: `${img.name}.png` },
        );
      }
      const created = [];
      for (let i = 0; i < data.tokens.length; i++) {
        const t = data.tokens[i];
        const asset = assets[t.image];
        if (!asset) continue;
        progress(`Creando tokens (${i + 1}/${data.tokens.length})`);
        const marker = `${importId}:${i}`;
        window.tokens.create(tokenSchema(asset, format.tokenScale(t), marker));
        const networkId = await waitFor(
          () => TokenManager.getAllTokenIds().find((id) => markerOf(id) === marker),
          10000,
          100,
        );
        if (!networkId) continue;
        const at = format.cellToWorld(corners, data.grid, t.x, t.y);
        const y = TokenManager.getTokenPosition(networkId)?.y ?? 0;
        TokenManager.updatePosition(networkId, { x: at.x, y, z: at.z });
        created.push(networkId);
      }
      // Locked once in place (a locked token can't be moved).
      await sleep(500);
      for (const networkId of created) window.tokens.update({ networkId, locked: true });
      return created.length;
    }

    /** Fog walls in Nivel20's own shape (copied from a wall it already had, if any). */
    function loadWalls(data, corners, sample) {
      const walls = format.toNativeWalls(data, corners, sample);
      window.fogOfWar.restoreWalls(walls);
      const kept = window.fogOfWar.getCurrentWalls()?.length ?? 0;
      return { walls: walls.length, kept, guessed: !sample };
    }

    /** Save the scene with Nivel20's own "new scene" (it adds the scene data and a screenshot). */
    async function saveScene(name) {
      window.toggleAssetListModal("TabletopScene");
      const button = await waitFor(() => document.querySelector("#TabletopScene-list-modal .btn-new-asset"), 5000);
      if (!button) throw new Error("no se encontró «Nueva escena»");
      button.click();
      const modal = await waitFor(() => {
        const m = document.querySelector("#TabletopScene-form-modal");
        return m?.classList.contains("show") ? m : null;
      }, 20000);
      if (!modal) throw new Error("no se abrió el formulario de la escena");
      const input = modal.querySelector("[name='tabletop_asset[name]']");
      if (input) input.value = name;
      modal.querySelector(".asset-submit")?.click();
      const saved = await waitFor(() => !modal.classList.contains("show"), 30000);
      window.toggleAssetListModal("TabletopScene");
      return !!saved;
    }

    async function importMap() {
      if (!PlayerManager.isGameMaster()) return fail(new Error("solo el DM puede importar mapas"));
      const file = await pickFile();
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch (_) {
        return fail(new Error("el archivo no es un mapa de Battle Maps"));
      }
      const problems = format.validate(data);
      if (problems.length) return fail(new Error(problems.join(". ")));
      if (!(await confirmClear(data))) return;
      try {
        // An existing wall tells how Nivel20 keeps walls: read it before clearing.
        const sample = window.fogOfWar.getCurrentWalls?.()?.[0] || null;
        const importId = `bm-${Date.now().toString(36)}`;
        progress("Vaciando la escena");
        await clearScene();
        progress("Cargando el mapa y su cuadrícula");
        const corners = await loadMap(data);
        if (!corners) throw new Error("el tablero no mostró el mapa");
        const tokens = await createTokens(data, corners, importId);
        progress("Cargando los muros");
        const walls = loadWalls(data, corners, sample);
        progress("Guardando la escena en Nivel20");
        const saved = await saveScene(data.name);
        const warnings = [];
        if (tokens < data.tokens.length)
          warnings.push(`${data.tokens.length - tokens} tokens no se pudieron crear.`);
        if (walls.kept !== walls.walls)
          warnings.push(
            `Nivel20 cargó ${walls.kept} de ${walls.walls} muros. ` +
              (walls.guessed
                ? "Dibujá un muro de niebla en una escena y volvé a importar: Nivel21 copia el formato de ese muro."
                : "Revisá la niebla de guerra."),
          );
        if (!saved) warnings.push("La escena no se guardó: guardala desde Escenas.");
        finish(`«${data.name}» cargado: ${tokens} tokens y ${walls.kept} muros.`, warnings);
      } catch (error) {
        fail(error);
      }
    }

    // Only the DM loads maps: players don't see the item.
    if (!(await waitFor(() => PlayerManager.isGameMaster(), 20000, 500))) return;

    const header = await MainMenuUIManager.addHeader("Nivel 21", { id: "n21-menu-header" });
    await MainMenuUIManager.addItem(
      {
        id: MENU_ITEM_ID,
        title: TITLE,
        iconClass: "ft-map",
        order: 40,
        onClick: () => {
          if (PlayerManager.isGameMaster()) void importMap();
        },
      },
      { afterElement: header },
    );
  } catch (error) {
    window._n21_.utils.registerFeatureError("Battle Maps Import", error);
  }
})();
