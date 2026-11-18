(async () => {
  try {
    /* =======================================================================
         Feature: Actions Bar

         Injects an "Acciones" folder with the basic actions of the
         character's game system (e.g. Dash, Hide, Search… for D&D 2024; Stride,
         Step, Seek… for Pathfinder 2) into its action bar. These actions are
         identical for every character of a system — no rolls, just icon + name
         + description — so they're hardcoded here instead of fetched from the
         sheet. Systems with no basic actions (Universal) get no folder.

         The system comes from CharacterSheetManager.getGameSystem (where the
         character's sheet URL redirects); until it resolves the bar renders
         without the folder and is re-created once it's known.

         The folder is inserted right after the spell folders (injected by the
         spell-action-bar feature) and before the character's native actions.

         Icons are bundled extension assets under `src/assets/actions/`; their
         URL is built from the extension base URL (which carries the extension
         id) exposed by the content script as `documentElement.dataset.n21BaseUrl`.
      ======================================================================= */

    const { loadManagers } = window._n21_;

    const [ActionBarManager, SettingsManager, CombatTrackingManager, CharacterSheetManager] =
      await loadManagers(
        "ActionBarManager",
        "SettingsManager",
        "CombatTrackingManager",
        "CharacterSheetManager",
      );

    // Applies live: when disabled its items are stripped from the bar.
    let featureEnabled = SettingsManager.get("feature.actions-bar.enabled");

    // Marks the folder injected by this feature so re-renders stay idempotent.
    const INJECT_TAG = "__n21Actions";

    const uuid =
      window._n21_?.utils?.uuid || (() => Math.random().toString(36).slice(2));

    /** Build a bundled-asset URL from the extension base (carries the ext id). */
    function assetUrl(file) {
      const base = document.documentElement?.dataset?.n21BaseUrl || "";
      return `${base}src/assets/actions/${file}`;
    }

    // Actions per Nivel20 game-system slug: [name, icon file, description
    // (HTML) | null]. Icons are reused across systems where the action matches.
    // Systems without an entry (e.g. "universal") get no "Acciones" folder.
    const DND_2024_ACTIONS = [
      [
        "Carrera",
        "dash.png",
        "<p>Obtienes movimiento adicional</p>\n",
      ],
      [
        "Destrabar",
        "disengage.png",
        "<p>Al usarla, tu movimiento no provoca ataques de oportunidad.</p>\n",
      ],
      [
        "Esquivar",
        "dodge.png",
        "<p>Desventaja en ataques contra ti.\nVentaja en tiradas de salvación de Destreza.</p>\n",
      ],
      [
        "Ayudar",
        "help.png",
        "<p>Elige una habilidad o herramienta competente: das Ventaja en una prueba de d20.</p>\n\n<p>Si un enemigo está a 1,5 m (5 pies) de ti: das Ventaja en un ataque aliado contra ese enemigo.</p>\n",
      ],
      ["Ocultarse", "hide.jpg", null],
      [
        "Preparar",
        "ready.png",
        "<p>Elige una acción y un desencadenante; usas tu reacción antes de tu próximo turno cuando ocurra el desencadenante</p>\n",
      ],
      [
        "Buscar",
        "search.png",
        "<p>Usar Perspicacia, Medicina, Percepción o Supervivencia según el caso</p>\n",
      ],
      [
        "Investigar",
        "study.png",
        "<p>Usar Arcana, Historia, Investigación, Naturaleza o Religión</p>\n",
      ],
      [
        "Usar",
        "utilize.png",
        "<p>Utiliza un objeto no mágico que requiera una acción para su uso.</p>\n",
      ],
    ];

    // D&D 5e (2014). Also used by El Resurgir del Dragón, built on the 5e SRD.
    const DND_5_ACTIONS = [
      [
        "Correr",
        "dash.png",
        "<p>Obtienes movimiento adicional igual a tu velocidad durante este turno.</p>\n",
      ],
      [
        "Destrabarse",
        "disengage.png",
        "<p>Tu movimiento no provoca ataques de oportunidad durante el resto del turno.</p>\n",
      ],
      [
        "Esquivar",
        "dodge.png",
        "<p>Hasta tu próximo turno, los ataques contra ti tienen desventaja si ves al atacante, y tienes ventaja en las tiradas de salvación de Destreza.</p>\n",
      ],
      [
        "Ayudar",
        "help.png",
        "<p>Das ventaja a un aliado en su próxima prueba de característica para una tarea, o en su próximo ataque contra una criatura a 1,5 m (5 pies) de ti.</p>\n",
      ],
      [
        "Esconderse",
        "hide.jpg",
        "<p>Haz una prueba de Destreza (Sigilo) para esconderte.</p>\n",
      ],
      [
        "Preparar",
        "ready.png",
        "<p>Elige un desencadenante y una acción (o tu movimiento); si ocurre antes de tu próximo turno, puedes resolverla usando tu reacción.</p>\n",
      ],
      [
        "Buscar",
        "search.png",
        "<p>Dedicas tu atención a encontrar algo: prueba de Sabiduría (Percepción) o de Inteligencia (Investigación).</p>\n",
      ],
      [
        "Usar un objeto",
        "utilize.png",
        "<p>Interactúas con un objeto que requiere una acción para usarse, o con un segundo objeto en el turno.</p>\n",
      ],
    ];

    const DND_3_5_ACTIONS = [
      [
        "Ayudar a otro",
        "help.png",
        "<p>Ataque contra CA 10 a un enemigo adyacente: un aliado obtiene +2 a su próximo ataque contra él o +2 a la CA contra su próximo ataque.</p>\n",
      ],
      [
        "Defensa total",
        "total-defense.png",
        "<p>+4 de esquiva a la CA hasta tu próximo turno. No puedes atacar ni hacer ataques de oportunidad.</p>\n",
      ],
      [
        "Preparar",
        "ready.png",
        "<p>Elige una acción y un desencadenante; antes de tu próximo turno, la realizas cuando ocurra el desencadenante.</p>\n",
      ],
      [
        "Correr",
        "dash.png",
        "<p>Asalto completo: te mueves hasta cuatro veces tu velocidad (tres con armadura pesada) en línea recta. Pierdes el bonificador de Destreza a la CA.</p>\n",
      ],
      [
        "Retirada",
        "disengage.png",
        "<p>Asalto completo: te mueves hasta el doble de tu velocidad; la casilla de la que sales no provoca ataques de oportunidad.</p>\n",
      ],
      [
        "Cargar",
        "charge.png",
        "<p>Asalto completo: te mueves hasta el doble de tu velocidad en línea recta y atacas con +2. Tienes -2 a la CA hasta tu próximo turno.</p>\n",
      ],
      [
        "Golpe de gracia",
        "coup-de-grace.png",
        "<p>Asalto completo: crítico automático contra un enemigo indefenso adyacente, que debe superar una salvación de Fortaleza (CD 10 + daño) o muere.</p>\n",
      ],
      [
        "Fintar",
        "feint.png",
        "<p>Engañar enfrentado a Averiguar intenciones del objetivo: si ganas, pierde su bonificador de Destreza a la CA contra tu próximo ataque.</p>\n",
      ],
      [
        "Usar un objeto",
        "utilize.png",
        "<p>Sacas, guardas o manipulas un objeto (beber una poción, abrir una puerta…).</p>\n",
      ],
    ];

    // Pathfinder 2e basic actions (Player Core).
    const PATHFINDER2_ACTIONS = [
      [
        "Zancada",
        "dash.png",
        "<p>1 acción. Te mueves hasta tu Velocidad.</p>\n",
      ],
      [
        "Paso",
        "step.png",
        "<p>1 acción. Te mueves 1,5 m (5 pies) sin provocar reacciones desencadenadas por el movimiento.</p>\n",
      ],
      [
        "Ponerse a cubierto",
        "take-cover.png",
        "<p>1 acción. Si tienes cobertura, pasa a ser cobertura mayor; si estás tumbado, obtienes cobertura mayor contra ataques a distancia.</p>\n",
      ],
      [
        "Ayudar",
        "help.png",
        "<p>Reacción. Tras prepararte en tu turno, ayudas a un aliado en una prueba: con una prueba CD 15 le das un bonificador circunstancial.</p>\n",
      ],
      [
        "Preparar",
        "ready.png",
        "<p>2 acciones. Elige un desencadenante y una acción simple de 1 acción; la realizas como reacción cuando ocurra.</p>\n",
      ],
      [
        "Buscar",
        "search.png",
        "<p>1 acción. Prueba de Percepción para encontrar criaturas u objetos escondidos o no detectados en un área.</p>\n",
      ],
      [
        "Averiguar intenciones",
        "sense-motive.png",
        "<p>1 acción. Prueba de Percepción para saber si una criatura miente o actúa de forma sospechosa.</p>\n",
      ],
      [
        "Interactuar",
        "utilize.png",
        "<p>1 acción. Agarras, sacas, guardas, abres o manipulas un objeto.</p>\n",
      ],
      [
        "Escapar",
        "escape.png",
        "<p>1 acción. Prueba de ataque sin armas, Acrobacias o Atletismo contra la CD del efecto que te tiene agarrado, apresado o inmovilizado.</p>\n",
      ],
      [
        "Retrasar",
        "delay.png",
        "<p>Acción gratuita al inicio de tu turno: lo pospones y vuelves a actuar más tarde en el orden de iniciativa.</p>\n",
      ],
    ];

    const ACTIONS_BY_SYSTEM = {
      "dnd-2024": DND_2024_ACTIONS,
      "dnd-5": DND_5_ACTIONS,
      "el-resurgir-del-dragon": DND_5_ACTIONS,
      "dnd-3-5": DND_3_5_ACTIONS,
      pathfinder2: PATHFINDER2_ACTIONS,
    };

    /**
     * Build a fresh "Acciones" folder (unique ids each time so the multi-level
     * normalizer never sees colliding ids across renders).
     */
    function buildActionsFolder(actions) {
      const child = ([name, icon, description]) => ({
        id: `n21-action-${uuid()}`,
        name,
        text: "",
        icon: assetUrl(icon),
        description,
        action_type: "none",
        hidden: false,
        order: null,
        source_name: null,
        tooltip_title: name,
        owned: false,
      });

      return {
        id: `n21-action-${uuid()}`,
        name: "Acciones",
        text: "",
        icon: assetUrl("acciones.png"),
        description: null,
        action_type: "folder",
        hidden: false,
        order: null,
        source_name: null,
        tooltip_title: "Acciones",
        owned: false,
        elements: actions.map(child),
      };
    }

    /**
     * "Iniciativa" action, first item of the bar: the very same roll as
     * "Inic." in the combat tracking panel (so the turn order can read it
     * from the chat). Only on the tabletop, where that roll exists.
     */
    function initiativeAction(charId) {
      const roll = charId ? CombatTrackingManager.getInitiativeRoll("character", charId) : null;
      if (!roll) return null;
      return {
        id: `n21-action-${uuid()}`,
        name: roll.name,
        text: "",
        icon: assetUrl("initiative.png"),
        description: null,
        action_type: "dice_roll",
        hidden: false,
        order: null,
        source_name: null,
        tooltip_title: roll.name,
        owned: false,
        dice_roll: roll.notation,
        roll_options: { roll_name: roll.name },
      };
    }

    /**
     * Resolve the character id owning an action bar from the `element` passed
     * to createBar (a row inside `.action-bar[data-sender-info]`).
     * @returns {string|null}
     */
    function resolveCharacterId(element) {
      try {
        const bar = $(element).closest(".action-bar")[0];
        const senderInfo = bar?.getAttribute("data-sender-info") || "";
        const match = senderInfo.match(/Character-(\d+)/);
        return match ? match[1] : null;
      } catch (_) {
        return null;
      }
    }

    // charId -> Promise<string|null> while in flight, then the resolved slug
    // (null if unknown). Lives for the page lifetime.
    const systems = new Map();

    /** Game-system slug of a character, fetched once. Never rejects. */
    function fetchGameSystem(charId) {
      return CharacterSheetManager.getGameSystem(`/characters/${charId}.json`).catch((error) => {
        window._n21_.utils?.registerFeatureError?.("actions-bar", error);
        return null;
      });
    }

    /** Basic actions of a game system ([] for Universal / unknown systems). */
    function actionsFor(system) {
      return ACTIONS_BY_SYSTEM[system] || [];
    }

    /**
     * Add (idempotently) "Iniciativa" first and the "Acciones" folder at the
     * end of the list, so the order is: [Iniciativa, spells…, native actions,
     * Acciones]. Spells stay at the
     * front (unshifted by the spell-action-bar feature) and our folder is
     * always last. `actions` empty (or system still unknown) -> no folder.
     */
    function injectInto(items, charId, actions) {
      // Remove our own previously injected folder.
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] && items[i][INJECT_TAG]) items.splice(i, 1);
      }
      if (actions.length) {
        items.push({ ...buildActionsFolder(actions), n21Key: "n21:actions", [INJECT_TAG]: true });
      }
      const initiative = initiativeAction(charId);
      if (initiative) items.unshift({ ...initiative, n21Key: "n21:initiative", [INJECT_TAG]: true });
    }

    // Run after spell-action-bar (priority 50) so spells are already in place,
    // and before multi-level (priority 100) so the folder gets normalized.
    // List the folder in the action bar editor.
    window._n21_.actionBarLayout?.registerProvider("initiative", {
      order: 5,
      getEntries: async () => (!featureEnabled ? [] : [
        { key: "n21:initiative", label: "Iniciativa", icon: assetUrl("initiative.png") },
      ]),
    });
    window._n21_.actionBarLayout?.registerProvider("actions", {
      order: 20,
      getEntries: async (charId) => {
        if (!featureEnabled) return [];
        let entry = systems.get(charId);
        if (entry === undefined) {
          entry = fetchGameSystem(charId);
          systems.set(charId, entry);
        }
        const system = await entry;
        systems.set(charId, system);
        if (!actionsFor(system).length) return [];
        return [{ key: "n21:actions", label: "Acciones", icon: assetUrl("acciones.png") }];
      },
    });

    function stripOwnItems(items) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] && items[i][INJECT_TAG]) items.splice(i, 1);
      }
    }

    SettingsManager.onChange(() => {
      const next = !!SettingsManager.get("feature.actions-bar.enabled");
      if (next === featureEnabled) return;
      featureEnabled = next;
      ActionBarManager.rerenderCharacterBars();
    });

    ActionBarManager.onCreateBar(
      "actions-bar",
      (element, items, parentItem = null) => {
        if (!featureEnabled) {
          if (parentItem === null && Array.isArray(items)) stripOwnItems(items);
          return;
        }
        // Only augment the root render of a character bar.
        if (parentItem !== null) return;
        if (!Array.isArray(items)) return;
        const charId = resolveCharacterId(element);
        if (!charId) return; // not a character bar

        const entry = systems.get(charId);
        if (entry === undefined || entry instanceof Promise) {
          // System not known yet: render without the folder, re-create later.
          injectInto(items, charId, []);
          if (entry === undefined) {
            const promise = fetchGameSystem(charId);
            systems.set(charId, promise);
            promise.then((system) => {
              systems.set(charId, system);
              if (actionsFor(system).length) {
                window.createBar($(element), items, parentItem, 0);
              }
            });
          }
          return;
        }

        injectInto(items, charId, actionsFor(entry));
        return;
      },
      { priority: 60 },
    );
  } catch (error) {
    window._n21_.utils?.registerFeatureError?.("actions-bar", error);
  }
})();
