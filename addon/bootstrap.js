/* global ChromeUtils, Services */

var CiteGen;

function install(data, reason) {}

function uninstall(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise;

  Services.scriptloader.loadSubScript(
    rootURI + "content/scripts/citegen.js",
  );

  CiteGen = Zotero.CiteGen;
  await CiteGen.init({ id, version, rootURI });
  await CiteGen.onMainWindowLoad(Zotero.getMainWindow());
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;

  if (CiteGen) {
    CiteGen.onMainWindowUnload(Zotero.getMainWindow());
    CiteGen.shutdown();
  }

  CiteGen = undefined;

  // Clear the cached script
  Cu.unload(rootURI + "content/scripts/citegen.js");
}

function onMainWindowLoad({ window }) {
  CiteGen?.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }) {
  CiteGen?.onMainWindowUnload(window);
}
