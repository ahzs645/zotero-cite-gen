/**
 * Zotero Citation Generator — Main Entry Point
 *
 * Pipeline: AI generates citation JSON → user pastes into plugin →
 * plugin verifies DOIs via CrossRef → imports into Zotero →
 * attaches reasoning as notes.
 */

import { ImportDialogController } from "./modules/import-dialog";
import { buildFullPrompt, CITATION_SYSTEM_PROMPT } from "./modules/prompt-template";
import { parseAICitationJSON, validatePayload } from "./modules/json-parser";
import { importCitations } from "./modules/importer";
import { openImportDialog } from "./modules/ui-import";
import { openPromptDialog } from "./modules/ui-prompt";

const OLD_NOTE_TEMPLATE =
  "<h2>AI Citation Reason</h2><p><strong>Query:</strong> {{query}}</p><p><strong>Reason:</strong> {{reason}}</p><p><em>Imported on {{date}}</em></p>";
const NEW_NOTE_TEMPLATE =
  "<h2>Citation Reason</h2><p><strong>Query:</strong> {{query}}</p><p><strong>Reason:</strong> {{reason}}</p><p><em>Imported on {{date}}</em></p>";

class CiteGenPlugin {
  private id: string = "";
  private version: string = "";
  private rootURI: string = "";
  private initialized: boolean = false;
  private menuIDs: string[] = [];
  private sectionID: string | false = false;

  async init(params: { id: string; version: string; rootURI: string }) {
    this.id = params.id;
    this.version = params.version;
    this.rootURI = params.rootURI;

    // Register preference pane
    Zotero.PreferencePanes.register({
      pluginID: this.id,
      src: this.rootURI + "content/preferences.xhtml",
    });

    this.migrateLegacyPrefs();

    this.initialized = true;
    Zotero.debug(`[CiteGen] Initialized v${this.version}`);
  }

  async onMainWindowLoad(window: Window) {
    if (!window) return;

    const doc = window.document;

    // ── Tools Menu ──
    this.addMenuItem(doc, {
      id: "citegen-menu-import",
      label: "Import AI Citations (JSON)...",
      parentId: "menu_ToolsPopup",
      onCommand: () => this.openImportDialog(),
    });

    this.addMenuItem(doc, {
      id: "citegen-menu-prompt",
      label: "Copy AI Citation Prompt...",
      parentId: "menu_ToolsPopup",
      onCommand: () => this.openPromptDialog(),
    });

    this.addMenuItem(doc, {
      id: "citegen-menu-verify",
      label: "Verify DOIs for Selected Items",
      parentId: "menu_ToolsPopup",
      onCommand: () => this.verifySelectedItems(),
    });

    // ── Right-Click Context Menu on Items ──
    this.addMenuItem(doc, {
      id: "citegen-context-import",
      label: "Import AI Citations (JSON)...",
      parentId: "zotero-itemmenu",
      onCommand: () => this.openImportDialog(),
    });

    // ── Item Pane Section ──
    this.registerItemPaneSection();

    Zotero.debug("[CiteGen] Main window loaded");
  }

  onMainWindowUnload(window: Window) {
    if (!window) return;
    const doc = window.document;

    // Remove all menu items
    for (const id of this.menuIDs) {
      doc.getElementById(id)?.remove();
    }
    this.menuIDs = [];

    // Unregister item pane section
    if (this.sectionID) {
      Zotero.ItemPaneManager.unregisterSection(this.sectionID as string);
      this.sectionID = false;
    }

    Zotero.debug("[CiteGen] Main window unloaded");
  }

  shutdown() {
    this.initialized = false;
    Zotero.debug("[CiteGen] Shutdown");
  }

  // ── Public API (available as Zotero.CiteGen.*) ──

  createImportController(): ImportDialogController {
    return new ImportDialogController();
  }

  buildFullPrompt(
    topic?: string,
    focus?: string,
    count?: number,
  ): string {
    return buildFullPrompt(topic, focus, count);
  }

  getSystemPrompt(): string {
    return CITATION_SYSTEM_PROMPT;
  }

  /**
   * Programmatic import — can be called from other plugins or scripts.
   */
  async importFromJSON(
    json: string,
    options?: {
      libraryID?: number;
      collectionID?: number;
      verifyDOIs?: boolean;
      attachReasons?: boolean;
      importTag?: string;
    },
  ) {
    const payload = parseAICitationJSON(json);
    const warnings = validatePayload(payload);
    if (warnings.length > 0) {
      Zotero.debug(`[CiteGen] Import warnings: ${warnings.join("; ")}`);
    }

    return importCitations(payload, {
      ...options,
      query: payload.query,
    });
  }

