(async () => {
  try {
    /* =======================
       Feature: Mana Bar (Barra de maná)

       Regla opcional de puntos de conjuro (5e): en el modal "Recursos de…"
       de Nivel20 (registro de la campaña o tablero) agrega un botón "Usar
       maná en lugar de espacios de conjuro". Tras confirmarlo crea el recurso
       "Maná" (una casilla): mientras exista, los espacios de conjuro del
       personaje se muestran como una barra de maná (marco de personaje y
       tokens) y Nivel21 los va marcando al gastar o recuperar maná (ver
       CombatTrackingManager.getMana). El mismo botón permite volver a los
       espacios de conjuro (elimina el recurso).

       Solo en sistemas con espacios de conjuro de 5e (D&D 5e, D&D 2024 y El
       Resurgir del Dragón).
    ======================= */

    const { loadManagers } = window._n21_;

    const [CombatTrackingManager, SettingsManager] = await loadManagers(
      "CombatTrackingManager",
      "SettingsManager",
    );

    // Applies live: the button is added/removed with the setting.
    let enabled = SettingsManager.get("feature.mana-bar.enabled");

    const FORM_SELECTOR = 'form[action$="/set_resources"]';
    const SYSTEMS = /\/games\/(dnd-5|dnd-2024|el-resurgir-del-dragon)\//;
    const BLOCK_CLASS = "n21-mana-toggle";
    const MANA_NAME = CombatTrackingManager.manaResourceName;

    function normalize(value) {
      return String(value ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim()
        .toLowerCase();
    }

    /** The resource row named "Maná" in the modal's form, if any. */
    function manaRow(form) {
      return [...form.querySelectorAll(".character-resource-form")].find(
        (row) => normalize(row.querySelector('input[name$="[name]"]')?.value) === normalize(MANA_NAME),
      );
    }

    function characterName(form) {
      const title = form.closest(".modal-content")?.querySelector(".modal-title")?.textContent || "";
      return title.replace(/^\s*Recursos de\s*/i, "").trim() || "el personaje";
    }

    /** Whether the character has spell slots (unknown -> assume it does). */
    function hasSpellSlots(form) {
      const id = form.querySelector('[name="character_id"]')?.value;
      const entry = id ? CombatTrackingManager.getEntry("character", id) : null;
      return !entry || entry.resources.some((r) => r.category === "spell_slots");
    }

    async function startUsingMana(form) {
      const name = characterName(form);
      const ok = await window._n21_.confirmAction({
        title: "¿Usar maná en lugar de espacios de conjuro?",
        description:
          `Se va a crear el recurso adicional «${MANA_NAME}» (una casilla). Mientras exista, ` +
          `los espacios de conjuro de ${name} se muestran como una barra de maná ` +
          "(regla opcional de puntos de conjuro) y Nivel21 los irá marcando internamente " +
          "al gastar o recuperar maná.",
        warning: `No marques a mano el recurso «${MANA_NAME}» ni los espacios de conjuro.`,
        confirmLabel: "Usar maná",
      });
      if (!ok) return;
      form.querySelector(".add-nested")?.click();
      const rows = form.querySelectorAll(".character-resource-form");
      const row = rows[rows.length - 1];
      const nameInput = row?.querySelector('input[name$="[name]"]');
      const maxSelect = row?.querySelector('select[name$="[max_value]"]');
      if (!nameInput || !maxSelect) return;
      nameInput.value = MANA_NAME;
      maxSelect.value = "1";
      form.requestSubmit();
    }

    async function stopUsingMana(form) {
      const ok = await window._n21_.confirmAction({
        title: "¿Volver a los espacios de conjuro?",
        description:
          `Se elimina el recurso «${MANA_NAME}» y los espacios de conjuro de ${characterName(form)} ` +
          "vuelven a mostrarse como siempre, marcados tal como estén ahora.",
        confirmLabel: "Volver a espacios",
      });
      if (!ok) return;
      manaRow(form)?.querySelector(".remove-item")?.click();
      form.requestSubmit();
    }

    /** Add (or refresh) the button in a resources form. */
    function enhance(form) {
      form.querySelector(`.${BLOCK_CLASS}`)?.remove();
      if (!enabled || !SYSTEMS.test(form.getAttribute("action") || "")) return;
      if (!hasSpellSlots(form)) return;

      const using = !!manaRow(form);
      const block = document.createElement("div");
      block.className = BLOCK_CLASS;
      block.innerHTML = using
        ? `<p>Este personaje usa <b>maná</b> en lugar de espacios de conjuro (recurso «${MANA_NAME}»).</p>
           <button type="button" class="btn btn-sm btn-secondary">Volver a espacios de conjuro</button>`
        : `<p>Regla opcional de puntos de conjuro: lleva la cuenta con una barra de maná.</p>
           <button type="button" class="btn btn-sm btn-info">Usar maná en lugar de espacios de conjuro</button>`;
      block.querySelector("button").addEventListener("click", () =>
        using ? stopUsingMana(form) : startUsingMana(form),
      );
      const wrapper = form.querySelector(".nested-fields-wrapper");
      if (wrapper) wrapper.after(block);
      else form.prepend(block);
    }

    function enhanceAll() {
      document.querySelectorAll(FORM_SELECTOR).forEach(enhance);
    }

    // The modal is loaded on demand: enhance its form when it shows up.
    let scheduled = false;
    new MutationObserver((mutations) => {
      if (scheduled) return;
      const relevant = mutations.some((m) =>
        [...m.addedNodes].some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            !node.classList?.contains(BLOCK_CLASS) &&
            (node.matches?.(FORM_SELECTOR) || node.querySelector?.(FORM_SELECTOR)),
        ),
      );
      if (!relevant) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        enhanceAll();
      }, 50);
    }).observe(document.body, { childList: true, subtree: true });

    SettingsManager.watch("feature.mana-bar.enabled", (value) => {
      enabled = !!value;
      enhanceAll();
    });
  } catch (error) {
    window._n21_.utils?.registerFeatureError?.("mana-bar", error);
  }
})();
