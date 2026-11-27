// Content script loader - injects scripts into page context
(function () {
  // Nivel20 launched a brand-new tabletop and the extension isn't compatible
  // with it yet. While this is true nothing is injected into the page: we only
  // show a notice on the tabletop. Set it back to false (and restore the CSS
  // in manifest.json's content_scripts) once the extension is adapted.
  const EXTENSION_PAUSED = true;

  if (EXTENSION_PAUSED) {
    showPausedNotice();
    return;
  }

  function showPausedNotice() {
    if (!/^\/tabletop(?:\/|$)/.test(window.location.pathname)) return;

    const DISMISS_KEY = "_n21_paused-notice-dismissed";
    const version = chrome.runtime.getManifest().version;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === version) return;
    } catch (_error) {}

    const render = () => {
      const host = document.createElement("div");
      host.id = "n21-paused-notice";
      // Shadow DOM so neither the page's styles nor ours leak across.
      const root = host.attachShadow({ mode: "closed" });
      root.innerHTML = `
        <style>
          .box { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
            width: min(360px, calc(100vw - 32px)); padding: 14px 16px; box-sizing: border-box;
            border: 1px solid #3a3d42; border-radius: 10px; background: #1d1e21; color: #ecebe8;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); font: 14px/1.45 system-ui, sans-serif; }
          h5 { margin: 0 0 6px; padding-right: 24px; font-size: 15px; font-weight: 700; }
          p { margin: 0 0 8px; }
          p:last-child { margin-bottom: 0; }
          a { color: #8ea1ff; }
          button { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px;
            border: 0; border-radius: 6px; background: transparent; color: inherit;
            font-size: 18px; line-height: 1; cursor: pointer; }
          button:hover { background: rgba(255, 255, 255, 0.08); }
        </style>
        <div class="box" role="status">
          <button type="button" aria-label="Cerrar">×</button>
          <h5>Nivel21 está en pausa</h5>
          <p>Nivel20 lanzó su nuevo tablero y la extensión todavía no es compatible,
            así que no se cargó para no causar errores.</p>
          <p>Estamos trabajando para adaptarla a la nueva versión del tablero.
            Novedades en <a href="https://open20.app/dc" target="_blank"
            rel="noopener">nuestro Discord</a>.</p>
        </div>`;
      root.querySelector("button").addEventListener("click", () => {
        try {
          sessionStorage.setItem(DISMISS_KEY, version);
        } catch (_error) {}
        host.remove();
      });
      document.body.appendChild(host);
    };

    if (document.body) render();
    else document.addEventListener("DOMContentLoaded", render, { once: true });
  }

  // Expose the extension's base URL (chrome-extension://<id>/ or
  // moz-extension://<uuid>/) to the page context via a shared-DOM data
  // attribute, so injected scripts can build URLs to web-accessible assets.
  document.documentElement.dataset.n21BaseUrl = chrome.runtime.getURL("");

  // Function to inject script into page context
  function injectScript(file) {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(file);
      script.onload = function () {
        this.remove();
        setTimeout(resolve, 200); // slight delay to ensure script is fully loaded
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  // Wait for jQuery to be available in page context
  function waitForJQuery(callback) {
    document.addEventListener("jQueryReady", callback, { once: true });
    injectScript("src/injected/jquery-checker.js");
  }

  // Check the Nivel20 version before loading anything that depends on its
  // internals. Resolves to false if the extension shouldn't load.
  function checkNivel20Version() {
    return new Promise((resolve) => {
      document.addEventListener(
        "n21VersionChecked",
        () => resolve(document.documentElement.dataset.n21VersionOk === "1"),
        { once: true },
      );
      injectScript("src/injected/version-check.js");
    });
  }

  // Wait for jQuery, then inject core and features in order
  waitForJQuery(async () => {
    // 0. Load DOMPurify
    await injectScript("src/lib/purify.min.js");

    // 1. Load core utilities
    await injectScript("src/core/utils.js");

    // 2. Load base manager
    await injectScript("src/core/base-manager.js");

    // 2a. From here on the code depends on Nivel20's internals: stop if the
    // version isn't supported and the user chose not to load anyway.
    if (!(await checkNivel20Version())) return;

    // 2b. Load shared, manager-less helpers used by multiple features.
    await injectScript("src/core/money.js");
    await injectScript("src/core/resource-icons.js");
    await injectScript("src/core/weather-renderer.js");
    await injectScript("src/core/effects-renderer.js");
    await injectScript("src/core/action-bar-layout.js");
    await injectScript("src/core/chat-consent.js");
    await injectScript("src/core/settings-guide.js");

    // 3. Load managers and features in parallel
    await Promise.all([
      // Managers
      injectScript("src/core/app-root-manager.js"),
      injectScript("src/core/settings-manager.js"),
      injectScript("src/core/main-menu-ui-manager.js"),
      injectScript("src/core/quick-menu-ui-manager.js"),
      injectScript("src/core/chat-ui-manager.js"),
      injectScript("src/core/key-modifiers-manager.js"),
      injectScript("src/core/chat-manager.js"),
      injectScript("src/core/chat-commands-manager.js"),
      injectScript("src/core/player-manager.js"),
      injectScript("src/core/token-manager.js"),
      injectScript("src/core/measurement-manager.js"),
      injectScript("src/core/camera-manager.js"),
      injectScript("src/core/map-manager.js"),
      injectScript("src/core/network-manager.js"),
      injectScript("src/core/dice-manager.js"),
      injectScript("src/core/floating-panel-manager.js"),
      injectScript("src/core/action-bar-manager.js"),
      injectScript("src/core/tooltip-manager.js"),
      injectScript("src/core/html-manager.js"),
      injectScript("src/core/edit-token-ui-manager.js"),
      injectScript("src/core/canvas-dropdown-manager.js"),
      injectScript("src/core/character-manager.js"),
      injectScript("src/core/character-sheet-manager.js"),
      injectScript("src/core/combat-tracking-manager.js"),
      injectScript("src/core/local-resources-manager.js"),
      injectScript("src/core/token-overlay-manager.js"),
      injectScript("src/core/character-items-manager.js"),
      injectScript("src/core/markdown-editor-manager.js"),

      // Features
      injectScript("src/features/advantage-disadvantage.js"),
      injectScript("src/features/send-to-chat.js"),
      injectScript("src/features/parse-chat-links.js"),
      injectScript("src/features/token-hotkeys.js"),
      injectScript("src/features/token-layers.js"),
      injectScript("src/features/token-aura.js"),
      injectScript("src/features/token-assign-player.js"),
      injectScript("src/features/token-assign-character.js"),
      injectScript("src/features/token-move-arrows.js"),
      injectScript("src/features/token-drag-measurement.js"),
      injectScript("src/features/token-drag-speed.js"),
      injectScript("src/features/multi-measurement.js"),
      injectScript("src/features/whisper-mode.js"),
      injectScript("src/features/multi-level-action-bar.js"),
      injectScript("src/features/ambient-fx.js"),
      injectScript("src/features/notes-panel.js"),
      injectScript("src/features/dm-screen.js"),
      injectScript("src/features/turn-order.js"),
      injectScript("src/features/dice-visibility.js"),
      injectScript("src/features/settings-panel.js"),
      injectScript("src/features/onboarding.js"),
      injectScript("src/features/token-notes.js"),
      injectScript("src/features/center-camera-here.js"),
      injectScript("src/features/ping-map.js"),
      injectScript("src/features/effects-panel.js"),
      injectScript("src/features/straighten-camera.js"),
      injectScript("src/features/camera-rotation-lock.js"),
      injectScript("src/features/generate-spell-actions.js"),
      injectScript("src/features/spell-action-bar.js"),
      injectScript("src/features/actions-bar.js"),
      injectScript("src/features/generate-trait-actions.js"),
      injectScript("src/features/traits-action-bar.js"),
      injectScript("src/features/floating-panel-action.js"),
      injectScript("src/features/inventory-panel.js"),
      injectScript("src/features/action-bar-editor.js"),
      injectScript("src/features/tabbed-action-bar.js"),
      injectScript("src/features/money-editor.js"),
      injectScript("src/features/character-frame.js"),
      injectScript("src/features/mana-bar.js"),
      injectScript("src/features/resource-actions.js"),
      injectScript("src/features/creature-resources.js"),
      injectScript("src/features/token-health-bar.js"),
      injectScript("src/features/token-conditions.js"),
      injectScript("src/features/invisible-condition.js"),
      injectScript("src/features/error-report.js"),
    ]);
  });
})();