  // ── Private Methods ──

  private openImportDialog() {
    openImportDialog(this.rootURI);
  }

  private openPromptDialog() {
    openPromptDialog(this.rootURI);
  }

  private async verifySelectedItems() {
    const items = ZoteroPane.getSelectedItems();
    if (!items || items.length === 0) {
      this.showNotification("No items selected.", "error");
      return;
    }

    const { verifyDOI } = await import("./modules/doi-verify");

    let valid = 0;
    let invalid = 0;
    let missing = 0;

    for (const item of items) {
      if (!item.isRegularItem()) continue;

      const doi = item.getField("DOI");
      if (!doi) {
        missing++;
        continue;
      }

      const result = await verifyDOI(doi);
      if (result.valid) {
        valid++;
      } else {
        invalid++;
      }
    }

    this.showNotification(
      `DOI verification: ${valid} valid, ${invalid} invalid, ${missing} no DOI`,
      valid > 0 ? "success" : "warning",
    );
  }

  private registerItemPaneSection() {
    try {
      this.sectionID = Zotero.ItemPaneManager.registerSection({
        paneID: "citegen-info",
        pluginID: this.id,
        header: {
          l10nID: "citegen-section-header",
          icon: this.rootURI + "content/icons/favicon@0.5x.png",
        },
        sidenav: {
          l10nID: "citegen-section-sidenav",
          icon: this.rootURI + "content/icons/favicon@0.5x.png",
        },
        onRender: ({
          body,
          item,
        }: {
          body: HTMLElement;
          item: any;
          editable: boolean;
          tabType: string;
        }) => {
          // Check if this item has an AI citation reason note
          if (!item || !item.isRegularItem()) {
            body.textContent = "Select a regular item to see AI citation info.";
            return;
          }

          const noteIDs = item.getNotes();
          let reasonNote = null;

          for (const nid of noteIDs) {
            const note = Zotero.Items.get(nid);
            const content = note.getNote();
            if (content && content.includes("Citation Reason")) {
              reasonNote = content;
              break;
            }
          }

          if (reasonNote) {
            body.innerHTML = reasonNote;
          } else {
            body.innerHTML =
              '<p style="color: #9ca3af; font-style: italic;">No citation reason note. Import citations via Tools → Import AI Citations.</p>';
          }
        },
      });
    } catch (e) {
      Zotero.debug(
        `[CiteGen] Could not register item pane section: ${(e as Error).message}`,
      );
    }
  }

  private addMenuItem(
    doc: Document,
    opts: {
      id: string;
      label: string;
      parentId: string;
      onCommand: () => void;
    },
  ) {
    const menuitem = doc.createXULElement("menuitem");
    menuitem.id = opts.id;
    menuitem.setAttribute("label", opts.label);
    menuitem.addEventListener("command", opts.onCommand);

    const parent = doc.getElementById(opts.parentId);
    if (parent) {
      parent.appendChild(menuitem);
      this.menuIDs.push(opts.id);
    }
  }

  private showNotification(message: string, type: string = "info") {
    try {
      const pw = new Zotero.ProgressWindow();
      pw.changeHeadline("Citation Generator");
      pw.addDescription(message);
      pw.show();
      pw.startCloseTimer(4000);
    } catch {
      Zotero.debug(`[CiteGen] ${type}: ${message}`);
    }
  }

  private migrateLegacyPrefs() {
    try {
      const prefRoot = "extensions.zotero.citegen.";
      const tagImported = Zotero.Prefs.get(`${prefRoot}tagImported`, true);
      const importTag = Zotero.Prefs.get(`${prefRoot}importTag`, true);
      if (tagImported === true && importTag === "ai-citation") {
        Zotero.Prefs.set(`${prefRoot}tagImported`, false, true);
        Zotero.Prefs.set(`${prefRoot}importTag`, "", true);
      }

      const noteTemplate = Zotero.Prefs.get(`${prefRoot}noteTemplate`, true);
      if (noteTemplate === OLD_NOTE_TEMPLATE) {
        Zotero.Prefs.set(`${prefRoot}noteTemplate`, NEW_NOTE_TEMPLATE, true);
      }
    } catch (e) {
      Zotero.debug(`[CiteGen] Could not migrate legacy prefs: ${(e as Error).message}`);
    }
  }
}

// Singleton — bootstrap.js loads this and calls Zotero.CiteGen.init()
const plugin = new CiteGenPlugin();
(Zotero as any).CiteGen = plugin;

export default plugin;
